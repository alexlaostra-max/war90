const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');

for (const file of ['data', 'events', 'geo', 'engine']) {
  (0, eval)(readFileSync(join(__dirname, '../js', file + '.js'), 'utf8'));
}
const { Engine: E, DATA: D } = globalThis.W90;
const fid = 'solnc';

function game() {
  const absent = D.FACTIONS.filter(f => f.id !== fid).map(f => f.id);
  const state = E.newGame(fid, 42, null, absent);
  state.turn = 30;
  const player = state.f[fid];
  const district = E.owned(state, fid)[0];
  Object.assign(player, { event: null, money: 2000, clean: 100, usd: 100 });
  return { state, player, district };
}

test('demolition keeps levels aligned and frees a slot for a different business', () => {
  const { state, player, district } = game();
  const points = state.d[district];
  points.b = ['kiosk', 'service'];
  points.l = [1, 3];
  const { money, ap } = player;
  assert.ok(E.ACTIONS.demolish(state, fid, district, 0, 0).ok);
  assert.equal(E.ACTIONS.demolish(state, fid, district, 0, 0).ok, false);
  assert.deepEqual(points.b, ['service']);
  assert.deepEqual(points.l, [3]);
  assert.equal(player.money, money);
  assert.equal(player.ap, ap);
  assert.ok(E.ACTIONS.build(state, fid, district, 'gym').ok);
  assert.ok(E.ACTIONS.upgrade(state, fid, district, 1, 2).ok);
  assert.match(E.upgradeLock(state, 2), /1999/);
});

test('only white rubles buy dollars, and selling them adds white rubles', () => {
  const { state, player } = game();
  assert.equal(E.ACTIONS.exchange(state, fid, 'buy', 101).ok, false);
  const buy = E.fxQuote(state, fid, 'buy', 50);
  assert.ok(E.ACTIONS.exchange(state, fid, 'buy', 50).ok);
  assert.deepEqual(E.cash(player), { black: 1800, white: 50 });
  assert.equal(E.usdOf(player), 100 + buy.get);
  const sell = E.fxQuote(state, fid, 'sell', 15);
  assert.ok(E.ACTIONS.exchange(state, fid, 'sell', 15).ok);
  assert.deepEqual(E.cash(player), { black: 1800, white: 50 + sell.get });
  assert.equal(E.usdOf(player), 85 + buy.get);
});

test('business and deals launder remaining black cash at the end of the month', () => {
  const { state, player, district } = game();
  assert.equal(E.income(state, fid).wash, 0);
  Object.assign(state.d[district], { b: ['kiosk', 'casino'], l: [2, 1] });
  player.proj.bank = { stage: 3, age: 0 };
  const income = E.income(state, fid);
  assert.equal(Math.round(income.washRate * 100), 19);
  assert.ok(income.wash > 0);
  assert.ok(E.endTurn(state, true).ok);
  assert.equal(player.report.wash, income.wash);
  assert.ok(E.cash(player).white > 100);
  assert.equal(E.usdOf(player), 100 + income.usd);
});
