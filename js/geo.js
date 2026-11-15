/* Геометрия карты: ячейки Вороного по координатам районов, соседство, границы округов */
(function (G) {
  function buildGeo(districts) {
    const SC = 2600, LON0 = 37.30, LAT0 = 55.93, K = 0.563;
    const pts = districts.map(d => [(d.lon - LON0) * K * SC, (LAT0 - d.lat) * SC]);

    // выпуклая оболочка
    const idx = pts.map((_, i) => i).sort((a, b) => pts[a][0] - pts[b][0] || pts[a][1] - pts[b][1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const i of idx) { while (lower.length > 1 && cross(pts[lower[lower.length - 2]], pts[lower[lower.length - 1]], pts[i]) <= 0) lower.pop(); lower.push(i); }
    for (const i of idx.slice().reverse()) { while (upper.length > 1 && cross(pts[upper[upper.length - 2]], pts[upper[upper.length - 1]], pts[i]) <= 0) upper.pop(); upper.push(i); }
    const hullIdx = lower.slice(0, -1).concat(upper.slice(0, -1));
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    // отодвигаем оболочку наружу и сглаживаем
    let hull = hullIdx.map(i => { const p = pts[i], dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy); return [p[0] + dx / l * 34, p[1] + dy / l * 34]; });
    for (let k = 0; k < 2; k++) { const n = []; for (let i = 0; i < hull.length; i++) { const a = hull[i], b = hull[(i + 1) % hull.length]; n.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]); } hull = n; }

    function clip(poly, a, b) { // оставить точки ближе к a, чем к b
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, nx = b[0] - a[0], ny = b[1] - a[1];
      const side = p => (p[0] - mx) * nx + (p[1] - my) * ny;
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length], sp = side(p), sq = side(q);
        if (sp <= 0) out.push(p);
        if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
      }
      return out;
    }
    const cells = pts.map((p, i) => { let poly = hull; for (let j = 0; j < pts.length; j++) if (j !== i) { poly = clip(poly, p, pts[j]); if (poly.length < 3) break; } return poly; });

    const adj = pts.map(() => []), borders = [];
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      for (let e = 0; e < c.length; e++) {
        const a = c[e], b = c[(e + 1) % c.length];
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 3) continue;
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], di = Math.hypot(m[0] - pts[i][0], m[1] - pts[i][1]);
        for (let j = i + 1; j < pts.length; j++) {
          if (Math.abs(Math.hypot(m[0] - pts[j][0], m[1] - pts[j][1]) - di) < 0.01) {
            if (!adj[i].includes(j)) { adj[i].push(j); adj[j].push(i); }
            borders.push({ i, j, a, b });
          }
        }
      }
    }
    const centers = cells.map(c => { let A = 0, x = 0, y = 0; for (let i = 0; i < c.length; i++) { const p = c[i], q = c[(i + 1) % c.length], f = p[0] * q[1] - q[0] * p[1]; A += f; x += (p[0] + q[0]) * f; y += (p[1] + q[1]) * f; } return [x / (3 * A), y / (3 * A)]; });
    const xs = hull.map(p => p[0]), ys = hull.map(p => p[1]);
    return { cells, adj, borders, centers, hull, box: [Math.min(...xs) - 10, Math.min(...ys) - 10, Math.max(...xs) - Math.min(...xs) + 20, Math.max(...ys) - Math.min(...ys) + 20] };
  }
  G.GEO = buildGeo(G.DATA.DISTRICTS);
})(typeof window !== 'undefined' ? window.W90 : globalThis.W90);
