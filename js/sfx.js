/* Звуки событий: синтезируются в браузере (Web Audio), без файлов.
   Sfx.play('shot' | 'siren' | 'cash' | 'event' | 'ach'). Включаются кнопкой с динамиком, по умолчанию включены. */
(function (G) {
  const KEY = 'war90.sfx';
  let ctx = null, out = null, noise = null;
  let on = (() => { try { return localStorage.getItem(KEY) !== '0'; } catch (e) { return true; } })();
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    ctx = new AC(); out = ctx.createGain(); out.gain.value = 0.35; out.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  const env = (g, t, a, v, r) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + r); };
  function tone(type, f, t, dur, vol, f2) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur); env(g, t, 0.01, vol, dur); o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05); }
  function burst(t, type, f, vol, dur) { const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise; fl.type = type; fl.frequency.value = f; env(g, t, 0.003, vol, dur); s.connect(fl); fl.connect(g); g.connect(out); s.start(t); s.stop(t + dur + 0.05); }
  const SOUND = {
    // выстрел: щелчок шума и низкий удар; очередь из нескольких
    shot(t) { const n = 2 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) { const x = t + i * (0.09 + Math.random() * 0.12); burst(x, 'bandpass', 1800 + Math.random() * 900, 0.9, 0.14); tone('sine', 140, x, 0.18, 0.6, 45); } },
    // сирена: два тона по очереди
    siren(t) { for (let i = 0; i < 4; i++) tone('square', i % 2 ? 660 : 880, t + i * 0.22, 0.2, 0.06); },
    // купюры: шелест и звон мелочи
    cash(t) { for (let i = 0; i < 5; i++) burst(t + i * 0.05, 'highpass', 5000, 0.18, 0.05); tone('triangle', 1568, t + 0.25, 0.25, 0.12); tone('triangle', 2093, t + 0.33, 0.35, 0.1); },
    // событие: глухой удар и тянущийся бас
    event(t) { tone('sine', 110, t, 0.6, 0.3, 70); burst(t, 'lowpass', 400, 0.25, 0.4); },
    // достижение: короткое арпеджио
    ach(t) { [784, 988, 1175, 1568].forEach((f, i) => tone('triangle', f, t + i * 0.08, 0.35, 0.12)); }
  };
  function play(kind) { if (!on || !SOUND[kind] || !init()) return; try { SOUND[kind](ctx.currentTime + 0.02); } catch (e) { /* звук не обязателен */ } }
  G.Sfx = { play, on: () => on };

  const b = document.getElementById('sfx');
  const sync = () => { if (!b) return; b.setAttribute('aria-pressed', on); b.title = on ? 'Звуки включены' : 'Звуки выключены'; b.classList.toggle('off', !on); };
  if (b) b.addEventListener('click', () => { on = !on; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* ignore */ } sync(); if (on) play('cash'); });
  sync();
})(window.W90);
