const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');

for (const file of ['data', 'events', 'geo', 'engine']) {
  (0, eval)(readFileSync(join(__dirname, '../js', file + '.js'), 'utf8'));
}
const { Engine: E, DATA: D, GEO } = globalThis.W90;
const fid = 'solnc', opponent = 'oreh';

function game(seed = 42, enemies = [opponent]) {
  const absent = D.FACTIONS.filter(f => f.id !== fid && !enemies.includes(f.id)).map(f => f.id);
  const state = E.newGame(fid, seed, null, absent);
  const p = state.f[fid];
  p.event = null;
  p.money = 20000;
  p.clean = 5000;
  p.usd = 1000;
  return { state, p };
}

test('January 1998 divides the ruble face value by 1000 without converting the dollars', () => {
  const { state, p } = game(42, []);
  state.turn = 72;
  assert.equal(E.date(state.turn).label, 'декабрь 1997');
  assert.equal(E.rubAmount(state, 1000), 5960000000);
  const before = E.rubAmount(state, E.cur(p).rub);
  assert.ok(E.endTurn(state, true).ok);
  assert.equal(E.date(state.turn).label, 'январь 1998');
  const after = E.rubAmount(state, E.cur(p).rub);
  assert.ok(Math.abs(before / after - 1000) < 2, `${before} → ${after}`);
  assert.equal(E.cur(p).usd, 1000);
  assert.equal(p.report.usd, 0);
  assert.equal(E.rubAmount(state, 1000), Math.round(1000000 * E.rubPerUsd(state)));
  assert.match(state.log.find(x => x.t === 73).s, /Деноминация/);
  const january = { ...state, fxn: 0 };
  const december = { ...state, turn: 72, fxn: 0 };
  E.rubPerUsd(december);
  p.event = null;
  const result = E.ACTIONS.exchange(january, fid, 'sell', 100);
  assert.match(result.msg, /582К ₽/);
});

test('September 1998 devalues the ruble wallet without devaluing the dollars', () => {
  const { state, p } = game(42, []);
  state.turn = 80;
  assert.equal(E.date(state.turn).label, 'август 1998');
  assert.ok(E.endTurn(state, true).ok);
  assert.equal(E.date(state.turn).label, 'сентябрь 1998');
  assert.equal(E.rubRate(state), 16);
  assert.equal(E.cur(p).usd, 1000);
  assert.ok(p.report.infl > 10000);
});

test('a bot offers to end the war and acceptance cancels pending attacks', () => {
  let match;
  for (let seed = 1; seed <= 50 && !match; seed++) {
    const { state, p } = game(seed);
    state.turn = 40;
    p.war = { [opponent]: 43 };
    E.endTurn(state, true);
    const offer = state.offers.find(o => o.kind === 'peace');
    if (offer) match = { state, p, offer };
  }
  assert.ok(match);
  const { state, p, offer } = match;
  const home = E.owned(state, fid)[0], end = state.turn + offer.x - 1;
  p.assaults = [{ att: opponent, i: home }];
  assert.ok(E.ACTIONS.answer(state, fid, offer.id, 1).ok);
  assert.equal(E.atWar(state, fid, opponent), false);
  assert.deepEqual(p.assaults, []);
  assert.equal(p.truce[opponent], end);
  assert.equal(state.f[opponent].truce[fid], end);
  assert.equal(E.ACTIONS.answer(state, fid, offer.id, 1).ok, false);
});

test('neighbors offer a truce or swap, and a swap transfers both districts together', () => {
  const homes = new Set(D.FACTIONS.map(f => D.DISTRICTS.find(d => d.name === f.home).id));
  const i = D.DISTRICTS.find(d => d.ent && !homes.has(d.id) && GEO.adj[d.id].some(j => !homes.has(j) && GEO.adj[j].some(k => k !== d.id && !homes.has(k)))).id;
  const j = GEO.adj[i].find(j => !homes.has(j) && GEO.adj[j].some(k => k !== i && !homes.has(k)));
  const a = GEO.adj[j].find(k => k !== i && !homes.has(k));
  const b = GEO.adj[i].find(k => k !== j && k !== a && !homes.has(k));
  let swap, truce;
  for (let seed = 1; seed <= 50 && !swap; seed++) {
    const { state, p } = game(seed);
    state.turn = 20;
    Object.assign(state.d[i], { o: opponent, b: ['kiosk'], l: [2], ent: true });
    for (const [d, o] of [[j, fid], [a, opponent], [b, fid]]) state.d[d].o = o;
    p.rel = { [opponent]: 60 };
    Object.assign(p.crew[0], { pos: 'watch', ok: E.watchKey(j) });
    E.endTurn(state, true);
    const offer = state.offers[0];
    if (offer?.kind === 'swap' && offer.i === i && offer.j === j) swap = { state, p, offer };
  }
  for (let seed = 1; seed <= 50 && !truce; seed++) {
    const { state, p } = game(seed);
    state.turn = 20;
    const home = E.owned(state, fid)[0];
    state.d[GEO.adj[home].find(i => !homes.has(i))].o = opponent;
    p.rel = { [opponent]: 35 };
    E.endTurn(state, true);
    const offer = state.offers[0];
    if (offer?.kind === 'truce') truce = { state, offer };
  }
  assert.ok(swap);
  assert.ok(truce);
  assert.ok(E.ACTIONS.answer(truce.state, fid, truce.offer.id, 0).ok);
  assert.equal(E.inTruce(truce.state, fid, opponent), false);

  const { state, p, offer } = swap;
  const stale = structuredClone(state);
  stale.d[j].o = null;
  assert.ok(E.ACTIONS.answer(stale, fid, offer.id, 1).expired);
  assert.equal(stale.d[i].o, opponent);
  assert.ok(E.ACTIONS.answer(state, fid, offer.id, 1).ok);
  assert.equal(state.d[i].o, fid);
  assert.equal(state.d[i].ent, true);
  assert.deepEqual(state.d[i].b, ['kiosk']);
  assert.deepEqual(state.d[i].l, [2]);
  assert.equal(state.d[j].o, opponent);
  assert.equal(p.crew[0].pos, null);
});

test('enemies can target a player with one district, and a truce prevents attempts', () => {
  let verified = 0;
  for (let seed = 1; seed <= 75; seed++) {
    const { state, p } = game(seed);
    state.turn = 40;
    p.war = { [opponent]: 43 };
    assert.equal(E.count(state, fid), 1);
    const peaceful = structuredClone(state);
    peaceful.f[fid].truce[opponent] = 45;
    assert.ok(E.endTurn(peaceful, true).ok);
    assert.equal(peaceful.f[fid].hitNotice, undefined);

    assert.ok(E.endTurn(state, true).ok);
    if (!p.hitNotice) continue;
    assert.equal(p.hitNotice.from, opponent);
    assert.ok(E.viewFor(state, fid).f[fid].hitNotice);
    assert.ok(E.ACTIONS.acknowledgeHit(state, fid).ok);
    assert.equal(p.hitNotice, undefined);
    E.endTurn(state, true);
    assert.equal(p.hitNotice, undefined);
    verified++;
  }
  assert.ok(verified > 0);
});
