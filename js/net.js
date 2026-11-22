/* Сеть: комнаты и поток состояния с игрового сервера. Если сервера нет (страница открыта файлом
   или как артефакт), available() вернёт false и останется одиночная игра. */
(function (G) {
  const KEY = 'war90.online';
  let es = null, ok = null;
  const http = location.protocol === 'http:' || location.protocol === 'https:';
  async function post(name, body) {
    try { const r = await fetch('api/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); return await r.json(); }
    catch (e) { return { ok: false, err: 'Нет связи с сервером', msg: 'Нет связи с сервером' }; }
  }
  async function rooms() {
    if (!http) { ok = false; return null; }
    try { const r = await fetch('api/rooms'); if (!r.ok) throw 0; const j = await r.json(); ok = Array.isArray(j.rooms); return ok ? j.rooms : null; }
    catch (e) { ok = false; return null; }
  }
  // общий чат и онлайн: спрашиваем сервер, что нового с момента since
  async function global(cid, since) {
    if (!http || ok === false) return null;
    try { const r = await fetch('api/global?cid=' + encodeURIComponent(cid) + '&since=' + (since || 0), { cache: 'no-store' }); if (!r.ok) return null; return await r.json(); }
    catch (e) { return null; }
  }
  function open(room, token, onSync, onLost) {
    close();
    es = new EventSource('api/stream?room=' + encodeURIComponent(room) + '&token=' + encodeURIComponent(token));
    es.onmessage = e => { try { onSync(JSON.parse(e.data)); } catch (err) { console.error(err); } };
    es.onerror = () => { if (es && es.readyState === 2) { close(); onLost(); } }; // иначе браузер переподключится сам
  }
  function close() { if (es) { es.close(); es = null; } }
  const remember = v => { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (e) { /* ignore */ } };
  const recall = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
  G.Net = { global, post, rooms, open, close, remember, recall, available: () => ok };
})(window.W90);
