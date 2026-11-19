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
    easy: { name: 'Лёгкая', grace: 24, ratio: 1.7, grow: 0.8, aggr: 0.7, home: 1.8, hits: 1 },
    norm: { name: 'Обычная', grace: 18, ratio: 1.4, grow: 1, aggr: 1, home: 1.5, hits: 1 },
    hard: { name: 'Жёсткая', grace: 12, ratio: 1.2, grow: 1.15, aggr: 1.5, home: 1.2, hits: 3 }
  };
  const dif = S => DIFF[S.diff] || DIFF.norm;
  function date(turn) { const mi = 11 + turn; return { year: 1991 + Math.floor(mi / 12), month: mi % 12 + 1, label: MONTHS[mi % 12] + ' ' + (1991 + Math.floor(mi / 12)) }; }
  const era = S => 1 + S.turn / 60;
  const fdef = id => D.FACTIONS.find(f => f.id === id);
  // to — кому видна запись (бригада); без to видят все
  function log(S, s, k, to) { S.log.unshift({ t: S.turn, s, k: k || '', to: to || undefined }); if (S.log.length > 300) S.log.length = 300; }
  const active = S => S.humans.filter(h => !S.f[h].over);

  // humans — бригады живых игроков, absent — бригады вне игры, остальные ведёт бот
  function newGame(humans, seed, nicks, absent, diff) {
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
    humans.forEach(h => { for (let k = 0; k < 3; k++) genPerson(S, h); S.f[h].pool = inflow(S, h).total; S.f[h].ap = apMax(S, h); pickEvent(S, h); log(S, 'Декабрь 1991-го. Ты глава бригады, у тебя один район и горстка пацанов.', 'big', h); });
    return S;
  }

  // Старые сохранения и новые бригады: склад по моделям, броники, легенды
  function kitInit(f) { f.arms = { pm: f.guns || 0 }; f.garage = { nine: f.cars || 0 }; if (f.vests == null) f.vests = 0; }
  function migrate(S) {
    (S.humans || []).forEach(h => { const x = S.f[h]; if (!x) return; if (!x.arms) kitInit(x); if (x.vests == null) x.vests = 0; if (!x.once) x.once = []; });
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
  const armorK = f => hasCar(f, 'gelik') ? 0.5 : 1;
  const carTalk = (S, fid) => { const f = S.f[fid]; return f.garage ? Math.min(15, (f.garage.merc || 0) * D.CARS.merc.talk) : 0; };
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
  const conn = (S, fid) => { const o = S.f[fid].off || {}; return Object.keys(o).reduce((s, k) => s + o[k] * D.OFFICIALS[k].w, 0) + (S.f[fid].human ? fx(S, fid, 'conn') : 0); };
  const apMax = (S, fid) => Math.min(7, 3 + okrugsHeld(S, fid).length + (S.f[fid].rep >= 60 ? 1 : 0) + (post(S, fid, 'right') ? 1 : 0));
  const menCap = (S, fid) => 10 + count(S, fid) * 6 + Math.floor(S.f[fid].rep / 2) + (S.f[fid].human ? fx(S, fid, 'cap') : 0);
  // Новобранцы: сколько людей готово прийти в бригаду за месяц и откуда они берутся
  function inflow(S, fid) {
    const rows = [['Двор', 2]], n = count(S, fid);
    let gyms = 0, other = 0;
    owned(S, fid).forEach(i => S.d[i].b.forEach((b, x) => { const r = (D.BUILDS[b].rec || 0) * pointLvl(S.d[i], x); if (b === 'gym') gyms += r; else other += r; }));
    rows.push(['Спортзалы', gyms], ['ЧОПы', other], ['Районы', Math.floor(n / 3)], ['Авторитет', Math.floor(S.f[fid].rep / 20)]);
    if (fid === 'oreh') rows.push(['Ореховские качалки', 2]);
    return { rows, total: rows.reduce((s, r) => s + r[1], 0) };
  }
  const pool = (S, fid) => S.f[fid].pool == null ? inflow(S, fid).total : S.f[fid].pool;
  const recruitPrice = S => Math.round(1 + S.turn / 40);
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

  const buildCost = (S, k) => D.BUILDS[k].cost;
  const officialCost = (S, fid, k) => Math.round(D.OFFICIALS[k].cost * (fid === 'solnc' ? 0.75 : 1));
  const gunPrice = (S, fid) => fid === 'kopt' ? 2 : 3;
  const armCost = (S, fid, k, n) => Math.max(1, Math.round(D.ARMS[k].price * n * (fid === 'kopt' ? 0.7 : 1) * (1 - fxp(S, fid, 'gun'))));
  const gunPack = (S, fid) => armCost(S, fid, 'pm', 5);
  const vestCost = (S, fid, n) => Math.max(1, Math.round(D.VEST.price * n * (1 - fxp(S, fid, 'gun'))));
  const CAR_PRICE = D.CARS.nine.price;
  const carCost = (S, fid, k) => Math.max(3, Math.round(D.CARS[k].price * (1 - fxp(S, fid, 'car'))));
  const carPrice = (S, fid) => carCost(S, fid, 'nine');
  const pointInc = (fid, k) => D.BUILDS[k].inc + (fid === 'tush' ? 1 : 0);
  // точки улучшаются до третьего уровня: доход и оборона умножаются на уровень
  const MAX_LVL = 3;
  const pointLvl = (d, x) => (d.l && d.l[x]) || 1;
  const upgradeCost = (S, i, x) => Math.round(Math.max(D.BUILDS[S.d[i].b[x]].cost, 20) * pointLvl(S.d[i], x) * 1.5);
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
  const cname = c => c.name.split(' ')[0] + ' «' + c.nick + '» ' + c.name.split(' ')[1];
  const cfull = c => (c.pos ? D.POSTS[c.pos].name.toLowerCase() + ' ' : '') + cname(c);
  function genPerson(S, fid) {
    const p = S.f[fid], b = D.BIOS[Math.floor(rnd(S) * D.BIOS.length)], used = new Set(crew(S, fid).map(c => c.nick));
    let nick = ''; for (let k = 0; k < 12; k++) { nick = D.NICKS[Math.floor(rnd(S) * D.NICKS.length)]; if (!used.has(nick)) break; }
    const st = v => clamp(Math.round(v + rr(S, -1, 2)), 1, 10);
    const c = { id: p.nid++, name: D.NAMES[Math.floor(rnd(S) * D.NAMES.length)] + ' ' + D.SURNAMES[Math.floor(rnd(S) * D.SURNAMES.length)], nick, age: ri(S, 19, 48), bio: b[0], str: st(4 + b[1]), wit: st(4 + b[2]), loy: st(4 + b[3]), pos: null, ok: null, st: 'ok', until: 0, since: S.turn };
    p.crew.push(c); return c;
  }
  // что случилось с человеком: hurt — ранен, jail — посадили, dead — убит
  function fate(S, fid, c, kind, where) {
    const p = S.f[fid], nm = cfull(c);
    if (kind === 'dead') {
      p.crew = p.crew.filter(x => x !== c); p.dead.unshift({ n: cname(c), pos: c.pos, t: S.turn, how: where }); if (p.dead.length > 12) p.dead.length = 12;
      addRep(S, fid, -1); log(S, nm.charAt(0).toUpperCase() + nm.slice(1) + ' погиб: ' + where + '.', 'bad', fid); return;
    }
    const m = kind === 'hurt' ? ri(S, 2, 4) : ri(S, 12, 30);
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
    return (fid === 'izm' ? 1.2 : 1) * (1 + (r ? r.str * 0.02 : 0) + (cp ? cp.str * 0.03 : 0));
  }
  const consBonus = (S, fid) => { const c = post(S, fid, 'cons'); return c ? c.wit * 3 : 0; };
  function crewPhase(S, fid) {
    const p = S.f[fid];
    p.crew.slice().forEach(c => {
      if (c.st !== 'ok' && c.until <= S.turn) {
        if (c.st === 'jail') { c.loy = Math.min(10, c.loy + 1); log(S, cname(c) + ' откинулся и вернулся в семью. Отсидел и не сдал: верность +1.', 'good', fid); }
        else log(S, cname(c) + ' встал на ноги и вернулся в строй.', 'good', fid);
        c.st = 'ok';
      }
      if (c.pos === 'capo' && !owned(S, fid).some(i => D.DISTRICTS[i].ok === c.ok)) { log(S, 'Бригадир ' + cname(c) + ' остался без округа и ушёл в резерв.', '', fid); c.pos = null; c.ok = null; }
      if (c.pos === 'watch' && S.d[watchDist(c)].o !== fid) { log(S, 'Смотрящий ' + cname(c) + ' остался без района (' + D.DISTRICTS[watchDist(c)].name + ') и ушёл в резерв.', '', fid); c.pos = null; c.ok = null; }
      if (c.st === 'ok' && c.loy <= 2 && rnd(S) < 0.04) {
        const m = Math.max(0, Math.round(p.money * 0.1)); p.money -= m; p.crew = p.crew.filter(x => x !== c);
        log(S, cfull(c).charAt(0).toUpperCase() + cfull(c).slice(1) + ' ушёл к конкурентам' + (m ? ' и прихватил из общака ' + m + ' тыс.' : '.'), 'bad', fid);
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
    const p = S.f[fid], rows = []; let white = 0, black = 0, dist = 0, pts = 0, ents = 0;
    const held = okrugsHeld(S, fid);
    let wt = 0;
    owned(S, fid).forEach(i => {
      const dd = D.DISTRICTS[i], cp = capoOf(S, fid, dd.ok), w = p.human ? watcherOf(S, fid, i) : null;
      const base = Math.round(dd.inc * (held.includes(dd.ok) ? 2 : 1) * (1 + (cp ? cp.str * 0.05 : 0)));
      dist += base;
      let dp = 0;
      S.d[i].b.forEach((b, x) => { const v = pointInc(fid, b) * pointLvl(S.d[i], x); dp += v; pts += v; if (D.BUILDS[b].kind === 'w') white += v; else black += v; });
      // смотрящий: сильный поднимает дань, умный — доход точек; ненадёжный утаивает половину дани
      if (w) { const v = w.loy <= 3 ? -Math.round(base / 2) : Math.round(dp * w.wit * 0.04 + base * w.str * 0.03); wt += v; black += v; }
      if (S.d[i].ent) { ents += dd.ent.inc; white += dd.ent.inc; }
    });
    black += dist;
    rows.push(['Дань с районов', dist], ['Точки и недвижимость', pts], ['Смотрящие', wt], ['Предприятия', ents]);
    let pj = 0;
    D.PROJECTS.forEach(pr => { const v = projIncome(S, fid, pr); pj += v; if (pr.kind === 'w') white += v; else black += v; });
    rows.push(['Крупные дела', pj]);
    const wash = Math.round(black * fxp(S, fid, 'wash')); black -= wash; white += wash;
    const tr = post(S, fid, 'treas'), gross = dist + pts + wt + ents + pj, tv = tr ? Math.round(gross * (tr.loy <= 3 ? -0.05 : tr.wit * 0.02)) : 0;
    rows.push(['Казначей', tv]);
    const upkeep = Math.round(p.men * 0.3 * era(S) * (1 - fxp(S, fid, 'upkeep'))), bribes = Object.keys(p.off).reduce((s, k) => s + p.off[k] * D.OFFICIALS[k].keep, 0);
    rows.push(['Содержание бойцов', -upkeep], ['Зарплата людям во власти', -bribes]);
    return { rows, total: gross + tv - upkeep - bribes, white, black, wash };
  }
  function heatDelta(S, fid) {
    const p = S.f[fid];
    let v = -2 - Object.keys(p.off).reduce((s, k) => s + p.off[k] * D.OFFICIALS[k].cool, 0);
    if (fid === 'tag') v -= 1;
    v -= fx(S, fid, 'cool');
    D.PROJECTS.forEach(pr => { if ((p.proj[pr.id] || {}).stage === 3) v += pr.heat; });
    return v + Math.floor(count(S, fid) / 5);
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
  const addRep = (S, fid, v) => { const p = S.f[fid]; p.rep = clamp(p.rep + v, 0, 100); };
  const addHeat = (S, fid, v) => { const p = S.f[fid]; p.heat = clamp(p.heat + v, 0, 100); };

  // Вербовка стоит денег и не тратит ход; нанять можно только тех, кто ждёт во дворах и спортзалах
  function recruit(S, fid, n) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    const p = S.f[fid], cap = menCap(S, fid), price = recruitPrice(S), have = pool(S, fid);
    if (p.men >= cap) return fail('Больше людей бригада не удержит. Нужны новые районы или авторитет');
    if (have < 1) return fail('Желающих нет. Новые придут в следующем месяце; строй спортзалы');
    if (p.money < price) return fail('Не хватает денег: боец стоит ' + price);
    n = Math.max(1, Math.min(Math.floor(+n) || 1, have, cap - p.men, Math.floor(p.money / price)));
    p.men += n; p.money -= n * price; p.pool = have - n;
    return { ok: true, msg: 'В бригаду пришли ' + n + ' чел. за ' + n * price + ' тыс.' };
  }
  // Стволы, броники и тачки стоят только денег и не тратят ход
  function buyGuns(S, fid, k, n) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    k = k || 'pm'; const A = D.ARMS[k], p = S.f[fid];
    if (!A) return fail('Нет такого ствола');
    if (date(S.turn).year < A.from) return fail('Появится в ' + A.from + ' году');
    n = Math.max(1, Math.min(50, Math.floor(+n) || A.pack));
    const c = armCost(S, fid, k, n);
    if (p.money < c) return fail('Не хватает денег: нужно ' + c);
    p.money -= c; addArms(p, k, n); addRep(S, fid, 0.4);
    return { ok: true, msg: 'В арсенале: ' + A.name + ' ×' + n };
  }
  function buyVests(S, fid, n) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    const p = S.f[fid];
    if (date(S.turn).year < D.VEST.from) return fail('Появятся в ' + D.VEST.from + ' году');
    n = Math.max(1, Math.min(50, Math.floor(+n) || D.VEST.pack));
    const c = vestCost(S, fid, n);
    if (p.money < c) return fail('Не хватает денег: нужно ' + c);
    p.money -= c; p.vests = (p.vests || 0) + n;
    return { ok: true, msg: 'Бронежилетов на складе: ' + p.vests };
  }
  function buyCar(S, fid, k) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    k = k || 'nine'; const C = D.CARS[k], p = S.f[fid];
    if (!C) return fail('Нет такой машины');
    if (date(S.turn).year < C.from) return fail('Появится в ' + C.from + ' году');
    const c = carCost(S, fid, k);
    if (p.money < c) return fail('Не хватает денег: нужно ' + c);
    p.money -= c; addCar(p, k, 1); addRep(S, fid, C.rep || 0.4);
    return { ok: true, msg: 'В гараже: ' + C.name + (C.rep ? '. Авторитет +' + C.rep : '') };
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
    if (A0.human && att === 'medv') la = Math.round(la * 0.7);
    if (A0.human) la = Math.round(la * (1 - fxp(S, att, 'med')) * vestK(A0, committed));
    la = Math.min(la, A0.men); A0.men -= la; A0.guns = Math.max(0, A0.guns - Math.floor(la / 2));
    if (A0.vests) A0.vests = Math.max(0, A0.vests - Math.floor(la / 3));
    let ld = 0;
    if (defender) { const dm = Math.round(defender.men * defFactor(count(S, d.o))); ld = Math.min(defender.men, Math.round(dm * clamp(0.18 * ratio, 0.05, 0.5) * (defender.human ? (1 - fxp(S, d.o, 'med')) * vestK(defender, dm) : 1))); defender.men -= ld; defender.guns = Math.max(0, defender.guns - Math.floor(ld / 2)); if (defender.vests) defender.vests = Math.max(0, defender.vests - Math.floor(ld / 3)); }
    const prev = d.o;
    const dok = D.DISTRICTS[i].ok, defCapo = defender && defender.human ? capoOf(S, prevOwner(d), dok) : null;
    if (win) { d.o = att; d.ent = false; }
    // судьба людей из семьи: кто вёл бой и кто держал округ
    if (A0.human) { const l = leader(S, att, i), x = rnd(S) / armorK(A0); if (l) { if (!win && x < 0.04) fate(S, att, l, 'dead', 'в неудачной разборке за ' + D.DISTRICTS[i].name); else if (x < (win ? 0.04 : 0.14)) fate(S, att, l, 'hurt', 'в разборке за ' + D.DISTRICTS[i].name); } }
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
  const flankOdds = (S, fid) => { const p = S.f[fid], B = p.battle; return clamp(0.45 + Math.min(1, seatsOf(p) / Math.max(1, B ? B.men : p.men)) * 0.25 + (B && leader(S, fid, B.i) ? 0.05 : 0), 0.2, 0.8); };
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
  function roundCalc(B, t, rand, extra) {
    const T = TACTICS[t]; let our = T.our || 0, their = T.their == null ? 1 : T.their, bonus = 0, note = '';
    if (t === 'flank') { const ok = rand() < extra.flank; our = ok ? 1.9 : 0.4; their = ok ? 0.5 : 1.4; note = ok ? 'зашли с тыла' : 'нарвались на засаду'; }
    if (t === 'rpg') bonus = B.d0 * 0.2;
    if (t === 'talk') { if (rand() * 100 < extra.talk) return { dealt: B.d, took: 0, note: 'сдались и ушли с района', surrender: true }; our = 0; their = 1; note = 'послали подальше'; }
    const dealt = B.a * 0.32 * our * (0.8 + rand() * 0.4) + bonus, took = B.d * 0.28 * their * (0.8 + rand() * 0.4);
    return { dealt, took, note };
  }
  function battleSim(a, d, rand) { // оценка: штурм, пока сильнее, иначе из укрытия
    const B = { a, a0: a, d, d0: d };
    for (let r = 0; r < BATTLE_ROUNDS; r++) { const x = roundCalc(B, B.a >= B.d ? 'storm' : 'cover', rand, {}); B.d -= x.dealt; B.a -= x.took; if (B.d <= 0) return true; if (B.a <= B.a0 * BREAK) return false; }
    return false;
  }
  function attack(S, fid, i, lvl) {
    const e = spend(S, fid, 1); if (e) return fail(e);
    if (!S.d[i] || !SHARES[lvl]) return fail('Нет такой цели');
    if (!attackable(S, fid, i)) return fail('Нападать можно только на районы, которые граничат с твоими');
    const d = S.d[i], dd = D.DISTRICTS[i], p = S.f[fid];
    if (d.o && !S.f[d.o].human && inTruce(S, fid, d.o)) return fail('С этой бригадой перемирие');
    if (p.men < 3) return fail('Некого посылать');
    p.ap--;
    const men = strike(p, SHARES[lvl]), a = power(p) * men / Math.max(1, p.men) * atkMult(S, fid, i) * rr(S, 0.9, 1.1), dv = districtDef(S, i) * rr(S, 0.9, 1.1);
    p.battle = { i, lvl, men, a, a0: a, d: dv, d0: dv, round: 0, log: [], foe: d.o, held: okrugHeld(S, fid, dd.ok) };
    addHeat(S, fid, HEATS[lvl] + (dd.ok === 'CAO' ? 2 : 0));
    return { ok: true, msg: KINDS[lvl] + ': ' + dd.name + '. Едут ' + men + ' бойцов', battle: true };
  }
  function battle(S, fid, t) {
    const p = S.f[fid]; if (!p || !p.human || p.over || S.done) return fail('Игра окончена');
    const B = p.battle; if (!B) return fail('Перестрелки нет');
    if (t === 'retreat') return finishBattle(S, fid, false, 'Ты увёл людей');
    const lock = tacticLock(S, fid, t); if (lock) return fail(lock);
    if (t === 'rpg') { p.arms.rpg--; p.guns--; }
    if (t === 'flank') B.flank = 1;
    const x = roundCalc(B, t, () => rnd(S), { flank: flankOdds(S, fid), talk: talkOdds(S, fid) });
    B.d -= x.dealt; B.a -= x.took; B.round++;
    B.log.push({ t, dealt: Math.round(x.dealt), took: Math.round(x.took), note: x.note });
    if (x.surrender || B.d <= 0) return finishBattle(S, fid, true, x.surrender ? 'Они сдались' : 'Район зачищен');
    if (B.a <= B.a0 * BREAK) return finishBattle(S, fid, false, 'Бойцы дрогнули');
    if (B.round >= BATTLE_ROUNDS) return finishBattle(S, fid, false, 'Не продавили: район устоял');
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
    if (B.one && d.b.includes(k)) return 'Уже есть';
    if (d.b.length >= dd.slots) return 'Нет свободных мест';
    if (B.needMen && p.men < B.needMen) return 'Нужно бойцов: ' + B.needMen;
    if (B.needConn && conn(S, fid) < B.needConn) return 'Нужны связи: ' + B.needConn;
    if (p.money < buildCost(S, k)) return 'Не хватает денег';
    return null;
  }
  function build(S, fid, i, k) {
    const e = spend(S, fid, 0) || canBuild(S, fid, i, k); if (e) return fail(e); // стройка стоит только денег
    const B = D.BUILDS[k], p = S.f[fid];
    p.money -= buildCost(S, k); S.d[i].l = S.d[i].b.map((_, j) => pointLvl(S.d[i], j)); S.d[i].b.push(k); S.d[i].l.push(1);
    if (B.heat) addHeat(S, fid, B.heat);
    return { ok: true, msg: B.name + ': ' + D.DISTRICTS[i].name + '. +' + pointInc(fid, k) + ' в месяц' };
  }
  function upgrade(S, fid, i, x) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    const d = S.d[i], p = S.f[fid];
    if (!d || d.o !== fid) return fail('Район не твой');
    const k = d.b[x]; if (!k) return fail('Нет такой точки');
    const lv = pointLvl(d, x); if (lv >= MAX_LVL) return fail('Улучшать больше некуда');
    const c = upgradeCost(S, i, x);
    if (p.money < c) return fail('Не хватает денег: нужно ' + c);
    p.money -= c; d.l = d.b.map((_, j) => pointLvl(d, j)); d.l[x] = lv + 1;
    return { ok: true, msg: D.BUILDS[k].name + ' улучшен: ' + D.DISTRICTS[i].name + '. Теперь +' + pointInc(fid, k) * (lv + 1) + ' в месяц' };
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
  // выдвинуть бойца в семью: раз в месяц, стоит денег и одного рядового
  const promoteCost = S => Math.round(12 * era(S));
  function promote(S, fid) {
    const e = spend(S, fid, 0); if (e) return fail(e);
    const p = S.f[fid], c = promoteCost(S);
    if (p.promoTurn === S.turn) return fail('В этом месяце уже выдвигали человека');
    if (p.men < 6) return fail('Нужно хотя бы 6 бойцов');
    if (p.money < c) return fail('Нужно ' + c + ' тыс.');
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
    if (c.pos) return fail('Сначала сними с должности');
    p.crew = p.crew.filter(x => x !== c);
    if (c.loy <= 3 && rnd(S) < 0.3) { addHeat(S, fid, 6); log(S, cname(c) + ' обиделся и пошёл к операм. Розыск +6.', 'bad', fid); return { ok: true, msg: cname(c) + ' ушёл со злобой и заговорил с операми', win: false }; }
    return { ok: true, msg: cname(c) + ' вернулся в рядовые' };
  }
  function kidnap(S, fid, i) {
    const e = spend(S, fid, 1); if (e) return fail(e);
    const p = S.f[fid];
    if (!S.d[i] || S.d[i].o !== fid) return fail('Район не твой');
    if (p.kidnapTurn === S.turn) return fail('В этом месяце уже было похищение. Город на ушах');
    if (p.men < 4) return fail('Нужно 4 бойца');
    p.ap--; p.kidnapTurn = S.turn;
    if (rnd(S) < clamp(0.55 + p.rep / 400 + fxp(S, fid, 'kid'), 0, 0.9)) {
      const m = Math.round(rr(S, 20, 50) * era(S)); p.money += m; addHeat(S, fid, 7); addRep(S, fid, 1);
      log(S, 'Похищение коммерсанта: семья заплатила ' + m, 'good', fid);
      return { ok: true, msg: 'Семья заплатила выкуп: ' + m + ' тыс. $' };
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
    if (p.money < c) return fail('Не хватает денег: нужно ' + c);
    p.money -= c; p.off[k]++; p.ap--;
    return { ok: true, msg: O.name + ' теперь получает у тебя зарплату' };
  }
  const bribeCost = (S, fid) => Math.round((15 + lawLevel(S.f[fid].heat) * 20) * era(S) * (1 - consBonus(S, fid) / 100));
  function bribe(S, fid) {
    const e = spend(S, fid, 1); if (e) return fail(e);
    const p = S.f[fid], c = bribeCost(S, fid);
    if (p.heat < 5) return fail('К тебе и так нет вопросов');
    if (p.money < c) return fail('Не хватает денег: нужно ' + c);
    p.money -= c; p.ap--; addHeat(S, fid, -12);
    return { ok: true, msg: 'Конверт дошёл. Розыск −12' };
  }
  const truceCost = (S, other) => Math.round(15 + power(S.f[other]) / 3);
  // ---------- переговоры с лидерами ----------
  // Отношения с каждой бригадой ботов: от −100 (вражда) до 100 (дружба). Дружба от 50 — боты не нападают,
  // вражда от −50 — нападают охотнее. Каждый месяц отношения остывают к нулю на десятую часть.
  const rel = (S, fid, other) => Math.round(((S.f[fid].rel || {})[other]) || 0);
  const addRel = (S, fid, other, v) => { const p = S.f[fid]; p.rel = p.rel || {}; p.rel[other] = clamp((p.rel[other] || 0) + v, -100, 100); };
  const talkBonus = (S, fid) => fx(S, fid, 'talk') + consBonus(S, fid) + carTalk(S, fid);
  const truceOdds = (S, fid, other) => clamp(45 + S.f[fid].rep / 2 + (power(S.f[fid]) > power(S.f[other]) ? 15 : -10) + talkBonus(S, fid) + rel(S, fid, other) / 4, 10, 95);
  const giftCost = S => Math.round(15 * era(S));
  const dealCost = S => Math.round(30 * era(S));
  const dealOdds = (S, fid, other) => clamp(60 + rel(S, fid, other) / 2 + talkBonus(S, fid) / 2, 10, 95);
  const buyPrice = (S, fid, i) => Math.round((districtDef(S, i) * 3 + D.DISTRICTS[i].inc * 12) * (1 - rel(S, fid, S.d[i].o) / 300));
  const buyOdds = (S, fid, other) => clamp(30 + rel(S, fid, other) / 2 + (power(S.f[fid]) > power(S.f[other]) ? 15 : -10) + talkBonus(S, fid) / 2 - count(S, other) * 0.5, 5, 90);
  const tributeOk = (S, fid, other) => power(S.f[fid]) > power(S.f[other]) * 1.3;
  const tributeOdds = (S, fid, other) => clamp(25 + (power(S.f[fid]) / Math.max(1, power(S.f[other])) - 1.3) * 60 + S.f[fid].rep / 4, 5, 85);
  const tributeSum = (S, other) => Math.round(count(S, other) * 6 * era(S) + 10);
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
      const c = truceCost(S, other); if (p.money < c) return fail('На стол и подарки нужно ' + c);
      meet(); p.money -= c;
      if (rnd(S) * 100 < truceOdds(S, fid, other)) { p.truce[other] = S.turn + 12; addRel(S, fid, other, 15); log(S, 'Стрелка с ' + boss + ' (' + nm + '): мир на год.', 'good', fid); return { ok: true, msg: boss + ' пожал руку. Год друг друга не трогаете' }; }
      addRep(S, fid, -1); addRel(S, fid, other, -5);
      return { ok: true, msg: boss + ' не согласился. Считает, что ты слаб', win: false };
    }
    if (kind === 'gift') {
      const c = giftCost(S); if (p.money < c) return fail('На подарок нужно ' + c);
      meet(); p.money -= c; addRel(S, fid, other, 20);
      return { ok: true, msg: boss + ' принял подарок. Отношения +20' };
    }
    if (kind === 'deal') {
      const c = dealCost(S); if (p.money < c) return fail('Твоя доля в деле: ' + c);
      if (rel(S, fid, other) < -20) return fail('С врагами дел не ведут');
      meet(); p.money -= c;
      if (rnd(S) * 100 < dealOdds(S, fid, other)) { const amt = Math.round(c * 1.8); p.later.push({ t: S.turn + ri(S, 3, 6), amt, why: 'Дело с ' + boss }); addRel(S, fid, other, 10); return { ok: true, msg: 'Вложился с ' + boss + '. Через несколько месяцев вернётся ' + amt }; }
      addRel(S, fid, other, -15); log(S, boss + ' кинул тебя на совместном деле: −' + c + '.', 'bad', fid);
      return { ok: true, msg: boss + ' кинул. Деньги пропали', win: false };
    }
    if (kind === 'buy') {
      const i = +arg; if (!S.d[i] || S.d[i].o !== other) return fail('Это не их район');
      if (!attackable(S, fid, i)) return fail('Купить можно только район, который граничит с твоими');
      if (isHome(S, other, i)) return fail('Родной район не продают');
      const c = buyPrice(S, fid, i); if (p.money < c) return fail('За ' + D.DISTRICTS[i].name + ' просят ' + c);
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
    if (kind === 'tribute') {
      if (!tributeOk(S, fid, other)) return fail('Дань требуют, только когда ты заметно сильнее');
      meet();
      if (rnd(S) * 100 < tributeOdds(S, fid, other)) { const v = tributeSum(S, other); p.money += v; addRel(S, fid, other, -30); addRep(S, fid, 3); log(S, nm + ' заплатили тебе дань: +' + v + '.', 'good', fid); return { ok: true, msg: boss + ' заплатил ' + v + '. Но запомнил' }; }
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
    const t = fx(S, fid, 'talk') + consBonus(S, fid) + carTalk(S, fid);
    return { share: clamp(55 + p.rep * 0.4 + t, 0, 95), bribe: clamp(65 + conn(S, fid) * 4 + t, 0, 97), force: clamp(25 + power(p) / 4, 0, 75) };
  }
  function projStep(S, fid, id, how) {
    const e = spend(S, fid, 1); if (e) return fail(e);
    const pr = D.PROJECTS.find(x => x.id === id); if (!pr) return fail('Нет такого бизнеса');
    const ps = projStatus(S, fid, pr), p = S.f[fid];
    if (ps.lock) return fail(ps.lock);
    const st = p.proj[id] = p.proj[id] || { stage: 0 };
    if (st.stage === 0) {
      if (p.money < pr.trip) return fail('На поездку нужно ' + pr.trip);
      p.money -= pr.trip; st.stage = 1; st.last = S.turn; p.ap--;
      return { ok: true, msg: 'Ты слетал в ' + pr.where + '. Встреча назначена: ' + pr.who };
    }
    if (st.stage === 1) {
      const ch = negChances(S, fid); let c = 0;
      if (!ch[how]) return fail('Выбери, как вести разговор');
      if (how === 'bribe') { c = Math.round(pr.buy * 0.2); if (p.money < c) return fail('Нужно ' + c + ' на подарок'); }
      p.ap--; st.last = S.turn; p.money -= c;
      if (how === 'force') addHeat(S, fid, 6);
      if (rnd(S) * 100 < ch[how]) { st.stage = 2; st.mult = how === 'share' ? 0.75 : 1; addRep(S, fid, 1); return { ok: true, msg: 'Договорились. Осталось внести деньги: ' + pr.buyLabel.toLowerCase() }; }
      st.stage = 0; addRep(S, fid, -2);
      let msg = 'Не договорились. Придётся искать новый выход и лететь снова';
      if (how === 'force') { const l = Math.min(p.men, ri(S, 2, 5)); p.men -= l; msg = 'Разговор кончился стрельбой. Потеряно бойцов: ' + l; }
      return { ok: true, msg, win: false };
    }
    if (st.stage === 2) {
      if (p.money < pr.buy) return fail(pr.buyLabel + ': нужно ' + pr.buy);
      p.money -= pr.buy; st.stage = 3; st.age = 0; st.last = S.turn; p.ap--; addRep(S, fid, pr.kind === 'w' ? 4 : 3);
      log(S, 'Запущен бизнес: ' + pr.name + '. +' + projIncome(S, fid, pr) + ' в месяц.', 'big', fid);
      return { ok: true, msg: pr.name + ': дело пошло. +' + projIncome(S, fid, pr) + ' в месяц' };
    }
    return fail('Бизнес уже работает');
  }
  function cashOut(S, fid) {
    const e = spend(S, fid, 1); if (e) return fail(e);
    const p = S.f[fid], st = p.proj.pyramid; if (!st || st.stage !== 3) return fail('Пирамиды нет');
    const pr = D.PROJECTS.find(x => x.id === 'pyramid'), m = projIncome(S, fid, pr) * 2;
    p.money += m; p.proj.pyramid = { stage: 0, dead: true }; p.ap--; addRep(S, fid, -5); addHeat(S, fid, 8);
    log(S, 'Ты закрыл пирамиду и вывез кассу: ' + m + '. Вкладчики остались у дверей.', 'big', fid);
    return { ok: true, msg: 'Касса вывезена: +' + m };
  }

  // ---------- события ----------
  // Событие месяца. who — в событии участвует человек из семьи ({who} в тексте), once — бывает один раз,
  // legend — легенда, которая может прийти в семью (не выпадает, если уже пришла), needCars — нужна тачка
  function pickEvent(S, fid) {
    const p = S.f[fid], dt = date(S.turn), live = crew(S, fid).filter(c => c.st === 'ok');
    const holders = r => r === true ? live : live.filter(c => c.pos === r);
    p.evWho = null; if (!p.once) p.once = [];
    let ev = EVENTS.find(e => e.date && e.date[0] === dt.year && e.date[1] === dt.month);
    if (!ev) {
      const fits = e => !e.date && (!e.from || dt.year >= e.from) && (!e.to || dt.year <= e.to) && (!e.who || holders(e.who).length) && (!e.needCars || p.cars > 0) && !(e.once && p.once.includes(e.id)) && !(e.legend && crew(S, fid).some(c => c.leg === e.legend));
      let pool = EVENTS.filter(e => fits(e) && !p.recent.includes(e.id));
      const adv = pool.filter(e => e.advice);
      if (adv.length && rnd(S) < 0.35) pool = adv;
      if (!pool.length) pool = EVENTS.filter(fits);
      ev = pool[Math.floor(rnd(S) * pool.length)];
      p.recent.push(ev.id); if (p.recent.length > 24) p.recent.shift();
    }
    if (ev.who && holders(ev.who).length) { const h = holders(ev.who); p.evWho = h[Math.floor(rnd(S) * h.length)].id; }
    p.event = ev.id;
  }
  const currentEvent = (S, fid) => S.f[fid].event ? EVENTS.find(e => e.id === S.f[fid].event) : null;
  const evWho = (S, fid) => S.f[fid].evWho != null ? crew(S, fid).find(c => c.id === S.f[fid].evWho) || null : null;
  function evText(S, fid, s) { if (!s || s.indexOf('{who}') < 0) return s; const w = evWho(S, fid); return s.split('{who}').join(w ? cname(w) : 'твой человек'); }
  function optState(S, fid, o) {
    const p = S.f[fid], m = era(S), cost = o.$ < 0 ? Math.round(-o.$ * m) : 0;
    if (cost > Math.max(0, p.money)) return { cost, lock: 'Нужно ' + cost + ' тыс. $' };
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
  function choose(S, fid, k) {
    const p = S.f[fid]; if (!p || !p.human || p.over || S.done) return fail('Игра окончена');
    const ev = currentEvent(S, fid); if (!ev) return fail('Нет события');
    const o = ev.opts[k]; if (!o) return fail('Нет такого варианта');
    const os = optState(S, fid, o); if (os.lock) return fail(os.lock);
    const m = era(S);
    if (os.cost) p.money -= os.cost; // цена варианта платится всегда
    let res = o;
    // совет от своего: чем умнее советчик, тем реже совет выходит боком
    const wa = evWho(S, fid), altP = o.alt ? o.alt.p * (o.trust && wa ? clamp((11 - wa.wit) / 6, 0.3, 1.5) : 1) : 0;
    if (o.alt && rnd(S) < altP) res = Object.assign({ $: 0 }, o.alt);
    const dl = {};
    const gain = res.$ > 0 ? Math.round(res.$ * m) : 0; p.money += gain; dl.money = gain - os.cost;
    if (res.rep) { addRep(S, fid, res.rep); dl.rep = res.rep; }
    if (res.heat) { addHeat(S, fid, res.heat); dl.heat = res.heat; }
    if (res.men) { const v = Math.max(-p.men, res.men); p.men += v; dl.men = v; }
    if (res.guns) { p.guns = Math.max(0, p.guns + res.guns); dl.guns = res.guns; }
    if (res.cars) { const v = Math.max(-p.cars, res.cars); p.cars += v; dl.cars = v; }
    if (res.arm) { addArms(p, res.arm[0], res.arm[1]); dl.guns = (dl.guns || 0) + res.arm[1]; dl.arm = D.ARMS[res.arm[0]].name + ' ×' + res.arm[1]; }
    if (res.car) { addCar(p, res.car, 1); dl.cars = (dl.cars || 0) + 1; dl.car = D.CARS[res.car].name; }
    if (res.vests) { const v = Math.max(-(p.vests || 0), res.vests); p.vests = (p.vests || 0) + v; dl.vests = v; }
    if (res.later) { const amt = Math.round(res.later * m); p.later.push({ t: S.turn + ri(S, 5, 9), amt, why: ev.title }); dl.later = amt; }
    const title = evText(S, fid, ev.title), r = evText(S, fid, res.r), w = evWho(S, fid);
    if (w) {
      if (res.wloy) { w.loy = clamp(w.loy + res.wloy, 1, 10); dl.loy = res.wloy; }
      if (res.wstr) { w.str = clamp(w.str + res.wstr, 1, 10); dl.str = res.wstr; }
      if (res.wwit) { w.wit = clamp(w.wit + res.wwit, 1, 10); dl.wit = res.wwit; }
      if (res.wfate === 'leave') { p.crew = p.crew.filter(x => x !== w); dl.gone = cname(w); }
      else if (res.wfate) fate(S, fid, w, res.wfate, title.charAt(0).toLowerCase() + title.slice(1));
    }
    if (res.truce) { const nb = D.FACTIONS.filter(f => !S.f[f.id].human && S.f[f.id].alive && !inTruce(S, fid, f.id) && owned(S, f.id).some(i => GEO.adj[i].some(j => S.d[j].o === fid))); if (nb.length) { const f = nb[Math.floor(rnd(S) * nb.length)]; p.truce[f.id] = S.turn + res.truce; addRel(S, fid, f.id, 10); dl.truce = f.name; } }
    if (res.relAll) { D.FACTIONS.forEach(f => { if (f.id !== fid && !S.f[f.id].human) addRel(S, fid, f.id, res.relAll); }); dl.rel = res.relAll; }
    if (res.join) { const c = addLegend(S, fid, res.join); if (c) { dl.join = cname(c); log(S, 'В семье новый человек: ' + cname(c) + '. ' + c.bio + '.', 'big', fid); } }
    if (ev.once) p.once.push(ev.id);
    p.event = null; p.evWho = null;
    log(S, title + ': ' + r, '', fid);
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
    if (rnd(S) > 0.1 + 0.05 * L) return;
    const who = D.LAW[L].name;
    let n = L === 1 ? ri(S, 1, 2) : L === 2 ? ri(S, 2, 5) : L === 3 ? Math.max(4, Math.round(p.men * rr(S, 0.1, 0.15))) : Math.max(8, Math.round(p.men * rr(S, 0.18, 0.25)));
    n = Math.min(Math.round(n * (1 - fxp(S, fid, 'hide'))), p.men); if (!n) return;
    let jail = 0, dead = 0, free = 0; const pk = 0.12 + 0.04 * L, pf = clamp(0.3 + conn(S, fid) * 0.03, 0, 0.7);
    for (let i = 0; i < n; i++) { const x = rnd(S); if (x < pk) dead++; else if (x < pk + pf) free++; else jail++; }
    p.men -= jail + dead;
    if (jail) p.jail.push({ n: jail, t: S.turn + ri(S, 12, 36) });
    const rep = clamp(Math.ceil(free / 2) - dead - Math.floor(jail / 4), -6, 4);
    addRep(S, fid, rep);
    let s = who + ': задержано ' + n + '. ';
    if (jail) s += 'Сели: ' + jail + '. '; if (dead) s += 'Убиты при задержании: ' + dead + '. '; if (free) s += 'Отпущены: ' + free + '. ';
    if (L >= 3 && p.money > 0) { const fr = Math.round(p.money * (L === 3 ? 0.1 : 0.2)); p.money -= fr; s += 'Счета арестованы: −' + fr + '. '; }
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
    p.money += income(S, fid).total;
    p.later = p.later.filter(l => { if (l.t <= S.turn) { p.money += l.amt; if (l.amt >= 0) log(S, 'Вернулись вложения («' + l.why + '»): +' + l.amt, 'good', fid); else log(S, 'Пришли за долгом («' + l.why + '»): ' + l.amt, 'bad', fid); return false; } return true; });
    if (p.money < 0) { const l = Math.max(1, Math.round(p.men * 0.1)); p.men = Math.max(0, p.men - l); addRep(S, fid, -2); log(S, 'Общак пуст, платить нечем. Ушли бойцы: ' + l, 'bad', fid); }
    D.PROJECTS.forEach(pr => {
      const st = p.proj[pr.id]; if (!st || st.stage !== 3) return;
      st.age++; if (pr.guns) addArms(p, 'aks', pr.guns); if (pr.cars) addCar(p, 'audi', pr.cars); if (pr.repTurn) addRep(S, fid, pr.repTurn);
      if (pr.pyramid && st.age >= 8 && rnd(S) < 0.05 + 0.02 * (st.age - 8)) { p.proj[pr.id] = { stage: 0, dead: true }; addHeat(S, fid, 25); addRep(S, fid, -15); log(S, 'Пирамида рухнула. Толпа вкладчиков громит офис, прокуратура возбудила дело.', 'bad', fid); }
    });
    if (p.rep > 15) p.rep -= p.rep * 0.015;
    Object.keys(p.rel || {}).forEach(k => { p.rel[k] = Math.round(p.rel[k] * 0.9); });
    addHeat(S, fid, heatDelta(S, fid));
    lawPressure(S, fid);
    if (!p.over) crewPhase(S, fid);
    p.jail = p.jail.filter(j => { if (j.t <= S.turn) { if (!p.over) p.men += j.n; addRep(S, fid, 1); log(S, 'Откинулись с зоны: ' + j.n + '. Вернулись в бригаду.', 'good', fid); return false; } return true; });
    p.report.money = Math.round(p.money - before);
  }

  function aiTurn(S, fid) {
    const f = S.f[fid]; if (!f.alive) return;
    const n = count(S, fid), X = dif(S);
    // большой бригаде люди даются труднее: после 15 районов каждый следующий даёт втрое меньше
    f.acc += (1 + Math.min(n, 15) * 0.3 + Math.max(0, n - 15) * 0.1) * X.grow; const add = Math.floor(f.acc); f.acc -= add;
    f.men = Math.min(menCap(S, fid), f.men + add);
    f.money += n * 3 * (1 + S.turn / 90);
    while (f.money >= 15 && f.guns < f.men) { f.money -= 15; f.guns += 5; }
    while (f.money >= 12 && f.cars * 4 < f.men) { f.money -= 12; f.cars++; }
    f.rep = clamp(10 + n * 2, 0, 100);
    // чем больше бригада, тем чаще ею занимаются силовики
    if (rnd(S) < 0.05 + Math.min(0.15, n * 0.004)) { const l = Math.round(f.men * rr(S, 0.12, 0.22)); f.men -= l; f.guns = Math.max(0, f.guns - Math.floor(l / 2)); if (l > 6) log(S, 'Силовики накрыли бригаду ' + fdef(fid).name + ': минус ' + l + ' бойцов.'); }
    // раскол: разросшуюся бригаду рвут изнутри, часть районов уходит местным
    if (n >= 18 && rnd(S) < 0.03 + (n - 18) * 0.002) {
      const own = owned(S, fid).filter(i => !isHome(S, fid, i)), k = Math.ceil(n * rr(S, 0.12, 0.2));
      for (let j = 0; j < k && own.length; j++) { const x = own.splice(Math.floor(rnd(S) * own.length), 1)[0]; S.d[x].o = null; S.d[x].ent = false; }
      f.men = Math.round(f.men * 0.85);
      log(S, 'Раскол у бригады ' + fdef(fid).name + ': бригадиры не поделили деньги, ' + k + ' районов отошли местным.', 'big');
      return;
    }
    const top = Math.max(0, ...active(S).map(h => count(S, h))), lead = top > n * 1.5;
    let tries = 1 + (n > 8 ? 1 : 0) + (top > 25 ? 1 : 0);
    const chance = (lead ? 0.55 : 0.22) * X.aggr * clamp(16 / (n + 4), 0.4, 1);
    while (tries-- > 0) {
      if (rnd(S) > chance) continue;
      const homeOk = D.DISTRICTS.find(d => d.name === fdef(fid).home).ok;
      const cand = new Set(); owned(S, fid).forEach(i => GEO.adj[i].forEach(j => { if (S.d[j].o !== fid) cand.add(j); }));
      let best = -1, bv = 1e9;
      cand.forEach(j => {
        const o = S.d[j].o, hum = o && S.f[o].human;
        if (hum && (S.turn < X.grace || inTruce(S, o, fid) || (S.hits[o] || 0) >= X.hits || rel(S, o, fid) >= 50)) return;
        const v = districtDef(S, j) * (D.DISTRICTS[j].ok === homeOk ? 0.8 : 1) * (hum && count(S, o) > n * 1.5 ? 0.7 : 1) * (hum && rel(S, o, fid) <= -50 ? 0.6 : 1) * (0.85 + rnd(S) * 0.3);
        if (v < bv) { bv = v; best = j; }
      });
      if (best < 0) continue;
      const bo = S.d[best].o, hum = bo && S.f[bo].human;
      if (power(f) * strike(f, 0.65) / Math.max(1, f.men) < districtDef(S, best) * (hum ? (rel(S, bo, fid) <= -50 ? 1.15 : X.ratio) : 1.2)) continue;
      const r = fight(S, fid, best, 0.65);
      if (hum && r.win) S.hits[bo] = (S.hits[bo] || 0) + 1;
      if (!hum && r.win && r.prev) log(S, fdef(fid).name + ' забрали ' + D.DISTRICTS[best].name + ' у бригады ' + fdef(r.prev).name + '.');
    }
  }

  function finale(S, fid) {
    const p = S.f[fid], inc = income(S, fid), c = conn(S, fid), n = count(S, fid), tot = inc.white + inc.black || 1, wshare = inc.white / tot;
    const score = Math.round(p.money / 10 + n * 20 + p.rep * 5 + c * 30 + inc.white * 5);
    let title, text;
    if (c >= 12 && wshare >= 0.5 && p.heat < 40) { title = 'Сенатор'; text = 'Декабрь 2007-го. У тебя кабинет в Совете Федерации, мигалка и неприкосновенность. Бригада называется холдингом, бойцы носят галстуки. Криминал не проиграл власти. Он ею стал.'; }
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
  const allReady = S => active(S).length > 0 && active(S).every(h => S.f[h].ready);

  function endTurn(S, force) {
    if (S.done) return fail('Игра окончена');
    if (!force && active(S).some(h => S.f[h].event)) return fail('Сначала реши, что делать с событием');
    active(S).forEach(h => { if (S.f[h].battle) finishBattle(S, h, false, 'Месяц кончился'); S.f[h].event = null; humanPhase(S, h); });
    S.hits = {};
    D.FACTIONS.forEach(f => { if (!S.f[f.id].human) aiTurn(S, f.id); });
    active(S).forEach(h => { if (count(S, h) === 0) eliminate(S, h); });
    if (S.turn >= LAST_TURN) active(S).forEach(h => finale(S, h));
    checkDone(S);
    if (S.done) return { ok: true, msg: 'Игра окончена', over: true };
    S.turn++;
    active(S).forEach(h => { const p = S.f[h], inf = inflow(S, h).total; p.pool = Math.min(pool(S, h) + inf, inf * 3); p.report.lost = p.lostNow || []; p.lostNow = null; p.ap = apMax(S, h); p.ready = false; pickEvent(S, h); });
    return { ok: true, msg: date(S.turn).label };
  }

  // Что сервер показывает игроку: без сида и без чужих секретов
  function viewFor(S, fid) {
    const V = JSON.parse(JSON.stringify(S)); delete V.seed; V.me = fid;
    S.humans.forEach(h => { if (h !== fid) { const x = S.f[h]; V.f[h] = { id: h, men: x.men, guns: x.guns, cars: x.cars, arms: x.arms, garage: x.garage, vests: x.vests, rep: x.rep, alive: x.alive, human: true, ready: x.ready, nick: x.nick, over: x.over ? { title: x.over.title, score: x.over.score } : null }; } });
    V.log = S.log.filter(l => !l.to || l.to === fid).slice(0, 80);
    return V;
  }

  const ACTIONS = { battle, parley, promote, assign, unassign, dismiss, recruit, buyGuns, buyVests, buyCar, attack, build, upgrade, kidnap, raid, hire, bribe, truce, projStep, cashOut, choose };
  G.Engine = { TACTICS, BATTLE_ROUNDS, BREAK, tacticLock, flankOdds, talkOdds, rel, giftCost, dealCost, dealOdds, buyPrice, buyOdds, tributeOk, tributeOdds, tributeSum, parleyCheck, watcherOf, watchKey, watchDist, promoteCost, DIFF, dif, isHome, migrate, armedValue, mobility, seatsOf, armCost, vestCost, carCost, carTalk, armorK, vestK, evText, evWho, addLegend, ARM_ORDER, CAR_ORDER, fx, fxp, gunPack, carPrice, crew, post, capoOf, capoMax, benchMax, cname, truceOdds, consBonus, atkMult, inflow, pool, recruitPrice, MAX_LVL, pointLvl, upgradeCost, ACTIONS, strike, SHARES, HEATS, KINDS, newGame, date, era, power, owned, count, defFactor, okrugIds, okrugHeld, okrugsHeld, conn, apMax, menCap, lawLevel, districtDef, attackable, inTruce, buildCost, officialCost, gunPrice, CAR_PRICE, pointInc, income, heatDelta, projIncome, projStatus, negChances, winOdds, raidOdds, bribeCost, truceCost, canBuild, currentEvent, optState, LAST_TURN, active, allReady, setReady, endTurn, viewFor };
})(typeof window !== 'undefined' ? window.W90 : globalThis.W90);
