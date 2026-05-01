(function () {

    function parseDxfGroups(text) {
        const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        const groups = [];
        let i = 0;
        while (i < lines.length) {
            const codeLine = lines[i].trim();
            if (codeLine === '') { i++; continue; }
            const code = parseInt(codeLine, 10);
            if (isNaN(code)) { i++; continue; }
            i++;
            groups.push({ code, value: i < lines.length ? lines[i].trim() : '' });
            i++;
        }
        return groups;
    }

    function getDxfUnitsScale(groups) {
        for (let i = 0; i < groups.length - 2; i++) {
            if (groups[i].code === 9 && groups[i].value === '$INSUNITS') {
                for (let j = i + 1; j < Math.min(i + 6, groups.length); j++) {
                    if (groups[j].code === 70) {
                        const u = parseInt(groups[j].value, 10);
                        if (u === 1) return 25.4 * viewScale;  // inches
                        if (u === 6) return 1000 * viewScale;  // meters
                        return viewScale;                       // mm or unitless
                    }
                }
            }
        }
        return viewScale; // default: assume mm
    }

    function extractDxfEntities(groups) {
        let i = 0;
        while (i < groups.length) {
            if (groups[i].code === 0 && groups[i].value === 'SECTION' &&
                i + 1 < groups.length && groups[i + 1].code === 2 && groups[i + 1].value === 'ENTITIES') {
                i += 2;
                break;
            }
            i++;
        }

        const supported = new Set(['LINE', 'LWPOLYLINE', 'POLYLINE', 'VERTEX', 'CIRCLE', 'ARC', 'ELLIPSE', 'SPLINE']);
        const entities = [];
        let currentPolyline = null;

        while (i < groups.length) {
            if (groups[i].code !== 0) { i++; continue; }
            const type = groups[i].value;
            if (type === 'ENDSEC') break;

            if (type === 'SEQEND') {
                if (currentPolyline) { entities.push(currentPolyline); currentPolyline = null; }
                i++;
                continue;
            }

            if (!supported.has(type)) { i++; continue; }

            const ent = { type, layer: '0', xs: [], ys: [], x1s: [], y1s: [], vals40: [] };
            i++;
            while (i < groups.length && groups[i].code !== 0) {
                const { code, value } = groups[i];
                if      (code === 8)  ent.layer = value;
                else if (code === 10) ent.xs.push(parseFloat(value));
                else if (code === 20) ent.ys.push(parseFloat(value));
                else if (code === 11) ent.x1s.push(parseFloat(value));
                else if (code === 21) ent.y1s.push(parseFloat(value));
                else if (code === 40) ent.vals40.push(parseFloat(value));
                else if (code === 50) ent.startAngle = parseFloat(value);
                else if (code === 51) ent.endAngle   = parseFloat(value);
                else if (code === 70) ent.flags  = parseInt(value, 10);
                else if (code === 71) ent.degree = parseInt(value, 10);
                i++;
            }

            if (type === 'VERTEX') {
                if (currentPolyline) {
                    currentPolyline.xs.push(ent.xs[0] || 0);
                    currentPolyline.ys.push(ent.ys[0] || 0);
                }
            } else if (type === 'POLYLINE') {
                if (currentPolyline) entities.push(currentPolyline);
                currentPolyline = ent;
            } else {
                if (currentPolyline) { entities.push(currentPolyline); currentPolyline = null; }
                entities.push(ent);
            }
        }
        if (currentPolyline) entities.push(currentPolyline);
        return entities;
    }

    function tessellateArc(cx, cy, r, startDeg, endDeg, scale, yf) {
        let start = startDeg * Math.PI / 180;
        let end   = endDeg   * Math.PI / 180;
        if (end <= start) end += 2 * Math.PI;
        const steps = Math.max(8, Math.ceil((end - start) / (Math.PI / 90)));
        const pts = [];
        for (let i = 0; i <= steps; i++) {
            const a = start + (end - start) * i / steps;
            pts.push({ x: (cx + Math.cos(a) * r) * scale, y: yf * (cy + Math.sin(a) * r) * scale });
        }
        return pts;
    }

    function tessellateEllipse(cx, cy, majorX, majorY, ratio, scale, yf) {
        const majorLen = Math.sqrt(majorX * majorX + majorY * majorY);
        const minorLen = majorLen * (ratio || 1);
        const angle = Math.atan2(majorY, majorX);
        const steps = 72;
        const pts = [];
        for (let i = 0; i <= steps; i++) {
            const t = 2 * Math.PI * i / steps;
            const lx = Math.cos(t) * majorLen;
            const ly = Math.sin(t) * minorLen;
            pts.push({
                x: (cx + lx * Math.cos(angle) - ly * Math.sin(angle)) * scale,
                y: yf * (cy + lx * Math.sin(angle) + ly * Math.cos(angle)) * scale
            });
        }
        return pts;
    }

    // Evaluate a B-spline at parameter t using de Boor's algorithm.
    function bsplineEval(t, p, knots, xs, ys) {
        const m = knots.length - 1;
        const tMax = knots[m - p];
        if (t >= tMax) t = tMax - 1e-10;

        // Find knot span k: largest k such that knots[k] <= t < knots[k+1]
        let k = p;
        for (let i = p; i < m - p; i++) {
            if (knots[i] <= t && t < knots[i + 1]) { k = i; break; }
        }

        const dx = [], dy = [];
        for (let j = 0; j <= p; j++) {
            dx.push(xs[k - p + j]);
            dy.push(ys[k - p + j]);
        }
        for (let r = 1; r <= p; r++) {
            for (let j = p; j >= r; j--) {
                const i0 = k - p + j;
                const denom = knots[i0 + p - r + 1] - knots[i0];
                const alpha = denom < 1e-12 ? 0 : (t - knots[i0]) / denom;
                dx[j] = (1 - alpha) * dx[j - 1] + alpha * dx[j];
                dy[j] = (1 - alpha) * dy[j - 1] + alpha * dy[j];
            }
        }
        return { x: dx[p], y: dy[p] };
    }

    function bsplineTessellate(degree, knots, xs, ys) {
        const tMin = knots[degree];
        const tMax = knots[knots.length - degree - 1];
        // Count distinct spans for step budget
        let spans = 0;
        for (let i = degree; i < knots.length - degree - 1; i++) {
            if (knots[i] < knots[i + 1]) spans++;
        }
        const steps = Math.max(32, spans * 24);
        const pts = [];
        for (let i = 0; i <= steps; i++) {
            pts.push(bsplineEval(tMin + (tMax - tMin) * i / steps, degree, knots, xs, ys));
        }
        return pts;
    }

    function entityToPoints(ent, scale) {
        const yf = -1; // DXF Y-up → canvas Y-down
        const x0 = ent.xs[0] || 0, y0 = ent.ys[0] || 0;

        switch (ent.type) {
            case 'LINE':
                return [
                    { x: x0 * scale, y: yf * y0 * scale },
                    { x: (ent.x1s[0] || 0) * scale, y: yf * (ent.y1s[0] || 0) * scale }
                ];

            case 'LWPOLYLINE':
            case 'POLYLINE': {
                const closed = (ent.flags & 1) !== 0;
                const pts = ent.xs.map((x, k) => ({ x: x * scale, y: yf * (ent.ys[k] || 0) * scale }));
                if (closed && pts.length > 1) pts.push({ x: pts[0].x, y: pts[0].y });
                return pts;
            }

            case 'CIRCLE':
                return tessellateArc(x0, y0, ent.vals40[0] || 1, 0, 360, scale, yf);

            case 'ARC':
                return tessellateArc(x0, y0, ent.vals40[0] || 1,
                    ent.startAngle || 0, ent.endAngle || 0, scale, yf);

            case 'ELLIPSE':
                return tessellateEllipse(x0, y0,
                    ent.x1s[0] || 1, ent.y1s[0] || 0, ent.vals40[0] || 1, scale, yf);

            case 'SPLINE': {
                const closed = (ent.flags & 1) !== 0;
                const degree = ent.degree || 3;
                const knots  = ent.vals40;
                // Fit points (code 11/21) lie on the curve; prefer them when available
                const hasFit = ent.x1s.length > 1;
                let rawPts;
                if (!hasFit && knots.length >= degree + 2 && ent.xs.length >= degree + 1) {
                    rawPts = bsplineTessellate(degree, knots, ent.xs, ent.ys);
                } else {
                    const srcXs = hasFit ? ent.x1s : ent.xs;
                    const srcYs = hasFit ? ent.y1s : ent.ys;
                    rawPts = srcXs.map((x, k) => ({ x, y: srcYs[k] || 0 }));
                }
                const pts = rawPts.map(p => ({ x: p.x * scale, y: yf * p.y * scale }));
                if (closed && pts.length > 1) pts.push({ x: pts[0].x, y: pts[0].y });
                return pts;
            }
        }
        return null;
    }

    window.parseDxfContent = function (text, name) {
        try {
            const groups   = parseDxfGroups(text);
            const scale    = getDxfUnitsScale(groups);
            const entities = extractDxfEntities(groups);
            const paths    = [];

            for (const ent of entities) {
                const pts = entityToPoints(ent, scale);
                if (!pts || pts.length < 2) continue;
                const simplified = simplifyPoints(pts, 0.1);
                if (simplified.length < 2) continue;
                const label = ent.type.charAt(0) + ent.type.slice(1).toLowerCase();
                paths.push({ geom: simplified, name: label });
            }

            if (paths.length === 0) {
                alert('No supported geometry found in DXF file.');
                return;
            }
            importParsedPaths(paths, name);
        } catch (e) {
            console.error('parseDxfContent error:', e);
            alert('Failed to import DXF file: ' + e.message);
        }
    };

})();
