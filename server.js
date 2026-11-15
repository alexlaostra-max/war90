/* Сервер онлайна: комнаты, лобби, авторитетный движок. Без зависимостей.
   Запуск: node server.js  (порт из PORT, по умолчанию 3000)
   Клиент получает состояние по Server-Sent Events, действия шлёт POST-запросами. */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
for (const f of ['data', 'events', 'geo', 'engine']) (0, eval)(fs.readFileSync(path.join(__dirname, 'js', f + '.js'), 'utf8'));
const E = globalThis.W90.Engine, D = globalThis.W90.DATA;

const PORT = process.env.PORT || 3000;
const STORE = process.env.ROOMS_FILE || path.join(__dirname, 'data', 'rooms.json');
const MAX_ROOMS = 200, ROOM_TTL = 14 * 24 * 3600e3;
const FIDS = D.FACTIONS.map(f => f.id);
const rooms = new Map();    // id -> room
const streams = new Map();  // roomId -> Map(token -> Set(res))

const id = n => crypto.randomBytes(n).toString('base64url');
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

// ---------- хранение ----------
function load() {
  try { JSON.parse(fs.readFileSync(STORE, 'utf8')).forEach(r => { if (Date.now() - r.touched < ROOM_TTL && !(r.started && (!r.S || r.S.v !== 4))) { if (r.S) E.migrate(r.S); rooms.set(r.id, r); } }); console.log('комнат загружено: ' + rooms.size); } catch (e) { /* первый запуск */ }
}
let saveT = null;
function save() {
  if (saveT) return;
  saveT = setTimeout(() => { saveT = null; fs.mkdir(path.dirname(STORE), { recursive: true }, () => fs.writeFile(STORE + '.tmp', JSON.stringify([...rooms.values()]), err => { if (!err) fs.rename(STORE + '.tmp', STORE, () => {}); })); }, 2000);
}

// ---------- комнаты ----------
function newRoom(name) {
  const r = { id: id(4), name, host: null, players: {}, slots: {}, started: false, S: null, touched: Date.now() };
  FIDS.forEach(f => r.slots[f] = 'bot'); // bot | off; занятый игроком слот определяется по players
  rooms.set(r.id, r); return r;
}
const online = (r, token) => { const m = streams.get(r.id); return !!(m && m.get(token) && m.get(token).size); };
const taken = (r, fid) => Object.keys(r.players).find(t => r.players[t].fid === fid);
function lobby(r, token) {
  return {
    id: r.id, name: r.name, started: r.started, host: r.host === token, slots: r.slots, diff: r.diff || 'norm',
    me: r.players[token] ? { nick: r.players[token].nick, fid: r.players[token].fid } : null,
    players: Object.keys(r.players).map(t => ({ nick: r.players[t].nick, fid: r.players[t].fid, host: t === r.host, online: online(r, t) }))
  };
}
function payload(r, token) {
  const p = r.players[token];
  return JSON.stringify({ lobby: lobby(r, token), state: r.started && p && p.fid ? E.viewFor(r.S, p.fid) : null });
}
function push(r) {
  r.touched = Date.now(); save();
  const m = streams.get(r.id); if (!m) return;
  m.forEach((set, token) => { if (!set.size) return; const data = 'data: ' + payload(r, token) + '\n\n'; set.forEach(res => res.write(data)); });
}
function listRooms() {
  return [...rooms.values()].filter(r => !(r.S && r.S.done)).sort((a, b) => b.touched - a.touched).slice(0, 50).map(r => ({
    id: r.id, name: r.name, started: r.started, players: Object.values(r.players).map(p => p.nick),
    date: r.started ? E.date(r.S.turn).label : null
  }));
}
function maybeEndTurn(r) { if (E.allReady(r.S)) E.endTurn(r.S, false); }

