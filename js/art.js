/* Картинки игры: всё рисуется в SVG прямо в коде, поэтому игра остаётся одним файлом.
   ART.build(точка, уровень) — здания на районе, ART.face(человек) — портреты,
   ART.arm(ствол), ART.car(модель), ART.vest() — арсенал и гараж. */
(function (G) {
  // ---------- общее ----------
  function hash(s) { s = String(s); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const pick = (r, a) => a[Math.floor(r() * a.length)];
  const f1 = v => (Math.round(v * 10) / 10).toString();
  const R = (x, y, w, h, f, ex) => '<rect x="' + f1(x) + '" y="' + f1(y) + '" width="' + f1(w) + '" height="' + f1(h) + '" fill="' + f + '"' + (ex ? ' ' + ex : '') + '/>';
  const P = (d, f, ex) => '<path d="' + d + '" fill="' + f + '"' + (ex ? ' ' + ex : '') + '/>';
  const C = (x, y, r, f, ex) => '<circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="' + f1(r) + '" fill="' + f + '"' + (ex ? ' ' + ex : '') + '/>';
  const L = (x1, y1, x2, y2, s, w, ex) => '<line x1="' + f1(x1) + '" y1="' + f1(y1) + '" x2="' + f1(x2) + '" y2="' + f1(y2) + '" stroke="' + s + '" stroke-width="' + (w || 1) + '"' + (ex ? ' ' + ex : '') + '/>';
  const T = (x, y, s, size, f, ex) => '<text x="' + f1(x) + '" y="' + f1(y) + '" font-size="' + size + '" fill="' + f + '" text-anchor="middle" font-family="Russo One, Arial Black, sans-serif"' + (ex ? ' ' + ex : '') + '>' + s + '</text>';
  // неон: широкий полупрозрачный ореол и яркая надпись поверх
  const NEON = (x, y, s, size, col) => T(x, y, s, size, 'none', 'stroke="' + col + '" stroke-width="2.4" stroke-opacity=".28" stroke-linejoin="round"') + T(x, y, s, size, col);
  const svg = (vb, body, label, cls) => '<svg class="art ' + (cls || '') + '" viewBox="' + vb + '" preserveAspectRatio="xMidYMid slice" role="img" aria-label="' + label + '"><title>' + label + '</title>' + body + '</svg>';

  // ночная улица
  const NIGHT = '#17131f', SKY2 = '#1f1929', GROUND = '#2a2530', CURB = '#3a3446', LIT = '#f0c968', LIT2 = '#e8b04d', DARK = '#2a2535';
  function scene(seed, body, lvl) {
    const r = rng(seed);
    let h = R(0, 0, 120, 72, NIGHT) + R(0, 30, 120, 30, SKY2);
    // звёзды и далёкие панельки
    for (let i = 0; i < 9; i++) h += C(r() * 120, r() * 22, r() < 0.3 ? 0.6 : 0.35, '#cfc6d8', 'opacity=".5"');
    let x = -4;
    while (x < 124) { const w = 10 + r() * 14, hh = 14 + r() * 20; h += R(x, 60 - hh, w, hh, '#221c2b'); for (let k = 0; k < 4; k++) if (r() < 0.5) h += R(x + 2 + r() * (w - 4), 60 - hh + 3 + r() * (hh - 6), 1.2, 1.2, '#6b5a3c'); x += w + 1; }
    h += R(0, 60, 120, 12, GROUND) + R(0, 60, 120, 1.2, CURB);
    for (let i = 0; i < 6; i++) h += R(4 + i * 21, 67, 9, 0.8, '#4a4352');
    return h + body;
  }
  // окна: сетка, часть горит
  function wins(x, y, cols, rows, w, h, gx, gy, seed, share, lit) {
    const r = rng(seed); let s = '';
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) s += R(x + i * (w + gx), y + j * (h + gy), w, h, r() < share ? (lit || LIT) : DARK);
    return s;
  }
  const board = (x, y, w, h, txt, bg, fg, size) => { size = Math.min(size || 5, (w - 1.5) * 1.55 / txt.length); return R(x, y, w, h, bg, 'rx="0.8"') + T(x + w / 2, y + h / 2 + size * 0.36, txt, f1(size), fg); };
  const man = (x, y, col, s) => { s = s || 1; return C(x, y - 9.6 * s, 1.5 * s, '#c79b7a') + P('M' + f1(x - 2.2 * s) + ' ' + f1(y - 2.5 * s) + 'L' + f1(x - 2 * s) + ' ' + f1(y - 7.6 * s) + 'Q' + f1(x) + ' ' + f1(y - 8.8 * s) + ' ' + f1(x + 2 * s) + ' ' + f1(y - 7.6 * s) + 'L' + f1(x + 2.2 * s) + ' ' + f1(y - 2.5 * s) + 'Z', col) + R(x - 1.6 * s, y - 2.6 * s, 1.2 * s, 2.6 * s, '#1c1a20') + R(x + 0.4 * s, y - 2.6 * s, 1.2 * s, 2.6 * s, '#1c1a20'); };
  const tree = (x, y, s) => R(x - 0.6, y - 6 * s, 1.2, 6 * s, '#3b2d24') + C(x, y - 8 * s, 4 * s, '#2e4a33') + C(x - 2 * s, y - 6.5 * s, 2.8 * s, '#28412d') + C(x + 2.2 * s, y - 6.8 * s, 2.6 * s, '#34553a');
  const lamp = (x, y, hgt) => R(x - 0.4, y - hgt, 0.8, hgt, '#4a4552') + R(x - 0.4, y - hgt, 4, 0.8, '#4a4552') + P('M' + f1(x + 1.2) + ' ' + f1(y - hgt + 0.8) + 'h3.6l2 14h-7.6z', LIT, 'opacity=".12"') + C(x + 3, y - hgt + 1.2, 0.9, LIT);
  const bulbs = (x1, x2, y, sag, n, cols) => { let s = '<path d="M' + x1 + ' ' + y + 'Q' + (x1 + x2) / 2 + ' ' + (y + sag) + ' ' + x2 + ' ' + y + '" stroke="#444" stroke-width=".4" fill="none"/>'; for (let i = 1; i < n; i++) { const t = i / n, bx = x1 + (x2 - x1) * t, by = y + 2 * t * (1 - t) * sag; s += C(bx, by, 0.7, cols[i % cols.length]); } return s; };
  const crate = (x, y, w, h, col) => R(x, y - h, w, h, col || '#6b4f32') + L(x, y - h / 2, x + w, y - h / 2, '#4a3522', 0.5) + L(x + w / 2, y - h, x + w / 2, y, '#4a3522', 0.5);
  const tyres = (x, y, n) => { let s = ''; for (let i = 0; i < n; i++) s += R(x, y - 2.4 * (i + 1), 7, 2.2, '#16141a', 'rx="1"') + R(x + 2.4, y - 2.4 * (i + 1) + 0.7, 2.2, 0.8, '#2d2a33'); return s; };
  const cross = (x, y, s, col) => R(x - s / 2, y - s * 1.5, s, s * 3, col) + R(x - s * 1.5, y - s / 2, s * 3, s, col);
  const fence = (x1, x2, y, h, col) => { let s = R(x1, y - h * 0.7, x2 - x1, 0.8, col) + R(x1, y - h * 0.3, x2 - x1, 0.8, col); for (let x = x1; x <= x2; x += 2.6) s += R(x, y - h, 1.2, h, col); return s; };

  // ---------- машины сбоку ----------
  // локальные координаты: земля y = 0, длина около 60, капот справа
  const CAR_SHAPES = {
    nine: { d: 'M2 -4L2 -10.5L4.5 -12L10.5 -19.5L32 -20L41 -12.6L55.5 -11.4Q58.6 -10.8 58.6 -8L58.6 -4Z', win: 'M11.6 -18.2L31.2 -18.6L38.6 -12.8L6.8 -12.8Z', pil: [21.5], wh: [13, 47.5], r: 4.3 },
    audi: { d: 'M1.5 -4L1.5 -10Q1.5 -12.2 5 -12.4L13 -12.8L20 -19.2Q21 -19.8 23 -19.8L36 -19.8Q38 -19.8 39 -19L45 -12.8L56 -11.8Q59 -11.2 59 -8L59 -4Z', win: 'M21 -18.4L36.6 -18.4L42.6 -12.9L15 -12.9Z', pil: [29.5], wh: [12.5, 48], r: 4.4 },
    bmw: { d: 'M1.5 -4L1.5 -10.6L3 -12.2L14 -12.6L21 -18.6L37 -18.8L44.5 -12.6L57 -11.6Q59.2 -11.2 59.2 -8.6L59.2 -4Z', win: 'M21.8 -17.4L36.4 -17.6L42.2 -12.7L15.8 -12.7Z', pil: [29.8], wh: [12.5, 48], r: 4.4, kid: 1 },
    merc: { d: 'M1 -4L1 -11Q1 -13 4 -13.2L14 -13.6L21 -20.2Q22 -21 24.5 -21L39.5 -21Q41.5 -21 42.5 -20.2L49 -13.6L60 -12.4Q63 -11.8 63 -8.6L63 -4Z', win: 'M22.5 -19.6L40.6 -19.6L46.6 -13.7L16.5 -13.7Z', pil: [31.5], wh: [13.5, 51], r: 4.6, len: 64 },
    jeep: { d: 'M1.5 -5L1.5 -20.5L4 -21.6L37.5 -21.8L43.5 -14L57.6 -13.2Q59.4 -12.8 59.4 -10.5L59.4 -5Z', win: 'M5 -20L36.6 -20.2L41.6 -14.4L5 -14.4Z', pil: [17, 28], wh: [13, 47.5], r: 5 },
    gelik: { d: 'M2.5 -5L2.5 -23.5L40 -23.5L41.6 -15.2L57.8 -14.4L58.4 -5Z', win: 'M5 -22L38.8 -22L40 -15.6L5 -15.6Z', pil: [16, 27.5], wh: [13, 47.5], r: 5.2, spare: 1 },
    uaz: { d: 'M2 -4.5L2 -24Q2 -26.5 5 -26.5L44 -26.5Q49.5 -26.5 52 -21L56.5 -13Q58.4 -12 58.4 -9L58.4 -4.5Z', win: 'M44 -24.6Q48.6 -24.6 50.6 -20.2L52.6 -16H44Z', side: 1, pil: [], wh: [12.5, 47], r: 4.6 },
    raf: { d: 'M2 -4.5L2 -24L48 -24Q52 -24 54 -19L57.6 -12Q58.6 -11 58.6 -8.5L58.6 -4.5Z', win: 'M47 -22.4Q50.6 -22.4 52.2 -18.4L53.8 -14.6H47Z', side: 1, pil: [], wh: [12.5, 47], r: 4.4 },
    limo: { d: 'M1 -4L1 -11Q1 -13 4 -13.2L14 -13.6L20 -19.8L64 -20L70 -13.6L80 -12.6Q83 -12 83 -8.6L83 -4Z', win: 'M21.5 -18.8L63.4 -18.8L68 -13.7L16.5 -13.7Z', pil: [33, 46, 56], wh: [13.5, 71], r: 4.6, len: 84 }
  };
  function carBody(kind, col, x, y, s, flip) {
    const k = CAR_SHAPES[kind] || CAR_SHAPES.nine, len = k.len || 60;
    let h = '<g transform="translate(' + f1(x) + ' ' + f1(y) + ') scale(' + (flip ? -s : s) + ' ' + s + ')' + (flip ? ' translate(' + -len + ' 0)' : '') + '">';
    h += '<ellipse cx="' + len / 2 + '" cy="-0.4" rx="' + len / 2 + '" ry="1.6" fill="#000" opacity=".35"/>';
    h += P(k.d, col) + R(2.6, -8.4, len - 5, 3.4, '#000', 'opacity=".22"');
    h += P(k.win, '#9fb3c8', 'opacity=".55"') + P(k.win, '#0e0d12', 'opacity=".45"');
    k.pil.forEach(px => { h += R(px, -21, 1.3, 9, col); });
    if (k.side) { h += R(8, -23.4, 8, 6, '#0e0d12', 'opacity=".55"') + R(19, -23.4, 8, 6, '#0e0d12', 'opacity=".55"') + R(30, -23.4, 8, 6, '#0e0d12', 'opacity=".55"'); }
    h += L(3, -9, len - 3, -9, '#fff', 0.35, 'opacity=".25"');
    h += R(len - 3.2, -10.2, 2.4, 1.6, '#f3e3a1') + R(1.6, -10, 1.6, 1.8, '#c2343c');
    if (k.kid) h += R(len - 2.6, -8.6, 1.4, 1.6, '#cfcfd6');
    if (k.spare) h += R(-0.6, -17, 3.2, 9, '#141216', 'rx="1.4"');
    k.wh.forEach(wx => { h += C(wx, -k.r, k.r, '#141216') + C(wx, -k.r, k.r * 0.45, '#8d8a92') + C(wx, -k.r, k.r * 0.15, '#3a3740'); });
    return h + '</g>';
  }

  // ---------- точки на районе: 13 видов × 3 уровня ----------
  const BUILD = {
    kiosk(l) {
      if (l === 1) return R(44, 34, 32, 26, '#5b6b5e') + R(42, 31, 36, 4, '#454f47') + board(46, 24, 28, 7, 'КИОСК', '#d9d2c3', '#2a2530', 5) + R(48, 39, 24, 13, LIT) + [52, 56, 60, 64, 68].map(x => L(x, 39, x, 52, '#3a3a3a', 0.6)).join('') + [49, 53, 57, 61, 65, 69].map((x, i) => R(x, 45, 2, 6, ['#c2343c', '#3f7bd1', '#e3b341', '#5aa867'][i % 4])).join('') + R(47, 52, 26, 1.5, '#3d463f') + crate(79, 60, 7, 5) + crate(80, 55, 6, 4, '#7a5a3a') + man(38, 60, '#3d3a52');
      if (l === 2) return [30, 61].map((x, i) => R(x, 34, 29, 26, i ? '#6b5a4e' : '#5b6b5e') + R(x + 3, 39, 23, 12, LIT) + [x + 7, x + 12, x + 17, x + 22].map(bx => L(bx, 39, bx, 51, '#3a3a3a', 0.6)).join('')).join('') + R(28, 31, 64, 4, '#3a3446') + R(32, 21, 56, 9, '#2c1015', 'rx="1"') + NEON(60, 28, '24 ЧАСА', 6.4, '#ff4d6d') + crate(14, 60, 8, 5, '#3b5d2e') + crate(15, 55, 7, 4, '#3b5d2e') + C(100, 52, 7, '#b8323f') + R(99.6, 52, 0.8, 8, '#777') + R(95, 56, 10, 1, '#999') + man(22, 60, '#4a3a2e') + man(107, 60, '#2e3a4a');
      return R(20, 30, 80, 30, '#3d4450') + R(23, 34, 74, 22, '#f0d58a') + [33, 45, 57, 69, 81].map(x => R(x, 34, 1.4, 22, '#3d4450')).join('') + [40, 48].map(y => R(23, y, 74, 1, '#c9a560')).join('') + wins(25, 36, 18, 2, 2.2, 3.4, 1.8, 4.6, 7, 0.9, '#c2343c') + P('M16 30L104 30L100 24L20 24Z', '#c2343c') + [24, 36, 48, 60, 72, 84, 96].map(x => P('M' + x + ' 24l4 0l-1.2 6h-4z', '#f3ede0')).join('') + R(26, 13, 68, 10, '#1a1420', 'rx="1"') + NEON(60, 20.8, 'ПРОДУКТЫ 24', 6.6, '#ffcf5a') + carBody('bmw', '#1f2b3d', 82, 64, 0.55) + man(16, 61, '#3d3a52') + lamp(8, 60, 26);
    },
    market(l) {
      const tent = (x, w, c1, c2) => P('M' + x + ' 44L' + (x + w / 2) + ' 36L' + (x + w) + ' 44Z', c1) + [0, 1, 2].map(i => P('M' + (x + i * w / 3) + ' 44h' + f1(w / 6) + 'l' + f1(-w / 12) + ' -3z', c2)).join('') + R(x + 1, 44, 0.8, 16, '#555') + R(x + w - 1.8, 44, 0.8, 16, '#555') + R(x + 1, 50, w - 2, 2, '#7a5a3a') + [0, 1, 2, 3].map(i => C(x + 3 + i * (w - 6) / 3, 49, 1.4, ['#e58139', '#c2343c', '#d6c84a', '#5aa867'][i])).join('');
      if (l === 1) return tent(14, 26, '#3f6fb1', '#e8e2d6') + tent(46, 26, '#b8323f', '#e8e2d6') + tent(78, 26, '#3f8f6b', '#e8e2d6') + crate(42, 60, 6, 4) + man(36, 60, '#3a2e4a') + man(73, 60, '#4a2e2e') + man(108, 60, '#2e3a4a');
      if (l === 2) return tent(4, 22, '#3f6fb1', '#e8e2d6') + tent(28, 22, '#b8323f', '#e8e2d6') + tent(70, 22, '#3f8f6b', '#e8e2d6') + tent(94, 22, '#a06bd6', '#e8e2d6') + R(51, 28, 3, 32, '#6b5a4a') + R(66, 28, 3, 32, '#6b5a4a') + P('M48 30Q60 18 72 30L72 33Q60 22 48 33Z', '#8a6b4a') + R(46, 30, 28, 7, '#2a1f18', 'rx="1"') + T(60, 35.6, 'РЫНОК', 5.4, '#e3b341') + bulbs(4, 116, 26, 4, 14, ['#ffcf5a', '#ff4d6d', '#6ccff0']) + man(60, 60, '#3a2e4a') + man(56, 60, '#4a3a2e', 0.9);
      return P('M8 60L8 36Q60 6 112 36L112 60Z', '#6b5a4a') + P('M14 60L14 38Q60 12 106 38L106 60Z', '#4a3d33') + wins(18, 40, 8, 2, 8.8, 5.4, 2.6, 3, 11, 0.85) + [30, 60, 90].map(x => R(x - 0.6, 20, 1.2, 40, '#6b5a4a')).join('') + R(34, 12, 52, 9, '#1a1420', 'rx="1"') + NEON(60, 19, 'ЦЕНТРАЛЬНЫЙ РЫНОК', 5, '#ffcf5a') + R(50, 50, 20, 10, '#1e1a25') + R(51, 51, 18, 9, LIT2, 'opacity=".7"') + carBody('uaz', '#d9d2c3', 4, 64, 0.42) + carBody('raf', '#7a8a6a', 92, 64, 0.42, 1) + man(46, 61, '#3a2e4a') + man(74, 61, '#2e3a4a');
    },
    gym(l) {
      const bar = (x, y, s) => R(x, y - 0.4 * s, 14 * s, 0.8 * s, '#8d8a92') + R(x + 1 * s, y - 2.4 * s, 1.6 * s, 4.8 * s, '#1c1a20') + R(x + 11.4 * s, y - 2.4 * s, 1.6 * s, 4.8 * s, '#1c1a20');
      if (l === 1) return R(10, 18, 100, 42, '#4a4552') + wins(14, 22, 8, 2, 7, 6, 5.2, 4, 21, 0.25) + R(44, 50, 32, 10, '#2a2530') + R(50, 46, 20, 14, '#1b1720') + P('M50 60L54 52H66L70 60Z', '#3a3446') + R(56, 52, 8, 8, '#5a3d28') + board(46, 41, 28, 5, 'КАЧАЛКА', '#c8b98a', '#2a1f18', 4.4) + R(82, 54, 14, 5, LIT, 'opacity=".9"') + bar(83, 56.5, 0.85) + man(40, 60, '#2a2a30');
      if (l === 2) return R(12, 30, 96, 30, '#5a4f45') + R(10, 27, 100, 3, '#3a3446') + board(34, 18, 52, 8, 'СПОРТЗАЛ', '#2d4a6a', '#f3ede0', 5.6) + [16, 44, 72].map(x => R(x, 35, 22, 14, LIT) + R(x, 35, 22, 1, '#9a8a6a')).join('') + bar(20, 46, 1) + bar(76, 46, 1) + R(54, 36, 1, 4, '#444') + R(52, 40, 5, 8, '#8a2b2b', 'rx="2"') + R(100, 40, 6, 20, '#3b2d24') + R(101, 42, 4, 16, '#6b4f32') + man(94, 60, '#1d3557') + man(8, 60, '#2a2a30');
      return R(14, 20, 92, 40, '#2d3340') + R(17, 23, 86, 15, '#9fc3d8', 'opacity=".75"') + R(17, 41, 86, 17, '#f0d58a') + [38, 60, 82].map(x => R(x, 23, 1.2, 35, '#2d3340')).join('') + bar(22, 52, 1) + bar(66, 52, 1) + [44, 50].map(x => R(x, 46, 1.4, 10, '#1c1a20')).join('') + R(24, 8, 72, 11, '#141018', 'rx="1"') + NEON(60, 16.6, 'ФИТНЕС-КЛУБ', 6.2, '#6ccff0') + carBody('jeep', '#20262b', 94, 65, 0.44, 1) + man(10, 61, '#c2343c') + man(106, 61, '#2a2a30');
    },
    service(l) {
      if (l === 1) return R(26, 30, 56, 30, '#7a4a3a') + wins(26, 30, 14, 7, 3, 1.4, 1, 3, 3, 0.5, '#8a5848') + R(32, 36, 44, 24, '#120f16') + carBody('nine', '#7a2430', 34, 61, 0.6) + R(28, 22, 52, 7, '#d9d2c3') + T(54, 27.4, 'ШИНОМОНТАЖ', 4.6, '#7a2430') + tyres(86, 60, 4) + lamp(18, 60, 24) + man(96, 60, '#3a3a2e');
      if (l === 2) return R(12, 28, 96, 32, '#6b6670') + R(10, 25, 100, 3, '#3a3446') + R(18, 34, 34, 26, '#1b1720') + R(64, 34, 34, 26, '#1b1720') + R(18, 34, 34, 2, LIT) + R(64, 34, 34, 2, LIT) + R(26, 48, 2, 12, '#c9a24a') + R(44, 48, 2, 12, '#c9a24a') + carBody('audi', '#5b6470', 20, 47, 0.52) + carBody('bmw', '#1f2b3d', 66, 61, 0.52) + board(34, 15, 52, 9, 'АВТОСЕРВИС', '#e3b341', '#1a1420', 5.6) + tyres(104, 60, 3) + man(58, 60, '#2e4a6a');
      return R(10, 24, 100, 36, '#3a4250') + R(13, 28, 94, 30, '#a9c7da', 'opacity=".5"') + R(13, 28, 94, 30, LIT, 'opacity=".25"') + [36, 60, 84].map(x => R(x, 28, 1.2, 30, '#3a4250')).join('') + carBody('merc', '#141418', 16, 58, 0.5) + carBody('jeep', '#7a2430', 64, 58, 0.62) + R(18, 10, 84, 12, '#141018', 'rx="1"') + NEON(60, 19.2, 'АВТОЦЕНТР', 7.2, '#ffcf5a') + [4, 114].map(x => R(x, 12, 0.8, 48, '#777') + P('M' + (x + 0.8) + ' 12h6l-1.5 3l1.5 3h-6z', '#c2343c')).join('');
    },
    gunshop(l) {
      const rifle = (x, y, s, col) => P('M' + x + ' ' + y + 'h' + 22 * s + 'v' + 1.4 * s + 'h-' + 12 * s + 'l-' + 3 * s + ' ' + 2.6 * s + 'h-' + 3 * s + 'l' + 1.5 * s + ' -' + 2.6 * s + 'h-' + 5.5 * s + 'z', col);
      if (l === 1) return R(4, 14, 112, 46, '#4d4a55') + wins(8, 18, 9, 2, 8, 7, 4.2, 4, 31, 0.35) + R(40, 44, 16, 16, '#2b1f18') + R(44, 47, 8, 13, '#4a3a2e') + R(62, 44, 22, 12, LIT2) + [65, 69, 73, 77, 81].map(x => L(x, 44, x, 56, '#222', 0.8)).join('') + board(38, 37, 48, 6, 'ОХОТА · РЫБАЛКА', '#2e4a33', '#e8e2d6', 4) + man(100, 60, '#3a3a2e');
      if (l === 2) return R(18, 28, 84, 32, '#5a4a3a') + R(16, 24, 88, 4, '#3a2d24') + R(30, 34, 26, 16, LIT2) + rifle(31, 40, 1.1, '#2a1f18') + rifle(31, 45, 1.1, '#2a1f18') + R(64, 36, 14, 24, '#2b1f18') + C(75, 48, 0.8, LIT) + board(34, 12, 52, 10, 'ОХОТНИК', '#1a2a1e', '#d6c48a', 6.4) + rifle(38, 13.4, 0.7, '#d6c48a') + rifle(66, 13.4, 0.7, '#d6c48a') + tree(108, 60, 1) + man(88, 60, '#4b5a3a');
      return R(8, 22, 66, 38, '#2d2a33') + R(12, 28, 26, 18, LIT) + rifle(14, 34, 1, '#1c1a20') + rifle(14, 39, 1, '#1c1a20') + R(44, 30, 24, 30, '#47434f') + R(47, 33, 18, 27, '#5e5a66') + C(62, 47, 0.9, '#c9a24a') + R(14, 10, 54, 11, '#141018', 'rx="1"') + NEON(41, 18.6, 'ОРУЖИЕ', 7, '#ff6a3d') + R(78, 30, 36, 30, '#3a3446') + C(96, 40, 7, '#e8e2d6') + C(96, 40, 5, '#c2343c') + C(96, 40, 3, '#e8e2d6') + C(96, 40, 1.2, '#c2343c') + board(82, 51, 28, 6, 'ТИР', '#1a1420', '#e3b341', 5) + man(73, 61, '#1c1a20');
    },
    clinic(l) {
      if (l === 1) return R(4, 10, 112, 50, '#4a4552') + wins(8, 14, 9, 3, 8, 7, 4.2, 5, 41, 0.3) + R(56, 26, 8, 7, '#f3ede0') + cross(60, 29.5, 1.3, '#c2343c') + R(44, 50, 10, 10, '#2b2530') + man(80, 60, '#3d3a52') + C(84, 50, 0.8, '#f3ede0');
      if (l === 2) return R(20, 30, 80, 30, '#d9d2c3') + R(18, 27, 84, 3, '#8a8590') + wins(26, 36, 4, 1, 10, 9, 6, 0, 51, 0.8) + R(54, 44, 12, 16, '#5a7a8a') + R(46, 15, 28, 10, '#f3ede0', 'rx="1"') + cross(53, 20, 1.6, '#c2343c') + T(64, 22, 'МЕД', 4.6, '#c2343c') + R(87, 18, 1, 9, '#888') + man(12, 60, '#3d3a52');
      return R(10, 14, 64, 46, '#e8e2d6') + wins(14, 18, 5, 3, 9, 7, 3.2, 4, 61, 0.75, '#bfe0ec') + R(36, 48, 12, 12, '#5a7a8a') + R(76, 6, 0, 0, '#000') + C(42, 9, 5.5, '#141018') + cross(42, 9, 2, '#ff3b4f') + R(16, 2, 0, 0, '#000') + carBody('raf', '#f3ede0', 70, 63, 0.75) + R(84, 46, 10, 2.4, '#c2343c') + cross(102, 52, 1.4, '#c2343c') + C(88, 43, 1, '#4fa8ff') + C(92, 43, 1, '#ff4d6d');
    },
    rest(l) {
      if (l === 1) return P('M16 34L104 34L100 28L20 28Z', '#b8323f') + [24, 40, 56, 72, 88].map(x => P('M' + x + ' 28l8 0l-1 6h-8z', '#f3ede0')).join('') + R(18, 34, 1, 26, '#555') + R(101, 34, 1, 26, '#555') + R(26, 18, 40, 9, '#2a1f18', 'rx="1"') + T(46, 24.6, 'ШАШЛЫК', 5.8, '#e3b341') + R(76, 48, 18, 4, '#3a3a3a') + [79, 83, 87, 91].map(x => C(x, 47, 1, '#ff6a3d')).join('') + P('M80 44q2 -4 0 -8q-2 -4 1 -8', 'none', 'stroke="#aaa" stroke-width="1.6" opacity=".35"') + P('M88 44q2 -4 0 -8q-2 -4 1 -8', 'none', 'stroke="#aaa" stroke-width="1.4" opacity=".3"') + [30, 54].map(x => R(x, 50, 14, 1.4, '#e8e2d6') + R(x + 6.4, 51, 1.2, 9, '#ccc')).join('') + man(28, 60, '#2a2a30') + man(48, 60, '#4a2e2e') + bulbs(18, 102, 34, 3, 12, ['#ffcf5a']);
      if (l === 2) return R(10, 24, 100, 36, '#6b3a35') + R(8, 21, 104, 3, '#3a2d24') + [16, 40, 64, 88].map(x => P('M' + x + ' 48V36Q' + (x + 8) + ' 28 ' + (x + 16) + ' 36V48Z', LIT2) + P('M' + x + ' 48V36Q' + (x + 4) + ' 31 ' + (x + 8) + ' 31L' + (x + 4) + ' 48Z', '#8a2b2b', 'opacity=".7"')).join('') + R(52, 50, 16, 10, '#2b1f18') + R(30, 9, 60, 11, '#1a1420', 'rx="1"') + T(60, 17.4, 'РЕСТОРАН', 7, '#e3b341') + [24, 96].map(x => C(x, 52, 1.6, LIT)).join('') + man(46, 60, '#1c1a20') + man(74, 60, '#1c1a20');
      return R(6, 20, 108, 40, '#4a2a2e') + P('M4 20L60 6L116 20Z', '#5a3a2e') + [14, 30, 46, 74, 90, 106].map(x => R(x - 2, 22, 4, 38, '#d9c9a8') + R(x - 3, 21, 6, 2, '#efe3c8')).join('') + wins(18, 30, 5, 2, 8, 9, 8, 6, 71, 0.9) + R(54, 40, 12, 20, '#f0c968') + R(50, 60, 20, 2, '#b8323f') + NEON(60, 17, '★ РЕСТОРАН ★', 5.8, '#ffcf5a') + carBody('merc', '#141418', 80, 67, 0.48) + man(48, 61, '#1c1a20') + man(72, 61, '#1c1a20');
    },
    bordel(l) {
      const pink = '#ff4fa3';
      if (l === 1) return R(8, 16, 104, 44, '#3d3846') + wins(12, 20, 9, 2, 8, 7, 3.6, 4, 81, 0.3) + R(50, 50, 20, 10, '#2a2530') + R(54, 46, 12, 14, '#1b1720') + P('M54 60L56 52H64L66 60Z', '#3a3446') + R(52, 40, 16, 5, '#1a1420', 'rx="1"') + T(60, 44, 'САУНА', 3.8, pink) + C(60, 48, 0.8, pink) + [46, 70].map(x => P('M' + x + ' 46q-2 -4 0 -8q2 -4 0 -8', 'none', 'stroke="#d0c6da" stroke-width="2" opacity=".25"')).join('') + man(84, 60, '#2a2a30');
      if (l === 2) return R(16, 20, 88, 40, '#3a2840') + wins(22, 26, 5, 2, 10, 10, 6, 6, 91, 0.85, '#c23b6c') + R(54, 48, 12, 12, '#1b1720') + R(30, 8, 60, 11, '#160f18', 'rx="1"') + NEON(60, 16.6, 'САУНА 24', 7, pink) + C(98, 52, 1.2, pink) + man(70, 60, '#2a2a30') + man(10, 60, '#5a2e4a');
      return P('M18 6L36 60M102 6L84 60', 'none', 'stroke="#fff" stroke-width="7" opacity=".05"') + R(10, 22, 100, 38, '#24162a') + R(10, 22, 100, 2, pink, 'opacity=".7"') + R(10, 58, 100, 2, pink, 'opacity=".7"') + R(48, 42, 24, 18, '#3a1830') + R(52, 46, 16, 14, '#ff8ac6', 'opacity=".6"') + P('M60 18c-3 -4 -9 -2 -7.5 3c1 3 7.5 7 7.5 7s6.5 -4 7.5 -7c1.5 -5 -4.5 -7 -7.5 -3z', 'none', 'stroke="' + pink + '" stroke-width="2.4" opacity=".3"') + P('M60 18c-3 -4 -9 -2 -7.5 3c1 3 7.5 7 7.5 7s6.5 -4 7.5 -7c1.5 -5 -4.5 -7 -7.5 -3z', pink) + NEON(32, 38, 'НОЧНОЙ', 6, '#b06cff') + NEON(88, 38, 'КЛУБ', 6, '#b06cff') + carBody('limo', '#efe8dc', 18, 68, 0.52) + man(78, 61, '#1c1a20');
    },
    flat(l) {
      const khr = (x, w, seed, renov) => R(x, 18, w, 42, renov ? '#6b6670' : '#5a5560') + wins(x + 3, 21, Math.floor((w - 4) / 6), 5, 3.6, 4.4, 2.4, 3.6, seed, renov ? 0.6 : 0.35, LIT) + R(x - 1, 16, w + 2, 2, '#3a3446') + (renov ? C(x + w - 5, 25, 2, '#d9d2c3') + R(x + w - 5.4, 25, 0.8, 3, '#999') : '');
      if (l === 1) return khr(30, 60, 101) + R(56, 52, 8, 8, '#2a2530') + tree(20, 60, 1.2) + tree(100, 60, 1) + man(70, 60, '#3a2e4a');
      if (l === 2) return khr(6, 50, 111) + khr(64, 50, 113, 1) + tree(60, 60, 0.9) + man(36, 60, '#3a2e4a') + carBody('nine', '#7a2430', 82, 64, 0.38);
      return R(52, 2, 34, 58, '#7a7480') + wins(55, 5, 5, 11, 3.6, 3.2, 2.6, 1.6, 121, 0.7) + R(51, 1, 36, 2, '#4a4552') + khr(4, 44, 123, 1) + R(90, 30, 28, 30, '#6b6670') + wins(92, 33, 4, 4, 4, 4, 2.6, 2.6, 125, 0.65) + board(57, 52, 24, 6, 'ЖК', '#1a1420', '#e3b341', 5) + R(52, 58, 34, 2, '#3a3446') + carBody('merc', '#141418', 92, 66, 0.34) + tree(48, 61, 0.8);
    },
    prem(l) {
      if (l === 1) return R(14, 30, 92, 30, '#6b5a4a') + P('M12 30L60 18L108 30Z', '#4a3d33') + R(26, 38, 30, 22, '#3a3446') + [41, 44, 47, 50, 53, 56].map(y => L(26, y, 56, y, '#2a2530', 0.6)).join('') + R(66, 42, 12, 18, '#2a2530') + board(70, 32, 30, 6, 'СКЛАД', '#c8b98a', '#2a1f18', 4.6) + crate(88, 60, 8, 6) + crate(96, 60, 7, 5) + man(62, 60, '#3a3a2e');
      if (l === 2) return R(4, 10, 112, 50, '#5a5560') + wins(8, 14, 9, 3, 8, 6, 4.2, 4, 131, 0.4) + [4, 32, 60, 88].map((x, i) => R(x + 1, 44, 26, 16, LIT2) + board(x + 2, 38, 24, 5, ['АРЕНДА', 'ОБМЕН ВАЛЮТ', 'АПТЕКА', 'ВИДЕОПРОКАТ'][i], ['#2d4a6a', '#5a2a2a', '#2e4a33', '#4a2e5a'][i], '#f3ede0', 3.4)).join('') + man(30, 60, '#2a2a30') + man(86, 60, '#3a2e4a');
      return R(38, 2, 44, 58, '#24364c') + wins(41, 5, 6, 9, 5, 3, 1.4, 1.2, 141, 0.55, '#8fc0e0') + R(39, 42, 42, 7, '#101820') + NEON(60, 47.2, 'БИЗНЕС-ЦЕНТР', 4.6, '#6ccff0') + R(36, 50, 48, 10, '#1a2433') + R(46, 52, 28, 8, '#8fc0e0', 'opacity=".55"') + R(4, 34, 28, 26, '#4a4552') + wins(7, 37, 4, 4, 4, 4, 2, 1.6, 143, 0.4) + R(88, 30, 28, 30, '#4a4552') + wins(91, 33, 4, 5, 4, 3.6, 2, 1.6, 145, 0.4) + carBody('merc', '#141418', 4, 66, 0.34) + carBody('jeep', '#20262b', 92, 66, 0.4, 1);
    },
    chop(l) {
      if (l === 1) return R(46, 38, 18, 22, '#5a6a5a') + R(44, 35, 22, 3, '#3a463a') + R(49, 42, 12, 8, LIT) + man(55, 50, '#2e3a2e', 0.6) + R(64, 46, 50, 2.2, '#e8e2d6') + [70, 82, 94, 106].map(x => R(x, 46, 5, 2.2, '#c2343c')).join('') + R(64, 44, 3, 16, '#777') + board(40, 28, 30, 6, 'ОХРАНА', '#2e3a2e', '#e8e2d6', 4.4) + lamp(30, 60, 26) + man(36, 60, '#2e3a2e');
      if (l === 2) return R(14, 26, 70, 34, '#55584a') + wins(18, 32, 5, 2, 9, 7, 4, 5, 151, 0.7) + R(44, 46, 10, 14, '#2b2530') + board(22, 16, 54, 8, 'ЧОП «ЩИТ»', '#1d2a3c', '#e3b341', 5.6) + R(88, 14, 0.8, 46, '#888') + P('M88.8 14h12v4h-12z', '#e8e2d6') + P('M88.8 18h12v4h-12z', '#3f6fb1') + P('M88.8 22h12v4h-12z', '#c2343c') + carBody('uaz', '#4c5b3c', 74, 64, 0.62);
      return R(4, 40, 112, 1.4, '#888') + [4, 16, 28, 40, 52, 64, 76, 88, 100, 112].map(x => R(x, 40, 1.4, 20, '#888')).join('') + P('M4 40' + Array.from({ length: 28 }, (_, i) => 'l2 -2l2 2').join(''), 'none', 'stroke="#aaa" stroke-width=".6"') + R(34, 14, 52, 26, '#3a3d33') + wins(38, 18, 6, 2, 5, 4, 2.6, 4, 161, 0.8) + R(10, 8, 12, 32, '#4a4d43') + R(8, 6, 16, 6, '#3a3d33') + P('M16 10L50 60L80 60Z', '#fff7c8', 'opacity=".07"') + C(16, 10, 1.6, '#fff7c8') + board(44, 4, 32, 8, 'ОХРАНА', '#1a1420', '#ff6a3d', 5.4) + carBody('gelik', '#2b2e26', 56, 66, 0.58) + man(30, 60, '#2e3a2e') + man(36, 60, '#2e3a2e');
    },
    casino(l) {
      const dots = (x, y, w, h, n) => { let s = ''; for (let i = 0; i < n; i++) { const t = i / n, px = t < .25 ? x + w * t * 4 : t < .5 ? x + w : t < .75 ? x + w - w * (t - .5) * 4 : x, py = t < .25 ? y : t < .5 ? y + h * (t - .25) * 4 : t < .75 ? y + h : y + h - h * (t - .75) * 4; s += C(px, py, 0.7, i % 2 ? '#ffcf5a' : '#ff4d6d'); } return s; };
      const slot = (x, y) => R(x, y, 8, 14, '#8a2b2b', 'rx="1"') + R(x + 1.2, y + 2, 5.6, 4, '#f3ede0') + [0, 1, 2].map(i => C(x + 2.2 + i * 1.8, y + 4, 0.6, ['#c2343c', '#e3b341', '#5aa867'][i])).join('') + R(x + 8, y + 3, 1, 4, '#999') + C(x + 8.5, y + 3, 1, '#c2343c');
      if (l === 1) return R(34, 30, 52, 30, '#2a2f45') + R(37, 34, 46, 22, '#1a1420') + slot(40, 38) + slot(51, 38) + slot(62, 38) + slot(73, 38) + R(32, 22, 56, 8, '#160f18', 'rx="1"') + NEON(60, 28.4, 'АВТОМАТЫ', 5.4, '#ffcf5a') + dots(32, 22, 56, 8, 26) + man(24, 60, '#2a2a30') + man(96, 60, '#4a2e2e');
      if (l === 2) return R(10, 24, 100, 36, '#3a1e2a') + dots(10, 24, 100, 36, 50) + wins(16, 30, 6, 1, 10, 12, 6.4, 0, 171, 0.9, '#ff8a5a') + R(52, 46, 16, 14, '#1b1018') + R(54, 48, 12, 12, '#f0c968', 'opacity=".5"') + C(60, 12, 7, '#141018') + C(60, 12, 6, '#2b1f18') + C(60, 12, 4.6, '#c2343c') + [0, 1, 2, 3, 4, 5].map(i => L(60, 12, 60 + 4.6 * Math.cos(i * 1.05), 12 + 4.6 * Math.sin(i * 1.05), '#1c1a20', 0.6)).join('') + C(60, 12, 1.4, '#e3b341') + NEON(32, 20, 'КАЗИНО', 7, '#ffcf5a') + NEON(90, 20, '24', 7, '#ff4d6d') + man(76, 60, '#1c1a20');
      return P('M14 10L28 60M106 10L92 60', 'none', 'stroke="#fff" stroke-width="8" opacity=".05"') + R(8, 26, 104, 34, '#3a1e2a') + P('M40 26Q60 2 80 26Z', '#e3b341') + P('M44 26Q60 8 76 26Z', '#b8902e') + C(60, 6, 2, '#ffcf5a') + [14, 30, 46, 74, 90, 106].map(x => R(x - 2, 28, 4, 32, '#d9c9a8')).join('') + wins(18, 32, 9, 1, 8, 14, 3.6, 0, 181, 0.9, '#ff8a5a') + dots(8, 26, 104, 34, 64) + R(32, 30, 56, 12, '#1a0f16', 'rx="1"') + NEON(60, 40, 'КАЗИНО', 10, '#ffcf5a') + R(50, 48, 20, 12, '#f0c968', 'opacity=".75"') + carBody('limo', '#141418', 10, 68, 0.5) + man(100, 61, '#1c1a20');
    },
    land(l) {
      if (l === 1) return R(0, 50, 120, 10, '#2e3a2a') + fence(10, 110, 60, 8, '#6b4f32') + R(46, 30, 1.4, 22, '#6b4f32') + R(36, 26, 26, 10, '#e8e2d6') + T(49, 30.4, 'ЧАСТНАЯ', 3.6, '#2a2530') + T(49, 34.4, 'СОБСТВЕННОСТЬ', 3, '#2a2530') + tree(100, 50, 1.4) + tree(16, 50, 1.1) + R(70, 48, 6, 2, '#3b2d24');
      if (l === 2) return R(0, 52, 120, 8, '#4a3d33') + R(76, 6, 2.4, 54, '#e3b341') + [10, 18, 26, 34, 42, 50].map(y => L(76, y, 78.4, y + 8, '#b8902e', 0.6)).join('') + R(30, 6, 70, 2.4, '#e3b341') + R(96, 8, 6, 6, '#3a3446') + L(40, 8, 40, 30, '#aaa', 0.5) + R(36, 30, 8, 4, '#888') + R(14, 40, 50, 12, '#6b6670') + wins(16, 42, 6, 1, 6, 4, 2, 0, 191, 0) + crate(66, 52, 8, 4, '#8a8590') + crate(88, 52, 10, 5, '#8a8590') + board(8, 26, 26, 7, 'СТРОЙКА', '#e3b341', '#1a1420', 4.6) + man(54, 60, '#e58139') + man(104, 60, '#e58139');
      const cottage = (x, s, seed) => R(x, 60 - 18 * s, 26 * s, 18 * s, '#c8b9a2') + P('M' + (x - 2 * s) + ' ' + f1(60 - 18 * s) + 'L' + f1(x + 13 * s) + ' ' + f1(60 - 30 * s) + 'L' + f1(x + 28 * s) + ' ' + f1(60 - 18 * s) + 'Z', '#7a2e2a') + wins(x + 3 * s, 60 - 14 * s, 3, 2, 4.4 * s, 4 * s, 3 * s, 2 * s, seed, 0.8) + R(x + 20 * s, 60 - 6 * s, 3 * s, 6 * s, '#5a3d28');
      return cottage(8, 1, 201) + cottage(64, 1.3, 203) + R(40, 44, 22, 16, '#2e3a2a') + tree(46, 60, 1.2) + tree(56, 60, 1) + R(0, 58, 120, 2, '#4a4552') + [0, 8, 16, 24, 32, 40, 100, 108, 116].map(x => R(x, 52, 1.4, 8, '#3a3446')).join('') + R(0, 52, 40, 1, '#3a3446') + R(100, 52, 20, 1, '#3a3446') + board(42, 34, 18, 6, 'ПОСЁЛОК', '#1a1420', '#e3b341', 3.6) + carBody('gelik', '#141418', 96, 66, 0.32, 1);
    }
  };
  const LVL = ['', 'I', 'II', 'III'];
  const cache = {};
  function build(k, lvl) {
    lvl = Math.max(1, Math.min(3, lvl || 1));
    const key = k + lvl; if (cache[key]) return cache[key];
    const B = (G.DATA.BUILDS[k] || {}).name || k, fn = BUILD[k];
    const body = fn ? fn(lvl) : '';
    return (cache[key] = svg('0 0 120 72', scene(hash(k) + lvl * 13, body, lvl), B + ', уровень ' + LVL[lvl], 'bld'));
  }

  // ---------- портреты ----------
  const SKIN = ['#efcfb2', '#e6bf9d', '#dcb08c', '#cf9f7c', '#bf8a66', '#f3d8c0'];
  const HAIR = ['#1d1a1a', '#2e221b', '#3b2a20', '#5a3d28', '#7a5a3a', '#a8834f', '#8a4a2a'];
  const CLOTH = {
    tracksuit: { c: '#1c1d24', d: '#2b2d38' }, leather: { c: '#18161a', d: '#2a272e' }, raspberry: { c: '#9c1f4a', d: '#b8325f' },
    suit: { c: '#24273a', d: '#33374f' }, sweater: { c: '#4a5a6a', d: '#5a6b7c' }, telnyashka: { c: '#e8e2d6', d: '#2d4a8a' },
    cop: { c: '#46586a', d: '#5a6e82' }, general: { c: '#3d4a2e', d: '#4e5c3a' }, prison: { c: '#2d2f35', d: '#3a3c44' }
  };
  function clothFor(c, r) {
    const b = c.bio || '';
    if (/Афган|Десантник|ДОСААФ/.test(b)) return 'telnyashka';
    if (/экономфак|Комсорг|директор|Сын генерала|Цеховик/.test(b)) return r() < 0.6 ? 'suit' : 'sweater';
    if (/боксу|самбо|борьбе|Хоккеист|Рубщик/.test(b)) return r() < 0.75 ? 'tracksuit' : 'leather';
    if (/опер/.test(b)) return 'leather';
    return pick(r, ['tracksuit', 'leather', 'leather', 'raspberry', 'sweater', 'tracksuit']);
  }
  // c: человек семьи или { name, nick, age, str, wit, loy, look, role, st, seed }
  function face(c, opts) {
    opts = opts || {};
    const look = Object.assign({}, c.look || {}, opts.look || {});
    const r = rng(hash((c.seed != null ? c.seed : '') + '|' + (c.name || '') + '|' + (c.nick || '') + '|' + (c.leg || '')));
    const age = c.age || 35, str = c.str || 5, wit = c.wit || 5, loy = c.loy || 5;
    const skin = look.skin || pick(r, SKIN), dskin = 'rgba(80,40,30,.28)';
    let hairC = look.hairC || pick(r, HAIR);
    const grey = look.grey || age > 44 && r() < 0.7;
    if (grey) hairC = age > 55 ? '#bdb8b2' : '#7d7873';
    const role = c.role || look.role;
    let cloth = look.cloth || (role === 'cop' ? 'cop' : role === 'general' ? 'general' : role === 'suit' ? 'suit' : clothFor(c, r));
    if (c.st === 'jail') cloth = 'prison';
    const CL = CLOTH[cloth] || CLOTH.leather;
    const wide = look.wide ? 1.5 : 0;
    const hw = 10.6 + str * 0.2 + wide, jaw = hw - 2.2 + str * 0.12 + wide * 0.6, chin = 43 + (r() - 0.5) * 1.6;
    const nw = 4.6 + str * 0.35 + wide;
    const bg = opts.bg || c.bg || '#2a2433';
    let s = R(0, 0, 64, 64, bg) + C(32, 70, 40, '#000', 'opacity=".18"');
    // плечи и одежда
    const sh = 22 + str * 0.6 + wide * 2;
    s += P('M' + f1(32 - sh) + ' 64Q' + f1(32 - sh) + ' 49 ' + f1(32 - nw - 3) + ' 47L' + f1(32 + nw + 3) + ' 47Q' + f1(32 + sh) + ' 49 ' + f1(32 + sh) + ' 64Z', CL.c);
    s += R(32 - nw, 36, nw * 2, 13, skin) + R(32 - nw, 44, nw * 2, 5, dskin);
    if (cloth === 'tracksuit') s += P('M' + f1(32 - nw - 2) + ' 47L32 56L' + f1(32 + nw + 2) + ' 47', 'none', 'stroke="#efe8dc" stroke-width="1"') + [0, 2, 4].map(o => L(32 - sh + 5 + o, 64, 32 - sh + 9 + o, 51, '#efe8dc', 0.8)).join('') + [0, 2, 4].map(o => L(32 + sh - 5 - o, 64, 32 + sh - 9 - o, 51, '#efe8dc', 0.8)).join('');
    if (cloth === 'leather') s += P('M' + f1(32 - nw - 3) + ' 47L' + f1(32 - nw - 7) + ' 56L32 51L' + f1(32 + nw + 7) + ' 56L' + f1(32 + nw + 3) + ' 47Z', CL.d) + R(31.4, 51, 1.2, 13, '#0d0c0f');
    if (cloth === 'raspberry' || cloth === 'suit') s += P('M' + f1(32 - nw) + ' 47L32 60L' + f1(32 + nw) + ' 47Z', cloth === 'suit' ? '#efe8dc' : '#141216') + P('M' + f1(32 - nw - 3) + ' 47L' + f1(32 - 2) + ' 62L' + f1(32 - nw - 6) + ' 54Z', CL.d) + P('M' + f1(32 + nw + 3) + ' 47L' + f1(32 + 2) + ' 62L' + f1(32 + nw + 6) + ' 54Z', CL.d) + (cloth === 'suit' ? P('M31 49h2l1 10l-2 3l-2 -3z', pick(r, ['#8a2b2b', '#2d4a6a', '#5a4a2a'])) : '');
    if (cloth === 'sweater') s += P('M' + f1(32 - nw - 1) + ' 47Q32 52 ' + f1(32 + nw + 1) + ' 47', 'none', 'stroke="' + CL.d + '" stroke-width="3"');
    if (cloth === 'telnyashka') { s += P('M' + f1(32 - nw - 1) + ' 47L32 55L' + f1(32 + nw + 1) + ' 47Z', '#efe8dc'); for (let y = 49; y < 55; y += 2) s += L(32 - nw, y, 32 + nw, y, '#2d4a8a', 0.9); s += P('M' + f1(32 - sh) + ' 64Q' + f1(32 - sh) + ' 49 ' + f1(32 - nw - 3) + ' 47L' + f1(32 - nw) + ' 50L' + f1(32 - nw - 4) + ' 64Z', '#3f4a3a') + P('M' + f1(32 + sh) + ' 64Q' + f1(32 + sh) + ' 49 ' + f1(32 + nw + 3) + ' 47L' + f1(32 + nw) + ' 50L' + f1(32 + nw + 4) + ' 64Z', '#3f4a3a'); }
    if (cloth === 'cop' || cloth === 'general') s += P('M' + f1(32 - nw) + ' 47L32 56L' + f1(32 + nw) + ' 47Z', '#d9e2ea') + P('M31 49h2l1 8l-2 2l-2 -2z', '#2a2f3a') + R(32 - sh + 3, 49, 9, 2.4, cloth === 'general' ? '#e3b341' : '#2a3442', 'rx=".6"') + R(32 + sh - 12, 49, 9, 2.4, cloth === 'general' ? '#e3b341' : '#2a3442', 'rx=".6"') + (cloth === 'general' ? C(32 - sh + 7, 50.2, 0.8, '#c2343c') + C(32 + sh - 8, 50.2, 0.8, '#c2343c') : '');
    if (cloth === 'prison') s += [-12, -6, 6, 12].map(o => L(32 + o, 50, 32 + o, 64, '#55585f', 1.2)).join('');
    const chain = look.chain || (/tracksuit|leather|raspberry/.test(cloth) && r() < 0.45);
    if (chain) s += P('M' + f1(32 - nw + 0.5) + ' 44Q32 ' + (51 + str * 0.2) + ' ' + f1(32 + nw - 0.5) + ' 44', 'none', 'stroke="#e3b341" stroke-width="1.1" stroke-dasharray="1.2 .5"');
    // уши и голова
    s += '<ellipse cx="' + f1(32 - hw + 0.4) + '" cy="29" rx="2.2" ry="3.4" fill="' + skin + '"/><ellipse cx="' + f1(32 + hw - 0.4) + '" cy="29" rx="2.2" ry="3.4" fill="' + skin + '"/>';
    const head = 'M' + f1(32 - hw) + ' 27C' + f1(32 - hw) + ' 11 ' + f1(32 + hw) + ' 11 ' + f1(32 + hw) + ' 27L' + f1(32 + jaw) + ' 37Q32 ' + f1(chin + 3) + ' ' + f1(32 - jaw) + ' 37Z';
    s += P(head, skin);
    s += P('M' + f1(32 + hw) + ' 27L' + f1(32 + jaw) + ' 37Q32 ' + f1(chin + 3) + ' ' + f1(32 - jaw) + ' 37Q32 ' + f1(chin) + ' ' + f1(32 + jaw - 1) + ' 35Z', dskin);
    // щетина и борода
    const beard = look.beard || (r() < 0.12 ? 'beard' : r() < 0.25 ? 'mustache' : r() < 0.55 ? 'stubble' : 'none');
    if (beard === 'stubble') s += P('M' + f1(32 - jaw) + ' 33L' + f1(32 - jaw) + ' 37Q32 ' + f1(chin + 3) + ' ' + f1(32 + jaw) + ' 37L' + f1(32 + jaw) + ' 33Q32 37 ' + f1(32 - jaw) + ' 33Z', hairC, 'opacity=".28"');
    if (beard === 'beard') s += P('M' + f1(32 - jaw - 0.4) + ' 31L' + f1(32 - jaw) + ' 38Q32 ' + f1(chin + 5) + ' ' + f1(32 + jaw) + ' 38L' + f1(32 + jaw + 0.4) + ' 31Q32 37.5 ' + f1(32 - jaw - 0.4) + ' 31ZM28 39Q32 41 36 39Q32 37.6 28 39Z', hairC, 'fill-rule="evenodd"');
    if (beard === 'mustache' || beard === 'beard') s += P('M27.4 36.6Q29 34.2 32 35Q35 34.2 36.6 36.6Q34 35.8 32 36.2Q30 35.8 27.4 36.6Z', hairC);
    // волосы
    let hair = look.hair || (age > 42 && r() < 0.3 ? 'bald' : pick(r, ['buzz', 'buzz', 'short', 'short', 'side', 'mullet', 'bald']));
    if (c.st === 'jail') hair = 'buzz';
    const top = 'M' + f1(32 - hw - 0.4) + ' 26C' + f1(32 - hw - 0.4) + ' 9.4 ' + f1(32 + hw + 0.4) + ' 9.4 ' + f1(32 + hw + 0.4) + ' 26';
    if (hair === 'buzz') s += P(top + 'L' + f1(32 + hw - 1) + ' 22Q32 16.4 ' + f1(32 - hw + 1) + ' 22Z', hairC, 'opacity=".78"');
    if (hair === 'short' || hair === 'mullet' || hair === 'side') s += P(top + 'L' + f1(32 + hw - 0.6) + ' 23Q' + f1(32 + hw - 3) + ' 19 ' + f1(32 + 3) + ' 18.6Q' + (hair === 'side' ? '27 17.4 ' + f1(32 - hw + 1) + ' 22' : '32 19.6 ' + f1(32 - hw + 0.6) + ' 23') + 'Z', hairC);
    if (hair === 'side') s += L(26.6, 13.6, 25.6, 19, '#000', 0.5, 'opacity=".35"');
    if (hair === 'mullet') s += P('M' + f1(32 - hw - 0.4) + ' 24L' + f1(32 - hw - 1.4) + ' 37L' + f1(32 - hw + 1.6) + ' 34L' + f1(32 - hw + 1) + ' 26ZM' + f1(32 + hw + 0.4) + ' 24L' + f1(32 + hw + 1.4) + ' 37L' + f1(32 + hw - 1.6) + ' 34L' + f1(32 + hw - 1) + ' 26Z', hairC);
    if (hair === 'bald') s += '<ellipse cx="' + f1(32 - hw * 0.35) + '" cy="15.5" rx="3.2" ry="1.6" fill="#fff" opacity=".22"/>' + (look.fringe || r() < 0.6 ? P('M' + f1(32 - hw - 0.3) + ' 27Q' + f1(32 - hw) + ' 21 ' + f1(32 - hw + 2.4) + ' 20L' + f1(32 - hw + 2) + ' 27ZM' + f1(32 + hw + 0.3) + ' 27Q' + f1(32 + hw) + ' 21 ' + f1(32 + hw - 2.4) + ' 20L' + f1(32 + hw - 2) + ' 27Z', hairC) : '');
    // глаза, брови, нос, рот
    const ey = 28, ex = 4.6 + wide * 0.3;
    const frown = loy <= 3 ? 1.6 : look.brows === 'heavy' ? 1 : (r() - 0.4);
    s += '<ellipse cx="' + f1(32 - ex) + '" cy="' + ey + '" rx="1.6" ry="1.05" fill="#f3ede0"/><ellipse cx="' + f1(32 + ex) + '" cy="' + ey + '" rx="1.6" ry="1.05" fill="#f3ede0"/>';
    s += C(32 - ex + 0.2, ey, 0.85, '#1b1613') + C(32 + ex + 0.2, ey, 0.85, '#1b1613');
    const bw = look.brows === 'heavy' || str > 7 ? 1.9 : 1.3, bc = grey ? '#8f8a86' : hairC;
    s += L(32 - ex - 2.6, ey - 3.6 - frown * 0.3, 32 - ex + 2.2, ey - 3.4 + frown * 0.8, bc, bw, 'stroke-linecap="round"') + L(32 + ex + 2.6, ey - 3.6 - frown * 0.3, 32 + ex - 2.2, ey - 3.4 + frown * 0.8, bc, bw, 'stroke-linecap="round"');
    const nl = 4.4 + r() * 1.4, nb = r() < 0.2 ? 0.9 : 0;
    s += P('M32 ' + (ey + 0.5) + 'L' + f1(30.6 - nb) + ' ' + f1(ey + nl) + 'Q32 ' + f1(ey + nl + 1.4) + ' 33.6 ' + f1(ey + nl), 'none', 'stroke="rgba(80,40,30,.55)" stroke-width=".8" stroke-linejoin="round"');
    const my = ey + nl + 3.6, sm = (r() - 0.5) * 1.6 + (loy >= 7 ? 0.5 : 0);
    s += P('M29 ' + f1(my) + 'Q32 ' + f1(my + sm) + ' 35 ' + f1(my - (sm > 0.6 ? 0.4 : 0)), 'none', 'stroke="#7a3a32" stroke-width="1" stroke-linecap="round"');
    if (age > 38) s += L(28.4, 18.6, 35.6, 18.6, 'rgba(80,40,30,.3)', 0.5) + (age > 46 ? L(29, 20.2, 35, 20.2, 'rgba(80,40,30,.3)', 0.5) + P('M28.6 ' + f1(ey + nl - 0.6) + 'q-1 2 -0.6 4M35.4 ' + f1(ey + nl - 0.6) + 'q1 2 0.6 4', 'none', 'stroke="rgba(80,40,30,.3)" stroke-width=".5"') : '');
    // шрам, очки, кепка
    if (look.scar || c.nick === 'Шрам' || r() < 0.1) s += L(36.4, 23.4, 39.4, 33.4, '#a0604f', 1, 'stroke-linecap="round"') + [26, 29, 32].map(y => L(37.2, y, 38.8, y - 0.4, '#a0604f', 0.5)).join('');
    const glasses = look.glasses != null ? look.glasses : (/Профессор|Бухгалтер|Студент/.test(c.nick || '') || (wit >= 8 && r() < 0.6)) ? 1 : (str >= 7 && r() < 0.18) ? 2 : 0;
    if (glasses === 1) s += '<rect x="' + f1(32 - ex - 2.8) + '" y="' + (ey - 2.2) + '" width="5.6" height="4.2" rx="1.2" fill="none" stroke="#1d1a1a" stroke-width=".8"/><rect x="' + f1(32 + ex - 2.8) + '" y="' + (ey - 2.2) + '" width="5.6" height="4.2" rx="1.2" fill="none" stroke="#1d1a1a" stroke-width=".8"/>' + L(32 - ex + 2.8, ey - 0.6, 32 + ex - 2.8, ey - 0.6, '#1d1a1a', 0.8);
    if (glasses === 2) s += P('M' + f1(32 - ex - 3.2) + ' ' + (ey - 2) + 'h6.2l-.6 3.4q-2.6 1.4 -5 0zM' + f1(32 + ex - 3) + ' ' + (ey - 2) + 'h6.2l-.6 3.4q-2.6 1.4 -5 0z', '#0d0c10') + L(32 - ex + 3, ey - 1.6, 32 + ex - 3, ey - 1.6, '#0d0c10', 0.9);
    if (look.cap || (!role && age > 40 && r() < 0.12)) s += P('M' + f1(32 - hw - 1) + ' 22C' + f1(32 - hw) + ' 10 ' + f1(32 + hw) + ' 10 ' + f1(32 + hw + 1) + ' 22Z', '#3a3a3e') + P('M' + f1(32 - hw) + ' 22Q32 18.6 ' + f1(32 + hw + 5) + ' 22.6Q32 24 ' + f1(32 - hw) + ' 22Z', '#2a2a2e');
    if (role === 'cop' || role === 'general') { const cc = role === 'general' ? '#3d4a2e' : '#3a4a5c'; s += P('M' + f1(32 - hw - 3) + ' 15Q32 6 ' + f1(32 + hw + 3) + ' 15L' + f1(32 + hw) + ' 20H' + f1(32 - hw) + 'Z', cc) + R(32 - hw, 18.6, hw * 2, 2.6, role === 'general' ? '#c2343c' : '#c2343c') + P('M' + f1(32 - hw) + ' 21.2Q32 25 ' + f1(32 + hw) + ' 21.2Z', '#141216') + C(32, 15.6, 1.4, '#e3b341') + (role === 'general' ? P('M' + f1(32 - hw + 1) + ' 21.4Q32 23.6 ' + f1(32 + hw - 1) + ' 21.4', 'none', 'stroke="#e3b341" stroke-width=".8"') : ''); }
    // ранен: повязка; сидит: решётка
    if (c.st === 'hurt') s += P('M' + f1(32 - hw - 0.6) + ' 18.6Q32 14 ' + f1(32 + hw + 0.6) + ' 18.6L' + f1(32 + hw + 0.4) + ' 22.4Q32 18 ' + f1(32 - hw - 0.4) + ' 22.4Z', '#efe8dc') + C(32 + hw * 0.4, 19.4, 1.3, '#b8323f', 'opacity=".85"');
    if (c.st === 'jail') s += [8, 20, 32, 44, 56].map(x => R(x - 1, 0, 2, 64, '#56535d', 'opacity=".85"')).join('') + R(0, 6, 64, 1.6, '#56535d', 'opacity=".7"');
    const lab = opts.label || ((c.name || '') + (c.nick ? ' «' + c.nick + '»' : ''));
    return svg('0 0 64 64', s, lab.replace(/[<>&"]/g, ''), 'face');
  }
  // глава бригады — тот же генератор с фиксированным сидом
  const bossFace = f => face({ seed: 'boss-' + f.id, name: f.boss, nick: '', age: 44, str: 7, wit: 7, loy: 8, look: { cloth: f.id === 'cher' ? 'suit' : f.id === 'lub' ? 'tracksuit' : 'raspberry', chain: f.id !== 'cher' } }, { bg: f.color + '40', label: f.boss });
  const legendFace = (k, opts) => { const L = G.DATA.LEGENDS[k]; return L ? face(Object.assign({ leg: k }, L), opts) : ''; };
  const OFF_ROLE = { uch: ['cop', 52], uvd: ['cop', 44], prok: ['suit', 47], dep: ['suit', 56], fsb: ['general', 58] };
  const officialFace = k => face({ seed: 'off-' + k, name: G.DATA.OFFICIALS[k].name, age: OFF_ROLE[k][1], str: 5, wit: 7, loy: 5, role: OFF_ROLE[k][0], look: k === 'dep' ? { glasses: 1, hair: 'side' } : {} }, { label: G.DATA.OFFICIALS[k].name });
  const vacantFace = () => svg('0 0 64 64', R(0, 0, 64, 64, '#211c29') + C(32, 26, 11, '#3a3446') + P('M10 64Q10 44 32 42Q54 44 54 64Z', '#3a3446') + T(32, 31, '?', 14, '#5a5466'), 'Вакантно', 'face');

  // ---------- арсенал ----------
  const METAL = '#2c2b31', MHI = '#5d5a66', WOOD = '#7a4a2a', WOOD2 = '#5a341c';
  const ARM = {
    obrez: () => R(14, 18, 62, 3.2, METAL) + R(14, 21.4, 62, 3.2, '#232228') + L(14, 21.2, 76, 21.2, MHI, 0.5) + R(74, 16.6, 14, 9.4, '#3a3840', 'rx="1"') + P('M86 17L98 18.4Q104 20 106 30L108 40Q103 42.4 98.6 40.6L95 28Q92 26 87 26Z', WOOD) + P('M95 28L98.6 40.6Q101 41.4 103 41L100 29Z', WOOD2) + P('M80 26Q80 32 86 32L87 26', 'none', 'stroke="' + METAL + '" stroke-width="1.4"') + R(82, 26, 1.4, 4, METAL) + R(40, 24.6, 30, 3, WOOD) + R(14, 17.6, 2, 7.4, '#141216'),
    pm: () => P('M30 15H82Q84 15 84 17V23H30Q28 23 28 21V17Q28 15 30 15Z', METAL) + [60, 63, 66, 69, 72, 75].map(x => L(x, 16, x, 22, '#1a191e', 0.6)).join('') + L(30, 16.4, 82, 16.4, MHI, 0.6) + P('M66 23H82L86 41Q80 43.4 72 42L68 30Z', '#1f1e23') + P('M70 27L80 27L83 39L74 39Z', '#2e2b28') + C(76, 33, 1.4, '#c2343c', 'opacity=".7"') + P('M56 23Q55 30 62 30H67', 'none', 'stroke="' + METAL + '" stroke-width="1.6"') + R(61, 23, 1.2, 4.4, METAL) + R(27, 17, 2, 4, '#141216'),
    aks: () => P('M10 19L32 19M10 26L32 22M10 19L10 26', 'none', 'stroke="' + METAL + '" stroke-width="1.6"') + R(32, 15.6, 40, 8.4, METAL, 'rx="1"') + L(33, 17, 71, 17, MHI, 0.6) + R(72, 16.2, 13, 6.6, WOOD) + R(72, 14, 13, 2.4, WOOD2) + R(85, 17.6, 16, 2.6, METAL) + R(100, 16.6, 8, 4.6, '#3a3840', 'rx="1.2"') + C(82, 13.4, 1.4, METAL) + P('M54 24L64 24Q66 32 62 41L56 40Q58 32 54 24Z', '#7a3e1e') + L(57.6, 27, 59.2, 38, '#5a2c14', 0.6) + P('M40 24L47 24L46 37L40 36Z', '#5a341c') + P('M48 24Q48 29 53 29', 'none', 'stroke="' + METAL + '" stroke-width="1.4"'),
    svd: () => P('M4 20L36 18L36 26L28 28Q22 36 12 34L6 30Z', WOOD) + P('M14 26Q20 28 26 25L24 31Q18 32 14 30Z', '#1b1a1f') + R(36, 17.4, 34, 7.2, METAL, 'rx="1"') + R(70, 18.4, 12, 5, WOOD) + R(82, 19.6, 30, 2, METAL) + R(110, 19, 5, 3, '#3a3840') + R(44, 9.6, 24, 4.4, '#1b1a1f', 'rx="2"') + R(42, 9, 4, 5.6, '#1b1a1f', 'rx="1"') + R(66, 9, 4, 5.6, '#1b1a1f', 'rx="1"') + C(69, 11.8, 1.8, '#6ccff0', 'opacity=".5"') + R(48, 14, 2, 3.4, METAL) + R(62, 14, 2, 3.4, METAL) + P('M52 24.6H58L57 32H53Z', METAL) + P('M40 24.6L46 24.6L45 34L40 33Z', WOOD2) + L(37, 18.6, 69, 18.6, MHI, 0.5),
    rpg: () => R(8, 20, 82, 5.4, '#4b5a3a') + R(6, 19, 4, 7.4, '#3a4630', 'rx="1"') + R(40, 18, 26, 9.4, WOOD, 'rx="1"') + L(40, 22.7, 66, 22.7, WOOD2, 0.6) + P('M90 18L100 14L114 20.6L114 24.6L100 31L90 27Z', '#566146') + P('M100 14L114 20.6L114 22.6L100 18Z', '#6d7a5a') + R(86, 19, 4, 7.4, '#3a4630') + P('M50 27.4L55 27.4L54 39L49.6 38Z', '#2c2b31') + P('M66 27.4L71 27.4L70 37L66 36.4Z', '#2c2b31') + R(66, 13, 2.4, 7, METAL) + R(64, 12, 6, 2, METAL) + P('M57 27.4Q57 32 62 32', 'none', 'stroke="' + METAL + '" stroke-width="1.4"')
  };
  function arm(k) {
    const A = G.DATA.ARMS[k]; if (!A) return '';
    const key = 'arm' + k; if (cache[key]) return cache[key];
    return (cache[key] = svg('0 0 120 48', R(0, 0, 120, 48, '#1d1a24') + R(0, 40, 120, 8, '#17141d') + '<g transform="translate(0 4)">' + ARM[k]() + '</g>', A.name, 'arm'));
  }
  function vest() {
    if (cache.vest) return cache.vest;
    const b = P('M44 6L52 4Q60 12 68 4L76 6L80 14Q76 18 78 24L78 42Q60 46 42 42L42 24Q44 18 40 14Z', '#3f4a33') + P('M47 20H73V40Q60 43 47 40Z', '#4e5b40') + [26, 31, 36].map(y => R(48, y, 24, 1.2, '#2d3524')).join('') + R(51, 22, 7, 5, '#2d3524', 'rx=".6"') + R(62, 22, 7, 5, '#2d3524', 'rx=".6"') + P('M44 6L52 4L54 10L46 12Z', '#2d3524') + P('M76 6L68 4L66 10L74 12Z', '#2d3524');
    return (cache.vest = svg('0 0 120 48', R(0, 0, 120, 48, '#1d1a24') + R(0, 40, 120, 8, '#17141d') + b, G.DATA.VEST.name, 'arm'));
  }
  function car(k) {
    const C0 = G.DATA.CARS[k]; if (!C0) return '';
    const key = 'car' + k; if (cache[key]) return cache[key];
    const kind = CAR_SHAPES[k] ? k : 'nine', len = CAR_SHAPES[kind].len || 60, s = Math.min(1.6, 100 / len);
    const bg = R(0, 0, 120, 48, '#1d1a24') + R(0, 38, 120, 10, '#24202b') + R(0, 38, 120, 0.8, '#3a3446') + [8, 38, 68, 98].map(x => R(x, 43.4, 14, 0.8, '#4a4352')).join('');
    return (cache[key] = svg('0 0 120 48', bg + carBody(kind, C0.col, (120 - len * s) / 2, 40, s), C0.name, 'car'));
  }

  G.ART = { build, face, bossFace, legendFace, officialFace, vacantFace, arm, vest, car, hash };
})(typeof window !== 'undefined' ? (window.W90 = window.W90 || {}) : (globalThis.W90 = globalThis.W90 || {}));
