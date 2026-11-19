/* Фоновая музыка: блатной шансон, синтезируется в браузере (Web Audio), без файлов.
   Пять своих треков идут подряд, как кассета в ларьке: дворовая «ум-ца», вальс, одесская полька,
   гитарный перебор и кабацкий шансон с драм-машиной. Мелодии свои. */
(function (G) {
  // ---------- нотная запись ----------
  // нота: «A4», «C#5», «Bb4», пауза «-»; длина в восьмых (0.5 — шестнадцатая). Такты через «|».
  // аккорд: «Am», «E7», «D», «Bb», «Gm»; «Dm/E7» — смена аккорда в середине такта.
  const PCL = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midi = s => { const m = /^([A-G])([#b]?)(-?\d)$/.exec(s); return 12 * (+m[3] + 1) + PCL[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); };
  const QUAL = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 10], m7: [0, 3, 10], dim: [0, 3, 6] };
  function chord(name) {
    const m = /^([A-G][#b]?)(m7|m|7|dim)?$/.exec(name), root = (midi(m[1] + '4') % 12 + 12) % 12;
    const bass = 40 + (root - 4 + 12) % 12;                 // корень от E2 до D#3
    const notes = QUAL[m[2] || ''].map(iv => { let n = 55 + ((root + iv - 55) % 12 + 12) % 12; return n; }).sort((a, b) => a - b); // голоса от G3 до F#4
    return { bass, alt: bass + 7 <= 50 ? bass + 7 : bass - 5, notes };
  }
  function section(s) {
    const mel = s.mel ? s.mel.split('|') : [];
    return s.ch.trim().split(/\s+/).map((c, i) => ({
      ch: c.split('/').map(chord),
      mel: (mel[i] || '').trim().split(/\s+/).filter(Boolean).map(t => { const p = t.split(':'); return [p[0] === '-' ? 0 : midi(p[0]), +p[1]]; })
    }));
  }

  // ---------- треки ----------
  // beats — долей в такте, acc — аккомпанемент, lead — кто ведёт мелодию, form — порядок частей
  const TRACKS = [
    { name: 'Дворовая', bpm: 104, beats: 4, acc: 'umca', lead: 'accordion', form: 'IAA',
      I: { ch: 'Am E7', mel: '-:8 | -:4 E4:2 G#4:2' },
      A: { ch: 'Am Am Dm Dm E7 E7 Am Am A7 Dm G C Am Dm/E7 Am Am',
        mel: 'E5:3 D5:1 C5:2 B4:2 | A4:6 -:2 | F5:3 E5:1 D5:2 C5:2 | D5:6 -:2 | E5:2 G#4:2 B4:2 D5:2 | D5:3 C5:1 B4:4 | C5:2 B4:2 A4:4 | A4:4 -:2 E5:2 |' +
          'A5:3 G5:1 E5:2 C#5:2 | D5:2 F5:2 A5:4 | G5:3 F5:1 D5:2 B4:2 | C5:2 E5:2 G5:4 | E5:3 D5:1 C5:2 A4:2 | D5:2 F5:2 E5:2 G#4:2 | A4:8 | -:4 E4:2 G#4:2' } },
    { name: 'Этап на север', bpm: 150, beats: 3, acc: 'waltz', lead: 'violin', form: 'IABABA',
      I: { ch: 'Dm A7', mel: '-:6 | -:6' },
      A: { ch: 'Dm Dm Gm Gm A7 A7 Dm Dm Dm D7 Gm Gm C F A7 Dm',
        mel: 'A4:2 D5:2 E5:2 | F5:4 E5:2 | D5:2 G5:2 F5:2 | D5:6 | C#5:2 E5:2 G5:2 | F5:4 E5:2 | F5:2 E5:2 D5:2 | D5:4 -:2 |' +
          'A4:2 D5:2 F5:2 | A5:4 F#5:2 | G5:2 D5:2 Bb4:2 | D5:4 G5:2 | G5:2 E5:2 C5:2 | F5:4 A4:2 | G5:2 E5:2 C#5:2 | D5:6' },
      B: { ch: 'Bb Bb F F Gm A7 Dm Dm',
        mel: 'F5:4 D5:2 | Bb4:2 D5:2 F5:2 | A5:4 F5:2 | F5:2 C5:2 A4:2 | Bb4:2 D5:2 G5:2 | E5:3 G5:1 F5:1 E5:1 | D5:6 | -:6' } },
    { name: 'Привоз', bpm: 132, beats: 2, acc: 'polka', lead: 'clarinet', form: 'IAABBAA',
      I: { ch: 'D D', mel: '-:4 | -:4' },
      A: { ch: 'D D D D Gm Gm D D Cm Cm D D Gm Cm D D',
        mel: 'D5:1 Eb5:1 F#5:1 G5:1 | A5:2 G5:1 F#5:1 | Eb5:1 F#5:1 Eb5:1 D5:1 | D5:3 -:1 | G4:1 Bb4:1 D5:1 G5:1 | F#5:1 G5:1 A5:1 G5:1 | F#5:1 Eb5:1 D5:1 C5:1 | D5:2 A4:2 |' +
          'C5:1 Eb5:1 G5:1 Eb5:1 | C5:1 D5:0.5 C5:0.5 Bb4:1 A4:1 | A4:1 F#4:1 A4:1 D5:1 | F#5:2 D5:2 | G5:1 F#5:1 G5:1 A5:1 | G5:1 Eb5:1 C5:1 Eb5:1 | F#5:1 Eb5:1 D5:1 C5:1 | D5:2 -:2' },
      B: { ch: 'Gm Gm Cm Cm D D Gm Gm',
        mel: 'D5:1 G5:1 D5:1 Bb4:1 | G4:2 Bb4:1 D5:1 | Eb5:1 G5:1 Eb5:1 C5:1 | C5:2 Eb5:1 D5:1 | C5:1 Bb4:1 A4:1 C5:1 | Bb4:1 A4:1 G4:1 F#4:1 | G4:1 Bb4:1 D5:1 G5:1 | G5:2 -:2' } },
    { name: 'Пересылка', bpm: 92, beats: 4, acc: 'arp', lead: 'violin', form: 'IAA',
      I: { ch: 'Em Em', mel: '-:8 | -:8' },
      A: { ch: 'Em Em Am Am D G C B7 Em Em Am D C Am B7 Em',
        mel: 'B4:2 E5:2 G5:3 F#5:1 | E5:6 -:2 | A4:2 C5:2 E5:3 D5:1 | C5:6 -:2 | D5:2 F#5:2 A5:3 G5:1 | F#5:2 G5:2 D5:4 | E5:2 C5:2 E5:2 G5:2 | F#5:6 D#5:2 |' +
          'E5:3 D#5:1 E5:2 G5:2 | B5:4 G5:2 E5:2 | A5:3 G5:1 F#5:2 E5:2 | F#5:4 D5:4 | E5:2 G5:2 C5:2 E5:2 | A4:2 C5:2 E5:2 C5:2 | B4:2 D#5:2 F#5:2 A5:2 | G5:2 F#5:2 E5:4' } },
    { name: 'Кабацкая', bpm: 120, beats: 4, acc: 'kabak', lead: 'synth', pad: true, drums: true, echo: true, form: 'IAA',
      I: { ch: 'Gm Gm Cm D7', mel: '-:8 | -:8 | -:8 | -:8' },
      A: { ch: 'Gm Gm Cm Cm F F Bb Bb Eb Eb Cm D Gm Cm D Gm',
        mel: 'D5:2 G5:2 G5:1 A5:1 Bb5:2 | A5:2 G5:2 D5:4 | Eb5:2 G5:2 G5:1 F5:1 Eb5:2 | D5:2 Eb5:2 C5:4 | C5:2 F5:2 F5:1 G5:1 A5:2 | G5:2 F5:2 C5:4 | D5:2 F5:2 Bb5:3 A5:1 | G5:2 F5:2 D5:4 |' +
          'Eb5:3 F5:1 G5:2 Bb5:2 | G5:4 Eb5:4 | C5:2 Eb5:2 G5:2 F5:1 Eb5:1 | D5:2 F#5:2 A5:4 | Bb5:3 A5:1 G5:2 D5:2 | Eb5:3 D5:1 C5:2 Eb5:2 | D5:2 C5:2 Bb4:2 A4:2 | G4:6 -:2' } }
  ];
  TRACKS.forEach(T => { T.bars = T.form.split('').reduce((a, k) => a.concat(section(T[k])), []); });

  // ---------- инструменты ----------
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  let ctx = null, master = null, noise = null;
  function env(g, t, a, vol, rel) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + rel); }
  function osc(type, m, t, end, out, det) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz(m); if (det) o.detune.value = det; o.connect(out); o.start(t); o.stop(end); return o; }
  function filt(type, f, q, out) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; if (q) n.Q.value = q; n.connect(out); return n; }
  function vibrato(t, end, rate, cents, delay, oscs) {
    const l = ctx.createOscillator(), g = ctx.createGain(); l.frequency.value = rate;
    g.gain.setValueAtTime(delay ? 0 : cents, t); if (delay) g.gain.linearRampToValueAtTime(cents, t + delay);
    l.connect(g); oscs.forEach(o => g.connect(o.detune)); l.start(t); l.stop(end);
  }
  function pluck(m, t, vol, dur, out) { // гитара: короткий щипок
    const g = ctx.createGain(), f = filt('lowpass', 2600, 0, g);
    f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(500, t + dur);
    env(g, t, 0.008, vol, dur); g.connect(out); osc('sawtooth', m, t, t + dur + 0.05, f);
  }
  function bass(m, t, dur, out) { const g = ctx.createGain(); env(g, t, 0.015, 0.5, dur); g.connect(out); osc('triangle', m, t, t + dur + 0.05, g); }
  function synthBass(m, t, dur, out) {
    const g = ctx.createGain(), f = filt('lowpass', 700, 4, g);
    f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(300, t + dur);
    env(g, t, 0.01, 0.32, dur); g.connect(out); osc('sawtooth', m, t, t + dur + 0.05, f);
  }
  // мелодия: у каждого инструмента свой тембр, атака и дрожание
  const LEAD = {
    accordion(m, t, dur, out) { // два расстроенных голоса
      const g = ctx.createGain(), f = filt('lowpass', 1900, 0.7, g), end = t + dur + 0.1;
      vibrato(t, end, 5.5, 4, 0, [-7, 7].map(d => osc('sawtooth', m, t, end, f, d)));
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.06); g.gain.setValueAtTime(0.16, t + Math.max(0.07, dur - 0.08)); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      g.connect(out);
    },
    violin(m, t, dur, out) { // смычок: мягкая атака, вибрато вступает позже
      const g = ctx.createGain(), f = filt('lowpass', 2600, 1.2, g), end = t + dur + 0.15;
      vibrato(t, end, 5.8, 14, Math.min(0.25, dur * 0.5), [-5, 5].map(d => osc('sawtooth', m, t, end, f, d)));
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.13, t + Math.min(0.09, dur * 0.4)); g.gain.setValueAtTime(0.13, t + Math.max(0.1, dur - 0.06)); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.08);
      g.connect(out);
    },
    clarinet(m, t, dur, out) { // квадрат в фильтре — деревянный тембр
      const g = ctx.createGain(), f = filt('lowpass', 1700, 1, g), end = t + dur + 0.08;
      vibrato(t, end, 5, 6, 0, [osc('square', m, t, end, f)]);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.11, t + 0.02); g.gain.setValueAtTime(0.11, t + Math.max(0.03, dur - 0.04)); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.02);
      g.connect(out);
    },
    synth(m, t, dur, out) { // кабацкий синтезатор девяностых
      const g = ctx.createGain(), f = filt('lowpass', 2800, 1, g), end = t + dur + 0.1;
      vibrato(t, end, 5.5, 10, 0.18, [osc('square', m, t, end, f, -6), osc('sawtooth', m, t, end, f, 6)]);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.075, t + 0.015); g.gain.setValueAtTime(0.075, t + Math.max(0.03, dur - 0.05)); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.04);
      g.connect(out);
    }
  };
  function pad(notes, t, dur, out) { // струнная подложка
    const g = ctx.createGain(), f = filt('lowpass', 1000, 0, g), end = t + dur + 0.4;
    notes.forEach(n => [-9, 9].forEach(d => osc('sawtooth', n, t, end, f, d)));
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.022, t + 0.25); g.gain.setValueAtTime(0.022, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.35);
    g.connect(out);
  }
  function noiseHit(t, type, f, vol, dur, out) {
    if (!noise) { noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ctx.createBufferSource(), g = ctx.createGain(), fl = filt(type, f, 0.8, g);
    s.buffer = noise; s.connect(fl); env(g, t, 0.002, vol, dur); g.connect(out); s.start(t); s.stop(t + dur + 0.02);
  }
  const DRUM = {
    kick(t, out) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14); env(g, t, 0.004, 0.55, 0.3); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.32); },
    snare(t, out) { noiseHit(t, 'bandpass', 1900, 0.22, 0.16, out); const g = ctx.createGain(); env(g, t, 0.003, 0.1, 0.09); g.connect(out); osc('triangle', 55, t, t + 0.1, g); },
    hat(t, out) { noiseHit(t, 'highpass', 7500, 0.05, 0.04, out); }
  };

  // ---------- аккомпанемент ----------
  // bar — такт, n — его номер в треке, t — начало, e — длина восьмой, ch(доля) — аккорд на этой доле
  const strum = (c, t, vol, dur, out) => c.notes.forEach((n, k) => pluck(n, t + k * 0.012, vol, dur, out));
  const ACC = {
    umca(T, n, t, e, ch, out) { for (let b = 0; b < 4; b++) { const c = ch(b), bt = t + b * 2 * e; if (b % 2) strum(c, bt, 0.11, e * 1.4, out); else bass(b === 0 || c !== ch(0) ? c.bass : c.alt, bt, e * 1.8, out); } },
    waltz(T, n, t, e, ch, out) { const c = ch(0); bass(n % 2 ? c.alt : c.bass, t, e * 2.4, out); strum(ch(1), t + 2 * e, 0.085, e * 1.3, out); strum(ch(2), t + 4 * e, 0.075, e * 1.3, out); },
    polka(T, n, t, e, ch, out) { for (let k = 0; k < 4; k++) { const c = ch(k >> 1), bt = t + k * e; if (k % 2) strum(c, bt, 0.09, e * 0.8, out); else bass(k ? c.alt : c.bass, bt, e * 0.95, out); } },
    arp(T, n, t, e, ch, out) {
      const ord = [-1, 0, 1, 2, -2, 2, 1, 0];
      for (let k = 0; k < T.beats * 2; k++) { const c = ch(k >> 1), bt = t + k * e, o = ord[k % 8]; if (o === -1) bass(c.bass, bt, e * 3.5, out); else if (o === -2) bass(c.alt, bt, e * 3.5, out); else pluck(c.notes[o] + 12, bt, 0.08, e * 3, out); }
    },
    kabak(T, n, t, e, ch, out) {
      for (let k = 0; k < 8; k++) { const c = ch(k >> 1), bt = t + k * e; synthBass(c.bass + (k % 2 ? 12 : 0), bt, e * 0.9, out); if (k === 2 || k === 6) strum(c, bt, 0.07, e * 1.1, out); }
    }
  };
  function scheduleBar(T, n, t, out, lead) {
    const bar = T.bars[n], e = 30 / T.bpm, half = Math.ceil(T.beats / 2);
    const ch = b => bar.ch[bar.ch.length > 1 && b >= half ? 1 : 0];
    ACC[T.acc](T, n, t, e, ch, out);
    if (T.pad) bar.ch.forEach((c, k) => pad(c.notes.map(x => x + 12), t + k * half * 2 * e, (bar.ch.length > 1 ? half : T.beats) * 2 * e, out));
    if (T.drums) for (let k = 0; k < T.beats * 2; k++) { const bt = t + k * e; if (k % 4 === 0) DRUM.kick(bt, out); if (k % 4 === 2) DRUM.snare(bt, out); if (k % 2) DRUM.hat(bt, out); }
    let pos = 0;
    bar.mel.forEach(m => { if (m[0]) LEAD[T.lead](m[0], t + pos * e, m[1] * e * 0.96, lead); pos += m[1]; });
  }

  // ---------- плеер ----------
  const GAP = 1.6; // тишина между треками, с
  let timer = 0, on = false, ti = -1, bar = 0, next = 0, bus = null, lead = null, onTrack = null;
  // у каждого трека своя шина: при перемотке её можно увести в тишину, не трогая следующий трек
  function openBus(T, at) {
    const old = bus;
    if (old) setTimeout(() => old.disconnect(), Math.max(0, at - ctx.currentTime) * 1000 + 4000);
    bus = ctx.createGain(); bus.connect(master); lead = bus;
    if (T.echo) {
      lead = ctx.createGain(); lead.connect(bus);
      const d = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain();
      d.delayTime.value = 45 / T.bpm; fb.gain.value = 0.3; wet.gain.value = 0.35;
      lead.connect(d); d.connect(fb); fb.connect(d); d.connect(wet); wet.connect(bus);
    }
  }
  function load(i, at) {
    ti = (i + TRACKS.length) % TRACKS.length; bar = 0; next = at; openBus(TRACKS[ti], at);
    const k = ti; setTimeout(() => { if (on && ti === k && onTrack) onTrack(TRACKS[k].name); }, Math.max(0, at - ctx.currentTime) * 1000);
  }
  function tick() {
    while (next < ctx.currentTime + 0.6) {
      const T = TRACKS[ti];
      if (bar >= T.bars.length) { load(ti + 1, next + GAP); continue; }
      scheduleBar(T, bar, next, bus, lead); next += T.beats * 60 / T.bpm; bar++;
    }
  }
  function start() {
    if (on) return true;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    if (!ctx) { ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.0001; master.connect(ctx.destination); }
    if (ctx.state === 'suspended') ctx.resume();
    master.gain.cancelScheduledValues(ctx.currentTime); master.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 0.5);
    on = true; load(ti < 0 ? Math.floor(Math.random() * TRACKS.length) : ti, ctx.currentTime + 0.1); tick(); timer = setInterval(tick, 200);
    return true;
  }
  function skip() { // следующий трек: текущий быстро гаснет
    if (!on) return;
    const t = ctx.currentTime; bus.gain.setValueAtTime(1, t); bus.gain.linearRampToValueAtTime(0.0001, t + 0.25);
    load(ti + 1, t + 0.35); tick();
  }
  function stop() {
    if (!on) return; on = false; clearInterval(timer);
    const t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0.0001, t + 0.3);
    const old = bus; bus = null;
    setTimeout(() => { if (old) old.disconnect(); if (!on && ctx) ctx.suspend(); }, 400);
  }
  G.Music = { start, stop, skip, playing: () => on, track: () => (ti < 0 ? null : TRACKS[ti].name), tracks: TRACKS.map(T => T.name) };

  const b = document.getElementById('music'), nx = document.getElementById('mnext');
  const label = name => { if (!b) return; b.querySelector('span').textContent = on && name ? name : 'Музыка'; b.title = on && name ? 'Играет «' + name + '». Выключить музыку' : 'Включить музыку'; };
  onTrack = label;
  function sync() { if (b) b.setAttribute('aria-pressed', on); if (nx) { nx.disabled = !on; nx.classList.toggle('off', !on); nx.setAttribute('aria-hidden', !on); } label(on && G.Music.track()); }
  if (b) b.addEventListener('click', () => {
    if (on) stop(); else if (!start()) return;
    sync();
    try { localStorage.setItem('war90.music', on ? '1' : '0'); } catch (e) { /* ignore */ }
  });
  if (nx) nx.addEventListener('click', () => { skip(); });
})(window.W90);
