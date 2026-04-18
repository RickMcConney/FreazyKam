class Curve extends Operation {
    constructor() {
        super('Curve', 'spline', 'Draw smooth Bezier curves. Click to add points, Alt+click for corners. Click near start to close, Escape to finish.');

        this.closeDistance = 15;
        this.handleSize = 8;
        this.mouseDown = false;
        this.active = false;
        this.alwaysCorner = false;
        this.curveFit = 'catmull-rom';

        this.properties = { curveFit: 'catmull-rom' };
        this.fields = {
            curveFit: {
                key: 'curveFit', label: 'Curve Fitting', type: 'choice',
                default: 'catmull-rom',
                options: [
                    { value: 'catmull-rom',  label: 'Catmull-Rom' },
                    { value: 'bezier',       label: 'Bezier' },
                    { value: 'cubic-spline', label: 'Cubic Spline' },
                    { value: 'arc-fit',      label: 'Arc Fit' },
                ],
                help: 'Controls how anchor points are interpolated.',
            }
        };

        // Drawing state
        this.nodes = [];        // [{x, y, corner}]
        this.mousePos = null;   // {x, y, corner}
        this.nearFirstPoint = false;

        // Edit state
        this.editPath = null;           // svgpath being edited
        this.activeHandle = null;       // node index being dragged
        this.hoveredHandle = null;
        this.insertPreviewPoint = null; // {x, y, anchorSegIdx} — insert preview on curve line
        this.handleWasDragged = false;

        this.keydownHandler = (evt) => {
            if (!this.active) return;
            const el = document.activeElement;
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;

            if (evt.key === 'Escape') {
                if (this.editPath !== null) {
                    this.editPath = null;
                    redraw();
                } else if (this.nodes.length > 0) {
                    this.finishDrawing();
                }
            }

            if ((evt.key === 'Delete' || evt.key === 'Backspace') && this.editPath !== null && this.hoveredHandle !== null) {
                evt.preventDefault();
                this._deleteNode(this.hoveredHandle);
            }
        };
    }

    start() {
        this.active = true;
        this.nodes = [];
        this.editPath = null;
        this.mousePos = null;
        this.activeHandle = null;
        this.hoveredHandle = null;
        this.insertPreviewPoint = null;
        this.curveFit = this.properties.curveFit || 'catmull-rom';
        document.addEventListener('keydown', this.keydownHandler);
        super.start();
    }

    stop() {
        this.active = false;
        if (this.nodes.length > 1) {
            this.finishDrawing();
        } else {
            this.nodes = [];
            this.mousePos = null;
        }
        this.editPath = null;
        this.activeHandle = null;
        this.hoveredHandle = null;
        this.insertPreviewPoint = null;
        document.removeEventListener('keydown', this.keydownHandler);
        super.stop();
    }

    // ── Spline math ──────────────────────────────────────────────────────────

    // Returns cubic Bezier control points for the segment nodes[i] → nodes[i+1].
    // Uses Catmull-Rom for smooth nodes; degenerates to straight line for corners.
    _segmentCP(nodes, i, closed) {
        const n = nodes.length;
        const p1 = nodes[i];
        const p2 = nodes[(i + 1) % n];

        if (p1.corner || p2.corner) {
            return { cp1x: p1.x, cp1y: p1.y, cp2x: p2.x, cp2y: p2.y };
        }

        let p0, p3;
        if (closed) {
            p0 = nodes[(i - 1 + n) % n];
            p3 = nodes[(i + 2) % n];
        } else {
            p0 = i > 0 ? nodes[i - 1] : { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y };
            p3 = (i + 2 < n) ? nodes[i + 2] : { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y };
        }

        return {
            cp1x: p1.x + (p2.x - p0.x) / 6,
            cp1y: p1.y + (p2.y - p0.y) / 6,
            cp2x: p2.x - (p3.x - p1.x) / 6,
            cp2y: p2.y - (p3.y - p1.y) / 6
        };
    }

    tessellate(nodes, closed, curveFit) {
        if (nodes.length < 2) return nodes.map(n => ({ x: n.x, y: n.y }));
        curveFit = curveFit || 'catmull-rom';
        if (curveFit === 'bezier')       return this._tessBezier(nodes, closed);
        if (curveFit === 'cubic-spline') return this._tessCubicSpline(nodes, closed);
        if (curveFit === 'arc-fit')      return this._tessArcFit(nodes, closed);
        return this._tessCatmullRom(nodes, closed);
    }

    // ── Shared tessellation helpers ───────────────────────────────────────────

    _tessSegment(pts, p1, p2, cp) {
        const polyLen =
            Math.hypot(cp.cp1x - p1.x,  cp.cp1y - p1.y) +
            Math.hypot(cp.cp2x - cp.cp1x, cp.cp2y - cp.cp1y) +
            Math.hypot(p2.x - cp.cp2x,  p2.y - cp.cp2y);
        const res = Math.max(2, Math.min(30, Math.ceil(polyLen / 40)));
        for (let t = 1; t <= res; t++) {
            const u = t / res, v = 1 - u;
            pts.push({
                x: v*v*v*p1.x + 3*v*v*u*cp.cp1x + 3*v*u*u*cp.cp2x + u*u*u*p2.x,
                y: v*v*v*p1.y + 3*v*v*u*cp.cp1y + 3*v*u*u*cp.cp2y + u*u*u*p2.y
            });
        }
    }

    _tessellateWithCP(nodes, closed, cpFn) {
        const pts = [{ x: nodes[0].x, y: nodes[0].y }];
        const n = nodes.length;
        const segCount = closed ? n : n - 1;
        for (let i = 0; i < segCount; i++) {
            const p1 = nodes[i], p2 = nodes[(i + 1) % n];
            if (p1.corner || p2.corner) {
                pts.push({ x: p2.x, y: p2.y });
            } else {
                this._tessSegment(pts, p1, p2, cpFn(nodes, i, closed));
            }
        }
        if (closed) pts.push({ x: pts[0].x, y: pts[0].y });
        return pts;
    }

    // ── Catmull-Rom ───────────────────────────────────────────────────────────

    _tessCatmullRom(nodes, closed) {
        return this._tessellateWithCP(nodes, closed, (nd, i, cl) => this._segmentCP(nd, i, cl));
    }

    // ── Bezier (chord-length scaled handles) ──────────────────────────────────

    _segmentCP_bezier(nodes, i, closed) {
        const n = nodes.length;
        const p1 = nodes[i], p2 = nodes[(i + 1) % n];
        const chord = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const h = chord / 3;

        let p0, p3;
        if (closed) {
            p0 = nodes[(i - 1 + n) % n];
            p3 = nodes[(i + 2) % n];
        } else {
            p0 = i > 0 ? nodes[i - 1] : { x: 2*p1.x - p2.x, y: 2*p1.y - p2.y };
            p3 = (i + 2 < n) ? nodes[i + 2] : { x: 2*p2.x - p1.x, y: 2*p2.y - p1.y };
        }

        const d1x = p2.x - p0.x, d1y = p2.y - p0.y, len1 = Math.hypot(d1x, d1y);
        const d2x = p3.x - p1.x, d2y = p3.y - p1.y, len2 = Math.hypot(d2x, d2y);

        return {
            cp1x: p1.x + (len1 > 1e-9 ? d1x/len1 * h : 0),
            cp1y: p1.y + (len1 > 1e-9 ? d1y/len1 * h : 0),
            cp2x: p2.x - (len2 > 1e-9 ? d2x/len2 * h : 0),
            cp2y: p2.y - (len2 > 1e-9 ? d2y/len2 * h : 0),
        };
    }

    _tessBezier(nodes, closed) {
        return this._tessellateWithCP(nodes, closed, (nd, i, cl) => this._segmentCP_bezier(nd, i, cl));
    }

    // ── Natural cubic spline (C2 continuous) ──────────────────────────────────

    _thomas(n, b, c, d) {
        const c2 = new Float64Array(n), d2 = new Float64Array(n), x = new Float64Array(n);
        c2[0] = c[0] / b[0];
        d2[0] = d[0] / b[0];
        for (let i = 1; i < n; i++) {
            const denom = b[i] - c2[i - 1]; // lower diagonal = 1
            c2[i] = i < n - 1 ? c[i] / denom : 0;
            d2[i] = (d[i] - d2[i - 1]) / denom;
        }
        x[n - 1] = d2[n - 1];
        for (let i = n - 2; i >= 0; i--) x[i] = d2[i] - c2[i] * x[i + 1];
        return x;
    }

    _solveOpenSpline(pts) {
        const n = pts.length;
        if (n < 2) return { mx: new Float64Array(n), my: new Float64Array(n) };
        if (n === 2) {
            const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y;
            return { mx: new Float64Array([dx, dx]), my: new Float64Array([dy, dy]) };
        }
        const b = new Float64Array(n).fill(4); b[0] = 2; b[n - 1] = 2;
        const c = new Float64Array(n).fill(1); c[n - 1] = 0;
        const drx = new Float64Array(n), dry = new Float64Array(n);
        drx[0] = 3*(pts[1].x - pts[0].x); dry[0] = 3*(pts[1].y - pts[0].y);
        for (let i = 1; i < n - 1; i++) {
            drx[i] = 3*(pts[i+1].x - pts[i-1].x);
            dry[i] = 3*(pts[i+1].y - pts[i-1].y);
        }
        drx[n-1] = 3*(pts[n-1].x - pts[n-2].x); dry[n-1] = 3*(pts[n-1].y - pts[n-2].y);
        return { mx: this._thomas(n, b, c, drx), my: this._thomas(n, b, c, dry) };
    }

    _solveCyclicSpline(pts) {
        const n = pts.length;
        const gamma = -4, alpha = 1, beta = 1;
        const b = new Float64Array(n).fill(4);
        b[0] -= gamma; b[n - 1] -= alpha * beta / gamma;
        const c = new Float64Array(n).fill(1); c[n - 1] = 0;
        const drx = new Float64Array(n), dry = new Float64Array(n);
        for (let i = 0; i < n; i++) {
            const prev = (i - 1 + n) % n, next = (i + 1) % n;
            drx[i] = 3*(pts[next].x - pts[prev].x);
            dry[i] = 3*(pts[next].y - pts[prev].y);
        }
        const u = new Float64Array(n); u[0] = gamma; u[n - 1] = alpha;
        const yx = this._thomas(n, b, c, drx), yy = this._thomas(n, b, c, dry);
        const z  = this._thomas(n, b, c, u);
        const bOverG = beta / gamma;
        const vdotz = z[0] + bOverG * z[n - 1];
        const factor = 1 / (1 + vdotz);
        const mx = new Float64Array(n), my = new Float64Array(n);
        const vyx = yx[0] + bOverG * yx[n - 1], vyy = yy[0] + bOverG * yy[n - 1];
        for (let i = 0; i < n; i++) {
            mx[i] = yx[i] - z[i] * vyx * factor;
            my[i] = yy[i] - z[i] * vyy * factor;
        }
        return { mx, my };
    }

    _cubicSplineDerivatives(nodes, closed) {
        const n = nodes.length;
        const mx = new Float64Array(n), my = new Float64Array(n);

        if (closed && !nodes.some(nd => nd.corner)) {
            const res = this._solveCyclicSpline(nodes);
            for (let i = 0; i < n; i++) { mx[i] = res.mx[i]; my[i] = res.my[i]; }
            return { mx, my };
        }

        // Find smooth runs (sequences of non-corner nodes)
        const processRun = (idxs) => {
            if (idxs.length < 2) return;
            const sub = idxs.map(i => nodes[i]);
            const res = this._solveOpenSpline(sub);
            for (let j = 0; j < idxs.length; j++) { mx[idxs[j]] = res.mx[j]; my[idxs[j]] = res.my[j]; }
        };

        if (!closed) {
            let cur = null;
            for (let i = 0; i < n; i++) {
                if (!nodes[i].corner) { if (!cur) cur = []; cur.push(i); }
                else { processRun(cur || []); cur = null; }
            }
            processRun(cur || []);
        } else {
            const firstCorner = nodes.findIndex(nd => nd.corner);
            let cur = null;
            for (let k = 1; k <= n; k++) {
                const i = (firstCorner + k) % n;
                if (!nodes[i].corner) { if (!cur) cur = []; cur.push(i); }
                else { processRun(cur || []); cur = null; }
            }
            processRun(cur || []);
        }
        return { mx, my };
    }

    _tessCubicSpline(nodes, closed) {
        const n = nodes.length;
        const { mx, my } = this._cubicSplineDerivatives(nodes, closed);
        return this._tessellateWithCP(nodes, closed, (_, i) => {
            const p1 = nodes[i], p2 = nodes[(i + 1) % n];
            return {
                cp1x: p1.x + mx[i] / 3, cp1y: p1.y + my[i] / 3,
                cp2x: p2.x - mx[(i + 1) % n] / 3, cp2y: p2.y - my[(i + 1) % n] / 3,
            };
        });
    }

    // ── Arc fit (tangent-constrained circular arcs) ───────────────────────────

    _crTangent(nodes, i, closed) {
        const n = nodes.length;
        const p1 = nodes[i];
        const p0 = closed ? nodes[(i - 1 + n) % n] : (i > 0 ? nodes[i - 1] : null);
        const p2 = nodes[(i + 1) % n];
        const dx = p0 ? p2.x - p0.x : p2.x - p1.x;
        const dy = p0 ? p2.y - p0.y : p2.y - p1.y;
        const len = Math.hypot(dx, dy);
        return len > 1e-9 ? { tx: dx / len, ty: dy / len } : null;
    }

    _tessArcFit(nodes, closed) {
        const pts = [{ x: nodes[0].x, y: nodes[0].y }];
        const n = nodes.length;
        const segCount = closed ? n : n - 1;

        for (let i = 0; i < segCount; i++) {
            const p1 = nodes[i], p2 = nodes[(i + 1) % n];
            if (p1.corner || p2.corner) { pts.push({ x: p2.x, y: p2.y }); continue; }

            // Segment 0 of an open path: p1 has no predecessor so _crTangent returns the
            // chord direction, making it parallel to p1→p2 and dotDN collapses to 0.
            // Instead, constrain the arc by the tangent at p2 and compute center from p2.
            const useP2Tang = !closed && i === 0 && n > 2;
            const tang = this._crTangent(nodes, useP2Tang ? 1 : i, closed);
            if (!tang) { pts.push({ x: p2.x, y: p2.y }); continue; }

            const nx = -tang.ty, ny = tang.tx;
            let cx, cy, r;

            if (useP2Tang) {
                // Center = p2 + r*n;  r derived from |center - p1| = |r|
                const dpx = p2.x - p1.x, dpy = p2.y - p1.y;
                const dot = dpx * nx + dpy * ny;
                if (Math.abs(dot) < 1e-6) { pts.push({ x: p2.x, y: p2.y }); continue; }
                r = -(dpx * dpx + dpy * dpy) / (2 * dot);
                cx = p2.x + r * nx;
                cy = p2.y + r * ny;
            } else {
                // Center = p1 + r*n;  r derived from |center - p2| = |r|
                const dpx = p1.x - p2.x, dpy = p1.y - p2.y;
                const dotDN = dpx * nx + dpy * ny;
                if (Math.abs(dotDN) < 1e-6) { pts.push({ x: p2.x, y: p2.y }); continue; }
                r = -(dpx * dpx + dpy * dpy) / (2 * dotDN);
                cx = p1.x + r * nx;
                cy = p1.y + r * ny;
            }

            const absR = Math.abs(r);
            if (absR > 1e6) { pts.push({ x: p2.x, y: p2.y }); continue; }

            let θ1 = Math.atan2(p1.y - cy, p1.x - cx);
            let θ2 = Math.atan2(p2.y - cy, p2.x - cx);

            if (r > 0) { if (θ2 < θ1) θ2 += 2 * Math.PI; }
            else       { if (θ2 > θ1) θ2 -= 2 * Math.PI; }

            const arcLen = absR * Math.abs(θ2 - θ1);
            const res = Math.max(2, Math.min(30, Math.ceil(arcLen / 40)));
            const span = θ2 - θ1;
            for (let t = 1; t <= res; t++) {
                const θ = θ1 + span * (t / res);
                pts.push({ x: cx + absR * Math.cos(θ), y: cy + absR * Math.sin(θ) });
            }
        }

        if (closed) pts.push({ x: pts[0].x, y: pts[0].y });
        return pts;
    }

    // Catmull-Rom tangent direction at smooth node i (normalised)
    _nodeTangent(nodes, i, closed) {
        const n = nodes.length;
        const node = nodes[i];
        if (node.corner) return null;

        let prev, next;
        if (closed) {
            prev = nodes[(i - 1 + n) % n];
            next = nodes[(i + 1) % n];
        } else {
            if (i === 0 || i === n - 1) return null; // endpoints of open path: skip
            prev = nodes[i - 1];
            next = nodes[i + 1];
        }

        const dx = next.x - prev.x, dy = next.y - prev.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 0.001) return null;
        return { dx: dx / len, dy: dy / len };
    }

    // ── Drawing ───────────────────────────────────────────────────────────────

    draw(ctx) {
        ctx.save();

        if (this.editPath !== null) {
            if (!this.alwaysCorner) this._drawTangentArms(ctx);
            this._drawAnchorHandles(ctx, this.editPath.creationProperties.nodes, this.activeHandle, this.hoveredHandle);
            if (this.insertPreviewPoint) {
                const sp = worldToScreen(this.insertPreviewPoint.x, this.insertPreviewPoint.y);
                this.drawHandle(ctx, sp.x, sp.y, this.handleSize, insertPreviewColor, insertPreviewStroke);
                this.drawCrosshair(ctx, sp.x, sp.y, 3, insertPreviewStroke, 1);
            }
            ctx.restore();
            return;
        }

        if (this.nodes.length === 0) { ctx.restore(); return; }

        // Curve built so far + preview to mouse
        const previewNodes = (!this.nearFirstPoint && this.mousePos)
            ? [...this.nodes, this.mousePos]
            : this.nodes;

        if (previewNodes.length >= 2) {
            const pts = this.tessellate(previewNodes, false, this.curveFit);
            ctx.beginPath();
            const p0 = worldToScreen(pts[0].x, pts[0].y);
            ctx.moveTo(p0.x, p0.y);
            for (let i = 1; i < pts.length; i++) {
                const pi = worldToScreen(pts[i].x, pts[i].y);
                ctx.lineTo(pi.x, pi.y);
            }
            ctx.strokeStyle = penLineColor;
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Closing preview (dashed loop back to first point)
        if (this.nearFirstPoint && this.nodes.length >= 3) {
            const closePts = this.tessellate(this.nodes, true, this.curveFit);
            ctx.beginPath();
            const p0 = worldToScreen(closePts[0].x, closePts[0].y);
            ctx.moveTo(p0.x, p0.y);
            for (let i = 1; i < closePts.length; i++) {
                const pi = worldToScreen(closePts[i].x, closePts[i].y);
                ctx.lineTo(pi.x, pi.y);
            }
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = penCloseLineColor;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.setLineDash([]);
        }

        this._drawAnchorHandles(ctx, this.nodes, null, null);

        // Highlight first point when near it
        if (this.nearFirstPoint && this.nodes.length >= 3) {
            const sp = worldToScreen(this.nodes[0].x, this.nodes[0].y);
            ctx.setLineDash([3, 3]);
            this.drawCircle(ctx, sp.x, sp.y, this.closeDistance, null, penFirstPointColor, 2);
            ctx.setLineDash([]);
            this.drawCircle(ctx, sp.x, sp.y, 5, penFirstPointColor, null);
        }

        ctx.restore();
    }

    _drawAnchorHandles(ctx, nodes, activeIdx, hoveredIdx) {
        const closed = this.editPath ? this.editPath.closed : false;
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            const sp = worldToScreen(n.x, n.y);
            let fill, stroke;

            if (activeIdx === i) {
                fill = handleActiveColor; stroke = handleActiveStroke;
            } else if (hoveredIdx === i) {
                fill = handleHoverColor; stroke = handleHoverStroke;
            } else if (i === 0) {
                fill = '#22c55e'; stroke = '#16a34a';
            } else if (n.corner) {
                fill = '#f97316'; stroke = '#c2410c';
            } else {
                fill = handleNormalColor; stroke = handleNormalStroke;
            }

            this.drawHandle(ctx, sp.x, sp.y, this.handleSize, fill, stroke);
        }
    }

    // Draw tangent arm lines through each smooth anchor to visualise curve direction
    _drawTangentArms(ctx) {
        if (!this.editPath || !this.editPath.creationProperties) return;
        const nodes = this.editPath.creationProperties.nodes;
        const closed = this.editPath.closed;
        const armLen = 28; // pixels

        ctx.save();
        ctx.strokeStyle = 'rgba(99,102,241,0.6)';
        ctx.lineWidth = 1;

        for (let i = 0; i < nodes.length; i++) {
            const t = this._nodeTangent(nodes, i, closed);
            if (!t) continue;

            const sp = worldToScreen(nodes[i].x, nodes[i].y);
            // Convert world tangent to screen tangent direction
            const sp2 = worldToScreen(nodes[i].x + t.dx, nodes[i].y + t.dy);
            const pdx = sp2.x - sp.x, pdy = sp2.y - sp.y;
            const plen = Math.sqrt(pdx * pdx + pdy * pdy);
            if (plen < 0.001) continue;
            const ux = pdx / plen, uy = pdy / plen;

            ctx.beginPath();
            ctx.moveTo(sp.x - ux * armLen, sp.y - uy * armLen);
            ctx.lineTo(sp.x + ux * armLen, sp.y + uy * armLen);
            ctx.stroke();

            this.drawCircle(ctx, sp.x - ux * armLen, sp.y - uy * armLen, 3, 'rgba(99,102,241,0.6)', null);
            this.drawCircle(ctx, sp.x + ux * armLen, sp.y + uy * armLen, 3, 'rgba(99,102,241,0.6)', null);
        }

        ctx.restore();
    }

    // ── Hit testing ───────────────────────────────────────────────────────────

    _getHandleAt(mouse) {
        if (!this.editPath || !this.editPath.creationProperties) return null;
        const nodes = this.editPath.creationProperties.nodes;
        let closest = null, closestDist = this.handleSize * 2;
        for (let i = 0; i < nodes.length; i++) {
            const dx = nodes[i].x - mouse.x, dy = nodes[i].y - mouse.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d <= closestDist) { closest = i; closestDist = d; }
        }
        return closest;
    }

    // Find closest point on the tessellated curve; returns {x, y, anchorSegIdx} or null
    _findClosestCurveSegment(mouse) {
        if (!this.editPath || !this.editPath.creationProperties) return null;
        const pts = this.editPath.path;
        const nodes = this.editPath.creationProperties.nodes;
        if (pts.length < 2) return null;

        const closed = this.editPath.closed;
        let minDist = Infinity, closestPt = null, closestK = -1;

        for (let k = 0; k < pts.length - 1; k++) {
            const pt = closestPointOnSegment(mouse, pts[k], pts[k + 1]);
            const dx = mouse.x - pt.x, dy = mouse.y - pt.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < minDist) { minDist = d; closestPt = pt; closestK = k; }
        }

        if (minDist > this.handleSize * 3) return null;

        // Map tessellated segment index back to anchor segment index,
        // mirroring the adaptive resolution logic in tessellate().
        const segCount = closed ? nodes.length : nodes.length - 1;
        let tessIdx = 0, anchorSegIdx = 0;
        for (let i = 0; i < segCount; i++) {
            const p1 = nodes[i], p2 = nodes[(i + 1) % nodes.length];
            let segPts;
            if (p1.corner || p2.corner) {
                segPts = 1;
            } else {
                const cp = this._segmentCP(nodes, i, closed);
                const polyLen =
                    Math.hypot(cp.cp1x - p1.x,  cp.cp1y - p1.y) +
                    Math.hypot(cp.cp2x - cp.cp1x, cp.cp2y - cp.cp1y) +
                    Math.hypot(p2.x - cp.cp2x,  p2.y - cp.cp2y);
                segPts = Math.max(2, Math.min(30, Math.ceil(polyLen / 40)));
            }
            if (closestK < tessIdx + segPts) { anchorSegIdx = i; break; }
            tessIdx += segPts;
            anchorSegIdx = i;
        }
        anchorSegIdx = Math.min(anchorSegIdx, nodes.length - (closed ? 1 : 2));

        return { x: closestPt.x, y: closestPt.y, anchorSegIdx };
    }

    _deleteNode(index) {
        if (!this.editPath || !this.editPath.creationProperties) return;
        const nodes = this.editPath.creationProperties.nodes;
        const minPoints = this.editPath.closed ? 3 : 2;
        if (nodes.length <= minPoints) {
            notify(`Cannot delete: minimum ${minPoints} points required`);
            return;
        }

        addUndo(false, true, false);
        nodes.splice(index, 1);

        // Snapshot path id before any async work
        const pathId = this.editPath.id;
        const closed = this.editPath.closed;

        const curveFit = this.editPath.creationProperties.curveFit;
        this.editPath.path = this.tessellate(nodes.slice(), closed, curveFit);
        this.editPath.bbox = boundingBox(this.editPath.path);
        this.hoveredHandle = null;
        this.insertPreviewPoint = null;

        redraw();

        // Defer toolpath regeneration so it runs after the current frame paints
        if (typeof regenerateToolpathsForPaths === 'function') {
            setTimeout(() => regenerateToolpathsForPaths([pathId]), 0);
        }
    }

    // ── Event handlers ────────────────────────────────────────────────────────

    onMouseDown(canvas, evt) {
        const mouse = this.normalizeEvent(canvas, evt);
        this.mouseDown = true;

        // ── Edit mode ──
        if (this.editPath !== null) {
            this.activeHandle = this._getHandleAt(mouse);
            if (this.activeHandle !== null) {
                if (evt.altKey && !this.alwaysCorner) {
                    // Alt+click: toggle corner ↔ smooth
                    addUndo(false, true, false);
                    const nodes = this.editPath.creationProperties.nodes;
                    nodes[this.activeHandle].corner = !nodes[this.activeHandle].corner;
                    this.editPath.path = this.tessellate(nodes, this.editPath.closed, this.editPath.creationProperties.curveFit);
                    this.editPath.bbox = boundingBox(this.editPath.path);
                    this.activeHandle = null;
                    if (typeof regenerateToolpathsForPaths === 'function') {
                        regenerateToolpathsForPaths([this.editPath.id]);
                    }
                    redraw();
                    return;
                }
                this.handleWasDragged = false;
                addUndo(false, true, false);
                return;
            }
            // Insert new node on curve line
            if (this.insertPreviewPoint) {
                addUndo(false, true, false);
                const nodes = this.editPath.creationProperties.nodes;
                nodes.splice(this.insertPreviewPoint.anchorSegIdx + 1, 0, {
                    x: this.insertPreviewPoint.x,
                    y: this.insertPreviewPoint.y,
                    corner: false
                });
                this.editPath.path = this.tessellate(nodes, this.editPath.closed, this.editPath.creationProperties.curveFit);
                this.editPath.bbox = boundingBox(this.editPath.path);
                this.insertPreviewPoint = null;
                if (typeof regenerateToolpathsForPaths === 'function') {
                    regenerateToolpathsForPaths([this.editPath.id]);
                }
                redraw();
                return;
            }
            const clicked = closestPath(mouse, false);
            if (clicked && clicked.creationTool === this.name && clicked !== this.editPath) {
                this.editPath = clicked;
                selectMgr.unselectAll();
                selectMgr.selectPath(clicked);
                redraw();
            } else if (!clicked || clicked === this.editPath) {
                if (!clicked) {
                    // Exit edit mode; start new curve at this click
                    this.editPath = null;
                    this.nodes = [{ x: mouse.x, y: mouse.y, corner: this.alwaysCorner || evt.altKey }];
                    redrawOverlay();
                }
                // If clicked === editPath (curve line, not handle) stay in edit mode
            } else {
                this.editPath = null;
                redraw();
            }
            return;
        }

        // ── Idle: check for existing Curve path ──
        if (this.nodes.length === 0) {
            const clicked = closestPath(mouse, false);
            if (clicked && clicked.creationTool === this.name) {
                this.editPath = clicked;
                selectMgr.unselectAll();
                selectMgr.selectPath(clicked);
                redraw();
                return;
            }
        }

        // ── Drawing mode ──
        if (this.nodes.length >= 3) {
            const first = this.nodes[0];
            const dx = mouse.x - first.x, dy = mouse.y - first.y;
            if (Math.sqrt(dx * dx + dy * dy) <= this.closeDistance) {
                this.closePath();
                return;
            }
        }

        this.nodes.push({ x: mouse.x, y: mouse.y, corner: this.alwaysCorner || evt.altKey });
        redrawOverlay();
    }

    onMouseMove(canvas, evt) {
        const mouse = this.normalizeEvent(canvas, evt);

        if (this.editPath !== null) {
            if (this.mouseDown && this.activeHandle !== null) {
                this.handleWasDragged = true;
                const nodes = this.editPath.creationProperties.nodes;
                nodes[this.activeHandle].x = mouse.x;
                nodes[this.activeHandle].y = mouse.y;
                this.editPath.path = this.tessellate(nodes, this.editPath.closed, this.editPath.creationProperties.curveFit);
                this.editPath.bbox = boundingBox(this.editPath.path);
                redraw();
            } else {
                const h = this._getHandleAt(mouse);
                const oldHover = this.hoveredHandle;
                const oldPreview = this.insertPreviewPoint;
                this.hoveredHandle = h;

                if (h !== null) {
                    this.insertPreviewPoint = null;
                    canvas.style.cursor = 'pointer';
                } else {
                    this.insertPreviewPoint = this._findClosestCurveSegment(mouse);
                    canvas.style.cursor = this.insertPreviewPoint ? 'copy' : 'default';
                }

                if (h !== oldHover || this.insertPreviewPoint !== oldPreview) {
                    redrawOverlay();
                }
            }
            return;
        }

        this.mousePos = { x: mouse.x, y: mouse.y, corner: this.alwaysCorner || evt.altKey };
        this.nearFirstPoint = false;
        if (this.nodes.length >= 3) {
            const first = this.nodes[0];
            const dx = mouse.x - first.x, dy = mouse.y - first.y;
            this.nearFirstPoint = Math.sqrt(dx * dx + dy * dy) <= this.closeDistance;
        }
        redrawOverlay();
    }

    onMouseUp(canvas, evt) {
        this.mouseDown = false;
        if (this.activeHandle !== null) {
            const wasDragged = this.handleWasDragged;
            const pathId = this.editPath ? this.editPath.id : null;
            this.activeHandle = null;
            this.handleWasDragged = false;

            if (wasDragged && pathId && typeof regenerateToolpathsForPaths === 'function') {
                regenerateToolpathsForPaths([pathId]);
            }
            redrawOverlay();
        }
    }

    // ── Path finalisation ─────────────────────────────────────────────────────

    refreshEditPath() {
        if (!this.editPath) return;
        const restored = svgpaths.find(p => p.id === this.editPath.id);
        if (restored && restored.creationProperties) {
            this.editPath = restored;
        } else {
            this.editPath = null;
        }
        redraw();
    }

    enterEditMode(svgPath) {
        selectMgr.unselectAll();
        selectMgr.selectPath(svgPath);
        this.editPath = svgPath;
        this.curveFit = svgPath.creationProperties.curveFit || 'catmull-rom';
        this.nodes = [];
        this.mousePos = null;
        this.nearFirstPoint = false;
        redraw();
    }

    _saveAndEnterEdit(svgPath) {
        svgpaths.push(svgPath);
        addSvgPath(svgPath.id, svgPath.name);
        svgpathId++;
        selectMgr.unselectAll();
        selectMgr.selectPath(svgPath);
        this.editPath = svgPath;
        this.nodes = [];
        this.mousePos = null;
        this.nearFirstPoint = false;
        redraw();
    }

    closePath() {
        if (this.nodes.length < 3) return;
        addUndo(false, true, false);
        const pts = this.tessellate(this.nodes, true, this.curveFit);
        this._saveAndEnterEdit({
            id: this.name + svgpathId,
            type: 'path',
            name: this.name + ' ' + svgpathId,
            selected: false, visible: true,
            path: pts,
            bbox: boundingBox(pts),
            closed: true,
            creationTool: this.name,
            creationProperties: { nodes: this.nodes.map(n => ({ ...n })), closed: true, curveFit: this.curveFit }
        });
    }

    finishDrawing() {
        if (!this.nodes || this.nodes.length < 2) {
            this.nodes = [];
            this.mousePos = null;
            return;
        }
        addUndo(false, true, false);
        const pts = this.tessellate(this.nodes, false, this.curveFit);
        this._saveAndEnterEdit({
            id: this.name + svgpathId,
            type: 'path',
            name: this.name + ' ' + svgpathId,
            selected: false, visible: true,
            path: pts,
            bbox: boundingBox(pts),
            closed: false,
            creationTool: this.name,
            creationProperties: { nodes: this.nodes.map(n => ({ ...n })), closed: false, curveFit: this.curveFit }
        });
    }

    // ── Properties panel ──────────────────────────────────────────────────────

    updateFromProperties(data) {
        if (data.curveFit) {
            this.curveFit = data.curveFit;
            this.properties = { ...this.properties, ...data };
        }
        if (this.editPath && this.editPath.creationProperties) {
            this.editPath.creationProperties.curveFit = this.curveFit;
            const nodes = this.editPath.creationProperties.nodes;
            this.editPath.path = this.tessellate(nodes, this.editPath.closed, this.curveFit);
            this.editPath.bbox = boundingBox(this.editPath.path);
            if (typeof regenerateToolpathsForPaths === 'function') {
                regenerateToolpathsForPaths([this.editPath.id]);
            }
            redraw();
        }
    }

    getPropertiesHTML() {
        let status;
        let pathProps = null;
        if (this.editPath) {
            const n = this.editPath.creationProperties.nodes.length;
            pathProps = this.editPath.creationProperties;
            this.curveFit = pathProps.curveFit || 'catmull-rom';
            status = `Editing: <strong>${this.editPath.name}</strong><br>${n} anchor point${n !== 1 ? 's' : ''}`;
        } else if (this.nodes.length > 0) {
            status = `Drawing: ${this.nodes.length} point${this.nodes.length !== 1 ? 's' : ''} placed`;
        } else {
            status = `Click to start drawing, or click a ${this.name} path to edit it.`;
        }

        return `
            <div class="alert alert-info mb-3">
                <strong>Curve Tool</strong><br>${status}
            </div>
            ${PropertiesManager.formHTML(Object.values(this.fields), pathProps, this.properties)}
            <div class="alert alert-secondary">
                <i data-lucide="info"></i>
                <small>
                    <strong>Drawing:</strong><br>
                    • <strong>Click</strong> to add smooth anchor points<br>
                    • <strong>Alt+Click</strong> for a corner (straight) point&nbsp;<span style="display:inline-block;width:10px;height:10px;background:#f97316;border-radius:50%;"></span><br>
                    • <strong>Click near first point</strong> to close path<br>
                    • <strong>Escape</strong> to finish open path<br><br>
                    <strong>Editing:</strong><br>
                    • <strong>Drag</strong> anchors to reshape the curve<br>
                    • <strong>Click curve line</strong> to insert a new point<br>
                    • <strong>Alt+Click</strong> an anchor to toggle corner ↔ smooth<br>
                    • <strong>Hover + Delete</strong> to remove a point<br>
                    • <strong>Click</strong> another Curve path to edit it<br>
                    • <strong>Click empty space</strong> to start a new curve<br>
                    • <strong>Escape</strong> to exit edit mode
                </small>
            </div>`;
    }
}
