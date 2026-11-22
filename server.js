/* Сервер онлайна: комнаты, лобби, авторитетный движок. Без зависимостей.
   Запуск: node server.js  (порт из PORT, по умолчанию 3000)
   Клиент получает состояние по Server-Sent Events, действия шлёт POST-запросами. */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
// настройки из .env рядом с сервером (почта, бот): KEY=значение
try { fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach(l => { const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(l); if (m && process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); }); } catch (e) { /* нет .env */ }
for (const f of ['data', 'events', 'geo', 'engine']) (0, eval)(fs.readFileSync(path.join(__dirname, 'js', f + '.js'), 'utf8'));
const E = globalThis.W90.Engine, D = globalThis.W90.DATA;

const PORT = process.env.PORT || 3000;
const STORE = process.env.ROOMS_FILE || path.join(__dirname, 'data', 'rooms.json');
const MAX_ROOMS = 200, ROOM_TTL = 14 * 24 * 3600e3;
// комната без единого подключённого человека закрывается через 10 минут (боты не в счёт)
const IDLE = +process.env.ROOM_IDLE_MS || 10 * 60e3;
const FIDS = D.FACTIONS.map(f => f.id);
// версия игры из собранного index.html: после git pull и перезапуска она новая, и клиенты просят переподключиться
const VER = (() => { try { return (/<meta name="app-ver" content="(\w+)"/.exec(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')) || [])[1] || ''; } catch (e) { return ''; } })();
// чат комнаты: хранится 100 последних сообщений, игрокам уходят 50, писать не чаще раза в секунду
// таймер хода (минуты; 0 — без таймера) и через сколько офлайна бригаду забирает бот
const TIMERS = [0, 3, 5, 10], AUTO_MS = +process.env.AUTO_MS || 3 * 60e3, MIN = +process.env.TIMER_UNIT_MS || 60e3;
const CHAT_KEEP = 100, CHAT_SHOW = 50, CHAT_GAP = 1000;
const rooms = new Map();    // id -> room
const streams = new Map();  // roomId -> Map(token -> Set(res))
const emptySince = new Map(); // roomId -> с какого момента в комнате нет ни одного подключения

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
  rooms.set(r.id, r); emptySince.set(r.id, Date.now()); return r;
}
const live = r => { const m = streams.get(r.id); let n = 0; if (m) m.forEach(set => { n += set.size; }); return n; };
function closeRoom(r) { rooms.delete(r.id); streams.delete(r.id); emptySince.delete(r.id); save(); }
const online = (r, token) => { const m = streams.get(r.id); return !!(m && m.get(token) && m.get(token).size); };
const taken = (r, fid) => Object.keys(r.players).find(t => r.players[t].fid === fid);
function sysSay(r, text, alert) {
  if (!r.chat) r.chat = [];
  const now = Date.now(); r.chat.push({ id: now.toString(36) + id(2), t: now, n: '', f: null, c: null, sys: true, alert: !!alert, x: text });
  if (r.chat.length > CHAT_KEEP) r.chat.splice(0, r.chat.length - CHAT_KEEP);
}
const cidOf = p => p.cid || (p.cid = id(3)); // метка автора в чате, чтобы не светить токен
function lobby(r, token) {
  return {
    id: r.id, name: r.name, started: r.started, host: r.host === token, slots: r.slots, diff: r.diff || 'norm', scen: r.scen || 's91',
    me: r.players[token] ? { nick: r.players[token].nick, fid: r.players[token].fid, cid: cidOf(r.players[token]) } : null,
    players: Object.keys(r.players).map(t => ({ nick: r.players[t].nick, fid: r.players[t].fid, host: t === r.host, online: online(r, t) })),
    chat: (r.chat || []).slice(-CHAT_SHOW),
    timer: r.timer == null ? 3 : r.timer, left: r.started && r.deadline ? Math.max(0, r.deadline - Date.now()) : null
  };
}
function payload(r, token) {
  const p = r.players[token];
  return JSON.stringify({ ver: VER, lobby: lobby(r, token), state: r.started && p && p.fid ? E.viewFor(r.S, p.fid) : null });
}
// кто выбыл из партии: живой игрок (поражение, тюрьма, пенсия, победа) или бригада ботов — в чат и всплывашкой всем
function outNews(r) {
  if (!r.started || !r.S) return;
  const first = !r.outSeen; if (first) r.outSeen = {};
  D.FACTIONS.forEach(f => {
    const x = r.S.f[f.id]; if (!x || r.outSeen[f.id]) return;
    const gone = x.human ? !!x.over : !x.alive; if (!gone) return;
    r.outSeen[f.id] = 1; if (first || x.absent) return;
    if (!x.human) return sysSay(r, '☠️ ' + f.name + ' стёрты с карты: у бригады не осталось районов', true);
    const pl = Object.values(r.players).find(p => p.fid === f.id), who = (pl ? pl.nick + ' · ' : '') + f.name;
    sysSay(r, (x.over.type === 'win' ? '🏆 ' : '💀 ') + who + (x.over.type === 'win' ? ': ' : ' выбыл: ') + x.over.title, true);
  });
}
function push(r) {
  r.touched = Date.now(); outNews(r); save();
  // новый месяц — таймер заново
  if (r.started && r.S && r.lastTurn !== r.S.turn) { r.lastTurn = r.S.turn; r.deadline = r.timer !== 0 ? Date.now() + (r.timer || 3) * MIN : null; }
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

// ---------- рекорды ----------
const SCORES = path.join(path.dirname(STORE), 'scores.json');
let scores = []; try { scores = JSON.parse(fs.readFileSync(SCORES, 'utf8')); } catch (e) { /* пусто */ }
function addScore(b) {
  const nick = clean(b.nick, 20), title = clean(b.title, 40), score = Math.round(+b.score), fid = FIDS.includes(b.fid) ? b.fid : null;
  if (!nick || !title || !fid || !(score >= 0 && score < 1e6) || !D.ENDINGS.includes(title)) return { err: 'Неверные данные' };
  const row = { nick, fid, title, score, date: clean(b.date, 20), scen: D.SCENARIOS[b.scen] ? b.scen : 's91', diff: E.DIFF[b.diff] ? b.diff : 'norm', at: Date.now() };
  scores.push(row); scores.sort((a, c) => c.score - a.score); scores = scores.slice(0, 300);
  fs.mkdir(path.dirname(SCORES), { recursive: true }, () => fs.writeFile(SCORES, JSON.stringify(scores), () => {}));
  return { ok: true, place: scores.indexOf(row) + 1 };
}

// ---------- облачные сохранения одиночной игры: партия хранится под кодом вида K7F3-9QX2 ----------
const SAVES = path.join(path.dirname(STORE), 'saves');
const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => { const b = crypto.randomBytes(8); let s = ''; for (let i = 0; i < 8; i++) s += CODE_ABC[b[i] % CODE_ABC.length]; return s.slice(0, 4) + '-' + s.slice(4); };
const codeOk = c => typeof c === 'string' && /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(c);
function cloudSave(b, done) {
  const st = b.state;
  if (!st || typeof st !== 'object' || st.v !== 4 || !Array.isArray(st.humans) || !st.f || !st.d) return done({ err: 'Это не сохранение игры' });
  const code = codeOk(b.code) ? b.code : newCode();
  fs.mkdir(SAVES, { recursive: true }, () => fs.writeFile(path.join(SAVES, code + '.json'), JSON.stringify(st), err => done(err ? { err: 'Не удалось сохранить' } : { ok: true, code, at: Date.now() })));
}
function cloudLoad(b, done) {
  const code = String(b.code || '').toUpperCase().replace(/[^A-Z2-9]/g, '').replace(/^(.{4})(.{4})$/, '$1-$2');
  if (!codeOk(code)) return done({ err: 'Код вида K7F3-9QX2' });
  fs.readFile(path.join(SAVES, code + '.json'), 'utf8', (err, txt) => { if (err) return done({ err: 'Сохранение не найдено' }); try { done({ ok: true, code, state: JSON.parse(txt) }); } catch (e) { done({ err: 'Сохранение повреждено' }); } });
}
// старые облачные сохранения (полгода без обновления) удаляются
setInterval(() => fs.readdir(SAVES, (err, fl) => { if (err) return; fl.forEach(f => fs.stat(path.join(SAVES, f), (e, st) => { if (!e && Date.now() - st.mtimeMs > 180 * 864e5) fs.unlink(path.join(SAVES, f), () => {}); })); }), 864e5).unref();

// ---------- личный кабинет: вход по почте (код на e-mail) или через Телеграм (код от бота, в мини-приложении — сразу) ----------
// Настройки в .env рядом с server.js: SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASS, SMTP_FROM, BOT_TOKEN, BOT_NAME
const tls = require('tls'), https = require('https');
const ACCF = path.join(path.dirname(STORE), 'accounts.json');
let ACC = { users: {}, sessions: {} };
try { ACC = JSON.parse(fs.readFileSync(ACCF, 'utf8')); } catch (e) { /* первый запуск */ }
let accT = null;
const accSave = () => { if (accT) return; accT = setTimeout(() => { accT = null; fs.mkdir(path.dirname(ACCF), { recursive: true }, () => fs.writeFile(ACCF + '.tmp', JSON.stringify(ACC), err => { if (!err) fs.rename(ACCF + '.tmp', ACCF, () => {}); })); }, 1000); };
const pending = new Map(); // ключ (почта или tg:метка) → { code, exp, tries, tg }
const code6 = () => String(crypto.randomInt(0, 1e6)).padStart(6, '0');
const meOf = u => ({ id: u.id, email: u.email || null, tg: u.tg ? { name: u.tg.name } : null, nick: u.nick || '', ach: u.ach || {}, save: u.save ? { turn: u.save.turn, fid: u.save.fid, at: u.save.at } : null });
function login(find, make) {
  let u = Object.values(ACC.users).find(find);
  if (!u) { u = Object.assign({ id: id(6), created: Date.now(), ach: {} }, make); ACC.users[u.id] = u; }
  const token = id(24); ACC.sessions[token] = { uid: u.id, at: Date.now() }; accSave();
  return { ok: true, token, me: meOf(u) };
}
const userBy = token => { const s = token && ACC.sessions[token]; return s ? ACC.users[s.uid] : null; };

// SMTP без зависимостей: TLS на 465 порту, AUTH LOGIN
function sendMail(to, subject, text) {
  return new Promise((resolve, reject) => {
    const host = process.env.SMTP_HOST, user = process.env.SMTP_USER, pass = process.env.SMTP_PASS, from = process.env.SMTP_FROM || user;
    if (!host || !user || !pass) return reject(new Error('почта не настроена'));
    const b64 = s => Buffer.from(s, 'utf8').toString('base64');
    const msg = ['From: =?UTF-8?B?' + b64('Передел') + '?= <' + from + '>', 'To: <' + to + '>', 'Subject: =?UTF-8?B?' + b64(subject) + '?=', 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', b64(text).replace(/.{76}/g, '$&\r\n'), '.'].join('\r\n');
    const steps = ['EHLO peredel', 'AUTH LOGIN', b64(user), b64(pass), 'MAIL FROM:<' + from + '>', 'RCPT TO:<' + to + '>', 'DATA', msg, 'QUIT'];
    const sock = tls.connect({ host, port: +(process.env.SMTP_PORT || 465), servername: host }, () => {});
    let buf = '', k = -1; const tmo = setTimeout(() => { sock.destroy(); reject(new Error('почта не отвечает')); }, 20000);
    sock.on('data', d => {
      buf += d.toString(); const lines = buf.split('\r\n'); if (!/^\d{3} /.test(lines[lines.length - 2] || '')) return; // ждём последнюю строку ответа
      const last = lines[lines.length - 2]; buf = '';
      if (/^[45]/.test(last)) { clearTimeout(tmo); sock.end(); return reject(new Error('почта: ' + last)); }
      k++; if (k < steps.length) sock.write(steps[k] + '\r\n'); else { clearTimeout(tmo); sock.end(); resolve(); }
    });
    sock.on('error', e => { clearTimeout(tmo); reject(e); });
  });
}
// Телеграм: запросы к Bot API
function tgApi(method, body) {
  return new Promise(resolve => {
    const tok = process.env.BOT_TOKEN; if (!tok) return resolve(null);
    const data = JSON.stringify(body || {});
    const req = https.request({ host: 'api.telegram.org', path: '/bot' + tok + '/' + method, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, timeout: 60000 }, res => { let s = ''; res.on('data', c => s += c); res.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { resolve(null); } }); });
    req.on('error', () => resolve(null)); req.on('timeout', () => { req.destroy(); resolve(null); }); req.end(data);
  });
}
// бот слушает «/start login_метка» и присылает код входа
let tgOff = 0;
async function tgPoll() {
  if (!process.env.BOT_TOKEN) return;
  const r = await tgApi('getUpdates', { offset: tgOff, timeout: 50, allowed_updates: ['message'] });
  if (r && r.ok) r.result.forEach(u => {
    tgOff = u.update_id + 1; const m = u.message; if (!m || !m.text || !m.from) return;
    const mt = /^\/start\s+login_([\w-]{8,40})$/.exec(m.text.trim());
    if (mt && pending.has('tg:' + mt[1])) {
      const p = pending.get('tg:' + mt[1]), code = code6();
      Object.assign(p, { code, tg: { id: String(m.from.id), name: [m.from.first_name, m.from.last_name].filter(Boolean).join(' ') || m.from.username || 'игрок' }, exp: Date.now() + 10 * 60e3 });
      tgApi('sendMessage', { chat_id: m.chat.id, text: 'Код для входа в «Передел»: ' + code + '\nВведи его в игре. Код действует 10 минут.' });
    } else if (/^\/start/.test(m.text)) tgApi('sendMessage', { chat_id: m.chat.id, text: 'Это бот игры «Передел». Играть: https://peredel-msk.ru' });
  });
  setTimeout(tgPoll, r && r.ok ? 200 : r ? 30000 : 5000); // неверный токен или нет связи — не долбим API
}
tgPoll();
// проверка подписи данных мини-приложения Телеграма
function tgInitUser(initData) {
  const tok = process.env.BOT_TOKEN; if (!tok || !initData) return null;
  const q = new URLSearchParams(initData), hash = q.get('hash'); q.delete('hash');
  const dcs = [...q.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([k, v]) => k + '=' + v).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(tok).digest();
  if (crypto.createHmac('sha256', secret).update(dcs).digest('hex') !== hash) return null;
  if (Date.now() / 1000 - (+q.get('auth_date') || 0) > 86400 * 7) return null;
  try { const u = JSON.parse(q.get('user')); return { id: String(u.id), name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'игрок' }; } catch (e) { return null; }
}
const lastSend = new Map();
const AUTH = {
  async email(b) {
    if (!process.env.AUTH_EMAIL) return { err: 'Вход только через Телеграм' }; // почта отключена
    const email = String(b.email || '').trim().toLowerCase();
    if (!/^[^@\s]{1,64}@[^@\s]{1,190}\.[a-z]{2,}$/.test(email)) return { err: 'Проверь адрес почты' };
    if (Date.now() - (lastSend.get(email) || 0) < 60e3) return { err: 'Код уже отправлен. Новый — через минуту' };
    const code = code6(); pending.set(email, { code, exp: Date.now() + 10 * 60e3, tries: 0 }); lastSend.set(email, Date.now());
    if (process.env.AUTH_DEV) { console.log('код для ' + email + ': ' + code); return { ok: true }; } // проверка без почты
    try { await sendMail(email, 'Код входа: ' + code, 'Код для входа в «Передел»: ' + code + '\n\nДействует 10 минут. Если ты не входил в игру — просто удали это письмо.'); }
    catch (e) { console.error('почта:', e.message); return { err: /не настроена/.test(e.message) ? 'Вход по почте пока не настроен на сервере' : 'Не получилось отправить письмо, попробуй позже' }; }
    return { ok: true };
  },
  tgstart() {
    if (!process.env.BOT_TOKEN) return { err: 'Вход через Телеграм пока не настроен на сервере' };
    const nonce = id(12); pending.set('tg:' + nonce, { code: null, exp: Date.now() + 15 * 60e3, tries: 0 });
    return { ok: true, nonce, link: 'https://t.me/' + (process.env.BOT_NAME || 'peredelmskbot') + '?start=login_' + nonce };
  },
  verify(b) {
    const key = b.nonce ? 'tg:' + String(b.nonce) : String(b.email || '').trim().toLowerCase(), p = pending.get(key);
    if (!p || Date.now() > p.exp) return { err: 'Код устарел, запроси новый' };
    if (!p.code) return { err: 'Сначала нажми «Старт» у бота — он пришлёт код' };
    if (++p.tries > 5) { pending.delete(key); return { err: 'Слишком много попыток, запроси новый код' }; }
    if (String(b.code || '').trim() !== p.code) return { err: 'Неверный код' };
    pending.delete(key);
    return p.tg ? login(u => u.tg && u.tg.id === p.tg.id, { tg: p.tg, nick: p.tg.name.slice(0, 20) }) : login(u => u.email === key, { email: key });
  },
  tgapp(b) { const t = tgInitUser(b.initData); if (!t) return { err: 'Телеграм не подтвердил вход' }; return login(u => u.tg && u.tg.id === t.id, { tg: t, nick: t.name.slice(0, 20) }); },
  me(b) { const u = userBy(b.token); return u ? { ok: true, me: meOf(u) } : { err: 'Нужно войти' }; },
  logout(b) { delete ACC.sessions[b.token]; accSave(); return { ok: true }; },
  nick(b) { const u = userBy(b.token); if (!u) return { err: 'Нужно войти' }; u.nick = clean(b.nick, 20); accSave(); return { ok: true, me: meOf(u) }; },
  ach(b) { const u = userBy(b.token); if (!u) return { err: 'Нужно войти' }; u.ach = u.ach || {}; Object.keys(b.ach || {}).slice(0, 200).forEach(k => { if (/^[\w-]{1,40}$/.test(k) && !u.ach[k]) u.ach[k] = +b.ach[k] || Date.now(); }); accSave(); return { ok: true, me: meOf(u) }; },
  save(b) {
    const u = userBy(b.token); if (!u) return { err: 'Нужно войти' };
    const st = b.state; if (!st || typeof st !== 'object' || st.v !== 4 || !Array.isArray(st.humans)) return { err: 'Это не сохранение игры' };
    fs.mkdir(SAVES, { recursive: true }, () => fs.writeFile(path.join(SAVES, 'acc_' + u.id + '.json'), JSON.stringify(st), () => {}));
    u.save = { turn: st.turn, fid: st.humans[0], at: Date.now() }; accSave(); return { ok: true, me: meOf(u) };
  },
  load(b, done) { const u = userBy(b.token); if (!u || !u.save) return done({ err: 'Сохранения нет' }); fs.readFile(path.join(SAVES, 'acc_' + u.id + '.json'), 'utf8', (e, t) => { if (e) return done({ err: 'Сохранения нет' }); try { done({ ok: true, state: JSON.parse(t) }); } catch (er) { done({ err: 'Сохранение повреждено' }); } }); }
};

// ---------- API ----------
const api = {
  create(b) {
    if (rooms.size >= MAX_ROOMS) return { err: 'Сервер переполнен, попробуй позже' };
    const name = clean(b.name, 40) || 'Без названия', nick = clean(b.nick, 20) || 'Безымянный';
    const r = newRoom(name), token = id(16);
    r.diff = E.DIFF[b.diff] ? b.diff : 'norm';
    r.scen = D.SCENARIOS[b.scen] ? b.scen : 's91';
    r.timer = TIMERS.includes(+b.timer) ? +b.timer : 3;
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
  timer(b, r, token) { // хост: время на месяц
    if (r.host !== token) return { err: 'Таймер ставит создатель комнаты' };
    if (!TIMERS.includes(+b.min)) return { err: 'Неверный таймер' };
    r.timer = +b.min; r.deadline = r.started && r.timer ? Date.now() + r.timer * MIN : null;
    push(r); return { ok: true };
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
    r.S = E.newGame(humans, crypto.randomBytes(4).readInt32LE(0), nicks, absent, r.diff, r.scen); r.started = true;
    sysSay(r, '🎬 Игра началась. ' + (r.timer ? 'На месяц ' + r.timer + ' мин.' : 'Без таймера.'));
    push(r); return { ok: true };
  },
  act(b, r, token) {
    const p = r.players[token]; if (!r.started || !p.fid) return { ok: false, msg: 'Игра не началась' };
    const fn = Object.prototype.hasOwnProperty.call(E.ACTIONS, b.name) && E.ACTIONS[b.name];
    const args = Array.isArray(b.args) ? b.args.slice(0, 4) : [];
    if (!fn || args.some(a => a !== null && !['string', 'number'].includes(typeof a))) return { ok: false, msg: 'Неизвестное действие' };
    const res = fn(r.S, p.fid, ...args);
    if (res.ok && res.deal) sysSay(r, '🤝 ' + res.deal);
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
  // служебные сообщения в чат: сделки, бот за игрока, конец месяца по таймеру
  say(b, r, token) {
    const p = r.players[token], text = clean(b.text, 300).replace(/\s+/g, ' ');
    if (!text) return { ok: false, msg: 'Пустое сообщение' };
    const now = Date.now(); if (p.saidAt && now - p.saidAt < CHAT_GAP) return { ok: false, msg: 'Не так часто' };
    p.saidAt = now;
    if (!r.chat) r.chat = [];
    r.chat.push({ id: now.toString(36) + id(2), t: now, n: p.nick, f: p.fid || null, c: cidOf(p), x: text });
    if (r.chat.length > CHAT_KEEP) r.chat.splice(0, r.chat.length - CHAT_KEEP);
    push(r); return { ok: true };
  },
  leave(b, r, token) {
    if (r.started) return { err: 'Из идущей игры выйти нельзя: твою бригаду некому вести' };
    delete r.players[token];
    if (r.host === token) { const next = Object.keys(r.players)[0]; if (next) r.host = next; else { closeRoom(r); return { ok: true }; } }
    push(r); return { ok: true };
  }
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
function send(res, code, obj) { const s = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(s); }

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/rooms' && req.method === 'GET') return send(res, 200, { rooms: listRooms() });
  if (url.pathname === '/api/version' && req.method === 'GET') return send(res, 200, { v: VER });
  if (url.pathname === '/api/scores' && req.method === 'GET') return send(res, 200, { scores: scores.slice(0, 50) });
  if (url.pathname === '/api/stream' && req.method === 'GET') {
    const r = rooms.get(url.searchParams.get('room')), token = url.searchParams.get('token');
    if (!r || !r.players[token]) return send(res, 404, { err: 'Комната не найдена или тебя в ней нет' });
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
    if (!streams.has(r.id)) streams.set(r.id, new Map());
    const m = streams.get(r.id); if (!m.has(token)) m.set(token, new Set());
    m.get(token).add(res); emptySince.delete(r.id);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); m.get(token).delete(res); if (!rooms.has(r.id)) return; if (!live(r)) emptySince.set(r.id, Date.now()); push(r); });
    push(r); return;
  }
  if (url.pathname.startsWith('/api/auth/') && req.method === 'POST') {
    const m = url.pathname.slice(10); if (!Object.prototype.hasOwnProperty.call(AUTH, m)) return send(res, 404, { err: 'Нет такого метода' });
    let body = ''; req.on('data', c => { body += c; if (body.length > (m === 'save' ? 3e6 : 20000)) req.destroy(); });
    req.on('end', async () => {
      let b; try { b = JSON.parse(body || '{}'); } catch (e) { return send(res, 400, { err: 'Плохой запрос' }); }
      try { if (m === 'load') return AUTH.load(b, r => send(res, 200, r)); send(res, 200, await AUTH[m](b)); } catch (e) { console.error(e); send(res, 500, { err: 'Ошибка сервера' }); }
    });
    return;
  }
  if (url.pathname.startsWith('/api/') && req.method === 'POST') {
    const name = url.pathname.slice(5); let body = '';
    const big = name === 'csave';
    if (!Object.prototype.hasOwnProperty.call(api, name) && !['score', 'csave', 'cload'].includes(name)) return send(res, 404, { err: 'Нет такого метода' });
    req.on('data', c => { body += c; if (body.length > (big ? 3e6 : 10000)) req.destroy(); });
    req.on('end', () => {
      let b; try { b = JSON.parse(body || '{}'); } catch (e) { return send(res, 400, { err: 'Плохой запрос' }); }
      if (!b || typeof b !== 'object') return send(res, 400, { err: 'Плохой запрос' });
      if (name === 'create') return send(res, 200, api.create(b));
      if (name === 'score') return send(res, 200, addScore(b));
      if (name === 'csave') return cloudSave(b, r => send(res, 200, r));
      if (name === 'cload') return cloudLoad(b, r => send(res, 200, r));
      const r = rooms.get(b.room); if (!r) return send(res, 200, { err: 'Комната не найдена' });
      if (name !== 'join' && !r.players[b.token]) return send(res, 200, { err: 'Тебя нет в этой комнате' });
      try { send(res, 200, api[name](b, r, b.token)); } catch (e) { console.error(e); send(res, 500, { err: 'Ошибка сервера' }); }
    });
    return;
  }
  // статика
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  if (!/^\/(index\.html|sw\.js|manifest\.webmanifest|css\/[\w.-]+\.css|js\/[\w.-]+\.js|img\/[\w.-]+\.jpg|icons\/[\w.-]+\.png)$/.test(p)) { res.writeHead(404); return res.end('not found'); }
  fs.readFile(path.join(__dirname, p), (err, buf) => { if (err) { res.writeHead(404); return res.end('not found'); } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)], 'Cache-Control': p.startsWith('/img/') || p.startsWith('/icons/') ? 'public, max-age=604800' : 'no-cache' }); res.end(buf); });
});

