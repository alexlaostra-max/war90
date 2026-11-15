/* Фоновая музыка: дворовый шансон в ля миноре, синтезируется в браузере (Web Audio), без файлов.
   Бас и гитарный «ум-ца» в аккомпанементе, мелодию ведёт аккордеон. Мелодия своя. */
(function (G) {
  const BPM = 104, E8 = 60 / BPM / 2; // длительность восьмой
  // такт: [бас, квинта, аккорд, (вторая половина такта: бас, квинта, аккорд)]
  const CH = {
    Am: [45, 40, [57, 60, 64]], Dm: [50, 45, [57, 62, 65]], E7: [40, 47, [56, 62, 64]],
    A7: [45, 52, [55, 61, 64]], G: [43, 50, [55, 59, 62]], C: [48, 43, [55, 60, 64]]
  };
  const BARS = ['Am', 'Am', 'Dm', 'Dm', 'E7', 'E7', 'Am', 'Am', 'A7', 'Dm', 'G', 'C', 'Am', 'Dm/E7', 'Am', 'Am'];
  // мелодия по тактам: [нота MIDI или 0 для паузы, длина в восьмых]
  const MEL = [
    [[76, 3], [74, 1], [72, 2], [71, 2]], [[69, 6], [0, 2]],
    [[77, 3], [76, 1], [74, 2], [72, 2]], [[74, 6], [0, 2]],
    [[76, 2], [68, 2], [71, 2], [74, 2]], [[74, 3], [72, 1], [71, 4]],
    [[72, 2], [71, 2], [69, 4]], [[69, 4], [0, 2], [76, 2]],
    [[81, 3], [79, 1], [76, 2], [73, 2]], [[74, 2], [77, 2], [81, 4]],
    [[79, 3], [77, 1], [74, 2], [71, 2]], [[72, 2], [76, 2], [79, 4]],
    [[76, 3], [74, 1], [72, 2], [69, 2]], [[74, 2], [77, 2], [76, 2], [68, 2]],
    [[69, 8]], [[0, 4], [64, 2], [68, 2]]
  ];
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  let ctx = null, master = null, timer = 0, bar = 0, next = 0, on = false;

  function pluck(m, t, vol, dur) { // гитара: короткий щипок
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = hz(m);
    f.type = 'lowpass'; f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(500, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function bass(m, t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = hz(m);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + E8 * 1.8);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + E8 * 2);
  }
  function accordion(m, t, dur) { // два расстроенных голоса с дрожанием
    const g = ctx.createGain(), f = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    f.type = 'lowpass'; f.frequency.value = 1900; f.Q.value = 0.7;
    lfo.frequency.value = 5.5; lg.gain.value = 4; lfo.connect(lg);
    [-7, 7].forEach(det => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = det; lg.connect(o.detune); o.connect(f); o.start(t); o.stop(t + dur + 0.1); });
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.06); g.gain.setValueAtTime(0.16, t + Math.max(0.07, dur - 0.08)); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(g); g.connect(master); lfo.start(t); lfo.stop(t + dur + 0.1);
  }
  function scheduleBar(i, t) {
    const halves = BARS[i].split('/');
    for (let b = 0; b < 4; b++) {
      const c = CH[halves[halves.length === 2 && b >= 2 ? 1 : 0]], bt = t + b * 2 * E8;
      if (b % 2 === 0) bass(b === 0 || halves.length === 2 ? c[0] : c[1], bt);
      else c[2].forEach((n, k) => pluck(n, bt + k * 0.012, 0.11, E8 * 1.4));
    }
    let pos = 0;
    MEL[i].forEach(n => { if (n[0]) accordion(n[0], t + pos * E8, n[1] * E8 * 0.96); pos += n[1]; });
  }
  function tick() {
    while (next < ctx.currentTime + 0.6) { scheduleBar(bar, next); next += 8 * E8; bar = (bar + 1) % BARS.length; }
  }
  function start() {
    if (on) return true;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    if (!ctx) { ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.0001; master.connect(ctx.destination); }
    if (ctx.state === 'suspended') ctx.resume();
    master.gain.cancelScheduledValues(ctx.currentTime); master.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 0.5);
    bar = 0; next = ctx.currentTime + 0.1; on = true; tick(); timer = setInterval(tick, 200);
    return true;
  }
  function stop() {
    if (!on) return; on = false; clearInterval(timer);
    master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setValueAtTime(master.gain.value, ctx.currentTime); master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    setTimeout(() => { if (!on && ctx) ctx.suspend(); }, 400);
  }
  G.Music = { start, stop, playing: () => on };

  const b = document.getElementById('music');
  if (b) b.addEventListener('click', () => {
    if (on) stop(); else if (!start()) return;
    b.setAttribute('aria-pressed', on);
    try { localStorage.setItem('war90.music', on ? '1' : '0'); } catch (e) { /* ignore */ }
  });
})(window.W90);
