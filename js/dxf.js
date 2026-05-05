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
                        if (u === 0) return null;              // unitless
                        if (u === 1) return 25.4 * viewScale;  // inches
                        if (u === 5) return 10 * viewScale;    // centimeters
                        if (u === 6) return 1000 * viewScale;  // meters
                        return viewScale;                       // mm or unsupported units
                    }
                }
            }
        }
        return null; // no declared units
    }

    function getDxfUnitsScaleFromChoice(units) {
        if (units === 'in') return 25.4 * viewScale;
        if (units === 'cm') return 10 * viewScale;
        if (units === 'm') return 1000 * viewScale;
        return viewScale;
    }

    function getEntityBounds(entities) {
        const bounds = { minx: Infinity, miny: Infinity, maxx: -Infinity, maxy: -Infinity };
        function addPoint(x, y) {
            if (!isFinite(x) || !isFinite(y)) return;
            bounds.minx = Math.min(bounds.minx, x);
            bounds.miny = Math.min(bounds.miny, y);
            bounds.maxx = Math.max(bounds.maxx, x);
            bounds.maxy = Math.max(bounds.maxy, y);
        }

        for (const ent of entities) {
            for (let i = 0; i < ent.xs.length; i++) addPoint(ent.xs[i], ent.ys[i] || 0);
            for (let i = 0; i < ent.x1s.length; i++) addPoint(ent.x1s[i], ent.y1s[i] || 0);
        }
        return bounds;
    }

    function guessUnitlessDxfUnits(entities) {
        const bounds = getEntityBounds(entities);
        if (!isFinite(bounds.minx) || !isFinite(bounds.maxx) || !isFinite(bounds.miny) || !isFinite(bounds.maxy)) {
            return 'mm';
        }
        const maxExtent = Math.max(bounds.maxx - bounds.minx, bounds.maxy - bounds.miny);
        return maxExtent > 1 && maxExtent < 50 ? 'cm' : 'mm';
    }

    async function resolveDxfUnitsScale(groups, entities) {
        const declaredScale = getDxfUnitsScale(groups);
        if (declaredScale !== null) return declaredScale;

        const defaultUnits = guessUnitlessDxfUnits(entities);
        if (typeof showDxfUnitsModal === 'function') {
            const selectedUnits = await showDxfUnitsModal(defaultUnits);
            return selectedUnits ? getDxfUnitsScaleFromChoice(selectedUnits) : null;
        }

        return getDxfUnitsScaleFromChoice(defaultUnits);
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

    function pointsNear(a, b, tolerance) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return dx * dx + dy * dy <= tolerance * tolerance;
    }

    function appendPointIfDifferent(points, point, tolerance) {
        if (points.length === 0 || !pointsNear(points[points.length - 1], point, tolerance)) {
            points.push(point);
        }
    }

    function isClosedChain(points, tolerance) {
        return points.length > 2 && pointsNear(points[0], points[points.length - 1], tolerance);
    }

    function stitchLineSegments(segments, tolerance) {
        const chains = [];
        const unused = segments.slice();

        while (unused.length > 0) {
            const first = unused.shift();
            const chain = [first[0], first[1]];
            let extended = true;

            while (extended && !isClosedChain(chain, tolerance)) {
                extended = false;
                const head = chain[0];
                const tail = chain[chain.length - 1];

                for (let i = 0; i < unused.length; i++) {
                    const seg = unused[i];
                    const start = seg[0];
                    const end = seg[1];

                    if (pointsNear(tail, start, tolerance)) {
                        appendPointIfDifferent(chain, end, tolerance);
                    } else if (pointsNear(tail, end, tolerance)) {
                        appendPointIfDifferent(chain, start, tolerance);
                    } else if (pointsNear(head, end, tolerance)) {
                        if (!pointsNear(chain[0], start, tolerance)) chain.unshift(start);
                    } else if (pointsNear(head, start, tolerance)) {
                        if (!pointsNear(chain[0], end, tolerance)) chain.unshift(end);
                    } else {
                        continue;
                    }

                    unused.splice(i, 1);
                    extended = true;
                    break;
                }
            }

            chains.push(chain);
        }

        return chains;
    }

    function buildStitchedLinePaths(lineEntities, scale) {
        const byLayer = {};
        const tolerance = Math.max(0.001, (getOption("tolerance") || 0.1) * viewScale * 0.1);

        for (const ent of lineEntities) {
            const pts = entityToPoints(ent, scale);
            if (!pts || pts.length < 2 || pointsNear(pts[0], pts[1], tolerance)) continue;
            const layer = ent.layer || '0';
            if (!byLayer[layer]) byLayer[layer] = [];
            byLayer[layer].push(pts);
        }

        const paths = [];
        Object.keys(byLayer).forEach(function(layer) {
            const chains = stitchLineSegments(byLayer[layer], tolerance);
            chains.forEach(function(chain) {
                if (chain.length >= 2) paths.push({ geom: chain, name: 'Line' });
            });
        });

        return paths;
    }

    window.parseDxfContent = async function (text, name) {
        try {
            const groups   = parseDxfGroups(text);
            const entities = extractDxfEntities(groups);
            const scale    = await resolveDxfUnitsScale(groups, entities);
            if (!scale) {
                if (typeof notify === 'function') {
                    notify('DXF import canceled: drawing units are required', 'warning');
                }
                return;
            }
            const paths    = [];
            const lineEntities = [];

            for (const ent of entities) {
                if (ent.type === 'LINE') {
                    lineEntities.push(ent);
                    continue;
                }

                const pts = entityToPoints(ent, scale);
                if (!pts || pts.length < 2) continue;
                const simplified = simplifyPoints(pts, 0.1);
                if (simplified.length < 2) continue;
                const label = ent.type.charAt(0) + ent.type.slice(1).toLowerCase();
                paths.push({ geom: simplified, name: label });
            }

            buildStitchedLinePaths(lineEntities, scale).forEach(function(linePath) {
                const simplified = simplifyPoints(linePath.geom, 0.1);
                if (simplified.length >= 2) {
                    paths.push({ geom: simplified, name: linePath.name });
                }
            });

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
