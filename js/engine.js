/* Движок: чистая логика над состоянием S. Действия — функции (S, fid, ...args) -> {ok, msg},
   где fid — бригада живого игрока. Случайность идёт через сид в состоянии, поэтому один и тот же
   движок работает и в браузере (одиночная игра), и на сервере (онлайн). */
(function (G) {
  const D = G.DATA, GEO = G.GEO, EVENTS = G.EVENTS;
  const LAST_TURN = 192; // декабрь 2007
  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

  function rnd(S) { S.seed = (S.seed + 0x6D2B79F5) | 0; let t = S.seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  const rr = (S, a, b) => a + rnd(S) * (b - a);
  const ri = (S, a, b) => Math.floor(rr(S, a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Сложность: grace — сколько месяцев боты не трогают живых игроков, ratio — во сколько раз бот должен быть
  // сильнее района живого игрока, grow — рост ботов, aggr — частота нападений, home — крепость родного района,
  // hits — сколько районов боты могут отнять у одного игрока за месяц
  const DIFF = {
    easy: { name: 'Лёгкая', grace: 12, ratio: 1.25, grow: 0.9, aggr: 0.8, home: 1.6, hits: 1 },
    norm: { name: 'Обычная', grace: 8, ratio: 1.05, grow: 1.05, aggr: 1.2, home: 1.35, hits: 2 },
    hard: { name: 'Жёсткая', grace: 4, ratio: 0.9, grow: 1.2, aggr: 1.6, home: 1.15, hits: 3 }
  };
  const dif = S => DIFF[S.diff] || DIFF.norm;
  function date(turn) { const mi = 11 + turn; return { year: 1991 + Math.floor(mi / 12), month: mi % 12 + 1, label: MONTHS[mi % 12] + ' ' + (1991 + Math.floor(mi / 12)) }; }
  const era = S => 1 + S.turn / 60;
  // с приходом нового президента власть давит сильнее: розыск растёт быстрее, облавы чаще, взятки дороже
  const lawK = S => { const y = 1991 + Math.floor((11 + S.turn) / 12); return y >= 2003 ? 1.6 : y >= 2000 ? 1.35 : 1; };
  // касса делится на белый и чёрный нал: белый (clean) не трогают при облавах, тратится всё сначала из чёрного
  // валюта: часть кассы в долларах (usd), остальное в рублях; рубли съедает инфляция, а в августе 1998-го — дефолт
  const cur = p => { const u = Math.min(Math.max(0, p.usd || 0), Math.max(0, p.money)); return { usd: Math.round(u), rub: Math.round(p.money - u) }; };
  // Курс доллара по месяцам, как было на самом деле (ЦБ и биржа), между опорными точками — плавно.
  // Рубли в кассе дешевеют ровно на столько, на сколько вырос курс: так работает и дефолт 1998-го.
  // С января 1998-го рубли новые (деноминация 1000:1), внутри считаем в старых.
  const RATES = [[1991, 12, 170], [1992, 1, 200], [1992, 5, 115], [1992, 7, 125], [1992, 12, 415], [1993, 6, 1060], [1993, 12, 1247], [1994, 6, 1960], [1994, 9, 2600], [1994, 10, 3080], [1994, 12, 3550],
    [1995, 5, 5050], [1995, 7, 4500], [1995, 12, 4640], [1996, 6, 5100], [1996, 12, 5560], [1997, 12, 5960], [1998, 1, 6000], [1998, 7, 6240], [1998, 8, 6400], [1998, 9, 16000], [1998, 10, 15900], [1998, 11, 16400], [1998, 12, 20650],
    [1999, 6, 24200], [1999, 12, 27000], [2000, 12, 28160], [2001, 12, 30140], [2002, 12, 31780], [2003, 12, 29450], [2004, 12, 27750], [2005, 12, 28780], [2006, 12, 26330], [2007, 12, 24550]];
  function rateAt(turn) { // в старых рублях за доллар
    const mi = 11 + turn + 1991 * 12, at = r => r[0] * 12 + r[1] - 1;
    if (mi <= at(RATES[0])) return RATES[0][2];
    for (let k = 1; k < RATES.length; k++) { const a = RATES[k - 1], b = RATES[k]; if (mi <= at(b)) return a[2] + (b[2] - a[2]) * (mi - at(a)) / (at(b) - at(a)); }
    return RATES[RATES.length - 1][2];
  }
  // Курс на улице гуляет вокруг исторического: S.fxn — отклонение этого месяца (до ±12%), поэтому рубль может и окрепнуть.
  // Шум следующего месяца (S.fxNext) выпадает только при закрытии месяца, заранее его не знает никто.
  const fxMid = (S, turn) => rateAt(turn) * (1 + (turn === S.turn ? S.fxn || 0 : turn === S.turn + 1 ? S.fxNext || 0 : 0));
  // в рублях за доллар: до 1998-го старые, потом новые (деноминация 1000:1)
  const realRub = (S, r) => date(S.turn).year >= 1998 ? r / 1000 : r;
  const rubRate = S => { const r = realRub(S, fxMid(S, S.turn)); return r < 100 ? Math.round(r * 100) / 100 : Math.round(r); };
  // сколько рублёвая касса теряет за месяц в долларах (отрицательное — рубль окреп)
  const inflation = S => Math.max(-0.15, 1 - fxMid(S, S.turn) / fxMid(S, S.turn + 1));
  // Обменник: будка покупает доллар дешевле, продаёт дороже (спред), а чем больше долларов скупаешь за месяц,
  // тем дороже каждый следующий: свободных долларов на рынке мало. Свои обменники добавляют долларов на рынок.
  const FX_SPREAD = 0.03, FX_STEEP = 0.12, FX_MAXK = 0.32;
  const fxBooths = (S, fid) => owned(S, fid).reduce((a, i) => a + S.d[i].b.reduce((s, b, x) => s + (b === 'exchange' ? pointLvl(S.d[i], x) : 0), 0), 0);
  const fxLiq = (S, fid) => Math.round((40 + fxBooths(S, fid) * 45) * era(S));
  const fxBought = (S, fid) => { const p = S.f[fid]; return p.fxb && p.fxb.t === S.turn ? p.fxb.v : 0; };
  // наценка за объём: средняя по отрезку [уже куплено, уже куплено + amt]
  const fxExtra = (S, fid, amt) => Math.min(FX_MAXK, FX_STEEP * (fxBought(S, fid) + (amt || 0) / 2) / Math.max(1, fxLiq(S, fid)));
  function fxQuote(S, fid, dir, amt) {
    amt = Math.max(0, Math.floor(+amt) || 0);
    if (dir === 'buy') { const k = 1 + FX_SPREAD + fxExtra(S, fid, amt), get = Math.floor(amt / k); return { give: amt, get, fee: amt - get, pct: Math.round((1 - 1 / k) * 100) }; }
    const get = Math.floor(amt * (1 - FX_SPREAD)); return { give: amt, get, fee: amt - get, pct: FX_SPREAD * 100 };
  }
  // табло будки: «покупаем» и «продаём» в рублях за доллар; продажа растёт, если скупать много
  const fxBoard = (S, fid) => { const m = realRub(S, fxMid(S, S.turn)), r = v => m < 100 ? Math.round(v * 100) / 100 : Math.round(v); return { buy: r(m * (1 - FX_SPREAD)), sell: r(m * (1 + FX_SPREAD + fxExtra(S, fid, 0))), mid: r(m), liq: fxLiq(S, fid), left: Math.max(0, fxLiq(S, fid) - fxBought(S, fid)) }; };
  const fxChange = S => S.fxLast ? fxMid(S, S.turn) / S.fxLast - 1 : 0;
  const exchangeFee = (S, fid) => FX_SPREAD + fxExtra(S, fid, 0);
  // деньги словами, только целые: 950К $, 2М 500К $, 1 млрд 200М $ (сумма в игровых тысячах)
  function fmtK(v) {
    const s = v < 0 ? '−' : '', K = Math.round(Math.abs(v));
    if (K < 1) return s + Math.round(Math.abs(v) * 1000);
    if (K < 1000) return s + K + 'К';
    if (K < 100000) { const M = Math.floor(K / 1000), k = K % 1000; return s + M + 'М' + (k ? ' ' + k + 'К' : ''); }
    const M = Math.round(K / 1000); if (M < 1000) return s + M + 'М';
    const B = Math.floor(M / 1000), m = M % 1000; return s + B + ' млрд' + (m ? ' ' + m + 'М' : '');
  }
  // знак валюты: всё, что зарабатывается и тратится в Москве, — рубли; доллары — обменник, крупные дела, статус и личное
  const fm = v => fmtK(v) + ' ₽', fu = v => fmtK(v) + ' $';
  const cash = p => { const w = Math.min(Math.max(0, p.clean || 0), Math.max(0, p.money)); return { white: Math.round(w), black: Math.round(p.money - w) }; };
  const fdef = id => D.FACTIONS.find(f => f.id === id);
  // to — кому видна запись (бригада); без to видят все
  function log(S, s, k, to) { S.log.unshift({ t: S.turn, s, k: k || '', to: to || undefined }); if (S.log.length > 300) S.log.length = 300; }
  const active = S => S.humans.filter(h => !S.f[h].over);

  // humans — бригады живых игроков, absent — бригады вне игры, остальные ведёт бот
  function newGame(humans, seed, nicks, absent, diff, scen) {
    if (typeof humans === 'string') humans = [humans];
    absent = absent || [];
    const S = { v: 4, seed: seed | 0 || 1, turn: 0, humans: humans.slice(), f: {}, d: [], log: [], done: false, diff: DIFF[diff] ? diff : 'norm' };
    D.DISTRICTS.forEach(() => S.d.push({ o: null, b: [], ent: false }));
    D.FACTIONS.forEach(f => {
      const x = S.f[f.id] = { id: f.id, men: 8, guns: 0, cars: 0, money: 0, rep: 10, heat: 0, alive: true, acc: 0, human: humans.includes(f.id) };
      if (!x.human && absent.includes(f.id)) { x.alive = false; x.men = 0; x.absent = true; return; }
      S.d[D.DISTRICTS.find(d => d.name === f.home).id].o = f.id;
      if (!x.human) return;
      Object.assign(x, { off: {}, jail: [], proj: {}, truce: {}, later: [], recent: [], event: null, kidnapTurn: -1, okBonus: {}, report: null, over: null, ready: false, crew: [], nid: 1, dead: [], nick: (nicks && nicks[f.id]) || '' });
      Object.keys(D.OFFICIALS).forEach(k => x.off[k] = 0);
      if (f.id === 'lub') x.men += 6;
      if (f.id === 'cher') x.money = 30;
      if (f.id === 'tag') x.off.uch = 1;
    });
    migrate(S);
    if (D.SCENARIOS[scen] && D.SCENARIOS[scen].turn) applyScenario(S, scen);
    humans.forEach(h => { for (let k = 0; k < 3; k++) genPerson(S, h); S.f[h].pool = inflow(S, h).total; S.f[h].ap = apMax(S, h); pickEvent(S, h); log(S, S.scen ? date(S.turn).label.charAt(0).toUpperCase() + date(S.turn).label.slice(1) + '. ' + D.SCENARIOS[S.scen].desc + '.' : 'Декабрь 1991-го. Ты глава бригады, у тебя один район и горстка пацанов.', 'big', h); });
    return S;
  }

  // Поздний старт: дата, районы вокруг родного и силы у всех бригад
  function applyScenario(S, key) {
    const X = D.SCENARIOS[key]; S.turn = X.turn; S.t0 = X.turn; S.scen = key;
    const grow = (fid, n) => { for (let k = 0; k < n; k++) { const own = owned(S, fid), c = []; own.forEach(i => GEO.adj[i].forEach(j => { if (!S.d[j].o && !c.includes(j)) c.push(j); })); if (!c.length) return; S.d[c[Math.floor(rnd(S) * c.length)]].o = fid; } };
    D.FACTIONS.forEach(f => { const x = S.f[f.id]; if (!x.alive) return; if (x.human) { grow(f.id, X.extra); Object.assign(x, { money: X.money, men: X.men, guns: X.guns, cars: X.cars, rep: X.rep }); if (x.arms) { x.arms = { pm: X.guns }; x.garage = { nine: X.cars }; } } else { grow(f.id, X.botExtra); x.men = X.botMen; x.guns = X.botMen; x.cars = Math.ceil(X.botMen / 5); } });
  }
  // Старые сохранения и новые бригады: склад по моделям, броники, легенды
  function kitInit(f) { f.arms = { pm: f.guns || 0 }; f.garage = { nine: f.cars || 0 }; if (f.vests == null) f.vests = 0; }
  function migrate(S) {
    (S.humans || []).forEach(h => { const x = S.f[h]; if (!x) return; if (!x.arms) kitInit(x); if (x.vests == null) x.vests = 0; if (!x.once) x.once = []; (x.crew || []).forEach(c => { if (c.leg && D.LEGENDS[c.leg]) { c.name = D.LEGENDS[c.leg].name; c.nick = D.LEGENDS[c.leg].nick; } }); });
    return S;
  }

  // ---------- арсенал и гараж ----------
  // Склад ведётся по моделям, а guns/cars остаются общим числом: события и потери в бою меняют их напрямую,
  // а syncKit сводит склад с итогом (лишнее добавляет базовой моделью, недостачу списывает с самого дешёвого).
  const ARM_ORDER = Object.keys(D.ARMS).sort((a, b) => D.ARMS[b].q - D.ARMS[a].q);
  const CAR_ORDER = Object.keys(D.CARS).sort((a, b) => D.CARS[b].q - D.CARS[a].q);
  function syncInv(f, inv, tot, base, order) {
    const m = f[inv]; f[tot] = Math.max(0, Math.round(f[tot] || 0));
    let s = 0; Object.keys(m).forEach(k => { s += m[k] || 0; });
    if (f[tot] > s) m[base] = (m[base] || 0) + f[tot] - s;
    else if (f[tot] < s) { let left = s - f[tot]; order.slice().reverse().forEach(k => { const n = Math.min(left, m[k] || 0); m[k] = (m[k] || 0) - n; left -= n; }); }
  }
  function syncKit(f) { if (!f.arms) return; syncInv(f, 'arms', 'guns', 'pm', ARM_ORDER); syncInv(f, 'garage', 'cars', 'nine', CAR_ORDER); }
  // боевая ценность стволов: лучшие достаются бойцам первыми
  function armedValue(f) {
    if (!f.arms) return Math.min(f.men, f.guns);
    syncKit(f); let left = f.men, v = 0;
    ARM_ORDER.forEach(k => { const n = Math.min(left, f.arms[k] || 0); v += n * D.ARMS[k].q; left -= n; });
    return v;
  }
  const seatsOf = f => f.garage ? Object.keys(f.garage).reduce((s, k) => s + (f.garage[k] || 0) * D.CARS[k].seats, 0) : f.cars * 4;
  function mobility(f) {
    if (!f.garage) return 0.5 * Math.min(f.men, f.cars * 4);
    syncKit(f); let left = f.men, v = 0;
    CAR_ORDER.forEach(k => { const n = Math.min(left, (f.garage[k] || 0) * D.CARS[k].seats); v += n * D.CARS[k].q; left -= n; });
    return v;
  }
  const hasCar = (f, k) => !!(f.garage && f.garage[k] > 0);
  const armorK = f => hasCar(f, 'gelik') || (f.elite && f.elite.g55 != null) ? 0.5 : 1;
  const carTalk = (S, fid) => { const f = S.f[fid]; return f.garage ? Math.min(15, Object.keys(f.garage).reduce((s, k) => s + (f.garage[k] || 0) * (D.CARS[k].talk || 0), 0)) : 0; };
  function addArms(p, k, n) { if (!p.arms) kitInit(p); syncKit(p); p.arms[k] = (p.arms[k] || 0) + n; p.guns += n; }
  function addCar(p, k, n) { if (!p.garage) kitInit(p); syncKit(p); p.garage[k] = (p.garage[k] || 0) + n; p.cars += n; }

  // ---------- показатели ----------
  const power = f => f.men + armedValue(f) + mobility(f);
  const owned = (S, fid) => S.d.reduce((a, d, i) => (d.o === fid && a.push(i), a), []);
  const count = (S, fid) => S.d.reduce((n, d) => n + (d.o === fid ? 1 : 0), 0);
  const defFactor = n => clamp(1.4 / Math.sqrt(n + 1), 0.2, 1);
  const okrugIds = ok => D.DISTRICTS.filter(d => d.ok === ok).map(d => d.id);
  const okrugHeld = (S, fid, ok) => okrugIds(ok).every(i => S.d[i].o === fid);
  const okrugsHeld = (S, fid) => Object.keys(D.OKRUGS).filter(ok => okrugHeld(S, fid, ok));
  const has = (S, fid, k) => !!(S.f[fid].status || {})[k];
  const conn = (S, fid) => { const o = S.f[fid].off || {}; return Object.keys(o).reduce((s, k) => s + o[k] * D.OFFICIALS[k].w, 0) + (S.f[fid].human ? fx(S, fid, 'conn') + eliteFx(S, fid, 'conn') : 0) + (has(S, fid, 'duma') ? 5 : 0); };
  const apMax = (S, fid) => Math.min(7, 3 + okrugsHeld(S, fid).length + (S.f[fid].rep >= 60 ? 1 : 0) + (post(S, fid, 'right') ? 1 : 0));
  const menCap = (S, fid) => 10 + count(S, fid) * 6 + Math.floor(S.f[fid].rep / 2) + (S.f[fid].human ? fx(S, fid, 'cap') : 0);
  // Новобранцы: сколько людей готово прийти в бригаду за месяц и откуда они берутся
  function inflow(S, fid) {
    const rows = [['Двор', 2]], n = count(S, fid);
    let gyms = 0, other = 0;
    owned(S, fid).forEach(i => S.d[i].b.forEach((b, x) => { const r = (D.BUILDS[b].rec || 0) * pointLvl(S.d[i], x); if (b === 'gym') gyms += r; else other += r; }));
    rows.push(['Спортзалы', gyms], ['Другие точки', other], ['Районы', Math.floor(n / 3)], ['Авторитет', Math.floor(S.f[fid].rep / 20)]);
    if (fid === 'oreh') rows.push(['Ореховские качалки', 2]);
    return { rows, total: rows.reduce((s, r) => s + r[1], 0) };
  }
  const pool = (S, fid) => S.f[fid].pool == null ? inflow(S, fid).total : S.f[fid].pool;
  // Цены для живого игрока растут вместе с эпохой и с его богатством: продавцы, менты и мастера знают, кто при деньгах.
  // Богатство — касса плюс годовой доход (доход прошлого месяца хранится в p.lastInc, чтобы не пересчитывать)
  const wealthOf = p => Math.max(0, p.money) + Math.max(0, p.lastInc || 0) * 12;
  const wealthK = p => !p || !p.human ? 1 : 1 + clamp(Math.log10(Math.max(1, wealthOf(p) / 150)) * 0.35, 0, 1.4);
  const priceK = (S, fid) => { const p = S.f[fid]; return p && p.human ? (1 + S.turn / 240) * wealthK(p) : 1; };
  const recruitPrice = (S, fid) => Math.round((1 + S.turn / 40) * (fid ? wealthK(S.f[fid]) : 1));
  function lawLevel(heat) { let l = 0; D.LAW.forEach((x, i) => { if (heat >= x.at) l = i; }); return l; }

  function districtDef(S, i) {
    const d = S.d[i], dd = D.DISTRICTS[i];
    if (!d.o) return Math.round((5 + dd.inc + S.turn * 0.25) * (dd.ok === 'CAO' ? 1.5 : 1));
    let v = power(S.f[d.o]) * defFactor(count(S, d.o)) * 1.4 + S.turn * 0.1;
    if (S.f[d.o].human) {
      v += d.b.reduce((s, b, x) => s + (D.BUILDS[b].def || 0) * pointLvl(d, x), 0); const cp = capoOf(S, d.o, dd.ok); if (cp) v += cp.str * 2;
      const w = watcherOf(S, d.o, i); if (w) v += w.str * 3;
      if (isHome(S, d.o, i) || count(S, d.o) === 1) v = v * dif(S).home + 6; // родные стены: тут каждый двор свой
    }
    return Math.max(3, Math.round(v));
  }
  const isHome = (S, fid, i) => D.DISTRICTS[i].name === fdef(fid).home;
  const attackable = (S, fid, i) => S.d[i].o !== fid && GEO.adj[i].some(j => S.d[j].o === fid);
  // перемирие хранит живой игрок; между двумя живыми перемирий нет
  const inTruce = (S, human, other) => ((S.f[human].truce || {})[other] || -1) >= S.turn;

  const buildCost = (S, k, fid) => Math.round(D.BUILDS[k].cost * (fid ? priceK(S, fid) : 1));
  const officialCost = (S, fid, k) => Math.round(D.OFFICIALS[k].cost * (fid === 'solnc' ? 0.75 : 1) * priceK(S, fid));
  const gunPrice = (S, fid) => fid === 'kopt' ? 2 : 3;
  const armCost = (S, fid, k, n) => Math.max(1, Math.round(D.ARMS[k].price * n * (fid === 'kopt' ? 0.7 : 1) * (1 - fxp(S, fid, 'gun')) * priceK(S, fid)));
  const gunPack = (S, fid) => armCost(S, fid, 'pm', 5);
  const vestCost = (S, fid, n) => Math.max(1, Math.round(D.VEST.price * n * (1 - fxp(S, fid, 'gun')) * priceK(S, fid)));
  const CAR_PRICE = D.CARS.nine.price;
  const carCost = (S, fid, k) => Math.max(3, Math.round(D.CARS[k].price * (1 - fxp(S, fid, 'car')) * priceK(S, fid)));
  const carPrice = (S, fid) => carCost(S, fid, 'nine');
  // точка в «своём» районе (особенность района из good) приносит в полтора раза больше
  const pointGood = (k, i) => i != null && !!D.BUILDS[k].good && D.BUILDS[k].good.some(t => D.DISTRICTS[i].t.includes(t));
  const pointInc = (fid, k, i) => { const v = D.BUILDS[k].inc + (fid === 'tush' ? 1 : 0); return pointGood(k, i) ? Math.round(v * 1.5) : v; };
  const traitNames = ts => ts.map(t => D.TRAITS[t].name.toLowerCase()).join(', ');
  // точки улучшаются до третьего уровня: доход и оборона умножаются на уровень
  const MAX_LVL = 3;
  const pointLvl = (d, x) => (d.l && d.l[x]) || 1;
  const upgradeCost = (S, i, x) => Math.round(Math.max(D.BUILDS[S.d[i].b[x]].cost, 20) * pointLvl(S.d[i], x) * 1.5 * (S.d[i].o ? priceK(S, S.d[i].o) : 1));
  // польза точек для империи: сумма fx[key] × уровень по всем районам бригады, с потолком
  function fx(S, fid, key) {
    let v = 0;
    owned(S, fid).forEach(i => S.d[i].b.forEach((b, x) => { const f = D.BUILDS[b].fx; if (f && f[key]) v += f[key] * pointLvl(S.d[i], x); }));
    return D.FX_CAP[key] ? Math.min(D.FX_CAP[key], v) : v;
  }
  const fxp = (S, fid, key) => fx(S, fid, key) / 100;

  // ---------- семья ----------
  const crew = (S, fid) => S.f[fid].crew || [];
  const post = (S, fid, pos) => crew(S, fid).find(c => c.pos === pos && c.st === 'ok');
  const capoOf = (S, fid, ok) => crew(S, fid).find(c => c.pos === 'capo' && c.ok === ok && c.st === 'ok');
  // смотрящий держит один район; район хранится в c.ok как 'd' + номер, чтобы не путать с округами
  const watchKey = i => 'd' + i;
  const watchDist = c => +String(c.ok).slice(1);
  const watcherOf = (S, fid, i, any) => crew(S, fid).find(c => c.pos === 'watch' && c.ok === watchKey(i) && (any || c.st === 'ok'));
  const capoMax = (S, fid) => Math.min(9, 1 + Math.floor(count(S, fid) / 6));
  const benchMax = (S, fid) => Math.min(8, 3 + Math.floor(S.f[fid].men / 25));
  const cname = c => { const n = c.name.split(' '); return n[0] + ' «' + c.nick + '»' + (n[1] ? ' ' + n[1] : ''); };
  const cfull = c => (c.pos ? D.POSTS[c.pos].name.toLowerCase() + ' ' : '') + cname(c);
  function genPerson(S, fid) {
    const p = S.f[fid], b = D.BIOS[Math.floor(rnd(S) * D.BIOS.length)], used = new Set(crew(S, fid).map(c => c.nick));
    let nick = ''; for (let k = 0; k < 12; k++) { nick = D.NICKS[Math.floor(rnd(S) * D.NICKS.length)]; if (!used.has(nick)) break; }
    const st = v => clamp(Math.round(v + rr(S, -1, 2)), 1, 10);
    const c = { id: p.nid++, name: D.NAMES[Math.floor(rnd(S) * D.NAMES.length)] + ' ' + D.SURNAMES[Math.floor(rnd(S) * D.SURNAMES.length)], nick, age: ri(S, 19, 48), bio: b[0], str: st(4 + b[1]), wit: st(4 + b[2]), loy: st(4 + b[3]), pos: null, ok: null, st: 'ok', until: 0, since: S.turn };
    if (fid === 'laz') c.loy = Math.min(10, c.loy + 2); // землячество
    p.crew.push(c); return c;
  }
  // что случилось с человеком: hurt — ранен, jail — посадили, dead — убит
  function fate(S, fid, c, kind, where) {
    const p = S.f[fid], nm = cfull(c);
    if (kind === 'dead') {
      p.crew = p.crew.filter(x => x !== c); p.dead.unshift({ n: cname(c), pos: c.pos, t: S.turn, how: where }); if (p.dead.length > 12) p.dead.length = 12;
      addRep(S, fid, -1); log(S, nm.charAt(0).toUpperCase() + nm.slice(1) + ' погиб: ' + where + '.', 'bad', fid); return;
    }
    const m = kind === 'hurt' ? ri(S, 2, 4) : Math.max(6, Math.round(ri(S, 12, 30) * (1 - lawyerWit(S, fid) * 0.04)));
    c.st = kind; c.until = S.turn + (kind === 'hurt' && fx(S, fid, 'med') ? Math.ceil(m / 2) : m);
    let s2 = nm.charAt(0).toUpperCase() + nm.slice(1) + (kind === 'hurt' ? ' ранен: ' : ' арестован: ') + where + '. Вернётся: ' + date(c.until + 1).label + '.';
    if (kind === 'jail' && c.loy <= 3 && rnd(S) < 0.5) { addHeat(S, fid, 10); s2 += ' На допросах дал показания: розыск +10.'; c.loy = Math.max(1, c.loy - 1); }
    log(S, s2, 'bad', fid);
  }
  // кто ведёт бригаду в бой за район: бригадир округа или правая рука
  const leader = (S, fid, i) => capoOf(S, fid, D.DISTRICTS[i].ok) || post(S, fid, 'right');
  function atkMult(S, fid, i) {
    if (!S.f[fid].human) return 1;
    const r = post(S, fid, 'right'), cp = capoOf(S, fid, D.DISTRICTS[i].ok);
    return (fid === 'izm' ? 1.2 : 1) * (1 + (r ? r.str * 0.02 : 0) + (cp ? cp.str * 0.03 : 0) + eliteFx(S, fid, 'atk') / 100);
  }
  // юрист работает, только если верен; неверный сливает дела (см. heatDelta)
  const lawyerWit = (S, fid) => { const c = post(S, fid, 'lawyer'); return c && c.loy > 3 ? c.wit : 0; };
  const consBonus = (S, fid) => { const c = post(S, fid, 'cons'); return c ? c.wit * 3 : 0; };
  function crewPhase(S, fid) {
    const p = S.f[fid];
    p.crew.slice().forEach(c => {
      if (c.st === 'ok' && c.pos) addXp(c, c.pos === 'watch' ? 1 : 2);
      if (c.st !== 'ok' && c.until <= S.turn) {
        if (c.st === 'jail') { c.loy = Math.min(10, c.loy + 1); log(S, cname(c) + ' откинулся и вернулся в семью. Отсидел и не сдал: верность +1.', 'good', fid); }
        else log(S, cname(c) + ' встал на ноги и вернулся в строй.', 'good', fid);
        c.st = 'ok';
      }
      if (c.pos === 'capo' && !owned(S, fid).some(i => D.DISTRICTS[i].ok === c.ok)) { log(S, 'Бригадир ' + cname(c) + ' остался без округа и ушёл в резерв.', '', fid); c.pos = null; c.ok = null; }
      if (c.pos === 'watch' && S.d[watchDist(c)].o !== fid) { log(S, 'Смотрящий ' + cname(c) + ' остался без района (' + D.DISTRICTS[watchDist(c)].name + ') и ушёл в резерв.', '', fid); c.pos = null; c.ok = null; }
      // переворот: сильная и неверная правая рука; бронированный гелик бережёт главу
      if (!p.over && c.st === 'ok' && c.pos === 'right' && c.loy <= 2 && c.str >= 7 && rnd(S) < 0.05 * armorK(p)) {
        owned(S, fid).forEach(i => { S.d[i].o = null; S.d[i].ent = false; });
        eliminate(S, fid, { type: 'dead', title: 'Убит на стрелке', text: 'Правая рука назначил стрелку «по общему делу». Ты приехал без охраны. ' + cname(c) + ' теперь сам ведёт бригаду, а тебя хоронят на Хованском с оркестром и венками от тех, кто стрелял. Верность нужно было проверять раньше.', score: scoreOf(S, fid) });
        log(S, cname(c) + ' устроил переворот. Глава бригады убит на стрелке.', 'big'); return;
      }
      // казначей с общаком: ненадёжный исчезает со всей кассой
      if (!p.over && c.st === 'ok' && c.pos === 'treas' && c.loy <= 2 && p.money >= 300 && rnd(S) < 0.03) {
        const m = Math.round(p.money); p.money = 0; p.clean = 0;
        owned(S, fid).forEach(i => { S.d[i].o = null; S.d[i].ent = false; });
        eliminate(S, fid, { type: 'lost', title: 'Казначей в бегах с общаком', text: cname(c) + ' не вышел на связь в понедельник. Вместе с ним исчезли ' + fm(m) + ', ключи от сейфа и бухгалтерия. Платить бойцам нечем, бригада разошлась по соседям за неделю. Ты остался ни с чем: долги, пустой офис и пейджер, который больше не пищит.', score: scoreOf(S, fid) });
        log(S, 'Казначей ' + cname(c) + ' сбежал с общаком: ' + fm(m), 'big'); return;
      }
      if (c.st === 'ok' && c.loy <= 2 && rnd(S) < 0.04) {
        const m = Math.max(0, Math.round(p.money * 0.1)); p.money -= m; p.crew = p.crew.filter(x => x !== c);
        log(S, cfull(c).charAt(0).toUpperCase() + cfull(c).slice(1) + ' ушёл к конкурентам' + (m ? ' и прихватил из общака ' + fm(m) : '.'), 'bad', fid);
      }
    });
    const capos = p.crew.filter(c => c.pos === 'capo');
    capos.slice(capoMax(S, fid)).forEach(c => { c.pos = null; c.ok = null; log(S, 'Районов стало меньше: бригадир ' + cname(c) + ' ушёл в резерв.', '', fid); });
    const bench = p.crew.filter(c => !c.pos).length;
    if (bench < benchMax(S, fid) && p.men >= 6 && rnd(S) < 0.5) { const c = genPerson(S, fid); log(S, 'В бригаде выделился ' + cname(c) + ': ' + c.bio.charAt(0).toLowerCase() + c.bio.slice(1) + '.', 'good', fid); }
  }

  function projIncome(S, fid, pr) {
    const st = S.f[fid].proj[pr.id]; if (!st || st.stage !== 3) return 0;
    let v = pr.inc * (st.mult || 1);
    if (pr.pyramid) v *= Math.pow(1.08, st.age || 0);
    return Math.round(v);
  }
  function income(S, fid) {
    const p = S.f[fid], rows = []; let white = 0, black = 0, dist = 0, pts = 0, ptsUsd = 0, ents = 0;
    const held = okrugsHeld(S, fid);
    let wt = 0;
    owned(S, fid).forEach(i => {
      const dd = D.DISTRICTS[i], cp = capoOf(S, fid, dd.ok), w = p.human ? watcherOf(S, fid, i) : null;
      const base = Math.round(dd.inc * (held.includes(dd.ok) ? 2 : 1) * (1 + (cp ? cp.str * 0.05 : 0)));
      dist += base;
      let dp = 0;
      S.d[i].b.forEach((b, x) => { const v = pointInc(fid, b, i) * pointLvl(S.d[i], x); dp += v; if (D.BUILDS[b].usd) ptsUsd += v; else pts += v; if (D.BUILDS[b].kind === 'w') white += v; else black += v; });
      // смотрящий: сильный поднимает дань, умный — доход точек; ненадёжный утаивает половину дани
      if (w) { const v = w.loy <= 3 ? -Math.round(base / 2) : Math.round(dp * w.wit * 0.04 + base * w.str * 0.03); wt += v; black += v; }
      if (S.d[i].ent) { ents += dd.ent.inc; white += dd.ent.inc; }
    });
    black += dist;
    rows.push(['Дань с районов', dist], ['Точки', pts], ['Валютные точки', ptsUsd, 'usd'], ['Смотрящие', wt], ['Предприятия', ents]);
    let pj = 0;
    D.PROJECTS.forEach(pr => { const v = projIncome(S, fid, pr); pj += v; if (pr.kind === 'w') white += v; else black += v; });
    rows.push(['Крупные дела', pj, 'usd']);
    const wash = Math.round(black * Math.min(0.8, fxp(S, fid, 'wash') + (has(S, fid, 'charity') ? 0.1 : 0))); black -= wash; white += wash;
    const tr = post(S, fid, 'treas'), gross = dist + pts + ptsUsd + wt + ents + pj, tv = tr ? Math.round(gross * (tr.loy <= 3 ? -0.05 : tr.wit * 0.02)) : 0;
    rows.push(['Казначей', tv]);
    const upkeep = Math.round(p.men * 0.3 * era(S) * (1 - fxp(S, fid, 'upkeep'))), bribes = Object.keys(p.off).reduce((s, k) => s + p.off[k] * D.OFFICIALS[k].keep, 0);
    // большая империя дорого обходится: охрана и откаты растут с числом районов, с 2000 года силовики берут долю с чёрного
    const n = count(S, fid), guard = p.human ? Math.round(Math.max(0, n - 4) * 1.5 * era(S)) : 0, siloviki = p.human && lawK(S) > 1 ? Math.round(Math.max(0, black) * (lawK(S) - 1) * 0.25) : 0;
    rows.push(['Содержание бойцов', -upkeep], ['Зарплата людям во власти', -bribes], ['Охрана и откаты', -guard], ['Доля силовикам', -siloviki]);
    return { rows, total: gross + tv - upkeep - bribes - guard - siloviki, usd: ptsUsd + pj, white, black, wash };
  }
  function heatDelta(S, fid) {
    const p = S.f[fid];
    let v = -2 - Object.keys(p.off).reduce((s, k) => s + p.off[k] * D.OFFICIALS[k].cool, 0);
    if (fid === 'tag') v -= 1;
    v -= fx(S, fid, 'cool');
    if (has(S, fid, 'charity')) v -= 2;
    v -= eliteFx(S, fid, 'cool');
    D.PROJECTS.forEach(pr => { if ((p.proj[pr.id] || {}).stage === 3) v += pr.heat; });
    v += Math.floor(count(S, fid) / 5);
    // громкое имя притягивает внимание: от авторитета 50 розыск +1 в месяц, от 80 — +2
    if (p.human) v += p.rep >= 80 ? 2 : p.rep >= 50 ? 1 : 0;
    const lw = post(S, fid, 'lawyer'); if (lw && lw.loy <= 3) v += 2;
    return v > 0 ? Math.round(v * lawK(S)) : v;
  }

  // ---------- действия игрока ----------
  const fail = msg => ({ ok: false, msg });
  function spend(S, fid, ap) {
    const p = S.f[fid];
    if (!p || !p.human) return 'Нет такой бригады';
    if (S.done || p.over) return 'Игра окончена';
    if (p.event) return 'Сначала реши, что делать с событием';
    if (p.battle) return 'Сначала закончи перестрелку';
    if (p.ready) return 'Ты уже закончил месяц. Сними готовность, чтобы ходить';
    if (p.ap < ap) return 'Ходы на этот месяц кончились';
    return null;
  }
  // Авторитет. У живого игрока есть потолок: его дают районы, целые округа, связи во власти, крупные дела,
  // статусные и личные вещи. Чем выше авторитет, тем меньше добавляет каждая победа.
  function repCap(S, fid) {
    const p = S.f[fid]; if (!p.human) return 100;
    const parts = repParts(S, fid); return clamp(Math.round(parts.reduce((a, r) => a + r[1], 0)), 20, 100);
  }
  function repParts(S, fid) {
    const p = S.f[fid], pj = Object.keys(p.proj || {}).filter(k => p.proj[k].stage === 3).length, st = D.STATUS.filter(X => has(S, fid, X.id)).length, el = Object.keys(p.elite || {}).length;
    return [['Улица', 20], ['Районы', count(S, fid) * 1.5], ['Целые округа', okrugsHeld(S, fid).length * 5], ['Связи во власти', conn(S, fid) * 1.5], ['Крупные дела', pj * 3], ['Статус', st * 3], ['Личные вещи', el * 1.5]].map(r => [r[0], Math.round(r[1])]);
  }
  const addRep = (S, fid, v) => {
    const p = S.f[fid];
    if (!p.human) { p.rep = clamp(p.rep + v, 0, 100); return; }
    if (v > 0) v *= Math.max(0.2, 1 - p.rep / 110);
    p.rep = clamp(p.rep + v, 0, Math.max(Math.min(p.rep, 100), repCap(S, fid)));
  };
  const addHeat = (S, fid, v) => { const p = S.f[fid]; p.heat = clamp((p.heat || 0) + (v > 0 ? v * lawK(S) : v), 0, has(S, fid, 'duma') ? 79 : 100); };

  // Вербовка стоит денег и не тратит ход; нанять можно только тех, кто ждёт во дворах и спортзалах
  function recruit(S, fid, n) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    const p = S.f[fid], cap = menCap(S, fid), price = recruitPrice(S, fid), have = pool(S, fid);
    if (p.men >= cap) return fail('Больше людей бригада не удержит. Нужны новые районы или авторитет');
    if (have < 1) return fail('Желающих нет. Новые придут в следующем месяце; строй спортзалы');
    if (p.money < price) return fail('Не хватает денег: боец стоит ' + price);
    n = Math.max(1, Math.min(Math.floor(+n) || 1, have, cap - p.men, Math.floor(p.money / price)));
    p.men += n; p.money -= n * price; p.pool = have - n;
    return { ok: true, msg: 'В бригаду пришли ' + n + ' чел. за ' + fm(n * price) };
  }
  // Стволы, броники и тачки стоят только денег и не тратят ход
  function buyGuns(S, fid, k, n) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    k = k || 'pm'; const A = D.ARMS[k], p = S.f[fid];
    if (!A) return fail('Нет такого ствола');
    if (date(S.turn).year < A.from) return fail('Появится в ' + A.from + ' году');
    n = Math.max(1, Math.min(200, Math.floor(+n) || A.pack));
    const c = armCost(S, fid, k, n);
    if (p.money < c) return fail('Не хватает денег: нужно ' + fm(c));
    p.money -= c; addArms(p, k, n); const h = gunHeat(k, n); if (h) addHeat(S, fid, h);
    return { ok: true, msg: 'В арсенале: ' + A.name + ' ×' + n + ' за ' + fm(c) + (gunHeat(k, n) >= 1 ? '. Партию заметили: розыск +' + Math.round(gunHeat(k, n)) : '') };
  }
  // партия стволов не проходит незамеченной: чем серьёзнее ствол и больше партия, тем выше розыск
  const GUN_HEAT = { obrez: 0.05, pm: 0.1, aks: 0.2, svd: 0.4, rpg: 0.6 };
  const gunHeat = (k, n) => Math.round((GUN_HEAT[k] || 0.1) * n * 10) / 10;
  function buyVests(S, fid, n) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    const p = S.f[fid];
    if (date(S.turn).year < D.VEST.from) return fail('Появятся в ' + D.VEST.from + ' году');
    n = Math.max(1, Math.min(200, Math.floor(+n) || D.VEST.pack));
    const c = vestCost(S, fid, n);
    if (p.money < c) return fail('Не хватает денег: нужно ' + fm(c));
    p.money -= c; p.vests = (p.vests || 0) + n; p.vestBuy = 1; if (p.advice && p.advice.k === 'vests' && p.vests >= p.men * 0.6) p.advice = null;
    return { ok: true, msg: 'Бронежилетов на складе: ' + p.vests };
  }
  // покупка нескольких машин сразу; авторитет даёт только первая машина каждой модели (дальше это просто парк)
  function buyCar(S, fid, k, n) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    k = k || 'nine'; const C = D.CARS[k], p = S.f[fid];
    if (!C) return fail('Нет такой машины');
    if (date(S.turn).year < C.from) return fail('Появится в ' + C.from + ' году');
    n = Math.max(1, Math.min(30, Math.floor(+n) || 1));
    const c = carCost(S, fid, k) * n;
    if (p.money < c) return fail('Не хватает денег: нужно ' + fm(c));
    p.money -= c; addCar(p, k, n);
    if (!p.carSeen) p.carSeen = {};
    const first = !p.carSeen[k]; p.carSeen[k] = 1; if (first && C.rep) addRep(S, fid, C.rep);
    return { ok: true, msg: 'В гараже: ' + C.name + (n > 1 ? ' ×' + n : '') + ' за ' + fm(c) + (first && C.rep ? '. Первая такая: авторитет +' + C.rep : '') };
  }


  const SHARES = [0.35, 0.65, 1], HEATS = [4, 7, 11], KINDS = ['Наезд', 'Разборка', 'Война'];
  // на разборку едут на тачках: 4 бойца на машину, ещё 10 доберутся сами
  const strike = (f, share) => Math.max(1, Math.min(Math.round(f.men * share), 10 + seatsOf(f)));
  // бронежилеты: доля потерь, которую они снимают, если хватает на всех
  const vestK = (f, n) => f.vests ? 1 - 0.35 * Math.min(1, f.vests / Math.max(1, n)) : 1;
  function eliminate(S, fid, over) {
    const f = S.f[fid]; f.alive = false; f.men = 0;
    if (f.human && !f.over) f.over = over || { type: 'lost', title: 'Вынесли из Москвы', text: 'У тебя не осталось ни одного района. Бригада разбежалась по чужим. Тебе советуют уехать, пока дают.' };
    log(S, fdef(fid).name + ' потеряли последний район. Бригады больше нет.', 'big');
  }
  const prevOwner = d => d.o;
  // Бой за район. Боты дерутся сразу; у живого игрока исход приходит готовым из перестрелки (pre)
  function fight(S, att, i, share, pre) {
    const d = S.d[i], A0 = S.f[att], defender = d.o ? S.f[d.o] : null;
    let committed, ratio, win, la;
    if (pre) ({ committed, ratio, win, la } = pre);
    else {
      const defBase = districtDef(S, i); committed = strike(A0, share);
      const A = power(A0) * committed / Math.max(1, A0.men) * rr(S, 0.8, 1.25) * atkMult(S, att, i);
      const Dv = defBase * rr(S, 0.85, 1.15); ratio = A / Dv; win = A > Dv;
      la = Math.round(committed * clamp(0.22 / ratio, 0.06, 0.45) * (win ? 1 : 1.5));
    }
    const fin = !!(pre && pre.final); // исход нового боя: потери, стволы и броники уже посчитаны
    if (A0.human && att === 'medv' && !fin) la = Math.round(la * 0.7);
    if (A0.human && !fin) la = Math.round(la * (1 - fxp(S, att, 'med')) * vestK(A0, committed));
    la = Math.min(la, A0.men); A0.men -= la;
    if (!fin) { A0.guns = Math.max(0, A0.guns - Math.floor(la / 2)); if (A0.vests) A0.vests = Math.max(0, A0.vests - Math.floor(la / 3)); }
    let ld = 0;
    if (defender) { const dm = Math.round(defender.men * defFactor(count(S, d.o))); ld = Math.min(defender.men, Math.round(dm * clamp(0.18 * ratio, 0.05, 0.5) * (defender.human ? (1 - fxp(S, d.o, 'med')) * vestK(defender, dm) : 1))); defender.men -= ld; defender.guns = Math.max(0, defender.guns - ld); if (defender.vests) defender.vests = Math.max(0, defender.vests - Math.floor(ld / 2)); }
    const prev = d.o;
    const dok = D.DISTRICTS[i].ok, defCapo = defender && defender.human ? capoOf(S, prevOwner(d), dok) : null;
    if (win) { d.o = att; d.ent = false; }
    // судьба людей из семьи: кто вёл бой и кто держал округ
    if (A0.human) { const l = leader(S, att, i), x = rnd(S) / armorK(A0); if (l) { addXp(l, win ? 3 : 1); if (!win && x < 0.04) fate(S, att, l, 'dead', 'в неудачной разборке за ' + D.DISTRICTS[i].name); else if (x < (win ? 0.04 : 0.14)) fate(S, att, l, 'hurt', 'в разборке за ' + D.DISTRICTS[i].name); } }
    if (defCapo && win) { const x = rnd(S) / armorK(defender); if (x < 0.07) fate(S, prev, defCapo, 'dead', 'защищая ' + D.DISTRICTS[i].name); else if (x < 0.25) fate(S, prev, defCapo, 'hurt', 'защищая ' + D.DISTRICTS[i].name); }
    const defW = defender && defender.human && win ? watcherOf(S, prev, i) : null;
    if (defW) { const x = rnd(S) / armorK(defender); if (x < 0.1) fate(S, prev, defW, 'dead', 'не отдал ' + D.DISTRICTS[i].name + ' без боя'); else if (x < 0.35) fate(S, prev, defW, 'hurt', 'защищая ' + D.DISTRICTS[i].name); }
    // живому защитнику — личное сообщение
    if (defender && defender.human) {
      const nm = D.DISTRICTS[i].name, who = fdef(att).name;
      if (win) { addRep(S, prev, -3); log(S, who + ' отбили у тебя ' + nm + '. Твои потери: ' + ld, 'bad', prev); defender.lostNow = (defender.lostNow || []).concat(nm); }
      else { addRep(S, prev, 2); log(S, who + ' напали на ' + nm + ', но ты удержал район. Твои потери: ' + ld, 'good', prev); }
    }
    if (win && prev && count(S, prev) === 0) eliminate(S, prev);
    return { win, la, ld, prev };
  }
  // ---------- перестрелка: захват района по раундам ----------
  // our — во сколько раз сильнее бьём мы, their — они; need — что нужно иметь
  const TACTICS = {
    storm: { name: 'Штурм', our: 1.4, their: 1.3, desc: 'Все вперёд: бьём сильнее, но и теряем больше' },
    cover: { name: 'Огонь из укрытия', our: 0.75, their: 0.55, desc: 'Медленно, зато бережёт людей' },
    flank: { name: 'Обход на машинах', need: 'car', desc: 'Удар с тыла. Получится — разгром, нет — подставились' },
    snipe: { name: 'Снайпер на крыше', need: 'svd', our: 0.7, their: 0.35, desc: 'СВД прижимает их к земле' },
    rpg: { name: 'Гранатомёт', need: 'rpg', our: 0.5, their: 0.8, desc: 'Тратит один РПГ, сносит пятую часть обороны' },
    talk: { name: 'Предложить сдаться', desc: 'Чем слабее они и выше твой авторитет, тем вернее' },
    retreat: { name: 'Отступить', desc: 'Уйти с теми потерями, что уже есть' }
  };
  const BATTLE_ROUNDS = 6, BREAK = 0.35;
  const flankOdds = (S, fid, men) => { const p = S.f[fid], B = p.battle, m = men || (B ? B.men : p.men); return clamp(0.45 + Math.min(1, seatsOf(p) / Math.max(1, m)) * 0.25 + (B && leader(S, fid, B.i) ? 0.05 : 0), 0.2, 0.8); };
  const talkOdds = (S, fid) => { const p = S.f[fid], B = p.battle; return clamp(15 + p.rep / 2 + fx(S, fid, 'talk') + consBonus(S, fid) - (B ? Math.max(0, B.d) / B.d0 : 1) * 55, 3, 85); };
  function tacticLock(S, fid, t) {
    const p = S.f[fid], T = TACTICS[t]; if (!T) return 'Нет такого приёма';
    if (T.need === 'car' && !p.cars) return 'нужна тачка';
    if (T.need === 'svd' && !((p.arms || {}).svd > 0)) return 'нужна СВД';
    if (T.need === 'rpg' && !((p.arms || {}).rpg > 0)) return 'нужен РПГ';
    if (t === 'flank' && p.battle && p.battle.flank) return 'уже обходили';
    return null;
  }
  // один раунд; rand — источник случайности (для оценки шансов — Math.random, в игре — сид)
  // Кубики: каждая сторона бросает 2d6. Сумма даёт множитель ×0.71…×1.29, две шестёрки — «в упор» ×1.5, две единицы — «осечка» ×0.5.
  // Урон за раунд = база (сила стороны × 0.32 или 0.28) × тактика × кубики × (1 − броня противника)
  const roll = rand => [1 + Math.floor(rand() * 6), 1 + Math.floor(rand() * 6)];
  const diceK = d => (d[0] === 6 && d[1] === 6 ? 1.5 : d[0] === 1 && d[1] === 1 ? 0.5 : 1) * (0.6 + (d[0] + d[1]) / 17.5);
  function roundCalc(B, t, rand, extra) {
    const T = TACTICS[t]; let our = T.our || 0, their = T.their == null ? 1 : T.their, bonus = 0, note = '';
    if (t === 'flank') { const ok = rand() < extra.flank; our = ok ? 1.9 : 0.4; their = ok ? 0.5 : 1.4; note = ok ? 'зашли с тыла' : 'нарвались на засаду'; }
    if (t === 'rpg') bonus = B.d0 * 0.2;
    if (t === 'talk') { if (rand() * 100 < extra.talk) return { dealt: B.d, took: 0, note: B.def ? 'договорились, они уехали' : 'сдались и ушли с района', surrender: true }; our = 0; their = 1; note = 'послали подальше'; }
    const du = roll(rand), dt = roll(rand), ku = diceK(du), kt = diceK(dt), baseU = B.a * 0.32, baseT = B.d * 0.28, armU = B.armU || 0, armT = B.armT || 0;
    if (du[0] === 6 && du[1] === 6) note += (note ? ', ' : '') + 'в упор'; if (du[0] === 1 && du[1] === 1) note += (note ? ', ' : '') + 'осечка';
    const dealt = baseU * our * ku * (1 - armT) + bonus, took = baseT * their * kt * (1 - armU);
    return { dealt, took, note, du, dt, ku, kt, baseU, baseT, our, their, armU, armT };
  }
  function battleSim(a, d, rand) { // оценка: штурм, пока сильнее, иначе из укрытия (a — нападающий, d — оборона)
    const B = { a, a0: a, d, d0: d };
    for (let r = 0; r < BATTLE_ROUNDS; r++) { const x = roundCalc(B, B.a >= B.d ? 'storm' : 'cover', rand, {}); B.d -= x.dealt; B.a -= x.took; if (B.d <= 0) return true; if (B.a <= B.a0 * BREAK) return false; }
    return false;
  }
  // броня: броники у бойцов, до 30% урона; в обороне ещё 10% — свои дворы и стены
  const armorOf = (p, men) => Math.round(Math.min(1, (p.vests || 0) / Math.max(1, men)) * 0.3 * 100) / 100;
  function attack(S, fid, i, lvl) {
    const e = spend(S, fid, 1); if (e) return fail(e);
    if (!S.d[i] || !SHARES[lvl]) return fail('Нет такой цели');
    if (!attackable(S, fid, i)) return fail('Нападать можно только на районы, которые граничат с твоими');
    const d = S.d[i], dd = D.DISTRICTS[i], p = S.f[fid];
    if (d.o && inTruce(S, fid, d.o)) return fail('С этой бригадой перемирие' + (S.f[d.o].human ? ' до ' + date(S.f[fid].truce[d.o]).label : ''));
    if (p.men < 3) return fail('Некого посылать');
    p.ap--;
    const men = strike(p, SHARES[lvl]), a = power(p) * men / Math.max(1, p.men) * atkMult(S, fid, i) * rr(S, 0.9, 1.1), dv = districtDef(S, i) * rr(S, 0.9, 1.1);
    p.battle = { i, lvl, men, a, a0: a, d: dv, d0: dv, round: 0, log: [], foe: d.o, held: okrugHeld(S, fid, dd.ok), armU: armorOf(p, men), armT: d.o ? 0.1 : 0 };
    addHeat(S, fid, HEATS[lvl] + (dd.ok === 'CAO' ? 2 : 0));
    return { ok: true, msg: KINDS[lvl] + ': ' + dd.name + '. Едут ' + men + ' бойцов', battle: true };
  }
  function battle(S, fid, t) {
    const p = S.f[fid]; if (!p || !p.human || p.over || S.done) return fail('Игра окончена');
    const B = p.battle; if (!B) return fail('Перестрелки нет');
    if (t === 'retreat') return B.def ? defendEnd(S, fid, false, 'Ты отвёл людей и сдал район') : finishBattle(S, fid, false, 'Ты увёл людей');
    const lock = tacticLock(S, fid, t); if (lock) return fail(lock);
    if (t === 'rpg') { p.arms.rpg--; p.guns--; }
    if (t === 'flank') B.flank = 1;
    const x = roundCalc(B, t, () => rnd(S), { flank: flankOdds(S, fid), talk: talkOdds(S, fid) });
    B.d -= x.dealt; B.a -= x.took; B.round++;
    B.log.push({ t, dealt: Math.round(x.dealt), took: Math.round(x.took), note: x.note, du: x.du, dt: x.dt, ku: x.ku && +x.ku.toFixed(2), kt: x.kt && +x.kt.toFixed(2), our: x.our, their: x.their, bu: x.baseU && Math.round(x.baseU), bt: x.baseT && Math.round(x.baseT) });
    if (B.def) {
      if (x.surrender || B.d <= 0) return defendEnd(S, fid, true, x.surrender ? 'Договорились: они уехали' : 'Отбились: нападавшие бежали');
      if (B.a <= B.a0 * BREAK) return defendEnd(S, fid, false, 'Наши дрогнули');
      if (B.round >= BATTLE_ROUNDS) return defendEnd(S, fid, true, 'Не прорвались: атака выдохлась');
    } else {
      if (x.surrender || B.d <= 0) return finishBattle(S, fid, true, x.surrender ? 'Они сдались' : 'Район зачищен');
      if (B.a <= B.a0 * BREAK) return finishBattle(S, fid, false, 'Бойцы дрогнули');
      if (B.round >= BATTLE_ROUNDS) return finishBattle(S, fid, false, 'Не продавили: район устоял');
    }
    return { ok: true, msg: TACTICS[t].name + ': урон ' + Math.round(x.dealt) + ', получили ' + Math.round(x.took) + (x.note ? ' (' + x.note + ')' : ''), round: true };
  }
  function finishBattle(S, fid, win, why) {
    const p = S.f[fid], B = p.battle, i = B.i, dd = D.DISTRICTS[i], lvl = B.lvl;
    p.battle = null;
    const lost = clamp(1 - Math.max(0, B.a) / B.a0, 0, 1);
    const la = Math.round(B.men * lost * 0.35 * (win ? 1 : 1.3));
    const ratio = win ? clamp(1 + Math.max(0, B.a) / B.a0, 1, 2.5) : clamp((B.d0 - Math.max(0, B.d)) / B.d0 * 1.5, 0.2, 1);
    const heldBefore = B.held;
    const r = fight(S, fid, i, null, { committed: B.men, win, la, ratio });
    let msg;
    if (r.win) {
      addRep(S, fid, r.prev ? 1.5 : 0.7);
      msg = why + '. ' + dd.name + ' теперь твой. Потери: ' + r.la + (r.prev ? ', у противника ' + r.ld : '');
      log(S, 'Взят район ' + dd.name + (r.prev ? ' (' + fdef(r.prev).name + ')' : '') + '. Потери: ' + r.la, 'good', fid);
      if (!heldBefore && okrugHeld(S, fid, dd.ok) && !p.okBonus[dd.ok]) { p.okBonus[dd.ok] = 1; addRep(S, fid, 10); log(S, D.OKRUGS[dd.ok].name + ' полностью твой. Дань с округа удвоена, +1 ход в месяц.', 'big', fid); msg += '. Весь ' + D.OKRUGS[dd.ok].short + ' под тобой'; }
      if (S.d.every(x => x.o === fid)) p.over = { type: 'win', title: 'Хозяин Москвы', text: 'Все сто два района платят тебе. В городе не осталось никого, кто мог бы возразить.' };
      checkDone(S);
    } else {
      addRep(S, fid, -2);
      msg = why + '. ' + KINDS[lvl] + ' за ' + dd.name + ' провалилась. Потери: ' + r.la;
      log(S, 'Не удалось взять ' + dd.name + '. Потери: ' + r.la, 'bad', fid);
    }
    return { ok: true, msg, win: r.win, battleEnd: true, title: (r.win ? 'Взят район ' : 'Перестрелка за ') + dd.name };
  }
  // ---------- нападение одним окном ----------
  // Игрок выбирает, сколько людей везти и как брать район; бой считается сразу, без раундов.
  // Сила отряда — от оружия: лучшие стволы достаются первыми, колёса добавляют силы тем, кто на машинах.
  // Убитый боец забирает с собой свой ствол и броник, а часть уцелевших броников рвётся — их надо обновлять.
  const ATK = {
    storm: { name: 'Штурм', k: 1.2, loss: 1.3, desc: 'Все разом: бьём сильнее, теряем больше' },
    cover: { name: 'Из укрытия', k: 0.85, loss: 0.6, desc: 'Медленно, зато бережёт людей' },
    flank: { name: 'Обход на машинах', need: 'car', desc: 'Удар с тыла: получится — разгром, нет — засада' },
    snipe: { name: 'Снайперы на крышах', need: 'svd', k: 1, loss: 0.75, desc: 'Каждая СВД (до пяти) +8% к силе, людей бережёт' },
    rpg: { name: 'Гранатомёты', need: 'rpg', k: 1, loss: 0.9, desc: 'До трёх РПГ: каждый сносит 12% обороны и тратится' },
    talk: { name: 'Предложить сдаться', k: 0.9, loss: 1.2, desc: 'Без стрельбы, если ты сильнее и при авторитете. Отказ — штурм с потерей темпа' }
  };
  const strikeMax = f => Math.max(0, Math.min(f.men, 10 + seatsOf(f)));
  function squad(p, men) {
    men = Math.max(0, Math.min(men, p.men)); const used = {}; let left = men, fire = 0, wheels = 0;
    if (p.arms) { syncKit(p); ARM_ORDER.forEach(k => { const n = Math.min(left, p.arms[k] || 0); if (n) { used[k] = n; fire += n * D.ARMS[k].q; left -= n; } }); }
    else { const n = Math.min(men, p.guns); fire = n; left -= n; }
    let ride = men; if (p.garage) CAR_ORDER.forEach(k => { const n = Math.min(ride, (p.garage[k] || 0) * D.CARS[k].seats); wheels += n * D.CARS[k].q; ride -= n; }); else wheels = 0.5 * Math.min(men, p.cars * 4);
    return { men, fire, wheels, used, bare: left, vests: Math.min(p.vests || 0, men), power: men + fire + wheels };
  }
  function atkLock(S, fid, t) {
    const p = S.f[fid], T = ATK[t]; if (!T) return 'Нет такого приёма';
    if (T.need === 'car' && !p.cars) return 'нужна тачка';
    if (T.need === 'svd' && !((p.arms || {}).svd > 0)) return 'нужна СВД';
    if (T.need === 'rpg' && !((p.arms || {}).rpg > 0)) return 'нужен РПГ';
    return null;
  }
  const surrOdds = (S, fid, ratio) => clamp(8 + S.f[fid].rep / 2 + talkBonus(S, fid) + (ratio - 1) * 60, 3, 85);
  // база боя: сила отряда, приёмы, оборона района
  function atkBase(S, fid, i, men, t) {
    const p = S.f[fid], q = squad(p, men), T = ATK[t] || ATK.storm, ar = p.arms || {};
    // чем больше империя, тем злее сопротивление: районы держатся до 1,6 раза крепче против разросшейся бригады
    let k = T.k || 1, def = districtDef(S, i) * (1 + Math.min(1.2, count(S, fid) * 0.02)), rpgs = 0;
    // против разросшейся бригады соседи-боты подкидывают обороне людей: самый сильный сосед — четверть своей силы
    if (p.human && count(S, fid) >= 12) { let ally = 0; GEO.adj[i].forEach(j => { const o = S.d[j].o; if (o && o !== fid && !S.f[o].human && S.f[o].alive) ally = Math.max(ally, power(S.f[o]) * 0.25); }); def += ally * Math.min(1, (count(S, fid) - 10) / 20); }
    if (t === 'snipe') k = 1 + 0.08 * Math.min(5, ar.svd || 0);
    if (t === 'rpg') { rpgs = Math.min(3, ar.rpg || 0); def *= 1 - 0.12 * rpgs; }
    return { q, a: q.power * atkMult(S, fid, i), k, def, rpgs, loss: T.loss || 1 };
  }
  // шанс взять район: прогон без изменения состояния
  function attackOdds(S, fid, i, men, t) {
    if (atkLock(S, fid, t) || !S.d[i]) return 0;
    const B = atkBase(S, fid, i, men, t), fo = flankOdds(S, fid, men); let w = 0;
    for (let n = 0; n < 300; n++) {
      let k = B.k; if (t === 'flank') k = Math.random() < fo ? 1.55 : 0.7;
      const A = B.a * k * (0.85 + Math.random() * 0.3), Dv = B.def * (0.9 + Math.random() * 0.2);
      if (t === 'talk' && Math.random() * 100 < surrOdds(S, fid, B.a / B.def)) { w++; continue; }
      if (A > Dv) w++;
    }
    return w / 300;
  }
  // убитые уносят свои стволы (из тех, что были в отряде) и броники; часть броников у живых рвётся
  function loseKit(S, fid, q, dead) {
    const p = S.f[fid], out = { guns: 0, vests: 0 };
    const armed = q.men - q.bare, lost = Math.min(armed, Math.round(dead * armed / Math.max(1, q.men)));
    if (p.arms && lost) {
      const keys = Object.keys(q.used); let left = lost;
      keys.forEach(k => { const n = Math.min(left, p.arms[k] || 0, Math.floor(lost * q.used[k] / Math.max(1, armed))); p.arms[k] -= n; out.guns += n; left -= n; });
      ARM_ORDER.slice().reverse().forEach(k => { if (left > 0 && q.used[k]) { const n = Math.min(left, p.arms[k] || 0); p.arms[k] -= n; out.guns += n; left -= n; } });
      p.guns = Math.max(0, p.guns - out.guns);
    } else if (lost) { out.guns = Math.min(p.guns, lost); p.guns -= out.guns; }
    if (q.vests) { const vd = Math.min(q.vests, Math.round(dead * q.vests / Math.max(1, q.men))), torn = Math.round((q.vests - vd) * 0.15); out.vests = Math.min(p.vests || 0, vd + torn); p.vests = (p.vests || 0) - out.vests; }
    return out;
  }
  // советник напоминает про броники: если их меньше, чем на 60% бойцов
  function vestAdvice(S, fid) {
    const p = S.f[fid]; if (!p.human || date(S.turn).year < D.VEST.from || p.vestAdv === S.turn) return;
    if (!p.vestBuy && !(p.vests > 0)) return;
    if ((p.vests || 0) >= p.men * 0.6) return;
    p.vestAdv = S.turn; const c = post(S, fid, 'cons'), who = c ? 'Советник «' + c.nick + '»' : 'Советник';
    p.advice = { t: S.turn, k: 'vests', s: who + ': броников осталось ' + (p.vests || 0) + ' на ' + p.men + ' бойцов, часть порвана в последних разборках. Надо обновить, иначе потери вырастут.' };
    log(S, p.advice.s, 'bad', fid);
  }
  // Война: напал на бригаду — она полгода каждый месяц едет на твои районы. Заканчивается миром на стрелке
  // или сама, когда срок вышел. Повторное нападение продлевает войну
  const WAR_LEN = 6;
  const atWar = (S, fid, other) => ((S.f[fid].war || {})[other] || -1) >= S.turn;
  function startWar(S, fid, other) {
    const p = S.f[fid]; p.war = p.war || {}; const was = atWar(S, fid, other);
    p.war[other] = S.turn + WAR_LEN;
    if (!was) log(S, fdef(other).name + ' объявили тебе войну: полгода будут каждый месяц приезжать на твои районы. Остановить — мир на стрелке.', 'bad', fid);
  }
  function attackGo(S, fid, i, men, t) {
    const e = spend(S, fid, 1); if (e) return fail(e);
    i = +i; t = ATK[t] ? t : 'storm';
    if (!S.d[i]) return fail('Нет такой цели');
    if (!attackable(S, fid, i)) return fail('Нападать можно только на районы, которые граничат с твоими');
    const d = S.d[i], dd = D.DISTRICTS[i], p = S.f[fid];
    if (d.o && inTruce(S, fid, d.o)) return fail('С этой бригадой перемирие' + (S.f[d.o].human ? ' до ' + date(S.f[fid].truce[d.o]).label : ''));
    const lk = atkLock(S, fid, t); if (lk) return fail('Нельзя: ' + lk);
    men = Math.max(3, Math.min(Math.floor(+men) || 0, strikeMax(p)));
    if (p.men < 3 || men < 3) return fail('Некого посылать: нужно хотя бы 3 бойца');
    p.ap--;
    const B = atkBase(S, fid, i, men, t), foe = d.o, nm = dd.name;
    let k = B.k, note = '', surr = false;
    if (t === 'flank') { const ok = rnd(S) < flankOdds(S, fid, men); k = ok ? 1.55 : 0.7; B.loss = ok ? 0.6 : 1.5; note = ok ? 'зашли с тыла' : 'нарвались на засаду'; }
    if (t === 'talk') { if (rnd(S) * 100 < surrOdds(S, fid, B.a / B.def)) { surr = true; note = foe ? 'договорились без стрельбы' : 'шпана сдалась и ушла'; } else note = 'послали подальше, пришлось штурмовать'; }
    if (B.rpgs) { p.arms.rpg -= B.rpgs; p.guns -= B.rpgs; }
    const A = B.a * k * rr(S, 0.85, 1.15), Dv = B.def * rr(S, 0.9, 1.1), ratio = A / Math.max(1, Dv), win = surr || A > Dv;
    let la = surr ? 0 : Math.round(men * clamp(0.2 / ratio, 0.04, 0.5) * B.loss * (win ? 1 : 1.4));
    if (fid === 'medv') la = Math.round(la * 0.7);
    la = Math.min(men, Math.round(la * (1 - fxp(S, fid, 'med')) * vestK(p, men)));
    const kit = loseKit(S, fid, B.q, la);
    addHeat(S, fid, Math.round(3 + 8 * men / Math.max(1, p.men)) + (dd.ok === 'CAO' ? 2 : 0));
    // напал на бригаду — с ней сразу вражда
    if (foe && !S.f[foe].human) { p.rel = p.rel || {}; p.rel[foe] = -100; startWar(S, fid, foe); }
    const held = okrugHeld(S, fid, dd.ok);
    const r = fight(S, fid, i, null, { committed: men, win, la, ratio: surr ? 1.2 : clamp(win ? ratio : ratio * 0.8, 0.2, 2.5), final: true });
    let msg;
    if (r.win) {
      addRep(S, fid, r.prev ? 1.5 : 0.7);
      msg = nm + ' теперь твой.';
      log(S, 'Взят район ' + nm + (r.prev ? ' (' + fdef(r.prev).name + ')' : '') + '. Потери: ' + r.la, 'good', fid);
      if (!held && okrugHeld(S, fid, dd.ok) && !p.okBonus[dd.ok]) { p.okBonus[dd.ok] = 1; addRep(S, fid, 8); log(S, D.OKRUGS[dd.ok].name + ' полностью твой. Дань с округа удвоена, +1 ход в месяц.', 'big', fid); msg += ' Весь ' + D.OKRUGS[dd.ok].short + ' под тобой.'; }
      if (S.d.every(x => x.o === fid)) p.over = { type: 'win', title: 'Хозяин Москвы', text: 'Все сто два района платят тебе. В городе не осталось никого, кто мог бы возразить.' };
      checkDone(S);
    } else { addRep(S, fid, -2); msg = 'Район устоял, бойцы отошли.'; log(S, 'Не удалось взять ' + nm + '. Потери: ' + r.la, 'bad', fid); }
    vestAdvice(S, fid);
    return { ok: true, battleEnd: true, win: r.win, title: (r.win ? 'Взят район ' : 'Не взяли ') + nm, msg, report: { men, tac: ATK[t].name, note, la: r.la, ld: r.ld, foe: foe || null, guns: kit.guns, vests: kit.vests, rpg: B.rpgs }, i };
  }
  // ---------- наезды на районы игрока ----------
  const assaultValid = (S, fid, x) => S.d[x.i].o === fid && S.f[x.att] && S.f[x.att].alive;
  const buyOffCost = (S, x) => Math.round(x.a * 1.6 * era(S));
  // сам вступаешь в бой — приводишь подмогу: половину сил бригады сверх гарнизона района
  const defPower = (S, fid, x, full) => districtDef(S, x.i) + (full ? power(S.f[fid]) * 0.5 : 0);
  function defendOdds(S, fid, x, full) { const a = defPower(S, fid, x, full); let w = 0; for (let k = 0; k < 200; k++) if (!battleSim(x.a * (0.9 + Math.random() * 0.2), a * (0.9 + Math.random() * 0.2), Math.random, true)) w++; return w / 200; }
  function resolveAssault(S, fid, x, how) {
    const p = S.f[fid]; p.assaults = (p.assaults || []).filter(y => y !== x);
    if (!assaultValid(S, fid, x)) return { ok: true, msg: 'Наезд отменился сам собой' };
    const nm = D.DISTRICTS[x.i].name, who = fdef(x.att).name;
    if (how === 'pay') { const c = buyOffCost(S, x); if (p.money < c) return fail('Не хватает денег: нужно ' + fm(c)); p.money -= c; addRel(S, fid, x.att, 5); addRep(S, fid, -1); log(S, who + ' получили ' + fm(c) + ' и отъехали от ' + nm + '.', '', fid); return { ok: true, msg: 'Откупился: ' + fm(c) + ' ' + who + ' уехали.' }; }
    if (how === 'give') { S.d[x.i].o = x.att; S.d[x.i].ent = false; addRep(S, fid, -4); log(S, 'Ты сдал ' + nm + ' бригаде ' + who + ' без боя.', 'bad', fid); p.lostNow = (p.lostNow || []).concat(nm); if (count(S, fid) === 0) eliminate(S, fid); return { ok: true, msg: nm + ' отошёл к ' + who + '. Без крови.' }; }
    const r = fight(S, x.att, x.i, 0.65);
    return { ok: true, msg: r.win ? who + ' взяли ' + nm + '. Наши потери: ' + r.ld : nm + ' устоял без тебя. Наши потери: ' + r.ld, battleEnd: true, win: !r.win, title: 'Наезд на ' + nm };
  }
  // Вступить в бой самому: подмога — половина сил бригады сверх гарнизона. Считается сразу, одним окном.
  function defend(S, fid, k, how) {
    const p = S.f[fid]; if (!p || !p.human || p.over || S.done) return fail('Игра окончена');
    if (p.battle) return fail('Сначала закончи перестрелку');
    const x = (p.assaults || [])[+k]; if (!x) return fail('Наезда нет');
    if (how !== 'fight') return resolveAssault(S, fid, x, how);
    if (!assaultValid(S, fid, x)) { p.assaults.splice(+k, 1); return fail('Район уже не твой'); }
    p.assaults.splice(+k, 1);
    const i = x.i, nm = D.DISTRICTS[i].name, A0 = S.f[x.att], who = fdef(x.att).name;
    const men = Math.max(3, Math.min(p.men, Math.round(p.men * Math.min(1, defFactor(count(S, fid)) + 0.5))));
    const q = squad(p, men), our = defPower(S, fid, x, true) * rr(S, 0.9, 1.1), their = x.a * rr(S, 0.85, 1.15), ratio = our / Math.max(1, their), win = our >= their;
    let la = Math.round(men * clamp(0.15 / ratio, 0.03, 0.4) * (win ? 1 : 1.4) * (1 - fxp(S, fid, 'med')) * vestK(p, men)); la = Math.min(la, p.men);
    const lb = Math.min(A0.men, Math.round(x.men * clamp(0.22 * ratio, 0.05, 0.6)));
    p.men -= la; const kit = loseKit(S, fid, q, la); A0.men -= lb; A0.guns = Math.max(0, A0.guns - lb);
    const l = capoOf(S, fid, D.DISTRICTS[i].ok); if (l) addXp(l, win ? 3 : 1);
    let msg;
    if (win) { addRep(S, fid, 2); addRel(S, fid, x.att, -20); msg = nm + ' остался твоим.'; log(S, 'Отбили наезд ' + who + ' на ' + nm + '. Потери: ' + la + ', у них ' + lb, 'good', fid); }
    else {
      S.d[i].o = x.att; S.d[i].ent = false; addRep(S, fid, -3); p.lostNow = (p.lostNow || []).concat(nm);
      if (l && rnd(S) < 0.2 / armorK(p) * 0.5) fate(S, fid, l, 'hurt', 'защищая ' + nm);
      msg = who + ' забрали ' + nm + '.'; log(S, who + ' отбили у тебя ' + nm + '. Потери: ' + la, 'bad', fid);
      if (count(S, fid) === 0) eliminate(S, fid);
    }
    vestAdvice(S, fid);
    return { ok: true, battleEnd: true, win, title: (win ? 'Отбились: ' : 'Потерян район ') + nm, msg, report: { men, tac: 'Оборона', note: '', la, ld: lb, foe: x.att, guns: kit.guns, vests: kit.vests, rpg: 0 }, i };
  }
  function defendEnd(S, fid, win, why) {
    const p = S.f[fid], B = p.battle, i = B.i, nm = D.DISTRICTS[i].name, A0 = S.f[B.att], who = fdef(B.att).name;
    p.battle = null;
    const lost = clamp(1 - Math.max(0, B.a) / B.a0, 0, 1);
    let la = Math.round(B.men * lost * 0.3 * (win ? 1 : 1.3) * (1 - fxp(S, fid, 'med')) * vestK(p, B.men)); la = Math.min(la, p.men);
    const lb = Math.min(A0.men, Math.round(B.attMen * clamp((B.d0 - Math.max(0, B.d)) / B.d0, 0, 1) * 0.5));
    p.men -= la; p.guns = Math.max(0, p.guns - Math.floor(la / 2)); A0.men -= lb; A0.guns = Math.max(0, A0.guns - Math.floor(lb / 2));
    let msg;
    if (win) { addRep(S, fid, 3); msg = why + '. ' + nm + ' остался твоим. Наши потери: ' + la + ', у ' + who + ': ' + lb; log(S, 'Отбили наезд ' + who + ' на ' + nm + '. Потери: ' + la + ', у них ' + lb, 'good', fid); }
    else {
      S.d[i].o = B.att; S.d[i].ent = false; addRep(S, fid, -3); p.lostNow = (p.lostNow || []).concat(nm);
      const cp = capoOf(S, fid, D.DISTRICTS[i].ok); if (cp && rnd(S) < 0.2 / armorK(p) * 0.5) fate(S, fid, cp, 'hurt', 'защищая ' + nm);
      msg = why + '. ' + who + ' забрали ' + nm + '. Наши потери: ' + la;
      log(S, who + ' отбили у тебя ' + nm + '. Потери: ' + la, 'bad', fid);
      if (count(S, fid) === 0) eliminate(S, fid);
    }
    return { ok: true, msg, win, battleEnd: true, title: (win ? 'Отбились: ' : 'Потерян район ') + nm };
  }
  function winOdds(S, fid, i, lvl) { // оценка без изменения состояния: прогон перестрелки
    const def = districtDef(S, i), p = S.f[fid], base = power(p) * strike(p, SHARES[lvl]) / Math.max(1, p.men) * atkMult(S, fid, i); let w = 0;
    for (let k = 0; k < 200; k++) if (battleSim(base * (0.9 + Math.random() * 0.2), def * (0.9 + Math.random() * 0.2), Math.random)) w++;
    return w / 200;
  }

  function canBuild(S, fid, i, k) {
    const B = D.BUILDS[k], d = S.d[i], dd = D.DISTRICTS[i], p = S.f[fid], y = date(S.turn).year;
    if (!B || !d) return 'Нет такой точки';
    if (d.o !== fid) return 'Район не твой';
    if (B.from && y < B.from) return 'Доступно с ' + B.from + ' года';
    if (B.onlyMarket && !dd.m) return 'На районе нет рынка';
    if (B.need && !B.need.some(t => dd.t.includes(t))) return 'Только там, где ' + traitNames(B.need);
    if (B.one && d.b.includes(k)) return 'Уже есть';
    if (d.b.length >= dd.slots) return 'Нет свободных мест';
    if (B.needMen && p.men < B.needMen) return 'Нужно бойцов: ' + B.needMen;
    if (B.needConn && conn(S, fid) < B.needConn) return 'Нужны связи: ' + B.needConn;
    if (p.money < buildCost(S, k, fid)) return 'Не хватает денег: нужно ' + fm(buildCost(S, k, fid));
    return null;
  }
  function doBuild(S, fid, i, k) {
    const B = D.BUILDS[k], p = S.f[fid];
    p.money -= buildCost(S, k, fid); S.d[i].l = S.d[i].b.map((_, j) => pointLvl(S.d[i], j)); S.d[i].b.push(k); S.d[i].l.push(1);
    if (B.heat && p.human) addHeat(S, fid, B.heat);
  }
  function doUpgrade(S, fid, i, x) { const d = S.d[i]; S.f[fid].money -= upgradeCost(S, i, x); d.l = d.b.map((_, j) => pointLvl(d, j)); d.l[x] = pointLvl(d, x) + 1; }
  function build(S, fid, i, k) {
    const e = spend(S, fid, 0) || canBuild(S, fid, i, k); if (e) return fail(e); // стройка стоит только денег
    doBuild(S, fid, i, k);
    return { ok: true, msg: D.BUILDS[k].name + ': ' + D.DISTRICTS[i].name + '. +' + fm(pointInc(fid, k, i)) + ' в месяц' };
  }
  // что выгоднее всего построить или улучшить в этих районах: доход на вложенный доллар, польза точки сверху
  function bestInvest(S, fid, ids, budget, sloppy) {
    const opts = [], have = {};
    owned(S, fid).forEach(i => S.d[i].b.forEach(k => { have[k] = (have[k] || 0) + 1; }));
    ids.forEach(i => {
      const d = S.d[i];
      Object.keys(D.BUILDS).forEach(k => {
        const c = buildCost(S, k, fid); if (!c || c > budget || canBuild(S, fid, i, k)) return;
        const B = D.BUILDS[k];
        // разнообразие: такая же точка в этом районе почти не нужна, а одинаковые по всей империи — всё менее выгодны
        const mix = (d.b.includes(k) ? 0.25 : 1) / (1 + (have[k] || 0) / 3);
        opts.push({ v: (pointInc(fid, k, i) + (B.fx || B.rec || B.def ? 2 : 0)) / c * (B.need ? 1.2 : 1) * mix, i, k, c });
      });
      d.b.forEach((k, x) => { if (pointLvl(d, x) >= MAX_LVL || upgradeLock(S, pointLvl(d, x))) return; const c = upgradeCost(S, i, x); if (c > budget) return; opts.push({ v: (pointInc(fid, k, i) + (D.BUILDS[k].fx ? 1 : 0)) / c, i, x, c }); });
    });
    opts.sort((a, b) => b.v - a.v);
    return opts.length ? opts[sloppy ? Math.floor(rnd(S) * Math.min(3, opts.length)) : 0] : null;
  }
  // Бригадиры сами ставят смотрящих из резерва, но строить и улучшать точки может только глава.
  // Каждый месяц бригадир предлагает одно вложение в своём округе — глава ставит его одной кнопкой или отказывает.
  function capoWork(S, fid) {
    const p = S.f[fid]; p.props = [];
    crew(S, fid).filter(c => c.pos === 'capo' && c.st === 'ok').forEach(cp => {
      const ids = owned(S, fid).filter(i => D.DISTRICTS[i].ok === cp.ok); if (!ids.length) return;
      const free = ids.filter(i => !watcherOf(S, fid, i, true)).sort((a, b) => D.DISTRICTS[b].inc - D.DISTRICTS[a].inc);
      const bench = crew(S, fid).filter(c => !c.pos && c.st === 'ok' && !c.leg).sort((a, b) => (b.str + b.loy * cp.wit / 5) - (a.str + a.loy * cp.wit / 5));
      if (free.length && bench.length > 1) { const w = bench[0]; w.pos = 'watch'; w.ok = watchKey(free[0]); log(S, 'Бригадир ' + cname(cp) + ' поставил смотрящим на ' + D.DISTRICTS[free[0]].name + ' ' + cname(w) + '.', '', fid); }
      const b = bestInvest(S, fid, ids, Math.max(0, p.money) * 0.6, cp.wit < 5); if (!b) return;
      p.props.push({ cid: cp.id, i: b.i, k: b.k || null, x: b.x == null ? null : b.x, c: b.c });
    });
  }
  // опыт людей семьи: копится на должности и в боях, тратится на рост
  const XP_NEED = lv => 5 + lv * 3, LV_MAX = 6;
  const addXp = (c, v) => { if (c) c.xp = (c.xp || 0) + v; };
  const trainCost = (S, c) => Math.round(8 * (c.lv || 1) * era(S));
  const trainLock = (S, fid, c) => { const lv = c.lv || 1; return c.st !== 'ok' ? 'вне строя' : lv >= LV_MAX ? 'выше расти некуда' : (c.xp || 0) < XP_NEED(lv) ? 'опыта ' + (c.xp || 0) + ' из ' + XP_NEED(lv) : S.f[fid].money < trainCost(S, c) ? 'не хватает денег' : null; };
  function train(S, fid, id, stat) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    const p = S.f[fid], c = crew(S, fid).find(x => x.id === +id); if (!c) return fail('Нет такого человека');
    if (!['str', 'wit', 'loy'].includes(stat)) return fail('Что качать?');
    const l = trainLock(S, fid, c); if (l) return fail('Рано: ' + l);
    if (c[stat] >= 10) return fail('Уже максимум');
    const cost = trainCost(S, c), lv = c.lv || 1;
    p.money -= cost; c.xp -= XP_NEED(lv); c.lv = lv + 1; c[stat]++;
    const nm = { str: 'сила', wit: 'ум', loy: 'верность' }[stat];
    log(S, cname(c) + ' вырос: ' + nm + ' ' + c[stat] + ', уровень ' + c.lv + '.', 'good', fid);
    return { ok: true, msg: cname(c) + ': ' + nm + ' +1, теперь уровень ' + c.lv + '. Отдано ' + fm(cost) };
  }
  // предложение бригадира: поставить точку или улучшить (снимается, когда сделано или устарело)
  function propose(S, fid, n, yes) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    const p = S.f[fid], o = (p.props || [])[+n]; if (!o) return fail('Предложение устарело');
    p.props.splice(+n, 1);
    const cp = crew(S, fid).find(c => c.id === o.cid);
    if (!yes) return { ok: true, msg: 'Отказал' + (cp ? ' «' + cp.nick + '»' : '') + '. Пусть думает дальше' };
    return o.k ? build(S, fid, o.i, o.k) : upgrade(S, fid, o.i, o.x);
  }
  // «Путь наверх»: задание выполнено — награду забирают кнопкой
  function questDone(S, fid, q) {
    const p = S.f[fid], cr = crew(S, fid), has = pos => cr.some(c => c.pos === pos);
    switch (q.id) {
      case 'right': case 'capo': case 'cons': case 'treas': case 'lawyer': return has(q.id);
      case 'arms': return p.guns >= 5;
      case 'grow': return count(S, fid) >= 2;
      case 'build': return owned(S, fid).some(i => S.d[i].b.length);
      case 'law': return Object.keys(p.off || {}).some(k => p.off[k] > 0);
      case 'big': return Object.keys(p.proj || {}).some(k => (p.proj[k].stage || 0) > 0);
    }
    return false;
  }
  const questNow = (S, fid) => { const p = S.f[fid]; return p.human && (p.quest || 0) < D.QUESTS.length ? D.QUESTS[p.quest || 0] : null; };
  function quest(S, fid, skip) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    const p = S.f[fid], q = questNow(S, fid); if (!q) return fail('Заданий больше нет');
    if (skip) { p.quest = D.QUESTS.length; return { ok: true, msg: 'Дед Хасан пожал плечами: дальше сам.' }; }
    if (!questDone(S, fid, q)) return fail('Ещё не сделано: ' + q.how.charAt(0).toLowerCase() + q.how.slice(1));
    const m = Math.round(q.$ * era(S)); p.money += m; addRep(S, fid, q.rep); p.quest = (p.quest || 0) + 1; if (p.quest >= D.QUESTS.length) { if (!p.flags) p.flags = {}; p.flags.tutor = true; }
    log(S, 'Дед Хасан доволен: «' + q.title + '». +' + fm(m) + ', авторитет +' + q.rep + '.', 'good', fid);
    return { ok: true, msg: 'Задание «' + q.title + '» выполнено: +' + fm(m) + ', авторитет +' + q.rep };
  }
  // «Тихий пенсионер»: с 2000 года можно выйти из игры с белыми деньгами и чистым досье
  const retireLock = (S, fid) => { const p = S.f[fid], w = cash(p).white; return date(S.turn).year < 2000 ? 'с 2000 года' : w < 1500 ? 'нужно белого нала ' + fm(1500) + ', есть ' + fm(w) : p.heat >= 20 ? 'розыск должен быть ниже 20' : null; };
  function retire(S, fid) {
    const e = spend(S, fid, 0) || retireLock(S, fid); if (e) return fail(e);
    const p = S.f[fid], w = cash(p).white, score = scoreOf(S, fid);
    owned(S, fid).forEach(i => { S.d[i].o = null; S.d[i].ent = false; });
    p.alive = false; p.men = 0;
    p.over = { type: 'end', title: 'Тихий пенсионер', text: 'Ты раздал районы, закрыл точки и перевёл ' + fm(w) + ' белыми на счета в трёх банках. Теперь у тебя дача под Звенигородом, внуки по выходным и ни одной строчки в оперативных сводках. Соседи думают, что ты бывший директор завода. Иногда ты и сам в это веришь.', score, stats: { money: Math.round(p.money), districts: 0, rep: Math.round(p.rep), conn: conn(S, fid), white: 100 } };
    log(S, fdef(fid).name + ': глава отошёл от дел. Районы отошли местным.', 'big');
    checkDone(S);
    return { ok: true, msg: 'Ты отошёл от дел.' };
  }
  const statusLock = (S, fid, X) => { const p = S.f[fid]; return has(S, fid, X.id) ? 'уже есть' : date(S.turn).year < X.from ? 'с ' + X.from + ' года' : X.needConn && conn(S, fid) < X.needConn ? 'нужны связи: ' + X.needConn : usdOf(p) < X.cost ? 'нужно ' + fu(X.cost) + ' долларами' : p.money < X.cost ? 'не хватает денег' : null; };
  // обменник: купить доллары за рубли или продать, сумма в тыс. $ по среднему курсу; спред и наценка за объём — см. fxQuote
  function exchange(S, fid, dir, amt) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    const p = S.f[fid], c = cur(p); amt = Math.floor(+amt);
    if (!(amt > 0)) return fail('Сколько менять?');
    if (dir === 'buy') {
      if (amt > c.rub) return fail('Рублей только на ' + fm(c.rub));
      const q = fxQuote(S, fid, 'buy', amt); if (q.get < 1) return fail('Слишком мало: на такую сумму доллара не дадут');
      p.money -= q.fee; p.usd = c.usd + q.get; p.fxb = { t: S.turn, v: fxBought(S, fid) + amt };
      return { ok: true, msg: 'Купили ' + fu(q.get) + ', будка взяла ' + fm(q.fee) + ' (' + q.pct + '%)' };
    }
    if (dir === 'sell') {
      if (amt > c.usd) return fail('Долларов только ' + fu(c.usd));
      const q = fxQuote(S, fid, 'sell', amt); p.money -= q.fee; p.usd = c.usd - amt;
      return { ok: true, msg: 'Продали ' + fu(amt) + ', на руки ' + fm(q.get) };
    }
    return fail('Купить или продать?');
  }
  function setUsd(S, fid, k) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    const p = S.f[fid]; k = [0, 0.5, 0.8].includes(+k) ? +k : 0; p.usdK = k;
    if (!k) { p.usd = 0; return { ok: true, msg: 'Всё держим в рублях.' }; }
    const c = cur(p), want = Math.max(0, p.money) * k;
    if (want > c.usd + 1) return exchange(S, fid, 'buy', Math.min(c.rub, Math.round(want - c.usd)));
    p.usd = Math.min(c.usd, want);
    return { ok: true, msg: 'Держим ' + k * 100 + '% кассы в долларах.' };
  }
  // ---------- личное главы: элитные машины и именное оружие ----------
  const eliteHas = (S, fid, id) => !!(S.f[fid].elite || {})[id];
  const eliteFx = (S, fid, key) => { const e = S.f[fid].elite || {}; return (D.ELITE || []).reduce((a, X) => a + (e[X.id] ? (X[key] === true ? 1 : X[key] || 0) : 0), 0); };
  const eliteLock = (S, fid, X) => eliteHas(S, fid, X.id) ? 'уже есть' : date(S.turn).year < X.from ? 'с ' + X.from + ' года' : usdOf(S.f[fid]) < X.cost ? 'нужно ' + fu(X.cost) + ' долларами' : null;
  function buyElite(S, fid, id) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    const X = (D.ELITE || []).find(x => x.id === id); if (!X) return fail('Нет такого');
    const l = eliteLock(S, fid, X); if (l) return fail(l);
    const p = S.f[fid]; payUsd(p, X.cost); if (!p.elite) p.elite = {}; p.elite[id] = S.turn;
    if (X.rep) addRep(S, fid, X.rep);
    log(S, 'Куплено лично: ' + X.name + '. ' + X.perk + '.', 'good', fid);
    return { ok: true, msg: X.name + ' теперь твой. ' + X.perk };
  }
  // ---------- мелкие дела по России и СНГ ----------
  const jobGain = (S, J) => { const g = 1 + Math.max(0, date(S.turn).year - J.from) * 0.06; return [Math.round(J.gain[0] * g), Math.round(J.gain[1] * g)]; };
  const jobCost = (S, J) => Math.round(J.cost * (1 + Math.max(0, date(S.turn).year - J.from) * 0.06));
  const jobOdds = (S, fid, J) => Math.round(clamp(55 + (S.f[fid].rep - J.rep) / 2 + (S.f[fid].men - J.men) * 0.3 + talkBonus(S, fid) / 2, 20, 92));
  function jobLock(S, fid, J) {
    const p = S.f[fid], c = jobCost(S, J), last = (p.jobs || {})[J.id];
    if (date(S.turn).year < J.from) return 'с ' + J.from + ' года';
    if (last != null && S.turn - last < J.wait) return 'снова — ' + date(last + J.wait).label;
    if (p.rep < J.rep) return 'нужен авторитет ' + J.rep;
    if (p.men < J.men) return 'нужно бойцов ' + J.men;
    if (p.money < c) return 'нужно ' + fm(c);
    if (p.ap < 1) return 'нет ходов';
    return null;
  }
  function job(S, fid, id) {
    const e = spend(S, fid, 1); if (e) return fail(e);
    const J = (D.JOBS || []).find(x => x.id === id); if (!J) return fail('Нет такого дела');
    const l = jobLock(S, fid, J); if (l) return fail(l);
    const p = S.f[fid], c = jobCost(S, J), g = jobGain(S, J);
    p.ap--; p.money -= c; if (!p.jobs) p.jobs = {}; p.jobs[J.id] = S.turn;
    if (rnd(S) * 100 < jobOdds(S, fid, J)) {
      const m = ri(S, g[0], g[1]); p.money += m; if (J.usd) p.usd = cur(p).usd + m;
      addHeat(S, fid, J.heat); addRep(S, fid, J.repWin || 1); if (J.cars) addCar(p, J.id === 'vlad' ? 'lc100' : 'audi', J.cars);
      log(S, J.name + ' (' + J.where + '): +' + (J.usd ? fu(m) : fm(m)) + '.', 'good', fid);
      return { ok: true, msg: J.name + ': +' + (J.usd ? fu(m) : fm(m)) + (J.cars ? ', машин в гараж: ' + J.cars : '') };
    }
    const lost = Math.min(p.men, ri(S, 1, Math.max(2, Math.round(J.men / 3)))); p.men -= lost; addHeat(S, fid, J.heat + 3); addRep(S, fid, -2);
    log(S, J.name + ' (' + J.where + ') сорвалось: местные встретили. Потеряно бойцов: ' + lost + '.', 'bad', fid);
    return { ok: true, msg: 'Сорвалось. Деньги на дорогу пропали, потеряно бойцов: ' + lost, win: false };
  }
  // капитал: касса, бизнес по оценке (пять лет нынешнего дохода) и купленное статусное и личное
  const capital = (S, fid) => { const p = S.f[fid]; return Math.round(Math.max(0, p.money) + Math.max(0, income(S, fid).total) * 60 + D.STATUS.reduce((a, X) => a + (has(S, fid, X.id) ? X.cost : 0), 0) + (D.ELITE || []).reduce((a, X) => a + (eliteHas(S, fid, X.id) ? X.cost : 0), 0)); };
  function buyStatus(S, fid, id) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    const X = D.STATUS.find(x => x.id === id); if (!X) return fail('Нет такого');
    const l = statusLock(S, fid, X); if (l) return fail(l);
    const p = S.f[fid], nu = needUsd(p, X.cost); if (nu) return fail(nu);
    payUsd(p, X.cost); if (!p.status) p.status = {}; p.status[id] = true;
    if (X.rep) addRep(S, fid, X.rep);
    if (id === 'church') (p.crew || []).forEach(c => { c.loy = Math.min(10, c.loy + 1); });
    log(S, 'Куплено: ' + X.name + '. ' + X.perk + '.', 'good', fid);
    return { ok: true, msg: 'Куплено: ' + X.name + '. ' + X.perk };
  }
  // машины ломаются: сломанная не возит бойцов, пока её не починят; автосервисы берегут парк
  const repairCost = (S, fid, k) => Math.max(2, Math.round(D.CARS[k].price * 0.3 * (1 - fxp(S, fid, 'car')) * priceK(S, fid)));
  // продают дешевле, чем покупают, с учётом скидок автосервисов: перепродажа никогда не в плюс
  const carSale = (S, fid, k, broken) => Math.max(1, Math.floor(carCost(S, fid, k) * (broken ? 0.15 : 0.5)));
  function carWear(S, fid) {
    const p = S.f[fid]; if (!p.garage) return; syncKit(p); if (!p.broken) p.broken = {};
    const kk = 1 - fxp(S, fid, 'car') * 0.8, out = [];
    Object.keys(p.garage).forEach(k => {
      const n = p.garage[k] || 0; let b = 0;
      for (let j = 0; j < n; j++) if (rnd(S) < 0.035 * (D.CARS[k].wear || 1) * kk) b++;
      if (b) { p.garage[k] -= b; p.cars -= b; p.broken[k] = (p.broken[k] || 0) + b; out.push(D.CARS[k].name + (b > 1 ? ' ×' + b : '')); }
    });
    if (out.length) log(S, 'Сломались машины: ' + out.join(', ') + '. Стоят в гараже: починить или продать.', 'bad', fid);
  }
  function repairCar(S, fid, k) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    const p = S.f[fid]; if (!D.CARS[k] || !(p.broken || {})[k]) return fail('Чинить нечего');
    const c = repairCost(S, fid, k); if (p.money < c) return fail('Не хватает денег: нужно ' + fm(c));
    p.money -= c; p.broken[k]--; addCar(p, k, 1);
    return { ok: true, msg: D.CARS[k].name + ' снова на ходу. Ремонт: ' + fm(c) };
  }
  // все сломанные разом: починить (сколько хватит денег, начиная с дешёвого ремонта) или сдать на металлолом
  const brokenList = p => Object.keys(p.broken || {}).filter(k => p.broken[k] > 0 && D.CARS[k]);
  const repairAllCost = (S, fid) => { const p = S.f[fid]; return brokenList(p).reduce((a, k) => a + repairCost(S, fid, k) * p.broken[k], 0); };
  const scrapAllValue = (S, fid) => { const p = S.f[fid]; return brokenList(p).reduce((a, k) => a + carSale(S, fid, k, true) * p.broken[k], 0); };
  function repairAll(S, fid) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    const p = S.f[fid], ks = brokenList(p).sort((a, b) => repairCost(S, fid, a) - repairCost(S, fid, b));
    if (!ks.length) return fail('Чинить нечего');
    let n = 0, c = 0;
    ks.forEach(k => { while (p.broken[k] > 0 && p.money >= repairCost(S, fid, k)) { const v = repairCost(S, fid, k); p.money -= v; c += v; p.broken[k]--; addCar(p, k, 1); n++; } });
    if (!n) return fail('Не хватает денег даже на один ремонт');
    const left = brokenList(p).reduce((a, k) => a + p.broken[k], 0);
    return { ok: true, msg: 'Починено машин: ' + n + ' за ' + fm(c) + (left ? ' На остальные ' + left + ' не хватило денег' : '') };
  }
  function scrapAll(S, fid) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    const p = S.f[fid], ks = brokenList(p); if (!ks.length) return fail('Сломанных нет');
    let n = 0, v = 0; ks.forEach(k => { n += p.broken[k]; v += carSale(S, fid, k, true) * p.broken[k]; p.broken[k] = 0; });
    p.money += v;
    return { ok: true, msg: 'На металлолом ушло машин: ' + n + '. Выручка +' + fm(v) };
  }
  function sellCar(S, fid, k, broken) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    const p = S.f[fid]; if (!D.CARS[k]) return fail('Нет такой машины');
    if (broken) { if (!(p.broken || {})[k]) return fail('Сломанных нет'); p.broken[k]--; }
    else { syncKit(p); if (!(p.garage[k] > 0)) return fail('Таких нет'); p.garage[k]--; p.cars--; }
    const v = carSale(S, fid, k, broken); p.money += v;
    return { ok: true, msg: D.CARS[k].name + (broken ? ' ушла на запчасти' : ' продана') + ': +' + fm(v) };
  }
  // улучшения привязаны ко времени: II уровень — с 1994-го (павильоны, ремонт по-европейски), III — с 1999-го (сети, торговые центры)
  const LVL_FROM = { 2: 1994, 3: 1999 };
  const upgradeLock = (S, lv) => { const y = LVL_FROM[lv + 1]; return y && date(S.turn).year < y ? 'до ' + ['', 'I', 'II', 'III'][lv + 1] + ' — с ' + y + ' года' : null; };
  function upgrade(S, fid, i, x) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    const d = S.d[i], p = S.f[fid];
    if (!d || d.o !== fid) return fail('Район не твой');
    const k = d.b[x]; if (!k) return fail('Нет такой точки');
    const lv = pointLvl(d, x); if (lv >= MAX_LVL) return fail('Улучшать больше некуда');
    const ul = upgradeLock(S, lv); if (ul) return fail('Улучшение доступно с ' + LVL_FROM[lv + 1] + ' года');
    const c = upgradeCost(S, i, x);
    if (p.money < c) return fail('Не хватает денег: нужно ' + fm(c));
    doUpgrade(S, fid, i, x);
    const B = D.BUILDS[k];
    return { ok: true, msg: (B.lv ? B.lv[lv - 1] + ' → ' + B.lv[lv] : B.name + ' улучшен') + ': ' + D.DISTRICTS[i].name + '. Теперь +' + fm(pointInc(fid, k, i) * (lv + 1)) + ' в месяц' };
  }
  function assign(S, fid, id, pos, ok) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    const c = crew(S, fid).find(x => x.id === id);
    if (!c) return fail('Нет такого человека');
    if (c.st !== 'ok') return fail('Человек вне строя');
    if (!D.POSTS[pos]) return fail('Нет такой должности');
    if (pos === 'watch') {
      const i = typeof ok === 'string' && ok.charAt(0) === 'd' ? +ok.slice(1) : NaN;
      if (!S.d[i] || S.d[i].o !== fid) return fail('Этот район не твой');
      crew(S, fid).forEach(x => { if (x !== c && x.pos === 'watch' && x.ok === ok) { x.pos = null; x.ok = null; } });
    } else if (pos === 'capo') {
      if (!D.OKRUGS[ok] || !owned(S, fid).some(i => D.DISTRICTS[i].ok === ok)) return fail('В этом округе у тебя нет районов');
      const others = crew(S, fid).filter(x => x !== c && x.pos === 'capo' && x.ok !== ok);
      if (others.length >= capoMax(S, fid)) return fail('Больше бригадиров не прокормить: нужно больше районов');
      crew(S, fid).forEach(x => { if (x !== c && x.pos === 'capo' && x.ok === ok) { x.pos = null; x.ok = null; } });
    } else crew(S, fid).forEach(x => { if (x !== c && x.pos === pos) { x.pos = null; x.ok = null; } });
    c.pos = pos; c.ok = pos === 'capo' || pos === 'watch' ? ok : null;
    return { ok: true, msg: cname(c) + ' теперь ' + D.POSTS[pos].name.toLowerCase() + (pos === 'capo' ? ': ' + D.OKRUGS[ok].short : pos === 'watch' ? ': ' + D.DISTRICTS[watchDist(c)].name : '') };
  }
  // перестановка по схеме: человек встаёт на должность; если там кто-то был, а у переставляемого была своя
  // должность — меняются местами. Без должности (pos пустой) — снять в резерв
  function place(S, fid, id, pos, ok) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    const cr = crew(S, fid), c = cr.find(x => x.id === +id); if (!c) return fail('Нет такого человека');
    if (c.st !== 'ok') return fail('Человек вне строя');
    if (!pos) { if (!c.pos) return fail('Он и так в резерве'); c.pos = null; c.ok = null; return { ok: true, msg: cname(c) + ' снят в резерв' }; }
    if (c.pos === pos && (c.ok || null) === (ok || null)) return fail('Он уже здесь');
    const from = { pos: c.pos, ok: c.ok }, keyed = pos === 'capo' || pos === 'watch';
    const holder = cr.find(x => x !== c && x.pos === pos && (!keyed || x.ok === ok));
    const r = assign(S, fid, c.id, pos, ok); if (!r.ok) return r;
    if (holder && from.pos && holder.st === 'ok') { const r2 = assign(S, fid, holder.id, from.pos, from.ok); if (r2.ok) return { ok: true, msg: cname(c) + ' и ' + cname(holder) + ' поменялись местами' }; }
    return r;
  }
  // выдвинуть бойца в семью: раз в месяц, стоит денег и одного рядового
  const promoteCost = S => Math.round(12 * era(S));
  function promote(S, fid) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    const p = S.f[fid], c = promoteCost(S);
    if (p.promoTurn === S.turn) return fail('В этом месяце уже выдвигали человека');
    if (p.men < 6) return fail('Нужно хотя бы 6 бойцов');
    if (p.money < c) return fail('Нужно ' + fm(c));
    if (crew(S, fid).length >= 14 + count(S, fid)) return fail('Семья и так большая');
    p.money -= c; p.men -= 1; p.promoTurn = S.turn;
    const x = genPerson(S, fid); log(S, 'Из рядовых выдвинулся ' + cname(x) + ': ' + x.bio.charAt(0).toLowerCase() + x.bio.slice(1) + '.', 'good', fid);
    return { ok: true, msg: cname(x) + ' теперь в семье' };
  }
  function unassign(S, fid, id) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    const c = crew(S, fid).find(x => x.id === id); if (!c) return fail('Нет такого человека');
    c.pos = null; c.ok = null;
    return { ok: true, msg: cname(c) + ' ушёл в резерв' };
  }
  function dismiss(S, fid, id) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    const p = S.f[fid], c = crew(S, fid).find(x => x.id === id); if (!c) return fail('Нет такого человека');
    p.crew = p.crew.filter(x => x !== c); p.men += 1;
    if (c.loy <= 3 && rnd(S) < 0.3) { addHeat(S, fid, 6); log(S, cname(c) + ' обиделся и пошёл к операм. Розыск +6.', 'bad', fid); return { ok: true, msg: cname(c) + ' ушёл со злобой и заговорил с операми', win: false }; }
    return { ok: true, msg: cname(c) + ' разжалован в рядовые' + (c.pos ? ': должность ' + D.POSTS[c.pos].name.toLowerCase() + ' свободна' : '') };
  }
  const kidnapOdds = (S, fid) => Math.round(clamp(0.55 + S.f[fid].rep / 400 + fxp(S, fid, 'kid'), 0, 0.9) * 100);
  function kidnap(S, fid, i) {
    const e = spend(S, fid, 1); if (e) return fail(e);
    const p = S.f[fid];
    if (i == null || i === '') i = owned(S, fid)[0];
    if (!S.d[i] || S.d[i].o !== fid) return fail('Район не твой');
    if (p.kidnapTurn === S.turn) return fail('В этом месяце уже было похищение. Город на ушах');
    if (p.men < 4) return fail('Нужно 4 бойца');
    p.ap--; p.kidnapTurn = S.turn;
    if (rnd(S) < clamp(0.55 + p.rep / 400 + fxp(S, fid, 'kid'), 0, 0.9)) {
      const m = Math.round(rr(S, 20, 50) * era(S)); p.money += m; addHeat(S, fid, 7); addRep(S, fid, 1);
      log(S, 'Похищение коммерсанта: семья заплатила ' + m, 'good', fid);
      return { ok: true, msg: 'Семья заплатила выкуп: ' + fm(m) };
    }
    const l = Math.min(p.men, ri(S, 1, 3)); p.men -= l; addHeat(S, fid, 11); addRep(S, fid, -2);
    log(S, 'Похищение сорвалось. Задержаны: ' + l, 'bad', fid);
    return { ok: true, msg: 'Засада на передаче денег. Потеряно бойцов: ' + l, win: false };
  }
  function raidOdds(S, fid, i) {
    const e = D.DISTRICTS[i].ent, p = S.f[fid];
    return clamp(50 + (p.men - e.men) * 0.8 + (conn(S, fid) - e.conn) * 8 + p.rep / 5, 10, 95);
  }
  function raid(S, fid, i) {
    const er = spend(S, fid, 2); if (er) return fail(er === 'Ходы на этот месяц кончились' ? 'Захват предприятия требует 2 хода' : er);
    const dd = D.DISTRICTS[i], d = S.d[i], p = S.f[fid];
    if (!dd || !dd.ent || d.o !== fid) return fail('Предприятие должно стоять на твоём районе');
    const e = dd.ent;
    if (d.ent) return fail('Предприятие уже твоё');
    if (p.men < e.men) return fail('Нужно бойцов: ' + e.men);
    if (conn(S, fid) < e.conn) return fail('Нужны люди во власти. Связи: ' + e.conn + ', у тебя ' + conn(S, fid));
    if (p.money < e.cost) return fail('На суды, реестр и нотариусов нужно ' + e.cost);
    p.ap -= 2; p.money -= e.cost;
    if (rnd(S) * 100 < raidOdds(S, fid, i)) {
      d.ent = true; addRep(S, fid, 6); addHeat(S, fid, 6);
      log(S, 'Захвачено предприятие: ' + e.name + '. Бойцы заняли проходную, суд признал нового собственника.', 'big', fid);
      return { ok: true, msg: e.name + ' под тобой. +' + e.inc + ' в месяц' };
    }
    const l = Math.min(p.men, ri(S, 3, 8)); p.men -= l; addHeat(S, fid, 12); addRep(S, fid, -4);
    log(S, 'Захват «' + e.name + '» сорван: директор вызвал ОМОН. Потери: ' + l, 'bad', fid);
    return { ok: true, msg: 'Захват сорвался. Деньги ушли, бойцов потеряно: ' + l, win: false };
  }
  function hire(S, fid, k) {
    const e = spend(S, fid, 1); if (e) return fail(e);
    const O = D.OFFICIALS[k], p = S.f[fid]; if (!O) return fail('Нет такого человека');
    const c = officialCost(S, fid, k);
    if (date(S.turn).year < O.from) return fail('Доступно с ' + O.from + ' года');
    if (p.off[k] >= D.OFFICIAL_MAX) return fail('Больше таких людей не купить');
    if (p.money < c) return fail('Не хватает денег: нужно ' + fm(c));
    p.money -= c; p.off[k]++; p.ap--;
    return { ok: true, msg: O.name + ' теперь получает у тебя зарплату' };
  }
  const bribeCost = (S, fid) => Math.round((15 + lawLevel(S.f[fid].heat) * 20) * era(S) * lawK(S) * wealthK(S.f[fid]) * (1 - consBonus(S, fid) / 100));
  function bribe(S, fid) {
    const e = spend(S, fid, 1); if (e) return fail(e);
    const p = S.f[fid], c = bribeCost(S, fid);
    if (p.heat < 5) return fail('К тебе и так нет вопросов');
    if (p.money < c) return fail('Не хватает денег: нужно ' + fm(c));
    p.money -= c; p.ap--; addHeat(S, fid, -12);
    return { ok: true, msg: 'Конверт дошёл. Розыск −12' };
  }
  const truceCost = (S, other) => Math.round(15 + power(S.f[other]) / 3);
  // ---------- переговоры с лидерами ----------
  // Отношения с каждой бригадой ботов: от −100 (вражда) до 100 (дружба). Дружба от 50 — боты не нападают,
  // вражда от −50 — нападают охотнее. Каждый месяц отношения остывают к нулю на десятую часть.
  const rel = (S, fid, other) => Math.round(((S.f[fid].rel || {})[other]) || 0);
  const addRel = (S, fid, other, v) => { const p = S.f[fid]; p.rel = p.rel || {}; p.rel[other] = clamp((p.rel[other] || 0) + v, -100, 100); };
  const talkBonus = (S, fid) => fx(S, fid, 'talk') + consBonus(S, fid) + carTalk(S, fid) + (S.f[fid].human ? eliteFx(S, fid, 'talk') : 0);
  const truceOdds = (S, fid, other) => clamp(45 + S.f[fid].rep / 2 + (power(S.f[fid]) > power(S.f[other]) ? 15 : -10) + talkBonus(S, fid) + rel(S, fid, other) / 4, 10, 95);
  const giftCost = S => Math.round(15 * era(S));
  const dealCost = S => Math.round(30 * era(S));
  const dealOdds = (S, fid, other) => clamp(60 + rel(S, fid, other) / 2 + talkBonus(S, fid) / 2, 10, 95);
  const buyPrice = (S, fid, i) => Math.round((districtDef(S, i) * 3 + D.DISTRICTS[i].inc * 12) * (1 - rel(S, fid, S.d[i].o) / 300));
  const buyOdds = (S, fid, other) => clamp(30 + rel(S, fid, other) / 2 + (power(S.f[fid]) > power(S.f[other]) ? 15 : -10) + talkBonus(S, fid) / 2 - count(S, other) * 0.5, 5, 90);
  const tributeOk = (S, fid, other) => power(S.f[fid]) > power(S.f[other]) * 1.3;
  const tributeOdds = (S, fid, other) => clamp(25 + (power(S.f[fid]) / Math.max(1, power(S.f[other])) - 1.3) * 60 + S.f[fid].rep / 4, 5, 85);
  const tributeSum = (S, other) => Math.round(count(S, other) * 6 * era(S) + 10);
  // ---------- убийство главаря ОПГ ----------
  // Без главаря бригада теряет часть районов (кроме родного) — их забирает местная шпана — и четверть бойцов.
  function beheadGang(S, fid, share) {
    const f = S.f[fid], own = owned(S, fid).filter(i => !isHome(S, fid, i)), k = Math.min(own.length, Math.max(1, Math.round(count(S, fid) * share))), lost = [];
    for (let j = 0; j < k && own.length; j++) { const x = own.splice(Math.floor(rnd(S) * own.length), 1)[0]; S.d[x].o = null; S.d[x].ent = false; lost.push(D.DISTRICTS[x].name); }
    f.men = Math.max(0, Math.round(f.men * 0.75));
    if (f.human) crew(S, fid).forEach(c => { if (c.pos === 'watch' && S.d[watchDist(c)].o !== fid) { c.pos = null; c.ok = null; } });
    return lost;
  }
  const hitCost = (S, other) => Math.round((40 + count(S, other) * 4) * era(S));
  const hitOdds = (S, fid, other) => Math.round(clamp(22 + S.f[fid].rep / 3 + (power(S.f[fid]) / Math.max(1, power(S.f[other])) - 1) * 12 + conn(S, fid) - count(S, other) * 0.6, 5, 60));
  const hitLock = (S, fid, other) => { const p = S.f[fid], last = (p.hitT || {})[other]; return last != null && S.turn - last < 12 ? 'на них уже покушались, снова — ' + date(last + 12).label : p.men < 6 ? 'нужно 6 бойцов' : p.money < hitCost(S, other) ? 'нужно ' + fm(hitCost(S, other)) : null; };
  function parleyCheck(S, fid, other) {
    const p = S.f[fid], f = S.f[other];
    if (!f || !f.alive || other === fid) return 'Не с кем договариваться';
    if (f.human) return 'С живым игроком договаривайся сам';
    if ((p.talked || {})[other] === S.turn) return 'С ними уже встречались в этом месяце';
    return null;
  }
  // kind: truce — мир на год, gift — подарок, deal — совместное дело, buy — купить район (arg — номер), tribute — потребовать дань
  function parley(S, fid, other, kind, arg) {
    const e = spend(S, fid, 1) || parleyCheck(S, fid, other); if (e) return fail(e);
    const p = S.f[fid], nm = fdef(other).name, boss = fdef(other).boss, m = era(S);
    const meet = () => { p.ap--; p.talked = p.talked || {}; p.talked[other] = S.turn; };
    if (kind === 'truce') {
      if (inTruce(S, fid, other)) return fail('Перемирие уже действует');
      const c = truceCost(S, other); if (p.money < c) return fail('На стол и подарки нужно ' + fm(c));
      meet(); p.money -= c;
      if (rnd(S) * 100 < truceOdds(S, fid, other)) { p.truce[other] = S.turn + 12; addRel(S, fid, other, 15); if (p.war) delete p.war[other]; log(S, 'Стрелка с ' + boss + ' (' + nm + '): мир на год.', 'good', fid); return { ok: true, msg: boss + ' пожал руку. Год друг друга не трогаете' }; }
      addRep(S, fid, -1); addRel(S, fid, other, -5);
      return { ok: true, msg: boss + ' не согласился. Считает, что ты слаб', win: false };
    }
    if (kind === 'gift') {
      const c = giftCost(S); if (p.money < c) return fail('На подарок нужно ' + fm(c));
      meet(); p.money -= c; addRel(S, fid, other, 20);
      return { ok: true, msg: boss + ' принял подарок. Отношения +20' };
    }
    if (kind === 'deal') {
      const c = dealCost(S); if (p.money < c) return fail('Твоя доля в деле: ' + c);
      if (rel(S, fid, other) < -20) return fail('С врагами дел не ведут');
      meet(); p.money -= c;
      if (rnd(S) * 100 < dealOdds(S, fid, other)) { const amt = Math.round(c * 1.8); p.later.push({ t: S.turn + ri(S, 3, 6), amt, why: 'Дело с ' + boss }); addRel(S, fid, other, 10); return { ok: true, msg: 'Вложился с ' + boss + '. Через несколько месяцев вернётся ' + amt }; }
      addRel(S, fid, other, -15); log(S, boss + ' кинул тебя на совместном деле: −' + fm(c) + '.', 'bad', fid);
      return { ok: true, msg: boss + ' кинул. Деньги пропали', win: false };
    }
    if (kind === 'buy') {
      const i = +arg; if (!S.d[i] || S.d[i].o !== other) return fail('Это не их район');
      if (!attackable(S, fid, i)) return fail('Купить можно только район, который граничит с твоими');
      if (isHome(S, other, i)) return fail('Родной район не продают');
      const c = buyPrice(S, fid, i); if (p.money < c) return fail('За ' + D.DISTRICTS[i].name + ' просят ' + fm(c));
      meet();
      if (rnd(S) * 100 < buyOdds(S, fid, other)) {
        p.money -= c; S.d[i].o = fid; S.d[i].ent = false; addRel(S, fid, other, -5); addRep(S, fid, 1);
        log(S, 'Выкупил ' + D.DISTRICTS[i].name + ' у бригады ' + nm + ' за ' + c + '.', 'good', fid);
        if (count(S, other) === 0) eliminate(S, other);
        return { ok: true, msg: D.DISTRICTS[i].name + ' теперь твой. Отдано ' + c };
      }
      addRel(S, fid, other, -5);
      return { ok: true, msg: boss + ': «Свою землю не продаём»', win: false };
    }
    if (kind === 'hit') {
      const l = hitLock(S, fid, other); if (l) return fail(l);
      meet(); p.money -= hitCost(S, other); p.hitT = p.hitT || {}; p.hitT[other] = S.turn; startWar(S, fid, other);
      p.rel = p.rel || {}; p.rel[other] = -100;
      if (rnd(S) * 100 < hitOdds(S, fid, other)) {
        const lost = beheadGang(S, other, 0.3); addHeat(S, fid, 15); addRep(S, fid, 4);
        log(S, 'Убит ' + boss + ', главарь бригады ' + nm + '. Без него бригада трещит: районы ' + (lost.join(', ') || '—') + ' отошли местной шпане.', 'big');
        if (count(S, other) === 0) eliminate(S, other);
        return { ok: true, msg: boss + ' убит. ' + nm + ' потеряли районов: ' + lost.length + '. Розыск +15, авторитет +4' };
      }
      const l2 = Math.min(p.men, ri(S, 2, 5)); p.men -= l2; addHeat(S, fid, 10); addRep(S, fid, -2);
      // промах: они знают, кто заказал, и едут мстить
      const tgt = owned(S, fid).filter(i => GEO.adj[i].some(j => S.d[j].o === other));
      if (tgt.length && S.f[other].alive) { const i = tgt[Math.floor(rnd(S) * tgt.length)], f = S.f[other], men = strike(f, 0.65); p.assaults = (p.assaults || []).filter(x => x.i !== i); p.assaults.push({ att: other, i, men, a: Math.round(power(f) * men / Math.max(1, f.men) * 1.15), t: S.turn + 1 }); }
      log(S, 'Покушение на ' + boss + ' сорвалось. Киллеры потеряны: ' + l2 + '. ' + nm + ' знают, кто заказал.', 'bad', fid);
      return { ok: true, msg: 'Сорвалось: ' + boss + ' жив, потеряно бойцов ' + l2 + '. Жди ответа', win: false };
    }
    if (kind === 'tribute') {
      if (!tributeOk(S, fid, other)) return fail('Дань требуют, только когда ты заметно сильнее');
      meet();
      if (rnd(S) * 100 < tributeOdds(S, fid, other)) { const v = tributeSum(S, other); p.money += v; addRel(S, fid, other, -30); addRep(S, fid, 3); log(S, nm + ' заплатили тебе дань: +' + fm(v) + '.', 'good', fid); return { ok: true, msg: boss + ' заплатил ' + fm(v) + '. Но запомнил' }; }
      addRel(S, fid, other, -45); addRep(S, fid, -2); log(S, boss + ' отказался платить дань и объявил тебе войну.', 'bad', fid);
      return { ok: true, msg: boss + ' послал тебя. Теперь между вами вражда', win: false };
    }
    return fail('Нет такого разговора');
  }
  const truce = (S, fid, other) => parley(S, fid, other, 'truce');

  // крупный бизнес
  function projStatus(S, fid, pr) {
    const p = S.f[fid], st = p.proj[pr.id] || { stage: 0 }, y = date(S.turn).year;
    if (st.dead) return { st, lock: 'Закрыто навсегда' };
    if (st.stage === 3) return { st, lock: null };
    if (y < pr.from) return { st, lock: 'Откроется в ' + pr.from + ' году' };
    if (p.rep < pr.rep) return { st, lock: 'Нужен авторитет: ' + pr.rep };
    if (st.last === S.turn) return { st, lock: 'Следующий шаг в новом месяце' };
    return { st, lock: null };
  }
  function negChances(S, fid) {
    const p = S.f[fid];
    const t = fx(S, fid, 'talk') + consBonus(S, fid) + carTalk(S, fid) + eliteFx(S, fid, 'talk') + (has(S, fid, 'yacht') ? 5 : 0);
    return { share: clamp(55 + p.rep * 0.4 + t, 0, 95), bribe: clamp(65 + conn(S, fid) * 4 + t, 0, 97), force: clamp(25 + power(p) / 4, 0, 75) };
  }
  // Доллары нужны для крупного: крупные дела и статусные покупки берут только $ (рубли там не принимают).
  // Остальное (бойцы, стволы, точки, взятки) — сначала рублями, потом долларами.
  const usdOf = p => cur(p).usd;
  const needUsd = (p, c) => usdOf(p) < c ? 'Нужно ' + fu(c) + ' долларами (есть ' + fu(usdOf(p)) + '). Поменяй рубли в обменнике' : null;
  function payUsd(p, c) { const u = usdOf(p); p.money -= c; p.usd = Math.max(0, u - c); }
  function projStep(S, fid, id, how) {
    const e = spend(S, fid, 1); if (e) return fail(e);
    const pr = D.PROJECTS.find(x => x.id === id); if (!pr) return fail('Нет такого бизнеса');
    const ps = projStatus(S, fid, pr), p = S.f[fid];
    if (ps.lock) return fail(ps.lock);
    const st = p.proj[id] = p.proj[id] || { stage: 0 };
    if (st.stage === 0) {
      const trip = has(S, fid, 'jet') ? 0 : pr.trip;
      const nu = needUsd(p, trip); if (nu) return fail(nu);
      payUsd(p, trip); st.stage = 1; st.last = S.turn; p.ap--;
      return { ok: true, msg: 'Ты слетал в ' + pr.where + '. Встреча назначена: ' + pr.who };
    }
    if (st.stage === 1) {
      const ch = negChances(S, fid); let c = 0;
      if (!ch[how]) return fail('Выбери, как вести разговор');
      if (how === 'bribe') { c = Math.round(pr.buy * 0.2); const nu = needUsd(p, c); if (nu) return fail(nu); }
      p.ap--; st.last = S.turn; if (c) payUsd(p, c);
      if (how === 'force') addHeat(S, fid, 6);
      if (rnd(S) * 100 < ch[how]) { st.stage = 2; st.mult = how === 'share' ? 0.75 : 1; addRep(S, fid, 1); return { ok: true, msg: 'Договорились. Осталось внести деньги: ' + pr.buyLabel.toLowerCase() }; }
      st.stage = 0; addRep(S, fid, -2);
      let msg = 'Не договорились. Придётся искать новый выход и лететь снова';
      if (how === 'force') { const l = Math.min(p.men, ri(S, 2, 5)); p.men -= l; msg = 'Разговор кончился стрельбой. Потеряно бойцов: ' + l; }
      return { ok: true, msg, win: false };
    }
    if (st.stage === 2) {
      const nu = needUsd(p, pr.buy); if (nu) return fail(nu);
      payUsd(p, pr.buy); st.stage = 3; st.age = 0; st.last = S.turn; p.ap--; addRep(S, fid, pr.kind === 'w' ? 4 : 3);
      log(S, 'Запущен бизнес: ' + pr.name + '. +' + fu(projIncome(S, fid, pr)) + ' в месяц.', 'big', fid);
      return { ok: true, msg: pr.name + ': дело пошло. +' + fu(projIncome(S, fid, pr)) + ' в месяц' };
    }
    return fail('Бизнес уже работает');
  }
  function cashOut(S, fid) {
    const e = spend(S, fid, 1); if (e) return fail(e);
    const p = S.f[fid], st = p.proj.pyramid; if (!st || st.stage !== 3) return fail('Пирамиды нет');
    const pr = D.PROJECTS.find(x => x.id === 'pyramid'), m = projIncome(S, fid, pr) * 2;
    p.money += m; p.usd = cur(p).usd + m; p.proj.pyramid = { stage: 0, dead: true }; p.ap--; addRep(S, fid, -5); addHeat(S, fid, 8);
    log(S, 'Ты закрыл пирамиду и вывез кассу: ' + fu(m) + '. Вкладчики остались у дверей.', 'big', fid);
    return { ok: true, msg: 'Касса вывезена: +' + fu(m) };
  }

  // ---------- события ----------
  // Событие месяца. who — в событии участвует человек из семьи ({who} в тексте), once — бывает один раз,
  // legend — легенда, которая может прийти в семью (не выпадает, если уже пришла), needCars — нужна тачка
  function pickEvent(S, fid) {
    const p = S.f[fid], dt = date(S.turn), live = crew(S, fid).filter(c => c.st === 'ok');
    const holders = r => r === true ? live : live.filter(c => c.pos === r);
    p.evWho = null; p.queue = []; if (!p.once) p.once = [];
    let ev = EVENTS.find(e => e.date && e.date[0] === dt.year && e.date[1] === dt.month);
    if (!ev) {
      const fits = e => !e.date && !e.extra && !(e.pal && p.lastPal != null && S.turn - p.lastPal < 8) && (!e.from || dt.year >= e.from) && (!e.to || dt.year <= e.to) && (!e.who || holders(e.who).length) && (!e.needCars || p.cars > 0) && !(e.once && p.once.includes(e.id)) && !(e.legend && crew(S, fid).some(c => c.leg === e.legend));
      let pool = EVENTS.filter(e => fits(e) && !p.recent.includes(e.id));
      const adv = pool.filter(e => e.advice);
      if (adv.length && rnd(S) < 0.35) pool = adv;
      if (!pool.length) pool = EVENTS.filter(fits);
      ev = pool[Math.floor(rnd(S) * pool.length)];
      p.recent.push(ev.id); if (p.recent.length > 24) p.recent.shift();
    }
    if (ev.who && holders(ev.who).length) { const h = holders(ev.who); p.evWho = h[Math.floor(rnd(S) * h.length)].id; }
    if (ev.pal) p.lastPal = S.turn;
    p.event = ev.id;
    pickExtra(S, fid);
  }
  // Внеочередные события сверх события месяца: власть приходит за деньгами, на своих людей всплывает компромат.
  // Идут по очереди после события месяца.
  function pickExtra(S, fid) {
    const p = S.f[fid], dt = date(S.turn), live = crew(S, fid).filter(c => c.st === 'ok');
    const holders = r => r === 'post' ? live.filter(c => c.pos) : r === true ? live : live.filter(c => c.pos === r);
    const fits = e => (!e.from || dt.year >= e.from) && (!e.to || dt.year <= e.to) && (!e.who || holders(e.who).length) && (!e.needCars || p.cars > 0) && !p.recent.includes(e.id);
    const add = kind => {
      const pool = EVENTS.filter(e => e.extra === kind && fits(e)); if (!pool.length) return;
      const ev = pool[Math.floor(rnd(S) * pool.length)];
      let who = null;
      if (ev.who) { const h = holders(ev.who), wt = h.map(c => 12 - c.loy); let r = rnd(S) * wt.reduce((a, b) => a + b, 0); who = h.find((c, k) => (r -= wt[k]) < 0) || h[0]; } // ненадёжных подозревают чаще
      p.queue.push({ id: ev.id, who: who ? who.id : null }); p.recent.push(ev.id); if (p.recent.length > 24) p.recent.shift();
    };
    if (S.turn > 0 && rnd(S) < 0.12 + p.heat / 250 + Math.min(0.15, count(S, fid) * 0.01)) add('law');
    if (S.turn > 2 && rnd(S) < (live.some(c => c.pos && c.loy <= 4) ? 0.22 : 0.1)) add('crew');
  }
  const currentEvent = (S, fid) => S.f[fid].event ? EVENTS.find(e => e.id === S.f[fid].event) : null;
  const evWho = (S, fid) => S.f[fid].evWho != null ? crew(S, fid).find(c => c.id === S.f[fid].evWho) || null : null;
  function evText(S, fid, s) { if (!s || s.indexOf('{who}') < 0) return s; const w = evWho(S, fid); return s.split('{who}').join(w ? cname(w) : 'твой человек'); }
  function optState(S, fid, o) {
    const p = S.f[fid], m = era(S), cost = o.$ < 0 ? Math.round(-o.$ * m) : 0;
    if (cost > Math.max(0, p.money)) return { cost, lock: 'Нужно ' + fm(cost) };
    if (o.needConn && conn(S, fid) < o.needConn) return { cost, lock: 'Нужны связи: ' + o.needConn };
    if (o.needMen && p.men < o.needMen) return { cost, lock: 'Нужно бойцов: ' + o.needMen };
    if (o.needCars && p.cars < o.needCars) return { cost, lock: 'Нужна тачка' };
    return { cost, lock: null };
  }
  // легенда эпохи приходит в семью
  function addLegend(S, fid, key) {
    const L = D.LEGENDS[key], p = S.f[fid];
    if (!L || !p.crew || p.crew.some(c => c.leg === key)) return null;
    const c = { id: p.nid++, name: L.name, nick: L.nick, age: L.age, bio: L.bio, str: L.str, wit: L.wit, loy: L.loy, pos: null, ok: null, st: 'ok', until: 0, since: S.turn, leg: key };
    p.crew.push(c); return c;
  }
  const LATER_IN = 6; // «потом» в событиях — ровно через полгода
  function choose(S, fid, k) {
    const p = S.f[fid]; if (!p || !p.human || p.over || S.done) return fail('Игра окончена');
    const ev = currentEvent(S, fid); if (!ev) return fail('Нет события');
    const o = ev.opts[k]; if (!o) return fail('Нет такого варианта');
    const os = optState(S, fid, o); if (os.lock) return fail(os.lock);
    const m = era(S);
    if (os.cost) p.money -= os.cost; // цена варианта платится всегда
    let res = o;
    // совет от своего: чем умнее советчик, тем реже совет выходит боком
    // компромат (guilt): чем вернее человек, тем вероятнее, что его подставили
    const wa = evWho(S, fid), altP = !o.alt ? 0 : o.guilt ? (wa ? clamp((wa.loy - 3) / 10, 0.05, 0.7) : 0.3) : o.alt.p * (o.trust && wa ? clamp((11 - wa.wit) / 6, 0.3, 1.5) : 1);
    if (o.alt && rnd(S) < altP) res = Object.assign({ $: 0 }, o.alt);
    const dl = {};
    const gain = (res.$ > 0 ? Math.round(res.$ * m) : 0) + (res.get ? Math.round(res.get * m) : 0); p.money += gain; dl.money = gain - os.cost;
    if (res.rep) { addRep(S, fid, res.rep); dl.rep = res.rep; }
    if (res.heat) { addHeat(S, fid, res.heat); dl.heat = res.heat; }
    if (res.men) { const v = Math.max(-p.men, res.men); p.men += v; dl.men = v; }
    if (res.guns) { p.guns = Math.max(0, p.guns + res.guns); dl.guns = res.guns; }
    if (res.cars) { const v = Math.max(-p.cars, res.cars); p.cars += v; dl.cars = v; }
    if (res.arm) { addArms(p, res.arm[0], res.arm[1]); dl.guns = (dl.guns || 0) + res.arm[1]; dl.arm = D.ARMS[res.arm[0]].name + ' ×' + res.arm[1]; }
    if (res.car) { addCar(p, res.car, 1); dl.cars = (dl.cars || 0) + 1; dl.car = D.CARS[res.car].name; }
    if (res.vests) { const v = Math.max(-(p.vests || 0), res.vests); p.vests = (p.vests || 0) + v; dl.vests = v; }
    if (res.later) { const amt = Math.round(res.later * m); p.later.push({ t: S.turn + LATER_IN, amt, why: ev.title }); dl.later = amt; dl.laterAt = date(S.turn + LATER_IN).label; }
    const title = evText(S, fid, ev.title), r = evText(S, fid, res.r), w = evWho(S, fid);
    if (w) {
      if (res.wloy) { w.loy = clamp(w.loy + res.wloy, 1, 10); dl.loy = res.wloy; }
      if (res.wstr) { w.str = clamp(w.str + res.wstr, 1, 10); dl.str = res.wstr; }
      if (res.wwit) { w.wit = clamp(w.wit + res.wwit, 1, 10); dl.wit = res.wwit; }
      if (res.demote && !res.wfate) { w.pos = null; w.ok = null; dl.demote = cname(w); }
      if (res.exec && res.wfate === 'dead') { if (!p.flags) p.flags = {}; p.flags.exec = true; if (res !== o) p.flags.framed = true; }
      if (res.wfate === 'leave') { p.crew = p.crew.filter(x => x !== w); dl.gone = cname(w); }
      else if (res.wfate === 'frame') { p.crew = p.crew.filter(x => x !== w); p.dead.unshift({ n: cname(w), pos: w.pos, t: S.turn, how: 'уехал на зону: подбросили наркоту', gone: true }); if (p.dead.length > 12) p.dead.length = 12; dl.gone = cname(w); }
      else if (res.wfate === 'ranks') { p.crew = p.crew.filter(x => x !== w); p.men += 1; dl.gone = cname(w); }
      else if (res.wfate) { fate(S, fid, w, res.wfate, res.exec ? 'казнён по приговору бригады' : title.charAt(0).toLowerCase() + title.slice(1)); if (res.wfate === 'dead') dl.dead = cname(w); }
    }
    if (res.truce) { const nb = D.FACTIONS.filter(f => !S.f[f.id].human && S.f[f.id].alive && !inTruce(S, fid, f.id) && owned(S, f.id).some(i => GEO.adj[i].some(j => S.d[j].o === fid))); if (nb.length) { const f = nb[Math.floor(rnd(S) * nb.length)]; p.truce[f.id] = S.turn + res.truce; addRel(S, fid, f.id, 10); dl.truce = f.name; } }
    if (res.relAll) { D.FACTIONS.forEach(f => { if (f.id !== fid && !S.f[f.id].human) addRel(S, fid, f.id, res.relAll); }); dl.rel = res.relAll; }
    if (res.join) { const c = addLegend(S, fid, res.join); if (c) { dl.join = cname(c); log(S, 'В семье новый человек: ' + cname(c) + '. ' + c.bio + '.', 'big', fid); } }
    if (ev.once) p.once.push(ev.id);
    p.event = null; p.evWho = null;
    log(S, title + ': ' + r, '', fid);
    // следующее внеочередное событие, если его человек ещё на месте
    while (p.queue && p.queue.length && !p.event) { const q = p.queue.shift(), qe = EVENTS.find(e => e.id === q.id); if (qe && (!qe.who || crew(S, fid).some(c => c.id === q.who && c.st === 'ok' && (qe.who === 'post' ? c.pos : c.pos === qe.who)))) { p.event = q.id; p.evWho = q.who; } }
    return { ok: true, msg: r, delta: dl, title, event: true, who: w ? w.id : null };
  }

  // ---------- конец месяца ----------
  function lawPressure(S, fid) {
    const p = S.f[fid], L = lawLevel(p.heat); if (!L) return;
    if (p.heat >= 100) {
      const c = Math.round(300 * era(S));
      if (conn(S, fid) >= 8 && p.money >= c) { p.money -= c; p.heat = 70; addRep(S, fid, -5); log(S, 'ФСБ пришла за тобой лично. Свои люди наверху развалили дело за ' + c + '.', 'big', fid); return; }
      owned(S, fid).forEach(i => { S.d[i].o = null; S.d[i].ent = false; });
      eliminate(S, fid, { type: 'jail', title: 'СИЗО «Лефортово»', text: 'Тебя взяли на рассвете. Спецназ ФСБ, наручники, камеры телевидения. Наверху не нашлось никого, кто снял бы трубку. Бригаду поделили за неделю.' });
      return;
    }
    if (rnd(S) > (0.1 + 0.05 * L) * lawK(S)) return;
    const who = D.LAW[L].name;
    let n = L === 1 ? ri(S, 1, 2) : L === 2 ? ri(S, 2, 5) : L === 3 ? Math.max(4, Math.round(p.men * rr(S, 0.1, 0.15))) : Math.max(8, Math.round(p.men * rr(S, 0.18, 0.25)));
    n = Math.min(Math.round(n * (1 - fxp(S, fid, 'hide')) * (has(S, fid, 'mansion') ? 0.75 : 1)), p.men); if (!n) return;
    let jail = 0, dead = 0, free = 0; const pk = 0.12 + 0.04 * L, lwit = lawyerWit(S, fid), pf = clamp(0.3 + conn(S, fid) * 0.03 + lwit * 0.03, 0, 0.85);
    for (let i = 0; i < n; i++) { const x = rnd(S); if (x < pk) dead++; else if (x < pk + pf) free++; else jail++; }
    p.men -= jail + dead;
    if (jail) p.jail.push({ n: jail, t: S.turn + Math.max(6, Math.round(ri(S, 12, 36) * (1 - lwit * 0.04))) });
    const rep = clamp(Math.ceil(free / 2) - dead - Math.floor(jail / 4), -6, 4);
    addRep(S, fid, rep);
    let s = who + ': задержано ' + n + '. ';
    if (jail) s += 'Сели: ' + jail + '. '; if (dead) s += 'Убиты при задержании: ' + dead + '. '; if (free) s += 'Отпущены: ' + free + '. ';
    const blk = cash(p).black;
    if (L >= 3 && blk > 0) { const fr = Math.round(blk * (L === 3 ? 0.15 : 0.3) * (1 - lwit * 0.05)); p.money -= fr; s += 'Изъят чёрный нал: −' + fm(fr) + '. Белые деньги на счетах не тронули. '; }
    if (L === 4 && rnd(S) < 0.3) {
      const act = D.PROJECTS.filter(pr => (p.proj[pr.id] || {}).stage === 3);
      if (act.length) { const pr = act[Math.floor(rnd(S) * act.length)]; p.proj[pr.id] = { stage: 0 }; s += 'Изъят бизнес: ' + pr.name + '. '; }
    }
    s += 'Авторитет ' + (rep >= 0 ? '+' : '') + rep + '.';
    log(S, s, 'law', fid); p.report.law = s;
    // под облаву может попасть и кто-то из семьи
    const live = p.crew.filter(c => c.st === 'ok');
    if (L >= 2 && live.length && rnd(S) < 0.08 * L) { const c = live[Math.floor(rnd(S) * live.length)]; if (L >= 3 && rnd(S) < 0.15 * armorK(p)) fate(S, fid, c, 'dead', 'застрелен при задержании'); else fate(S, fid, c, 'jail', D.LAW[L].name); }
  }

  function humanPhase(S, fid) {
    const p = S.f[fid], before = p.money;
    p.report = { money: 0, law: null, lost: [] };
    const inc = income(S, fid), w0 = cash(p).white; p.lastInc = inc.total;
    const u0 = cur(p).usd;
    p.money += inc.total; p.clean = w0 + Math.max(0, inc.white); p.clean = cash(p).white; p.usd = u0 + Math.max(0, inc.usd || 0); p.usd = cur(p).usd;
    // рубли дешевеют вслед за курсом доллара (автообмена нет: менять — в обменнике)
    { const r = cur(p).rub, loss = r > 0 ? Math.round(r * inflation(S)) : 0; if (loss) { p.money -= loss; p.report.infl = loss; } }
    p.usdK = 0;
    p.later = p.later.filter(l => { if (l.t <= S.turn) { p.money += l.amt; if (l.amt >= 0) log(S, 'Вернулись вложения («' + l.why + '»): +' + l.amt, 'good', fid); else log(S, 'Пришли за долгом («' + l.why + '»): ' + l.amt, 'bad', fid); return false; } return true; });
    if (p.money < 0) { const l = Math.max(1, Math.round(p.men * 0.1)); p.men = Math.max(0, p.men - l); addRep(S, fid, -2); log(S, 'Общак пуст, платить нечем. Ушли бойцы: ' + l, 'bad', fid); }
    D.PROJECTS.forEach(pr => {
      const st = p.proj[pr.id]; if (!st || st.stage !== 3) return;
      st.age++; if (pr.guns) addArms(p, 'aks', pr.guns); if (pr.cars) addCar(p, pr.carK || 'audi', pr.cars); if (pr.repTurn) addRep(S, fid, pr.repTurn);
      if (pr.pyramid && st.age >= 8 && rnd(S) < 0.05 + 0.02 * (st.age - 8)) { p.proj[pr.id] = { stage: 0, dead: true }; addHeat(S, fid, 25); addRep(S, fid, -15); log(S, 'Пирамида рухнула. Толпа вкладчиков громит офис, прокуратура возбудила дело.', 'bad', fid); }
    });
    // авторитет остывает, если его не подкреплять; выше потолка (потерял районы, связи) падает быстро
    if (p.rep > 15) p.rep -= p.rep * 0.02;
    { const cap = repCap(S, fid); if (p.rep > cap) p.rep -= Math.max(1, (p.rep - cap) * 0.3); }
    Object.keys(p.rel || {}).forEach(k => { p.rel[k] = Math.round(p.rel[k] * 0.9); });
    p.heat = clamp(p.heat + heatDelta(S, fid), 0, has(S, fid, 'duma') ? 79 : 100);
    if (has(S, fid, 'yacht') && !p.yachtUsed && p.heat >= 80) { p.heat = 40; p.yachtUsed = true; log(S, 'Розыск дошёл до 80. Ты ушёл на яхте в нейтральные воды и переждал: розыск упал до 40. Второй раз так не выйдет.', 'big', fid); }
    lawPressure(S, fid);
    if (!p.over) { crewPhase(S, fid); capoWork(S, fid); carWear(S, fid); }
    p.clean = cash(p).white;
    p.jail = p.jail.filter(j => { if (j.t <= S.turn) { if (!p.over) p.men += j.n; addRep(S, fid, 1); log(S, 'Откинулись с зоны: ' + j.n + '. Вернулись в бригаду.', 'good', fid); return false; } return true; });
    p.report.money = Math.round(p.money - before);
  }

  function aiTurn(S, fid) {
    const f = S.f[fid]; if (!f.alive) return;
    // в онлайне за свободные группировки играют самые сложные боты; защита живых игроков — по выбранной сложности
    const n = count(S, fid), X = S.online ? DIFF.hard : dif(S);
    // большой бригаде люди даются труднее: после 15 районов каждый следующий даёт втрое меньше
    // отстающие от лидера-человека растут быстрее: город не любит одного хозяина
    const lag = Math.max(0, ...active(S).map(h => count(S, h))) > n * 1.5 ? 1.4 : 1;
    f.acc += (1 + Math.min(n, 15) * 0.3 + Math.max(0, n - 15) * 0.1) * X.grow * lag; const add = Math.floor(f.acc); f.acc -= add;
    f.men = Math.min(menCap(S, fid), f.men + add);
    f.money += n * 3 * (1 + S.turn / 90);
    // бригадиры ботов тоже вкладываются в точки: треть кассы идёт на стройку, точки приносят доход
    const own = owned(S, fid);
    own.forEach(i => S.d[i].b.forEach((b, x) => { f.money += pointInc(fid, b, i) * pointLvl(S.d[i], x); }));
    for (let k = 0; k < 2; k++) { const b = bestInvest(S, fid, own, f.money * 0.35, true); if (!b) break; if (b.k) doBuild(S, fid, b.i, b.k); else doUpgrade(S, fid, b.i, b.x); }
    if (f.cars > 2 && rnd(S) < 0.3) f.cars--; // машины изнашиваются и у ботов
    while (f.money >= 15 && f.guns < f.men) { f.money -= 15; f.guns += 5; }
    while (f.money >= 12 && f.cars * 4 < f.men) { f.money -= 12; f.cars++; }
    f.rep = clamp(10 + n * 2, 0, 100);
    // чем больше бригада, тем чаще ею занимаются силовики
    if (rnd(S) < (0.05 + Math.min(0.15, n * 0.004)) * lawK(S)) { const l = Math.round(f.men * rr(S, 0.12, 0.22)); f.men -= l; f.guns = Math.max(0, f.guns - Math.floor(l / 2)); if (l > 6) log(S, 'Силовики накрыли бригаду ' + fdef(fid).name + ': минус ' + l + ' бойцов.'); }
    // раскол: разросшуюся бригаду рвут изнутри, часть районов уходит местным
    if (n >= 18 && rnd(S) < 0.03 + (n - 18) * 0.002) {
      const own = owned(S, fid).filter(i => !isHome(S, fid, i)), k = Math.ceil(n * rr(S, 0.12, 0.2));
      for (let j = 0; j < k && own.length; j++) { const x = own.splice(Math.floor(rnd(S) * own.length), 1)[0]; S.d[x].o = null; S.d[x].ent = false; }
      f.men = Math.round(f.men * 0.85);
      log(S, 'Раскол у бригады ' + fdef(fid).name + ': бригадиры не поделили деньги, ' + k + ' районов отошли местным.', 'big');
      return;
    }
    // война с живым игроком: каждый месяц наезд на самый слабый пограничный район, даже без перевеса
    active(S).forEach(h => {
      const P0 = S.f[h]; if (!atWar(S, h, fid) || inTruce(S, h, fid) || P0.over) return;
      if ((P0.assaults || []).some(x => x.att === fid)) return;
      const tg = owned(S, h).filter(i => GEO.adj[i].some(j => S.d[j].o === fid)).sort((a, b) => districtDef(S, a) * (isHome(S, h, a) ? 2 : 1) - districtDef(S, b) * (isHome(S, h, b) ? 2 : 1));
      if (!tg.length || f.men < 4) return;
      const men = strike(f, 0.8); P0.assaults = (P0.assaults || []).filter(x => x.i !== tg[0]);
      P0.assaults.push({ att: fid, i: tg[0], men, a: Math.round(power(f) * men / Math.max(1, f.men) * rr(S, 0.9, 1.2)), t: S.turn + 1, war: true });
    });
    // Живой игрок обычно растёт быстрее ботов, поэтому против лидера боты сбиваются в стаю: нападают чаще,
    // соседние бригады подкидывают людей, а враги (отношения −50 и ниже) лезут даже без перевеса — налётом.
    const top = Math.max(0, ...active(S).map(h => count(S, h))), lead = top > n * 1.5;
    let tries = 1 + (n > 8 ? 1 : 0) + (top > 25 ? 1 : 0) + (lead && top > 12 ? 1 : 0);
    const chance = (lead ? 0.6 : 0.25) * X.aggr * clamp(16 / (n + 4), 0.45, 1);
    while (tries-- > 0) {
      if (rnd(S) > chance) continue;
      const homeOk = D.DISTRICTS.find(d => d.name === fdef(fid).home).ok;
      const cand = new Set(); owned(S, fid).forEach(i => GEO.adj[i].forEach(j => { if (S.d[j].o !== fid) cand.add(j); }));
      let best = -1, bv = 1e9;
      cand.forEach(j => {
        const o = S.d[j].o, hum = o && S.f[o].human;
        if (hum && (S.turn - (S.t0 || 0) < X.grace || inTruce(S, o, fid) || (S.hits[o] || 0) >= X.hits || rel(S, o, fid) >= 50 || S.f[o].over)) return;
        const big = hum && count(S, o) > n * 1.5, foe = hum && rel(S, o, fid) <= -50;
        const v = districtDef(S, j) * (D.DISTRICTS[j].ok === homeOk ? 0.8 : 1) * (big ? 0.55 : 1) * (foe ? 0.6 : 1) * (hum && isHome(S, o, j) ? 1.6 : 1) * (0.85 + rnd(S) * 0.3);
        if (v < bv) { bv = v; best = j; }
      });
      if (best < 0) continue;
      const bo = S.d[best].o, hum = bo && S.f[bo].human, men = strike(f, 0.65);
      let a = power(f) * men / Math.max(1, f.men);
      if (hum && count(S, bo) > n * 1.5) { // стая: самый сильный сосед-бот у этого района подкидывает треть своих
        let ally = 0; GEO.adj[best].forEach(j => { const o = S.d[j].o; if (o && o !== fid && o !== bo && !S.f[o].human && S.f[o].alive) ally = Math.max(ally, power(S.f[o]) * 0.35); });
        a += ally;
      }
      const foe = hum && rel(S, bo, fid) <= -50, need = hum ? X.ratio * (count(S, bo) > n * 1.5 ? 0.85 : 1) * (foe ? 0.9 : 1) : 1.2;
      const raid = hum && a < districtDef(S, best) * need && (foe ? 0.35 : lead ? 0.15 : 0) > rnd(S);
      if (a < districtDef(S, best) * need && !raid) continue;
      if (hum && S.f[bo].alive && !S.f[bo].over) {
        // на район живого игрока: наезд встаёт в очередь, в начале месяца игрок решает — вступить в бой, откупиться или сдать
        const P0 = S.f[bo]; P0.assaults = (P0.assaults || []).filter(x => x.i !== best);
        P0.assaults.push({ att: fid, i: best, men, a: Math.round(a * rr(S, 0.85, 1.15)), t: S.turn + 1, raid });
        S.hits[bo] = (S.hits[bo] || 0) + 1; continue;
      }
      const r = fight(S, fid, best, 0.65);
      if (!hum && r.win && r.prev) log(S, fdef(fid).name + ' забрали ' + D.DISTRICTS[best].name + ' у бригады ' + fdef(r.prev).name + '.');
    }
  }

  // Покушения ботов: враждующие бригады изредка заказывают главарей друг друга, а лидера-человека — если он всех обогнал
  function aiHits(S) {
    const bots = D.FACTIONS.map(f => f.id).filter(id => S.f[id].alive && !S.f[id].human), X = S.online ? DIFF.hard : dif(S);
    bots.forEach(a => {
      if (rnd(S) > 0.012 * X.aggr) return;
      const pool = D.FACTIONS.map(f => f.id).filter(b => b !== a && S.f[b].alive && !S.f[b].over && count(S, b) > 1);
      if (!pool.length) return;
      const b = pool[Math.floor(rnd(S) * pool.length)], B = S.f[b];
      if (B.human) {
        if (S.turn - (S.t0 || 0) < X.grace || inTruce(S, b, a) || rel(S, b, a) > -30 || (B.hitAt != null && S.turn - B.hitAt < 18)) return;
        B.hitAt = S.turn;
        if (rnd(S) < 0.45 * armorK(B)) {
          const lost = beheadGang(S, b, 0.2); addRep(S, b, -5);
          log(S, 'Покушение на тебя: заказ ' + fdef(a).name + '. Ты выжил, но пока лежал в больнице, районы ' + (lost.join(', ') || '—') + ' разбежались к местным, ушла четверть бойцов.', 'bad', b);
          if (count(S, b) === 0) eliminate(S, b);
        } else log(S, 'Покушение на тебя сорвалось: охрана заметила снайпера. Заказ ' + fdef(a).name + '.', 'bad', b);
        return;
      }
      if (rnd(S) < 0.5) { const lost = beheadGang(S, b, 0.25); log(S, 'Убит ' + fdef(b).boss + ', главарь бригады ' + fdef(b).name + '. Говорят, заказ ' + fdef(a).name + '. Районов отошло шпане: ' + lost.length + '.', 'big'); if (count(S, b) === 0) eliminate(S, b); }
    });
  }
  function scoreOf(S, fid) { const p = S.f[fid], inc = income(S, fid); return Math.round(p.money / 10 + count(S, fid) * 20 + p.rep * 5 + conn(S, fid) * 30 + inc.white * 5); }
  function finale(S, fid) {
    const p = S.f[fid], inc = income(S, fid), c = conn(S, fid), n = count(S, fid), tot = inc.white + inc.black || 1, wshare = inc.white / tot;
    const score = scoreOf(S, fid), live = id => ((p.proj || {})[id] || {}).stage === 3;
    let title, text;
    if (live('olymp') && live('seaport') && c >= 10 && p.heat < 50) { title = 'Губернатор'; text = 'Декабрь 2007-го. Олимпийские подряды, порт на Чёрном море и правильные люди в Кремле сделали своё дело: тебя назначили губернатором. На инаугурации в первом ряду сидят те, с кем ты делил районы в девяносто втором. Теперь они называют тебя по имени-отчеству.'; }
    else if (c >= 12 && wshare >= 0.5 && p.heat < 40) { title = 'Сенатор'; text = 'Декабрь 2007-го. У тебя кабинет в Совете Федерации, мигалка и неприкосновенность. Бригада называется холдингом, бойцы носят галстуки. Криминал не проиграл власти. Он ею стал.'; }
    else if (wshare >= 0.5 && p.money > 3000) { title = 'Олигарх'; text = 'Декабрь 2007-го. Ты в списке журнала о богатых людях. О девяностых в интервью говоришь коротко: «Время было такое». Половина твоих партнёров носит погоны.'; }
    else if (p.heat >= 60) { title = 'Беглец'; text = 'Декабрь 2007-го. Ты смотришь новости из России на вилле под Марбельей. Интерпол прислал запрос, адвокаты пока справляются. Домой дороги нет.'; }
    else if (n >= 15) { title = 'Смотрящий'; text = 'Декабрь 2007-го. Ты остался тем, кем был: хозяином улиц. Но улицы теперь принадлежат людям с удостоверениями, и тебе всё чаще напоминают об этом.'; }
    else { title = 'Авторитетный предприниматель'; text = 'Декабрь 2007-го. У тебя пара ресторанов, охранная фирма и место на кладбище рядом с теми, кто не дожил. Ты дожил. По меркам твоего поколения это победа.'; }
    p.over = { type: 'end', title, text, score, stats: { money: Math.round(p.money), districts: n, rep: Math.round(p.rep), conn: c, white: Math.round(wshare * 100) } };
  }
  function checkDone(S) {
    const winner = S.humans.find(h => S.f[h].over && S.f[h].over.type === 'win');
    if (winner) S.humans.forEach(h => { if (!S.f[h].over) S.f[h].over = { type: 'lost', title: 'Москва досталась другому', text: fdef(winner).name + ' взяли весь город. Тебе в нём места не осталось.' }; });
    if (!active(S).length) S.done = true;
  }

  // Онлайн: игрок отмечает, что закончил месяц. Сервер зовёт endTurn, когда готовы все.
  function setReady(S, fid, v) {
    const p = S.f[fid]; if (!p || !p.human || p.over || S.done) return fail('Игра окончена');
    if (v && p.event) return fail('Сначала реши, что делать с событием');
    if (v && p.battle) return fail('Сначала закончи перестрелку');
    p.ready = !!v;
    return { ok: true, msg: v ? 'Ждём остальных' : 'Можно ходить дальше' };
  }
  const allReady = S => active(S).length > 0 && active(S).some(h => !S.f[h].auto) && active(S).every(h => S.f[h].ready || S.f[h].auto);

  function endTurn(S, force) {
    if (S.done) return fail('Игра окончена');
    active(S).forEach(h => autoPlay(S, h));
    if (!force && active(S).some(h => S.f[h].event)) return fail('Сначала реши, что делать с событием');
    // курс следующего месяца: шум вокруг исторического, с памятью; в дефолт осенью 1998-го улица идёт за биржей
    { const nd = date(S.turn + 1), calm = nd.year === 1998 && nd.month >= 8 && nd.month <= 10; S.fxNext = calm ? 0 : clamp((S.fxn || 0) * 0.55 + rr(S, -0.07, 0.07), -0.12, 0.12); }
    active(S).forEach(h => { if (S.f[h].battle) { if (S.f[h].battle.def) defendEnd(S, h, false, 'Месяц кончился'); else finishBattle(S, h, false, 'Месяц кончился'); } (S.f[h].assaults || []).slice().forEach(x => resolveAssault(S, h, x, 'auto')); snapshot(S, h); S.f[h].event = null; S.f[h].queue = []; humanPhase(S, h); });
    S.hits = {}; S.offers = [];
    D.FACTIONS.forEach(f => { if (!S.f[f.id].human) aiTurn(S, f.id); });
    aiHits(S);
    active(S).forEach(h => { if (count(S, h) === 0) eliminate(S, h); });
    if (S.turn >= LAST_TURN) active(S).forEach(h => finale(S, h));
    checkDone(S);
    if (S.done) return { ok: true, msg: 'Игра окончена', over: true };
    S.fxLast = fxMid(S, S.turn); S.turn++; S.fxn = S.fxNext || 0; S.fxNext = 0;
    { const dt = date(S.turn); if (dt.month === 8 && dt.year === 1998) active(S).forEach(h => { const r = cur(S.f[h]).rub; log(S, 'Август 1998-го: в стране пахнет дефолтом. Если рубль рухнет, рублёвая касса (' + fm(r) + ') потеряет больше половины. Доллары — в обменнике.', 'bad', h); });
      if (dt.month === 1 && dt.year === 2000) log(S, 'Новый год, новый хозяин в Кремле. Власть закручивает гайки: розыск растёт на 35% быстрее, облавы чаще.', 'big'); if (dt.month === 1 && dt.year === 2003) log(S, 'Вертикаль достроена: розыск растёт на 60% быстрее, чем в девяностые. Пора легализоваться.', 'big'); }
    active(S).forEach(h => { const p = S.f[h], inf = inflow(S, h).total; p.pool = Math.min(pool(S, h) + inf, inf * 3); p.report.lost = p.lostNow || []; p.lostNow = null; p.ap = apMax(S, h); p.ready = false; pickEvent(S, h); });
    return { ok: true, msg: date(S.turn).label };
  }

  // Что сервер показывает игроку: без сида и без чужих секретов
  function viewFor(S, fid) {
    const V = JSON.parse(JSON.stringify(S)); delete V.seed; V.me = fid; V.offers = (S.offers || []).filter(o => o.from === fid || o.to === fid);
    S.humans.forEach(h => { if (h !== fid) { const x = S.f[h]; V.f[h] = { id: h, men: x.men, guns: x.guns, cars: x.cars, arms: x.arms, garage: x.garage, vests: x.vests, rep: x.rep, alive: x.alive, human: true, ready: x.ready, auto: !!x.auto, nick: x.nick, over: x.over ? { title: x.over.title, score: x.over.score } : null }; } });
    V.log = S.log.filter(l => !l.to || l.to === fid).slice(0, 80);
    return V;
  }

  // Запись партии для разбора: действия и решения за месяц, раз в месяц — снимок состояния (p.hist)
  function track(S, fid, name, args, evId, r) {
    const p = S.f[fid]; if (!p || !p.human) return;
    const m = p.month || (p.month = { acts: {}, ev: [] });
    m.acts[name] = (m.acts[name] || 0) + 1;
    if (name === 'choose') m.ev.push([evId, args[0], r.delta && r.delta.money || 0]);
  }
  const PALS = ['malaya', 'chernysh', 'medved', 'kosoy', 'lobster', 'pyatigor', 'bordur', 'dagir', 'ildar', 'voron'];
  const ownsName = (S, fid, name) => { const d = D.DISTRICTS.find(x => x.name === name); return !!d && S.d[d.id].o === fid; };
  const ACHC = {
    first_blood: (S, f) => count(S, f) >= 2 + (S.scen && D.SCENARIOS[S.scen].extra || 0), okrug: (S, f) => okrugsHeld(S, f).length >= 1, ten: (S, f) => count(S, f) >= 10, quarter: (S, f) => count(S, f) >= 26,
    center: (S, f) => okrugHeld(S, f, 'CAO'), kapotnya: (S, f) => ownsName(S, f, 'Капотня'), luzhniki: (S, f) => ownsName(S, f, 'Хамовники'),
    army100: (S, f, p) => p.men >= 100, armory: (S, f, p) => p.guns >= 100, rpg: (S, f, p) => (p.arms || {}).rpg > 0, merc: (S, f, p) => (p.garage || {}).merc > 0 || (p.garage || {}).w220 > 0, fleet: (S, f, p) => p.cars >= 10,
    grand: (S, f, p) => p.money >= 1000, nelokh: (S, f) => capital(S, f) >= 1e6, ten_m: (S, f, p) => p.money >= 10000, white50: (S, f) => { const i = income(S, f); return i.white > 20 && i.white >= i.black; },
    dollars: (S, f, p) => { const d = date(S.turn); return d.year === 1998 && d.month === 9 && p.money > 0 && cur(p).usd >= p.money * 0.8; }, default_survivor: (S, f, p) => { const d = date(S.turn); return d.year === 1998 && d.month >= 9 && p.money >= 1000; },
    first_point: (S, f) => owned(S, f).some(i => S.d[i].b.length), points20: (S, f) => owned(S, f).reduce((a, i) => a + S.d[i].b.length, 0) >= 20, lvl3: (S, f) => owned(S, f).some(i => S.d[i].b.some((b, x) => pointLvl(S.d[i], x) >= 3)),
    specials5: (S, f) => { const k = new Set(); owned(S, f).forEach(i => S.d[i].b.forEach(b => { if (D.BUILDS[b].need && b !== 'casino') k.add(b); })); return k.size >= 5; },
    first_deal: (S, f, p) => Object.keys(p.proj || {}).some(k => p.proj[k].stage === 3), deals5: (S, f, p) => Object.keys(p.proj || {}).filter(k => p.proj[k].stage === 3).length >= 5,
    ent: (S, f) => owned(S, f).some(i => S.d[i].ent), ent5: (S, f) => owned(S, f).filter(i => S.d[i].ent).length >= 5,
    full_circle: (S, f) => ['right', 'cons', 'treas', 'lawyer'].every(pos => post(S, f, pos)), capos3: (S, f) => crew(S, f).filter(c => c.pos === 'capo').length >= 3,
    legend: (S, f) => crew(S, f).some(c => c.leg && !PALS.includes(c.leg)), pals3: (S, f) => crew(S, f).filter(c => PALS.includes(c.leg)).length >= 3, pals7: (S, f) => crew(S, f).filter(c => PALS.includes(c.leg)).length >= 7,
    executed: (S, f, p) => !!(p.flags || {}).exec, framed: (S, f, p) => !!(p.flags || {}).framed, tutor: (S, f, p) => !!(p.flags || {}).tutor,
    off_all: (S, f, p) => Object.keys(D.OFFICIALS).every(k => (p.off || {})[k] > 0), clean: (S, f, p) => date(S.turn).year >= 1995 && S.turn - (S.t0 || 0) >= 24 && p.heat < 1 && count(S, f) >= 5,
    fsb_escape: (S, f, p) => (p.peakHeat || 0) >= 90 && p.heat < 30, duma: (S, f) => has(S, f, 'duma'), status_all: (S, f) => D.STATUS.every(X => has(S, f, X.id))
  };
  function checkAch(S, fid) {
    const p = S.f[fid]; if (!p || !p.human) return; if (!p.ach) p.ach = {};
    p.peakHeat = Math.max(p.peakHeat || 0, p.heat || 0);
    D.ACH.forEach(a => { if (!p.ach[a.id] && ACHC[a.id] && ACHC[a.id](S, fid, p)) { p.ach[a.id] = S.turn; log(S, 'Достижение: «' + a.name + '» — ' + a.desc.toLowerCase() + '.', 'good', fid); } });
  }
  function snapshot(S, fid) {
    checkAch(S, fid);
    const p = S.f[fid], m = p.month || { acts: {}, ev: [] }, own = owned(S, fid), c = cash(p);
    if (!p.hist) p.hist = [];
    p.hist.push({ t: S.turn, money: Math.round(p.money), white: c.white, inc: income(S, fid).total, men: p.men, guns: p.guns, cars: p.cars, broken: Object.keys(p.broken || {}).reduce((a, k) => a + (p.broken[k] || 0), 0),
      d: own.length, pts: own.reduce((a, i) => a + S.d[i].b.length, 0), lv: own.reduce((a, i) => a + S.d[i].b.reduce((x, b, j) => x + pointLvl(S.d[i], j), 0), 0),
      heat: Math.round(p.heat), rep: Math.round(p.rep), conn: conn(S, fid), apLeft: p.ap, crew: (p.crew || []).length, posts: (p.crew || []).filter(x => x.pos).length,
      proj: Object.keys(p.proj || {}).filter(k => p.proj[k].stage === 3), acts: m.acts, ev: m.ev });
    if (p.hist.length > 220) p.hist.shift();
    p.month = { acts: {}, ev: [] };
  }

  // ---------- свои люди: казнь и подстава ----------
  // казнить: человек погибает, бригада боится (авторитет +2), часть семьи затаит обиду; раз в месяц
  function execute(S, fid, id) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    const p = S.f[fid], c = crew(S, fid).find(x => x.id === id); if (!c) return fail('Нет такого человека');
    if (c.st === 'jail') return fail('Он сидит: до него не дотянуться');
    if (p.execTurn === S.turn) return fail('Одной казни в месяц хватит: пацаны и так напуганы');
    p.execTurn = S.turn;
    const nm = cname(c);
    fate(S, fid, c, 'dead', 'казнён по твоему приказу');
    if (!p.flags) p.flags = {}; p.flags.exec = true;
    addRep(S, fid, 2); addHeat(S, fid, 4);
    let hurt = 0; crew(S, fid).forEach(x => { if (rnd(S) < 0.25) { x.loy = Math.max(1, x.loy - 1); hurt++; } });
    log(S, nm + ' казнён. Пацаны теперь ходят тише.' + (hurt ? ' Кое-кто в семье затаил обиду: верность −1 у ' + hurt + '.' : ''), 'bad', fid);
    return { ok: true, msg: nm + ' казнён. Авторитет +2, розыск +4' + (hurt ? ', у ' + hurt + ' из семьи верность −1' : '') };
  }
  // подбросить наркоту: человека сажают надолго и он уходит из семьи без крови; стоит денег на ментов
  const frameCost = S => Math.round(8 * era(S));
  function frame(S, fid, id) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    const p = S.f[fid], c = crew(S, fid).find(x => x.id === id); if (!c) return fail('Нет такого человека');
    if (c.st === 'jail') return fail('Он уже сидит');
    if (p.frameTurn === S.turn) return fail('Операм хватит одного заказа в месяц');
    const cost = frameCost(S); if (p.money < cost) return fail('Операм нужно ' + fm(cost));
    p.money -= cost; p.frameTurn = S.turn;
    const nm = cname(c);
    p.crew = p.crew.filter(x => x !== c);
    p.dead.unshift({ n: nm, pos: c.pos, t: S.turn, how: 'уехал на зону: подбросили наркоту', gone: true }); if (p.dead.length > 12) p.dead.length = 12;
    let s2 = 'У ' + nm + ' при обыске нашли пакет. Восемь лет строгого режима, в семью он не вернётся.';
    if (c.loy <= 3 && rnd(S) < 0.5) { addHeat(S, fid, 8); s2 += ' На допросах понял, откуда пакет, и заговорил: розыск +8.'; }
    log(S, s2, 'bad', fid);
    return { ok: true, msg: nm + ' уехал на зону. Отдано операм ' + fm(cost) };
  }

  // ---------- онлайн: сделки между живыми игроками ----------
  // kind: truce — мир на x месяцев; pay — отдать x тыс.; ask — попросить x тыс.; sell — продать свой район i за x; buy — купить их район i за x
  const OFFER_KINDS = ['truce', 'pay', 'ask', 'sell', 'buy'];
  const peer = (S, fid, to) => { const f = S.f[to]; return f && f.human && f.alive && !f.over && to !== fid; };
  function offerCheck(S, o) {
    const a = S.f[o.from], b = S.f[o.to];
    if (!peer(S, o.from, o.to) || !a.alive || a.over) return 'Сделка больше невозможна';
    if (o.kind === 'truce') return inTruce(S, o.from, o.to) ? 'Перемирие уже действует' : null;
    if (o.kind === 'pay') return a.money < o.x ? 'Не хватает денег: нужно ' + fm(o.x) : null;
    if (o.kind === 'ask') return b.money < o.x ? 'Не хватает ' + fm(o.x) : null;
    const seller = o.kind === 'sell' ? o.from : o.to, buyer = o.kind === 'sell' ? o.to : o.from, d = S.d[o.i];
    if (!d || d.o !== seller) return 'Район уже не у продавца';
    if (isHome(S, seller, o.i)) return 'Родной район не продают';
    if (count(S, seller) < 2) return 'Последний район не продают';
    if (!attackable(S, buyer, o.i)) return 'Купить можно только район рядом со своими';
    if (S.f[buyer].money < o.x) return 'У покупателя не хватает денег: нужно ' + fm(o.x);
    return null;
  }
  const months = n => n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? 'месяц' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'месяца' : 'месяцев');
  const offerText = o => { const dn = o.i != null ? D.DISTRICTS[o.i].name : ''; return { truce: 'предлагает мир на ' + months(o.x), pay: 'дарит ' + fm(o.x), ask: 'просит ' + fm(o.x), sell: 'продаёт район ' + dn + ' за ' + fm(o.x), buy: 'хочет купить район ' + dn + ' за ' + fm(o.x) }[o.kind]; };
  function offer(S, fid, to, kind, x, i) {
    const p = S.f[fid]; if (!p || !p.human || p.over || S.done) return fail('Игра окончена');
    if (!peer(S, fid, to)) return fail('Сделки — только с живыми игроками');
    if (!OFFER_KINDS.includes(kind)) return fail('Нет такой сделки');
    x = Math.round(+x); if (!(x > 0 && x <= (kind === 'truce' ? 36 : 100000))) return fail(kind === 'truce' ? 'Срок от 1 до 36 месяцев' : 'Сумма должна быть больше нуля');
    S.offers = S.offers || [];
    if (S.offers.filter(o => o.from === fid).length >= 3) return fail('Не больше трёх предложений за раз');
    const o = { id: (S.oid = (S.oid || 0) + 1), from: fid, to, kind, x, i: kind === 'sell' || kind === 'buy' ? +i : null, t: S.turn };
    const why = offerCheck(S, o); if (why) return fail(why);
    S.offers.push(o);
    return { ok: true, msg: 'Предложение отправлено. Ждём ответа' };
  }
  function answer(S, fid, id, yes) {
    S.offers = S.offers || [];
    const o = S.offers.find(x => x.id === +id); if (!o) return fail('Предложение уже неактуально');
    if (o.from === fid && !yes) { S.offers = S.offers.filter(x => x !== o); return { ok: true, msg: 'Предложение отозвано' }; }
    if (o.to !== fid) return fail('Это не тебе');
    S.offers = S.offers.filter(x => x !== o);
    const A = fdef(o.from).name, B = fdef(o.to).name;
    if (!yes) { log(S, B + ' отказались. Ты ' + offerText(o).replace(/^(\S+)/, w => ({ 'предлагает': 'предлагал', 'дарит': 'дарил', 'просит': 'просил', 'продаёт': 'продавал', 'хочет': 'хотел' })[w] || w) + '.', '', o.from); return { ok: true, msg: 'Отказано' }; }
    const why = offerCheck(S, o); if (why) return fail(why);
    const a = S.f[o.from], b = S.f[o.to];
    if (o.kind === 'truce') { a.truce[o.to] = S.turn + o.x; b.truce[o.from] = S.turn + o.x; }
    else if (o.kind === 'pay') { a.money -= o.x; b.money += o.x; }
    else if (o.kind === 'ask') { b.money -= o.x; a.money += o.x; }
    else { const seller = o.kind === 'sell' ? o.from : o.to, buyer = o.kind === 'sell' ? o.to : o.from; S.f[buyer].money -= o.x; S.f[seller].money += o.x; S.d[o.i].o = buyer; S.d[o.i].ent = false; crew(S, seller).forEach(c => { if (c.pos === 'watch' && c.ok === watchKey(o.i)) { c.pos = null; c.ok = null; } }); }
    const dn = o.i != null ? D.DISTRICTS[o.i].name : '', byr = fdef(o.kind === 'sell' ? o.to : o.from).name;
    const s2 = 'Сделка ' + A + ' и ' + B + ': ' + { truce: 'мир на ' + months(o.x), pay: A + ' передали ' + fm(o.x), ask: B + ' передали ' + fm(o.x), sell: dn + ' перешёл к ' + byr + ' за ' + fm(o.x), buy: dn + ' перешёл к ' + byr + ' за ' + fm(o.x) }[o.kind] + '.';
    log(S, s2, 'good', o.from); log(S, s2, 'good', o.to);
    return { ok: true, msg: 'По рукам', deal: s2 };
  }

  // ---------- онлайн: бригаду ушедшего игрока ведёт бот ----------
  function setAuto(S, fid, v) {
    const p = S.f[fid]; if (!p || !p.human || p.over) return false;
    if (!!p.auto === !!v) return false;
    p.auto = !!v;
    log(S, v ? fdef(fid).name + ': игрок пропал, бригаду ведёт бот.' : fdef(fid).name + ': игрок вернулся и снова сам ведёт бригаду.', '');
    return true;
  }
  // бот за человека: отвечает на события, отбивается, нанимает, вооружает, ставит людей и строит; сам не нападает
  function autoPlay(S, fid) {
    const p = S.f[fid]; if (!p.auto || p.over) return;
    for (let k = 0; k < 6 && p.event; k++) { const ev = currentEvent(S, fid); if (!ev) { p.event = null; break; } const ok = ev.opts.map((o, j) => j).filter(j => !optState(S, fid, ev.opts[j]).lock); if (!ok.length) { p.event = null; break; } choose(S, fid, ok[Math.floor(rnd(S) * ok.length)]); }
    if (p.battle) { if (p.battle.def) defendEnd(S, fid, false, 'Бот отступил'); else finishBattle(S, fid, false, 'Бот отступил'); }
    (p.assaults || []).slice().forEach(x => resolveAssault(S, fid, x, 'auto'));
    p.ready = false;
    const n = Math.min(pool(S, fid), menCap(S, fid) - p.men, Math.floor(p.money * 0.3 / Math.max(1, recruitPrice(S, fid)))); if (n > 0) recruit(S, fid, n);
    const bare = p.men - p.guns; if (bare > 0) buyGuns(S, fid, 'pm', Math.min(bare, Math.floor(p.money * 0.2 / Math.max(1, gunPrice(S, fid)))));
    const bench = () => crew(S, fid).filter(c => !c.pos && c.st === 'ok');
    ['right', 'treas', 'cons', 'lawyer'].forEach(pos => { if (post(S, fid, pos)) return; const b = bench().filter(c => c.loy > 3).sort((x, y) => (pos === 'right' ? y.str - x.str : y.wit - x.wit))[0]; if (b) assign(S, fid, b.id, pos); });
    Object.keys(D.OKRUGS).forEach(ok => { if (capoOf(S, fid, ok) || !owned(S, fid).some(i => D.DISTRICTS[i].ok === ok)) return; const b = bench().sort((x, y) => y.str - x.str)[0]; if (b) assign(S, fid, b.id, 'capo', ok); });
    { const r = cur(p).rub; if (r > 5 && inflation(S) > 0.02) exchange(S, fid, 'buy', r); }
    const own = owned(S, fid), bi = own.length ? bestInvest(S, fid, own, Math.floor(p.money * 0.35), 0) : null;
    if (bi) { if (bi.k) doBuild(S, fid, bi.i, bi.k); else doUpgrade(S, fid, bi.i, bi.x); }
    p.ready = true;
  }

  const ACTIONS = { attackGo, train, propose, buyElite, job, place, repairAll, scrapAll, exchange, execute, frame, offer, answer, defend, setUsd, buyStatus, retire, quest, repairCar, sellCar, battle, parley, promote, assign, unassign, dismiss, recruit, buyGuns, buyVests, buyCar, attack, build, upgrade, kidnap, raid, hire, bribe, truce, projStep, cashOut, choose };
  Object.keys(ACTIONS).forEach(n => { const f = ACTIONS[n]; ACTIONS[n] = (S, fid, ...a) => { const evId = S.f[fid] && S.f[fid].event, r = f(S, fid, ...a); if (r && r.ok) { track(S, fid, n, a, evId, r); checkAch(S, fid); } return r; }; });
  G.Engine = { atWar, WAR_LEN, hitCost, hitOdds, hitLock, fu, gunHeat, priceK, wealthK, fxChange, fmtK, fm, fxQuote, fxBoard, fxLiq, fxBought, fxBooths, FX_SPREAD, repCap, repParts, ATK, atkLock, attackOdds, strikeMax, squad, surrOdds, XP_NEED, LV_MAX, trainCost, trainLock, eliteHas, eliteFx, eliteLock, jobGain, jobCost, jobOdds, jobLock, capital, realRub, LATER_IN, upgradeLock, LVL_FROM, repairAllCost, scrapAllValue, usdOf, kidnapOdds, rubRate, setAuto, autoPlay, offerText, offerCheck, frameCost, OFFER_KINDS, defendOdds, buyOffCost, assaultValid, checkAch, cur, inflation, exchangeFee, has, statusLock, retireLock, scoreOf, questNow, questDone, lawK, cash, repairCost, carSale, pointGood, traitNames, TACTICS, BATTLE_ROUNDS, BREAK, tacticLock, flankOdds, talkOdds, rel, giftCost, dealCost, dealOdds, buyPrice, buyOdds, tributeOk, tributeOdds, tributeSum, parleyCheck, watcherOf, watchKey, watchDist, promoteCost, DIFF, dif, isHome, migrate, armedValue, mobility, seatsOf, armCost, vestCost, carCost, carTalk, armorK, vestK, evText, evWho, addLegend, ARM_ORDER, CAR_ORDER, fx, fxp, gunPack, carPrice, crew, post, capoOf, capoMax, benchMax, cname, truceOdds, consBonus, atkMult, inflow, pool, recruitPrice, MAX_LVL, pointLvl, upgradeCost, ACTIONS, strike, SHARES, HEATS, KINDS, newGame, date, era, power, owned, count, defFactor, okrugIds, okrugHeld, okrugsHeld, conn, apMax, menCap, lawLevel, districtDef, attackable, inTruce, buildCost, officialCost, gunPrice, CAR_PRICE, pointInc, income, heatDelta, projIncome, projStatus, negChances, winOdds, raidOdds, bribeCost, truceCost, canBuild, currentEvent, optState, LAST_TURN, active, allReady, setReady, endTurn, viewFor };
})(typeof window !== 'undefined' ? window.W90 : globalThis.W90);