// ---------- API ----------
const api = {
  create(b) {
    if (rooms.size >= MAX_ROOMS) return { err: 'Сервер переполнен, попробуй позже' };
    const name = clean(b.name, 40) || 'Без названия', nick = clean(b.nick, 20) || 'Безымянный';
    const r = newRoom(name), token = id(16);
    r.diff = E.DIFF[b.diff] ? b.diff : 'norm';
    r.host = token; r.players[token] = { nick, fid: null };
    save(); return { room: r.id, token };
  },
  join(b, r) {
    if (b.token && r.players[b.token]) return { room: r.id, token: b.token };
    if (r.started) return { err: 'Игра уже идёт. Войти можно только тем, кто в ней участвует' };
    if (Object.keys(r.players).length >= FIDS.length) return { err: 'Комната заполнена' };
    const token = id(16); r.players[token] = { nick: clean(b.nick, 20) || 'Безымянный', fid: null };
    push(r); return { room: r.id, token };
  },
  pick(b, r, token) { // занять бригаду или освободить (fid: null)
    if (r.started) return { err: 'Игра уже идёт' };
    if (b.fid !== null && !FIDS.includes(b.fid)) return { err: 'Нет такой бригады' };
    if (b.fid && taken(r, b.fid) && taken(r, b.fid) !== token) return { err: 'Бригада занята' };
    r.players[token].fid = b.fid; if (b.fid) r.slots[b.fid] = 'bot';
    push(r); return { ok: true };
  },
  slot(b, r, token) { // хост: свободная бригада — бот или вне игры
    if (r.host !== token) return { err: 'Это решает создатель комнаты' };
    if (r.started) return { err: 'Игра уже идёт' };
    if (!FIDS.includes(b.fid) || !['bot', 'off'].includes(b.mode)) return { err: 'Неверный запрос' };
    if (taken(r, b.fid)) return { err: 'Бригаду ведёт игрок' };
    r.slots[b.fid] = b.mode; push(r); return { ok: true };
  },
  start(b, r, token) {
    if (r.host !== token) return { err: 'Начать может создатель комнаты' };
    if (r.started) return { err: 'Игра уже идёт' };
    const humans = [], nicks = {};
    Object.values(r.players).forEach(p => { if (p.fid) { humans.push(p.fid); nicks[p.fid] = p.nick; } });
    if (!humans.length) return { err: 'Никто не выбрал бригаду' };
    const absent = FIDS.filter(f => r.slots[f] === 'off' && !humans.includes(f));
    if (FIDS.length - absent.length < 2) return { err: 'Нужны хотя бы две бригады' };
    Object.keys(r.players).forEach(t => { if (!r.players[t].fid) delete r.players[t]; }); // зрителей нет
    r.S = E.newGame(humans, crypto.randomBytes(4).readInt32LE(0), nicks, absent, r.diff); r.started = true;
    push(r); return { ok: true };
  },
  act(b, r, token) {
    const p = r.players[token]; if (!r.started || !p.fid) return { ok: false, msg: 'Игра не началась' };
    const fn = Object.prototype.hasOwnProperty.call(E.ACTIONS, b.name) && E.ACTIONS[b.name];
    const args = Array.isArray(b.args) ? b.args.slice(0, 3) : [];
    if (!fn || args.some(a => a !== null && !['string', 'number'].includes(typeof a))) return { ok: false, msg: 'Неизвестное действие' };
    const res = fn(r.S, p.fid, ...args);
    if (res.ok) push(r);
    return res;
  },
  ready(b, r, token) {
    const p = r.players[token]; if (!r.started || !p.fid) return { ok: false, msg: 'Игра не началась' };
    const res = E.setReady(r.S, p.fid, !!b.ready);
    if (res.ok) { maybeEndTurn(r); push(r); }
    return res;
  },
  force(b, r, token) { // хост завершает месяц за всех: кто не решил событие, пропускает его
    if (r.host !== token) return { ok: false, msg: 'Это может только создатель комнаты' };
    if (!r.started) return { ok: false, msg: 'Игра не началась' };
    const res = E.endTurn(r.S, true); push(r); return res;
  },
  leave(b, r, token) {
    if (r.started) return { err: 'Из идущей игры выйти нельзя: твою бригаду некому вести' };
    delete r.players[token];
    if (r.host === token) { const next = Object.keys(r.players)[0]; if (next) r.host = next; else { rooms.delete(r.id); save(); return { ok: true }; } }
    push(r); return { ok: true };
  }
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
function send(res, code, obj) { const s = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(s); }

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/rooms' && req.method === 'GET') return send(res, 200, { rooms: listRooms() });
  if (url.pathname === '/api/stream' && req.method === 'GET') {
    const r = rooms.get(url.searchParams.get('room')), token = url.searchParams.get('token');
    if (!r || !r.players[token]) return send(res, 404, { err: 'Комната не найдена или тебя в ней нет' });
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
    if (!streams.has(r.id)) streams.set(r.id, new Map());
    const m = streams.get(r.id); if (!m.has(token)) m.set(token, new Set());
    m.get(token).add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); m.get(token).delete(res); if (rooms.has(r.id)) push(r); });
    push(r); return;
  }
  if (url.pathname.startsWith('/api/') && req.method === 'POST') {
    const name = url.pathname.slice(5); let body = '';
    if (!Object.prototype.hasOwnProperty.call(api, name)) return send(res, 404, { err: 'Нет такого метода' });
    req.on('data', c => { body += c; if (body.length > 10000) req.destroy(); });
    req.on('end', () => {
      let b; try { b = JSON.parse(body || '{}'); } catch (e) { return send(res, 400, { err: 'Плохой запрос' }); }
      if (!b || typeof b !== 'object') return send(res, 400, { err: 'Плохой запрос' });
      if (name === 'create') return send(res, 200, api.create(b));
      const r = rooms.get(b.room); if (!r) return send(res, 200, { err: 'Комната не найдена' });
      if (name !== 'join' && !r.players[b.token]) return send(res, 200, { err: 'Тебя нет в этой комнате' });
      try { send(res, 200, api[name](b, r, b.token)); } catch (e) { console.error(e); send(res, 500, { err: 'Ошибка сервера' }); }
    });
    return;
  }
  // статика
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  if (!/^\/(index\.html|css\/[\w.-]+\.css|js\/[\w.-]+\.js)$/.test(p)) { res.writeHead(404); return res.end('not found'); }
  fs.readFile(path.join(__dirname, p), (err, buf) => { if (err) { res.writeHead(404); return res.end('not found'); } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)], 'Cache-Control': 'no-cache' }); res.end(buf); });
});

load();
setInterval(() => { rooms.forEach(r => { if (Date.now() - r.touched > ROOM_TTL) { rooms.delete(r.id); streams.delete(r.id); } }); save(); }, 3600e3).unref();
server.listen(PORT, () => console.log('Передел: http://localhost:' + PORT));
