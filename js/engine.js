/* Движок: чистая логика над состоянием S. Все действия — функции (S, ...args) -> {ok, msg}.
   Случайность идёт через сид в состоянии, поэтому тот же движок может работать на сервере. */
(function (G) {
  const D = G.DATA, GEO = G.GEO, EVENTS = G.EVENTS;
  const LAST_TURN = 192; // декабрь 2007
  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

  function rnd(S) { S.seed = (S.seed + 0x6D2B79F5) | 0; let t = S.seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  const rr = (S, a, b) => a + rnd(S) * (b - a);
  const ri = (S, a, b) => Math.floor(rr(S, a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function date(turn) { const mi = 11 + turn; return { year: 1991 + Math.floor(mi / 12), month: mi % 12 + 1, label: MONTHS[mi % 12] + ' ' + (1991 + Math.floor(mi / 12)) }; }
  const era = S => 1 + S.turn / 60;
  const fdef = id => D.FACTIONS.find(f => f.id === id);
  const P = S => S.f[S.player];
  const perk = (S, id) => S.player === id;
  function log(S, s, k) { S.log.unshift({ t: S.turn, s, k: k || '' }); if (S.log.length > 150) S.log.length = 150; }

  function newGame(playerId, seed) {
    const S = { v: 2, seed: seed | 0 || 1, turn: 0, player: playerId, f: {}, d: [], off: {}, jail: [], proj: {}, truce: {}, later: [], log: [], recent: [], over: null, kidnapTurn: -1, okBonus: {} };
    D.DISTRICTS.forEach(() => S.d.push({ o: null, b: [], ent: false }));
    D.FACTIONS.forEach(f => {
      S.f[f.id] = { id: f.id, men: 8, guns: 0, cars: 0, money: 0, rep: 10, heat: 0, alive: true, acc: 0 };
      S.d[D.DISTRICTS.find(d => d.name === f.home).id].o = f.id;
    });
    Object.keys(D.OFFICIALS).forEach(k => S.off[k] = 0);
    const p = P(S);
    if (playerId === 'lub') p.men += 6;
    if (playerId === 'cher') p.money = 30;
    if (playerId === 'tag') S.off.uch = 1;
    S.ap = apMax(S);
    log(S, 'Декабрь 1991-го. Ты глава бригады, у тебя один район и восемь пацанов.', 'big');
    pickEvent(S);
    return S;
  }

  // ---------- показатели ----------
  const power = f => f.men + Math.min(f.men, f.guns) + 0.5 * Math.min(f.men, f.cars * 4);
  const owned = (S, fid) => S.d.reduce((a, d, i) => (d.o === fid && a.push(i), a), []);
  const count = (S, fid) => S.d.reduce((n, d) => n + (d.o === fid ? 1 : 0), 0);
  const defFactor = n => clamp(1.4 / Math.sqrt(n + 1), 0.2, 1);
  const okrugIds = ok => D.DISTRICTS.filter(d => d.ok === ok).map(d => d.id);
  const okrugHeld = (S, fid, ok) => okrugIds(ok).every(i => S.d[i].o === fid);
  const okrugsHeld = (S, fid) => Object.keys(D.OKRUGS).filter(ok => okrugHeld(S, fid, ok));
  const conn = S => Object.keys(S.off).reduce((s, k) => s + S.off[k] * D.OFFICIALS[k].w, 0);
  const apMax = S => Math.min(6, 3 + okrugsHeld(S, S.player).length + (P(S).rep >= 60 ? 1 : 0));
  const menCap = (S, fid) => 10 + count(S, fid) * 6 + Math.floor(S.f[fid].rep / 2);
  function lawLevel(heat) { let l = 0; D.LAW.forEach((x, i) => { if (heat >= x.at) l = i; }); return l; }

  function districtDef(S, i) {
    const d = S.d[i], dd = D.DISTRICTS[i];
    if (!d.o) return Math.round((5 + dd.inc + S.turn * 0.25) * (dd.ok === 'CAO' ? 1.5 : 1));
    let v = power(S.f[d.o]) * defFactor(count(S, d.o)) * 1.4 + S.turn * 0.1;
    if (d.o === S.player) v += d.b.reduce((s, b) => s + (D.BUILDS[b].def || 0), 0);
    return Math.max(3, Math.round(v));
  }
  function attackable(S, i) {
    if (S.d[i].o === S.player) return false;
    return GEO.adj[i].some(j => S.d[j].o === S.player);
  }
  const inTruce = (S, fid) => (S.truce[fid] || -1) >= S.turn;

  function buildCost(S, k) { return D.BUILDS[k].cost; }
  function officialCost(S, k) { return Math.round(D.OFFICIALS[k].cost * (perk(S, 'solnc') ? 0.75 : 1)); }
  const gunPrice = S => perk(S, 'kopt') ? 2 : 3;
  const CAR_PRICE = 12;

  function projIncome(S, pr) {
    const st = S.proj[pr.id]; if (!st || st.stage !== 3) return 0;
    let v = pr.inc * (st.mult || 1);
    if (pr.pyramid) v *= Math.pow(1.08, st.age || 0);
    return Math.round(v);
  }
  function income(S) {
    const pid = S.player, p = P(S), rows = []; let white = 0, black = 0;
    let dist = 0, pts = 0, ents = 0;
    const held = okrugsHeld(S, pid);
    owned(S, pid).forEach(i => {
      const dd = D.DISTRICTS[i];
      dist += dd.inc * (held.includes(dd.ok) ? 2 : 1);
      S.d[i].b.forEach(b => { const B = D.BUILDS[b], v = B.inc + (perk(S, 'tush') ? 1 : 0); pts += v; if (B.kind === 'w') white += v; else black += v; });
      if (S.d[i].ent) { ents += dd.ent.inc; white += dd.ent.inc; }
    });
    black += dist;
    rows.push(['Дань с районов', dist], ['Точки и недвижимость', pts], ['Предприятия', ents]);
    let pj = 0;
    D.PROJECTS.forEach(pr => { const v = projIncome(S, pr); pj += v; if (pr.kind === 'w') white += v; else black += v; });
    rows.push(['Крупный бизнес', pj]);
    const upkeep = Math.round(p.men * 0.3 * era(S)), bribes = Object.keys(S.off).reduce((s, k) => s + S.off[k] * D.OFFICIALS[k].keep, 0);
    rows.push(['Содержание бойцов', -upkeep], ['Зарплата людям во власти', -bribes]);
    return { rows, total: dist + pts + ents + pj - upkeep - bribes, white, black };
  }
  function heatDelta(S) {
    let v = -2 - Object.keys(S.off).reduce((s, k) => s + S.off[k] * D.OFFICIALS[k].cool, 0);
    if (perk(S, 'tag')) v -= 1;
    D.PROJECTS.forEach(pr => { if ((S.proj[pr.id] || {}).stage === 3) v += pr.heat; });
    v += Math.floor(count(S, S.player) / 5);
    return v;
  }

  // ---------- действия игрока ----------
  const fail = msg => ({ ok: false, msg });
  function spend(S, ap) { if (S.over) return 'Игра окончена'; if (S.event) return 'Сначала реши, что делать с событием'; if (S.ap < ap) return 'Ходы на этот месяц кончились'; return null; }
  function addRep(S, v) { const p = P(S); p.rep = clamp(p.rep + v, 0, 100); }
  function addHeat(S, v) { const p = P(S); p.heat = clamp(p.heat + v, 0, 100); }

  function recruit(S) {
    const e = spend(S, 1); if (e) return fail(e);
    const p = P(S), cap = menCap(S, S.player);
    if (p.men >= cap) return fail('Больше людей район не даст. Нужны новые районы или авторитет');
    const n = Math.min(cap - p.men, 3 + Math.floor(p.rep / 10) + (perk(S, 'oreh') ? 2 : 0));
    p.men += n; S.ap--;
    return { ok: true, msg: 'В бригаду пришли ' + n + ' чел.' };
  }
  function buyGuns(S) {
    const e = spend(S, 0); if (e) return fail(e);
    const p = P(S), c = gunPrice(S) * 5;
    if (p.money < c) return fail('Не хватает денег: нужно ' + c);
    p.money -= c; p.guns += 5; addRep(S, 0.4);
    return { ok: true, msg: 'Куплено 5 стволов' };
  }
  function buyCar(S) {
    const e = spend(S, 0); if (e) return fail(e);
    const p = P(S);
    if (p.money < CAR_PRICE) return fail('Не хватает денег: нужно ' + CAR_PRICE);
    p.money -= CAR_PRICE; p.cars += 1; addRep(S, 0.4);
    return { ok: true, msg: 'В гараже новая тачка' };
  }

  const SHARES = [0.35, 0.65, 1], HEATS = [4, 7, 11], KINDS = ['Наезд', 'Разборка', 'Война'];
  // на разборку едут на тачках: 4 бойца на машину, ещё 10 доберутся сами
  const strike = (f, share) => Math.max(1, Math.min(Math.round(f.men * share), 10 + f.cars * 4));
  function fight(S, att, i, share) {
    const d = S.d[i], A0 = S.f[att], defender = d.o ? S.f[d.o] : null;
    const defBase = districtDef(S, i);
    const committed = strike(A0, share);
    let A = power(A0) * committed / Math.max(1, A0.men) * rr(S, 0.8, 1.25); if (att === S.player && perk(S, 'izm')) A *= 1.2;
    const Dv = defBase * rr(S, 0.85, 1.15), ratio = A / Dv, win = A > Dv;
    let la = Math.round(committed * clamp(0.22 / ratio, 0.06, 0.45) * (win ? 1 : 1.5));
    if (att === S.player && perk(S, 'medv')) la = Math.round(la * 0.7);
    la = Math.min(la, A0.men); A0.men -= la; A0.guns = Math.max(0, A0.guns - Math.floor(la / 2));
    let ld = 0;
    if (defender) { const dm = Math.round(defender.men * defFactor(count(S, d.o))); ld = Math.min(defender.men, Math.round(dm * clamp(0.18 * ratio, 0.05, 0.5))); defender.men -= ld; defender.guns = Math.max(0, defender.guns - Math.floor(ld / 2)); }
    const prev = d.o;
    if (win) { d.o = att; d.ent = false; if (prev && count(S, prev) === 0) { S.f[prev].alive = false; S.f[prev].men = 0; log(S, fdef(prev).name + ' потеряли последний район. Бригады больше нет.', 'big'); } }
    return { win, la, ld, prev };
  }
  function attack(S, i, lvl) {
    const e = spend(S, 1); if (e) return fail(e);
    if (!attackable(S, i)) return fail('Нападать можно только на районы, которые граничат с твоими');
    const d = S.d[i], dd = D.DISTRICTS[i], p = P(S);
    if (d.o && inTruce(S, d.o)) return fail('С этой бригадой перемирие');
    if (p.men < 3) return fail('Некого посылать');
    S.ap--;
    const heldBefore = okrugHeld(S, S.player, dd.ok);
    const r = fight(S, S.player, i, SHARES[lvl]);
    addHeat(S, HEATS[lvl] + (dd.ok === 'CAO' ? 2 : 0));
    let msg;
    if (r.win) {
      addRep(S, r.prev ? 1.5 : 0.7);
      msg = KINDS[lvl] + ': ' + dd.name + ' теперь твой. Потери: ' + r.la + (r.prev ? ', у противника ' + r.ld : '');
      log(S, 'Взят район ' + dd.name + (r.prev ? ' (' + fdef(r.prev).name + ')' : '') + '. Потери: ' + r.la, 'good');
      if (!heldBefore && okrugHeld(S, S.player, dd.ok) && !S.okBonus[dd.ok]) { S.okBonus[dd.ok] = 1; addRep(S, 10); log(S, D.OKRUGS[dd.ok].name + ' полностью твой. Дань с округа удвоена, +1 ход в месяц.', 'big'); msg += '. Весь ' + D.OKRUGS[dd.ok].short + ' под тобой'; }
      checkWin(S);
    } else {
      addRep(S, -2);
      msg = KINDS[lvl] + ' провалилась: ' + dd.name + ' устоял. Потери: ' + r.la;
      log(S, 'Не удалось взять ' + dd.name + '. Потери: ' + r.la, 'bad');
    }
    return { ok: true, msg, win: r.win };
  }
  function winOdds(S, i, lvl) { // оценка без изменения состояния
    const def = districtDef(S, i), p = P(S), base = power(p) * strike(p, SHARES[lvl]) / Math.max(1, p.men) * (perk(S, 'izm') ? 1.2 : 1); let w = 0;
    for (let k = 0; k < 200; k++) if (base * (0.8 + Math.random() * 0.45) > def * (0.85 + Math.random() * 0.3)) w++;
    return w / 200;
  }

  function canBuild(S, i, k) {
    const B = D.BUILDS[k], d = S.d[i], dd = D.DISTRICTS[i], p = P(S), y = date(S.turn).year;
    if (d.o !== S.player) return 'Район не твой';
    if (B.from && y < B.from) return 'Доступно с ' + B.from + ' года';
    if (B.onlyMarket && !dd.m) return 'На районе нет рынка';
    if (B.one && d.b.includes(k)) return 'Уже есть';
    if (d.b.length >= dd.slots) return 'Нет свободных мест';
    if (B.needMen && p.men < B.needMen) return 'Нужно бойцов: ' + B.needMen;
    if (B.needConn && conn(S) < B.needConn) return 'Нужны связи: ' + B.needConn;
    if (p.money < buildCost(S, k)) return 'Не хватает денег';
    return null;
  }
  function build(S, i, k) {
    const e = spend(S, 1) || canBuild(S, i, k); if (e) return fail(e);
    const B = D.BUILDS[k];
    P(S).money -= buildCost(S, k); S.d[i].b.push(k); S.ap--;
    if (B.heat) addHeat(S, B.heat);
    return { ok: true, msg: B.name + ': ' + D.DISTRICTS[i].name + '. +' + (B.inc + (perk(S, 'tush') ? 1 : 0)) + ' в месяц' };
  }
  function kidnap(S, i) {
    const e = spend(S, 1); if (e) return fail(e);
    const p = P(S);
    if (S.d[i].o !== S.player) return fail('Район не твой');
    if (S.kidnapTurn === S.turn) return fail('В этом месяце уже было похищение. Город на ушах');
    if (p.men < 4) return fail('Нужно 4 бойца');
    S.ap--; S.kidnapTurn = S.turn;
    if (rnd(S) < clamp(0.55 + p.rep / 400, 0, 0.85)) {
      const m = Math.round(rr(S, 20, 50) * era(S)); p.money += m; addHeat(S, 7); addRep(S, 1);
      log(S, 'Похищение коммерсанта: семья заплатила ' + m, 'good');
      return { ok: true, msg: 'Семья заплатила выкуп: ' + m + ' тыс. $' };
    }
    const l = Math.min(p.men, ri(S, 1, 3)); p.men -= l; addHeat(S, 11); addRep(S, -2);
    log(S, 'Похищение сорвалось. Задержаны: ' + l, 'bad');
    return { ok: true, msg: 'Засада на передаче денег. Потеряно бойцов: ' + l };
  }
  function raidOdds(S, i) {
    const e = D.DISTRICTS[i].ent, p = P(S);
    return clamp(50 + (p.men - e.men) * 0.8 + (conn(S) - e.conn) * 8 + p.rep / 5, 10, 95);
  }
  function raid(S, i) {
    const er = spend(S, 2); if (er) return fail(er === 'Ходы на этот месяц кончились' ? 'Захват предприятия требует 2 хода' : er);
    const dd = D.DISTRICTS[i], e = dd.ent, p = P(S), d = S.d[i];
    if (!e || d.o !== S.player) return fail('Предприятие должно стоять на твоём районе');
    if (d.ent) return fail('Предприятие уже твоё');
    if (p.men < e.men) return fail('Нужно бойцов: ' + e.men);
    if (conn(S) < e.conn) return fail('Нужны люди во власти. Связи: ' + e.conn + ', у тебя ' + conn(S));
    if (p.money < e.cost) return fail('На суды, реестр и нотариусов нужно ' + e.cost);
    S.ap -= 2; p.money -= e.cost;
    if (rnd(S) * 100 < raidOdds(S, i)) {
      d.ent = true; addRep(S, 6); addHeat(S, 6);
      log(S, 'Захвачено предприятие: ' + e.name + '. Бойцы заняли проходную, суд признал нового собственника.', 'big');
      return { ok: true, msg: e.name + ' под тобой. +' + e.inc + ' в месяц' };
    }
    const l = Math.min(p.men, ri(S, 3, 8)); p.men -= l; addHeat(S, 12); addRep(S, -4);
    log(S, 'Захват «' + e.name + '» сорван: директор вызвал ОМОН. Потери: ' + l, 'bad');
    return { ok: true, msg: 'Захват сорвался. Деньги ушли, бойцов потеряно: ' + l };
  }
  function hire(S, k) {
    const e = spend(S, 1); if (e) return fail(e);
    const O = D.OFFICIALS[k], p = P(S), c = officialCost(S, k);
    if (date(S.turn).year < O.from) return fail('Доступно с ' + O.from + ' года');
    if (S.off[k] >= D.OFFICIAL_MAX) return fail('Больше таких людей не купить');
    if (p.money < c) return fail('Не хватает денег: нужно ' + c);
    p.money -= c; S.off[k]++; S.ap--;
    return { ok: true, msg: O.name + ' теперь получает у тебя зарплату' };
  }
  const bribeCost = S => Math.round((15 + lawLevel(P(S).heat) * 20) * era(S));
  function bribe(S) {
    const e = spend(S, 1); if (e) return fail(e);
    const p = P(S), c = bribeCost(S);
    if (p.heat < 5) return fail('К тебе и так нет вопросов');
    if (p.money < c) return fail('Не хватает денег: нужно ' + c);
    p.money -= c; S.ap--; addHeat(S, -12);
    return { ok: true, msg: 'Конверт дошёл. Розыск −12' };
  }
  function truce(S, fid) {
    const e = spend(S, 1); if (e) return fail(e);
    const p = P(S), f = S.f[fid];
    if (!f || !f.alive || fid === S.player) return fail('Не с кем договариваться');
    if (inTruce(S, fid)) return fail('Перемирие уже действует');
    const c = Math.round(15 + power(f) / 3);
    if (p.money < c) return fail('На стол и подарки нужно ' + c);
    S.ap--; p.money -= c;
    if (rnd(S) * 100 < clamp(45 + p.rep / 2 + (power(p) > power(f) ? 15 : -10), 10, 95)) { S.truce[fid] = S.turn + 12; log(S, 'Стрелка с бригадой ' + fdef(fid).name + ': мир на год.', 'good'); return { ok: true, msg: 'Договорились. Год друг друга не трогаете' }; }
    addRep(S, -1);
    return { ok: true, msg: 'Не договорились. Они считают, что ты слаб' };
  }
  const truceCost = (S, fid) => Math.round(15 + power(S.f[fid]) / 3);

  // крупный бизнес
  function projStatus(S, pr) {
    const st = S.proj[pr.id] || { stage: 0 }, p = P(S), y = date(S.turn).year;
    if (st.dead) return { st, lock: 'Закрыто навсегда' };
    if (st.stage === 3) return { st, lock: null };
    if (y < pr.from) return { st, lock: 'Откроется в ' + pr.from + ' году' };
    if (p.rep < pr.rep) return { st, lock: 'Нужен авторитет: ' + pr.rep };
    if (st.last === S.turn) return { st, lock: 'Следующий шаг в новом месяце' };
    return { st, lock: null };
  }
  function negChances(S, pr) {
    const p = P(S);
    return { share: clamp(55 + p.rep * 0.4, 0, 90), bribe: clamp(65 + conn(S) * 4, 0, 95), force: clamp(25 + power(p) / 4, 0, 75) };
  }
  function projStep(S, id, how) {
    const e = spend(S, 1); if (e) return fail(e);
    const pr = D.PROJECTS.find(x => x.id === id), ps = projStatus(S, pr), p = P(S);
    if (ps.lock) return fail(ps.lock);
    const st = S.proj[id] = S.proj[id] || { stage: 0 };
    if (st.stage === 0) {
      if (p.money < pr.trip) return fail('На поездку нужно ' + pr.trip);
      p.money -= pr.trip; st.stage = 1; st.last = S.turn; S.ap--;
      return { ok: true, msg: 'Ты слетал в ' + pr.where + '. Встреча назначена: ' + pr.who };
    }
    if (st.stage === 1) {
      const ch = negChances(S, pr); let c = 0;
      if (how === 'bribe') { c = Math.round(pr.buy * 0.2); if (p.money < c) return fail('Нужно ' + c + ' на подарок'); }
      if (!ch[how]) return fail('Выбери, как вести разговор');
      S.ap--; st.last = S.turn; p.money -= c;
      if (how === 'force') addHeat(S, 6);
      if (rnd(S) * 100 < ch[how]) { st.stage = 2; st.mult = how === 'share' ? 0.75 : 1; addRep(S, 1); return { ok: true, msg: 'Договорились. Осталось внести деньги: ' + pr.buyLabel.toLowerCase() }; }
      st.stage = 0; addRep(S, -2);
      let msg = 'Не договорились. Придётся искать новый выход и лететь снова';
      if (how === 'force') { const l = Math.min(p.men, ri(S, 2, 5)); p.men -= l; msg = 'Разговор кончился стрельбой. Потеряно бойцов: ' + l; }
      return { ok: true, msg };
    }
    if (st.stage === 2) {
      if (p.money < pr.buy) return fail(pr.buyLabel + ': нужно ' + pr.buy);
      p.money -= pr.buy; st.stage = 3; st.age = 0; st.last = S.turn; S.ap--; addRep(S, pr.kind === 'w' ? 4 : 3);
      log(S, 'Запущен бизнес: ' + pr.name + '. +' + projIncome(S, pr) + ' в месяц.', 'big');
      return { ok: true, msg: pr.name + ': дело пошло. +' + projIncome(S, pr) + ' в месяц' };
    }
    return fail('Бизнес уже работает');
  }
  function cashOut(S) {
    const e = spend(S, 1); if (e) return fail(e);
    const st = S.proj.pyramid; if (!st || st.stage !== 3) return fail('Пирамиды нет');
    const pr = D.PROJECTS.find(x => x.id === 'pyramid'), m = projIncome(S, pr) * 2;
    P(S).money += m; st.stage = 0; st.dead = true; S.ap--; addRep(S, -5); addHeat(S, 8);
    log(S, 'Ты закрыл пирамиду и вывез кассу: ' + m + '. Вкладчики остались у дверей.', 'big');
    return { ok: true, msg: 'Касса вывезена: +' + m };
  }

  // ---------- события ----------
  function pickEvent(S) {
    const dt = date(S.turn);
    let ev = EVENTS.find(e => e.date && e.date[0] === dt.year && e.date[1] === dt.month);
    if (!ev) {
      const pool = EVENTS.filter(e => !e.date && (!e.from || dt.year >= e.from) && !S.recent.includes(e.id));
      ev = pool[Math.floor(rnd(S) * pool.length)];
      S.recent.push(ev.id); if (S.recent.length > 16) S.recent.shift();
    }
    S.event = ev.id;
  }
  const currentEvent = S => S.event ? EVENTS.find(e => e.id === S.event) : null;
  function optState(S, o) {
    const p = P(S), m = era(S), cost = o.$ < 0 ? Math.round(-o.$ * m) : 0;
    if (cost > Math.max(0, p.money)) return { cost, lock: 'Нужно ' + cost + ' тыс. $' };
    if (o.needConn && conn(S) < o.needConn) return { cost, lock: 'Нужны связи: ' + o.needConn };
    return { cost, lock: null };
  }
  function choose(S, k) {
    const ev = currentEvent(S); if (!ev) return fail('Нет события');
    let o = ev.opts[k]; if (!o) return fail('Нет такого варианта');
    const os = optState(S, o); if (os.lock) return fail(os.lock);
    const p = P(S), m = era(S);
    if (os.cost) p.money -= os.cost; // цена варианта платится всегда
    let res = o;
    if (o.alt && rnd(S) < o.alt.p) res = Object.assign({ $: 0 }, o.alt);
    const dl = {};
    const gain = res.$ > 0 ? Math.round(res.$ * m) : 0; p.money += gain; dl.money = gain - os.cost;
    if (res.rep) { addRep(S, res.rep); dl.rep = res.rep; }
    if (res.heat) { addHeat(S, res.heat); dl.heat = res.heat; }
    if (res.men) { const v = Math.max(-p.men, res.men); p.men += v; dl.men = v; }
    if (res.guns) { p.guns += res.guns; dl.guns = res.guns; }
    if (res.cars) { p.cars += res.cars; dl.cars = res.cars; }
    if (res.later) { const amt = Math.round(res.later * m); S.later.push({ t: S.turn + ri(S, 5, 9), amt, why: ev.title }); dl.later = amt; }
    S.event = null;
    log(S, ev.title + ': ' + res.r);
    return { ok: true, msg: res.r, delta: dl, title: ev.title };
  }

  // ---------- конец хода ----------
  function lawPressure(S) {
    const p = P(S), L = lawLevel(p.heat); if (!L) return;
    if (p.heat >= 100) {
      const c = Math.round(300 * era(S));
      if (conn(S) >= 8 && p.money >= c) { p.money -= c; p.heat = 70; addRep(S, -5); log(S, 'ФСБ пришла за тобой лично. Свои люди наверху развалили дело за ' + c + '.', 'big'); return; }
      S.over = { type: 'jail', title: 'СИЗО «Лефортово»', text: 'Тебя взяли на рассвете. Спецназ ФСБ, наручники, камеры телевидения. Наверху не нашлось никого, кто снял бы трубку. Бригаду поделили за неделю.' };
      return;
    }
    if (rnd(S) > 0.1 + 0.05 * L) return;
    const who = D.LAW[L].name;
    let n = L === 1 ? ri(S, 1, 2) : L === 2 ? ri(S, 2, 5) : L === 3 ? Math.max(4, Math.round(p.men * rr(S, 0.1, 0.15))) : Math.max(8, Math.round(p.men * rr(S, 0.18, 0.25)));
    n = Math.min(n, p.men); if (!n) return;
    let jail = 0, dead = 0, free = 0; const pk = 0.12 + 0.04 * L, pf = clamp(0.3 + conn(S) * 0.03, 0, 0.7);
    for (let i = 0; i < n; i++) { const x = rnd(S); if (x < pk) dead++; else if (x < pk + pf) free++; else jail++; }
    p.men -= jail + dead;
    if (jail) S.jail.push({ n: jail, t: S.turn + ri(S, 12, 36) });
    const rep = Math.ceil(free / 2) - dead - Math.floor(jail / 4);
    addRep(S, clamp(rep, -6, 4));
    let s = who + ': задержано ' + n + '. ';
    if (jail) s += 'Сели: ' + jail + '. '; if (dead) s += 'Убиты при задержании: ' + dead + '. '; if (free) s += 'Отпущены: ' + free + '. ';
    if (L >= 3 && p.money > 0) { const fr = Math.round(p.money * (L === 3 ? 0.1 : 0.2)); p.money -= fr; s += 'Счета арестованы: −' + fr + '. '; }
    if (L === 4 && rnd(S) < 0.3) {
      const act = D.PROJECTS.filter(pr => (S.proj[pr.id] || {}).stage === 3);
      if (act.length) { const pr = act[Math.floor(rnd(S) * act.length)]; S.proj[pr.id] = { stage: 0 }; s += 'Изъят бизнес: ' + pr.name + '. '; }
    }
    s += 'Авторитет ' + (rep >= 0 ? '+' : '') + clamp(rep, -6, 4) + '.';
    log(S, s, 'law'); S.lastLaw = { turn: S.turn, text: s, who };
  }

  function aiTurn(S, fid) {
    const f = S.f[fid]; if (!f.alive) return;
    const n = count(S, fid);
    f.acc += 1 + n * 0.3; const add = Math.floor(f.acc); f.acc -= add;
    f.men = Math.min(menCap(S, fid), f.men + add);
    f.money += n * 3 * (1 + S.turn / 90);
    while (f.money >= 15 && f.guns < f.men) { f.money -= 15; f.guns += 5; }
    while (f.money >= 12 && f.cars * 4 < f.men) { f.money -= 12; f.cars++; }
    f.rep = clamp(10 + n * 2, 0, 100);
    if (rnd(S) < 0.05) { const l = Math.round(f.men * 0.15); f.men -= l; if (l > 6) log(S, 'Силовики накрыли бригаду ' + fdef(fid).name + ': минус ' + l + ' бойцов.'); }
    let tries = 1 + (n > 8 ? 1 : 0) + (count(S, S.player) > 25 ? 1 : 0); const lead = count(S, S.player) > n * 1.5;
    while (tries-- > 0) {
      if (rnd(S) > (lead ? 0.55 : 0.22)) continue;
      const home = fdef(fid), homeOk = D.DISTRICTS.find(d => d.name === home.home).ok;
      const cand = new Set(); owned(S, fid).forEach(i => GEO.adj[i].forEach(j => { if (S.d[j].o !== fid) cand.add(j); }));
      let best = -1, bv = 1e9;
      cand.forEach(j => {
        const o = S.d[j].o;
        if (o === S.player && (S.turn < 12 || inTruce(S, fid))) return;
        const v = districtDef(S, j) * (D.DISTRICTS[j].ok === homeOk ? 0.8 : 1) * (lead && o === S.player ? 0.7 : 1) * (0.85 + rnd(S) * 0.3);
        if (v < bv) { bv = v; best = j; }
      });
      if (best < 0 || power(f) * strike(f, 0.65) / Math.max(1, f.men) < districtDef(S, best) * (S.d[best].o === S.player ? 1.3 : 1.2)) continue;
      const wasPlayer = S.d[best].o === S.player, r = fight(S, fid, best, 0.65), nm = D.DISTRICTS[best].name;
      if (wasPlayer) {
        if (r.win) { addRep(S, -3); log(S, fdef(fid).name + ' отбили у тебя ' + nm + '. Твои потери: ' + r.ld, 'bad'); S.lost = (S.lost || []).concat(nm); }
        else { addRep(S, 2); log(S, fdef(fid).name + ' напали на ' + nm + ', но ты удержал район. Твои потери: ' + r.ld, 'good'); }
      } else if (r.win && r.prev) log(S, fdef(fid).name + ' забрали ' + nm + ' у бригады ' + fdef(r.prev).name + '.');
    }
  }

  function checkWin(S) {
    if (S.d.every(d => d.o === S.player)) S.over = { type: 'win', title: 'Хозяин Москвы', text: 'Все сто два района платят тебе. В городе не осталось никого, кто мог бы возразить.' };
  }
  function finale(S) {
    const p = P(S), inc = income(S), c = conn(S), n = count(S, S.player), tot = inc.white + inc.black || 1, wshare = inc.white / tot;
    const score = Math.round(p.money / 10 + n * 20 + p.rep * 5 + c * 30 + inc.white * 5);
    let title, text;
    if (c >= 12 && wshare >= 0.5 && p.heat < 40) { title = 'Сенатор'; text = 'Декабрь 2007-го. У тебя кабинет в Совете Федерации, мигалка и неприкосновенность. Бригада называется холдингом, бойцы носят галстуки. Криминал не проиграл власти. Он ею стал.'; }
    else if (wshare >= 0.5 && p.money > 3000) { title = 'Олигарх'; text = 'Декабрь 2007-го. Ты в списке журнала о богатых людях. О девяностых в интервью говоришь коротко: «Время было такое». Половина твоих партнёров носит погоны.'; }
    else if (p.heat >= 60) { title = 'Беглец'; text = 'Декабрь 2007-го. Ты смотришь новости из России на вилле под Марбельей. Интерпол прислал запрос, адвокаты пока справляются. Домой дороги нет.'; }
    else if (n >= 15) { title = 'Смотрящий'; text = 'Декабрь 2007-го. Ты остался тем, кем был: хозяином улиц. Но улицы теперь принадлежат людям с удостоверениями, и тебе всё чаще напоминают об этом.'; }
    else { title = 'Авторитетный предприниматель'; text = 'Декабрь 2007-го. У тебя пара ресторанов, охранная фирма и место на кладбище рядом с теми, кто не дожил. Ты дожил. По меркам твоего поколения это победа.'; }
    S.over = { type: 'end', title, text, score, stats: { money: Math.round(p.money), districts: n, rep: Math.round(p.rep), conn: c, white: Math.round(wshare * 100) } };
  }

  function endTurn(S) {
    if (S.over) return fail('Игра окончена');
    if (S.event) return fail('Сначала реши, что делать с событием');
    const p = P(S), report = [];
    S.lost = []; S.lastLaw = null;
    const inc = income(S); p.money += inc.total; report.push('Касса: ' + (inc.total >= 0 ? '+' : '') + inc.total);
    S.later = S.later.filter(l => { if (l.t <= S.turn) { p.money += l.amt; log(S, 'Вернулись вложения («' + l.why + '»): +' + l.amt, 'good'); return false; } return true; });
    if (p.money < 0) { const l = Math.max(1, Math.round(p.men * 0.1)); p.men = Math.max(0, p.men - l); addRep(S, -2); log(S, 'Общак пуст, платить нечем. Ушли бойцы: ' + l, 'bad'); }
    D.PROJECTS.forEach(pr => {
      const st = S.proj[pr.id]; if (!st || st.stage !== 3) return;
      st.age++; if (pr.guns) p.guns += pr.guns; if (pr.cars) p.cars += pr.cars; if (pr.repTurn) addRep(S, pr.repTurn);
      if (pr.pyramid && st.age >= 8 && rnd(S) < 0.05 + 0.02 * (st.age - 8)) { S.proj[pr.id] = { stage: 0, dead: true }; addHeat(S, 25); addRep(S, -15); log(S, 'Пирамида рухнула. Толпа вкладчиков громит офис, прокуратура возбудила дело.', 'bad'); }
    });
    if (p.rep > 15) p.rep -= p.rep * 0.015;
    addHeat(S, heatDelta(S));
    lawPressure(S);
    S.jail = S.jail.filter(j => { if (j.t <= S.turn) { p.men += j.n; addRep(S, 1); log(S, 'Откинулись с зоны: ' + j.n + '. Вернулись в бригаду.', 'good'); return false; } return true; });
    if (!S.over) D.FACTIONS.forEach(f => { if (f.id !== S.player) aiTurn(S, f.id); });
    if (!S.over && count(S, S.player) === 0) S.over = { type: 'lost', title: 'Вынесли из Москвы', text: 'У тебя не осталось ни одного района. Бригада разбежалась по чужим. Тебе советуют уехать, пока дают.' };
    if (!S.over && S.turn >= LAST_TURN) finale(S);
    if (S.over) return { ok: true, msg: S.over.title, over: true };
    S.turn++; S.ap = apMax(S);
    pickEvent(S);
    return { ok: true, msg: date(S.turn).label, report };
  }

  G.Engine = { strike, SHARES, newGame, date, era, power, owned, count, defFactor, okrugIds, okrugHeld, okrugsHeld, conn, apMax, menCap, lawLevel, districtDef, attackable, inTruce, buildCost, officialCost, gunPrice, CAR_PRICE, income, heatDelta, projIncome, projStatus, negChances, winOdds, raidOdds, bribeCost, truceCost, canBuild, currentEvent, optState, LAST_TURN, KINDS,
    recruit, buyGuns, buyCar, attack, build, kidnap, raid, hire, bribe, truce, projStep, cashOut, choose, endTurn };
})(typeof window !== 'undefined' ? window.W90 : globalThis.W90);