load();
rooms.forEach(r => emptySince.set(r.id, Date.now())); // после перезапуска у игроков есть 10 минут, чтобы переподключиться
setInterval(() => { rooms.forEach(r => { if (Date.now() - r.touched > ROOM_TTL) closeRoom(r); }); }, 3600e3).unref();
setInterval(() => {
  const now = Date.now();
  emptySince.forEach((t, rid) => { const r = rooms.get(rid); if (!r) { emptySince.delete(rid); return; } if (now - t >= IDLE && !live(r)) { closeRoom(r); console.log('комната закрыта, никого нет ' + Math.round(IDLE / 60e3) + ' мин: ' + r.name); } });
}, Math.min(30e3, IDLE / 4)).unref();
// раз в две секунды: кто пропал — за того бот, кто вернулся — снова сам; вышло время — месяц закрывается за всех
setInterval(() => {
  const now = Date.now();
  rooms.forEach(r => {
    if (!r.started || !r.S || r.S.done) return;
    let changed = false; r.off = r.off || {};
    Object.keys(r.players).forEach(t => {
      const fid = r.players[t].fid; if (!fid || !r.S.f[fid]) return;
      const nm = r.players[t].nick + ' (' + D.FACTIONS.find(f => f.id === fid).name + ')';
      if (online(r, t)) { delete r.off[t]; if (E.setAuto(r.S, fid, false)) { changed = true; sysSay(r, '👋 ' + nm + ' вернулся и снова сам ведёт бригаду'); } }
      else { if (!r.off[t]) r.off[t] = now; if (now - r.off[t] >= AUTO_MS && E.setAuto(r.S, fid, true)) { changed = true; sysSay(r, '🤖 ' + nm + ' пропал, бригаду ведёт бот'); } }
    });
    if (changed && E.allReady(r.S)) E.endTurn(r.S, false);
    if (r.deadline && now >= r.deadline) {
      const someone = Object.keys(r.players).some(t => online(r, t));
      if (someone) { E.endTurn(r.S, true); changed = true; sysSay(r, '⏱ Время вышло, месяц закрыт за всех. Теперь ' + E.date(r.S.turn).label); } else r.deadline = now + 30e3; // без людей не спешим
    }
    if (changed) push(r);
  });
}, 2000).unref();
server.listen(PORT, () => console.log('Передел: http://localhost:' + PORT));
