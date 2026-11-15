/* Интерфейс: карта, панели, модальные окна */
(function () {
  const G = window.W90, E = G.Engine, D = G.DATA, GEO = G.GEO;
  const SAVE = 'war90.save.v2';
  let S = null, sel = null, tab = 'district', report = null, confirmNew = false;
  const FULL = GEO.box.slice(); let view = FULL.slice();
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fd = id => D.FACTIONS.find(f => f.id === id);
  const sign = v => (v > 0 ? '+' : '') + v;
  const R = Math.round;

  function save() { try { localStorage.setItem(SAVE, JSON.stringify(S)); } catch (e) { /* без сохранения */ } }
  function load() { try { const s = JSON.parse(localStorage.getItem(SAVE)); return s && s.v === 2 ? s : null; } catch (e) { return null; } }
  function wipe() { try { localStorage.removeItem(SAVE); } catch (e) { /* ignore */ } }

  // ---------- карта ----------
  const svg = $('#map');
  function buildMap() {
    const pth = c => 'M' + c.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z';
    let h = '<g id="cells">' + GEO.cells.map((c, i) => '<path class="cell" data-i="' + i + '" d="' + pth(c) + '"></path>').join('') + '</g><g id="okb">';
    GEO.borders.forEach(b => { if (D.DISTRICTS[b.i].ok !== D.DISTRICTS[b.j].ok) h += '<line x1="' + b.a[0].toFixed(1) + '" y1="' + b.a[1].toFixed(1) + '" x2="' + b.b[0].toFixed(1) + '" y2="' + b.b[1].toFixed(1) + '"></line>'; });
    h += '</g><path id="rim" d="' + pth(GEO.hull) + '"></path><g id="marks">';
    D.DISTRICTS.forEach((d, i) => { const c = GEO.centers[i]; if (d.ent) h += '<rect class="ent" data-m="' + i + '" x="' + (c[0] - 2.6).toFixed(1) + '" y="' + (c[1] - 10.5).toFixed(1) + '" width="5.2" height="5.2" transform="rotate(45 ' + c[0].toFixed(1) + ' ' + (c[1] - 7.9).toFixed(1) + ')"></rect>'; });
    h += '</g><g id="oklab">';
    Object.keys(D.OKRUGS).forEach(ok => { const ids = E.okrugIds(ok), x = ids.reduce((s, i) => s + GEO.centers[i][0], 0) / ids.length, y = ids.reduce((s, i) => s + GEO.centers[i][1], 0) / ids.length; h += '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '">' + D.OKRUGS[ok].short + '</text>'; });
    h += '</g><g id="labels">';
    D.DISTRICTS.forEach((d, i) => { const c = GEO.centers[i], parts = d.name.length > 11 ? d.name.split(/[- ]/) : [d.name]; h += '<text x="' + c[0].toFixed(1) + '" y="' + (c[1] + 2 - (parts.length - 1) * 3).toFixed(1) + '">' + parts.map((t, k) => '<tspan x="' + c[0].toFixed(1) + '" dy="' + (k ? 6.4 : 0) + '">' + esc(t) + '</tspan>').join('') + '</text>'; });
    svg.innerHTML = h + '</g>';
    applyView();
  }
  function applyView() {
    svg.setAttribute('viewBox', view.map(v => v.toFixed(1)).join(' '));
    svg.classList.toggle('zoomed', view[2] < FULL[2] * 0.62);
  }
  function zoomAt(f, cx, cy) {
    const w = Math.max(FULL[2] * 0.22, Math.min(FULL[2], view[2] * f)), k = w / view[2];
    view = [cx - (cx - view[0]) * k, cy - (cy - view[1]) * k, w, view[3] * k];
    clampView(); applyView();
  }
  function clampView() {
    view[0] = Math.max(FULL[0] - view[2] * 0.3, Math.min(FULL[0] + FULL[2] - view[2] * 0.7, view[0]));
    view[1] = Math.max(FULL[1] - view[3] * 0.3, Math.min(FULL[1] + FULL[3] - view[3] * 0.7, view[1]));
  }
  function svgPoint(e) { const r = svg.getBoundingClientRect(), sc = Math.max(view[2] / r.width, view[3] / r.height); return [view[0] + view[2] / 2 + (e.clientX - r.left - r.width / 2) * sc, view[1] + view[3] / 2 + (e.clientY - r.top - r.height / 2) * sc, sc]; }
  const ptrs = new Map(); let moved = 0, pinch = 0;
  svg.addEventListener('pointerdown', e => { ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; if (ptrs.size === 2) { const a = [...ptrs.values()]; pinch = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]); } });
  svg.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    const p = ptrs.get(e.pointerId), dx = e.clientX - p[0], dy = e.clientY - p[1];
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 2) { const a = [...ptrs.values()], dist = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]), c = svgPoint({ clientX: (a[0][0] + a[1][0]) / 2, clientY: (a[0][1] + a[1][1]) / 2 }); if (pinch) zoomAt(pinch / dist, c[0], c[1]); pinch = dist; moved = 99; return; }
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved > 6) { if (!svg.hasPointerCapture(e.pointerId)) svg.setPointerCapture(e.pointerId); const sc = svgPoint(e)[2]; view[0] -= dx * sc; view[1] -= dy * sc; clampView(); applyView(); }
  });
  const up = e => { const was = ptrs.has(e.pointerId); ptrs.delete(e.pointerId); pinch = 0; if (was && moved <= 6 && e.type === 'pointerup') { const t = document.elementFromPoint(e.clientX, e.clientY); if (t && t.dataset && t.dataset.i != null) { sel = +t.dataset.i; tab = 'district'; render(); } } };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  svg.addEventListener('wheel', e => { e.preventDefault(); const p = svgPoint(e); zoomAt(e.deltaY > 0 ? 1.18 : 0.85, p[0], p[1]); }, { passive: false });
  $('#zoom').addEventListener('click', e => { const z = e.target.dataset.z; if (!z) return; if (z === '0') { view = FULL.slice(); applyView(); } else zoomAt(z === '1' ? 0.7 : 1.4, view[0] + view[2] / 2, view[1] + view[3] / 2); });

  function paintMap() {
    svg.querySelectorAll('.cell').forEach(el => {
      const i = +el.dataset.i, o = S.d[i].o;
      el.style.fill = o ? fd(o).color : '';
      el.classList.toggle('mine', o === S.player);
      el.classList.toggle('foe', !!o && o !== S.player);
      el.classList.toggle('target', E.attackable(S, i));
      el.classList.toggle('sel', i === sel);
    });
    svg.querySelectorAll('.ent').forEach(el => el.classList.toggle('got', S.d[+el.dataset.m].ent));
    const s = svg.querySelector('.cell.sel'); if (s) s.parentNode.appendChild(s);
  }

  // ---------- шапка ----------
  function renderTop() {
    const p = S.f[S.player], inc = E.income(S), L = E.lawLevel(p.heat), cap = E.menCap(S, S.player);
    $('#date').textContent = E.date(S.turn).label;
    const st = (l, v, x, cls) => '<div class="st ' + (cls || '') + '"><span>' + l + '</span><b>' + v + '</b>' + (x ? '<i>' + x + '</i>' : '') + '</div>';
    let pips = ''; for (let i = 0; i < E.apMax(S); i++) pips += '<u class="' + (i < S.ap ? 'on' : '') + '"></u>';
    $('#stats').innerHTML =
      st('Касса, тыс. $', R(p.money), sign(inc.total) + ' в мес.', p.money < 0 ? 'bad' : '') +
      st('Бойцы', p.men, 'из ' + cap) + st('Стволы', p.guns) + st('Тачки', p.cars) +
      st('Авторитет', R(p.rep)) + st('Связи', E.conn(S)) +
      '<div class="st heat l' + L + '"><span>Розыск · ' + D.LAW[L].name + '</span><div class="meter"><em style="width:' + p.heat + '%"></em><s style="left:20%"></s><s style="left:40%"></s><s style="left:60%"></s><s style="left:80%"></s></div><i>' + R(p.heat) + ' из 100, ' + sign(E.heatDelta(S)) + ' в мес.</i></div>' +
      '<div class="st ap"><span>Ходы</span><div class="pips">' + pips + '</div></div>';
    $('#end').disabled = !!S.event || !!S.over;
  }

  // ---------- вкладки ----------
  const TABS = [['district', 'Район'], ['gang', 'Братва'], ['law', 'Власть'], ['biz', 'Бизнес'], ['clans', 'Кланы'], ['log', 'Хроника']];
  const btn = (label, a, attrs, lock, cls) => '<button class="btn ' + (cls || '') + '" data-a="' + a + '" ' + (attrs || '') + (lock ? ' disabled' : '') + '>' + label + (lock && typeof lock === 'string' ? '<small>' + esc(lock) + '</small>' : '') + '</button>';
  const kindTag = k => '<span class="tag ' + k + '">' + ({ w: 'белый', g: 'серый', b: 'чёрный' }[k]) + '</span>';

  function paneDistrict() {
    if (sel == null) return '<p class="muted">Выбери район на карте. Нападать можно только на районы, которые граничат с твоими: они обведены пунктиром.</p>';
    const d = S.d[sel], dd = D.DISTRICTS[sel], p = S.f[S.player], mine = d.o === S.player;
    const ids = E.okrugIds(dd.ok), have = ids.filter(i => S.d[i].o === S.player).length;
    let h = '<h2>' + esc(dd.name) + '</h2><p class="sub">' + D.OKRUGS[dd.ok].name + ' · у тебя ' + have + ' из ' + ids.length + '</p>';
    h += '<dl class="kv"><dt>Хозяин</dt><dd>' + (mine ? 'Ты' : d.o ? '<i class="dot" style="background:' + fd(d.o).color + '"></i>' + fd(d.o).name : 'Местная шпана') + '</dd><dt>Оборона</dt><dd>' + E.districtDef(S, sel) + '</dd><dt>Дань</dt><dd>' + dd.inc + ' в мес.</dd>' + (dd.m ? '<dt>Рынок</dt><dd>есть</dd>' : '') + '</dl>';
    if (dd.ent) {
      const e = dd.ent;
      h += '<div class="box"><h3>' + esc(e.name) + '</h3>';
      if (d.ent) h += '<p class="good">Под тобой. +' + e.inc + ' в мес.</p>';
      else {
        const ok = (v, need) => '<b class="' + (v >= need ? 'good' : 'bad') + '">' + need + '</b>';
        h += '<p>Доход ' + e.inc + ' в мес. Для захвата нужны бойцы ' + ok(p.men, e.men) + ', связи во власти ' + ok(E.conn(S), e.conn) + ' и ' + ok(p.money, e.cost) + ' тыс. $ на суды и реестр.</p>';
        if (mine) h += btn('Захватить предприятие · 2 хода · шанс ' + R(E.raidOdds(S, sel)) + '%', 'raid', '', p.men < e.men || E.conn(S) < e.conn || p.money < e.cost || S.ap < 2, 'wide');
        else h += '<p class="muted">Сначала возьми район.</p>';
      }
      h += '</div>';
    }
    if (mine) {
      h += '<h3>Точки <span class="muted">' + d.b.length + ' из ' + dd.slots + '</span></h3>';
      if (d.b.length) h += '<p class="chips">' + d.b.map(b => '<span>' + D.BUILDS[b].name + '</span>').join('') + '</p>';
      h += '<div class="grid">';
      Object.keys(D.BUILDS).forEach(k => {
        const B = D.BUILDS[k], lock = E.canBuild(S, sel, k);
        if (B.onlyMarket && !dd.m) return;
        h += '<button class="card" data-a="build" data-k="' + k + '"' + (lock || S.ap < 1 ? ' disabled' : '') + ' title="' + esc(B.desc) + '"><b>' + B.name + '</b>' + kindTag(B.kind) + '<span>' + (B.cost ? B.cost + ' тыс.' : 'бесплатно') + ' → +' + (B.inc + (S.player === 'tush' ? 1 : 0)) + '/мес.</span>' + (lock ? '<small>' + esc(lock) + '</small>' : '') + '</button>';
      });
      h += '</div>' + btn('Похитить коммерсанта', 'kidnap', '', S.kidnapTurn === S.turn ? 'раз в месяц' : p.men < 4 ? 'нужно 4 бойца' : S.ap < 1, 'wide');
    } else if (E.attackable(S, sel)) {
      if (d.o && E.inTruce(S, d.o)) h += '<p class="muted">С бригадой перемирие до ' + E.date(S.truce[d.o]).label + '.</p>';
      else {
        h += '<h3>Нападение</h3><div class="grid g3">';
        E.KINDS.forEach((k, l) => { h += '<button class="card atk" data-a="attack" data-l="' + l + '"' + (S.ap < 1 || p.men < 3 ? ' disabled' : '') + '><b>' + k + '</b><span>едут ' + E.strike(p, E.SHARES[l]) + ' бойцов</span><span>шанс ' + R(E.winOdds(S, sel, l) * 100) + '%</span><small>розыск +' + [4, 7, 11][l] + '</small></button>'; });
        h += '</div><p class="muted">На дело едут на тачках: 4 бойца на машину, ещё 10 доберутся сами.</p>';
      }
    } else h += '<p class="muted">Район не граничит с твоей территорией.</p>';
    return h;
  }

  function paneGang() {
    const p = S.f[S.player], inc = E.income(S), cap = E.menCap(S, S.player);
    let h = '<h2>' + fd(S.player).name + '</h2><p class="sub">' + esc(fd(S.player).perk) + '</p>';
    h += '<dl class="kv"><dt>Сила бригады</dt><dd>' + R(E.power(p)) + '</dd><dt>Бойцы</dt><dd>' + p.men + ' из ' + cap + '</dd><dt>Со стволом</dt><dd>' + Math.min(p.men, p.guns) + '</dd><dt>На колёсах</dt><dd>' + Math.min(p.men, p.cars * 4) + '</dd><dt>Районы</dt><dd>' + E.count(S, S.player) + ' из 102</dd></dl>';
    h += '<div class="grid">' +
      '<button class="card" data-a="recruit"' + (S.ap < 1 || p.men >= cap ? ' disabled' : '') + '><b>Вербовать</b><span>1 ход, бесплатно</span>' + (p.men >= cap ? '<small>предел: нужны районы и авторитет</small>' : '') + '</button>' +
      '<button class="card" data-a="guns"' + (p.money < E.gunPrice(S) * 5 ? ' disabled' : '') + '><b>5 стволов</b><span>' + E.gunPrice(S) * 5 + ' тыс., без хода</span></button>' +
      '<button class="card" data-a="car"' + (p.money < E.CAR_PRICE ? ' disabled' : '') + '><b>Тачка</b><span>' + E.CAR_PRICE + ' тыс., без хода</span></button></div>';
    h += '<p class="muted">Боец со стволом дерётся за двоих. Тачка возит четверых на разборку. Стволы и тачки поднимают авторитет.</p>';
    h += '<h3>Касса за месяц</h3><table class="tbl">' + inc.rows.filter(r => r[1]).map(r => '<tr><td>' + r[0] + '</td><td class="' + (r[1] < 0 ? 'bad' : 'good') + '">' + sign(r[1]) + '</td></tr>').join('') + '<tr class="sum"><td>Итого</td><td>' + sign(inc.total) + '</td></tr></table>';
    const tot = inc.white + inc.black;
    if (tot) h += '<p class="muted">Белый доход: ' + R(inc.white / tot * 100) + '%. К 2007 году выживут те, кто успел легализоваться.</p>';
    if (S.later.length) h += '<h3>Вложения в пути</h3><table class="tbl">' + S.later.map(l => '<tr><td>' + esc(l.why) + '</td><td class="good">+' + l.amt + '</td></tr>').join('') + '</table>';
    if (S.jail.length) h += '<h3>На зоне</h3><table class="tbl">' + S.jail.map(j => '<tr><td>' + j.n + ' чел.</td><td>выйдут: ' + E.date(j.t + 1).label + '</td></tr>').join('') + '</table>';
    return h;
  }

  function paneLaw() {
    const p = S.f[S.player], L = E.lawLevel(p.heat), y = E.date(S.turn).year;
    let h = '<h2>Власть</h2><p class="sub">Розыск ' + R(p.heat) + ' из 100 · ' + D.LAW[L].name + '</p><ol class="ladder">';
    const what = ['', 'Берут по одному-два бойца', 'Облавы: до пяти бойцов', 'Десятая часть бригады и арест счетов', 'Пятая часть бригады, счета, бизнес. На 100 придут за тобой'];
    D.LAW.forEach((l, i) => { if (i) h += '<li class="' + (i === L ? 'cur' : i < L ? 'past' : '') + '"><b>' + l.name + '</b><span>от ' + l.at + ' · ' + what[i] + '</span></li>'; });
    h += '</ol><p class="muted">Задержанных сажают, убивают при задержании или отпускают. От этого зависит авторитет. Чем больше связей, тем чаще отпускают.</p>';
    h += btn('Занести наверх · ' + E.bribeCost(S) + ' тыс. · розыск −12', 'bribe', '', p.heat < 5 ? 'вопросов нет' : p.money < E.bribeCost(S) ? 'не хватает денег' : S.ap < 1, 'wide');
    h += '<h3>Люди во власти <span class="muted">связи: ' + E.conn(S) + '</span></h3><div class="grid">';
    Object.keys(D.OFFICIALS).forEach(k => {
      const O = D.OFFICIALS[k], c = E.officialCost(S, k), lock = y < O.from ? 'с ' + O.from + ' года' : S.off[k] >= D.OFFICIAL_MAX ? 'больше не купить' : p.money < c ? 'не хватает денег' : '';
      h += '<button class="card" data-a="hire" data-k="' + k + '"' + (lock || S.ap < 1 ? ' disabled' : '') + '><b>' + O.name + '</b><em>' + S.off[k] + ' из ' + D.OFFICIAL_MAX + '</em><span>' + c + ' тыс. и ' + O.keep + ' в мес.</span><span>связи +' + O.w + ', розыск −' + O.cool + ' в мес.</span>' + (lock ? '<small>' + lock + '</small>' : '') + '</button>';
    });
    return h + '</div>';
  }

  function paneBiz() {
    const p = S.f[S.player];
    let h = '<h2>Крупный бизнес</h2><p class="sub">Три шага: поездка, переговоры, вход в капитал. Один шаг в месяц.</p>';
    D.PROJECTS.forEach(pr => {
      const ps = E.projStatus(S, pr), st = ps.st, stage = st.stage || 0;
      h += '<div class="box proj ' + (stage === 3 ? 'live' : '') + '"><h3>' + pr.name + ' ' + kindTag(pr.kind) + '</h3>';
      h += '<p>' + (stage === 3 ? '<b class="good">+' + E.projIncome(S, pr) + ' в мес.</b>' : 'Доход ' + pr.inc + ' в мес.') + (pr.heat ? ' · розыск ' + sign(pr.heat) + ' в мес.' : '') + (pr.note ? ' · ' + pr.note : '') + '</p>';
      if (stage === 3) { if (pr.pyramid) h += btn('Соскочить и вывезти кассу · +' + E.projIncome(S, pr) * 2, 'cashout', '', S.ap < 1, 'wide'); }
      else {
        h += '<ol class="steps"><li class="' + (stage > 0 ? 'done' : 'cur') + '">Поездка: ' + pr.where + '</li><li class="' + (stage > 1 ? 'done' : stage === 1 ? 'cur' : '') + '">Переговоры: ' + pr.who + '</li><li class="' + (stage === 2 ? 'cur' : '') + '">' + pr.buyLabel + '</li></ol>';
        if (ps.lock) h += '<p class="muted">' + ps.lock + '</p>';
        else if (stage === 0) h += btn('Лететь в ' + pr.where + ' · ' + pr.trip + ' тыс.', 'proj', 'data-k="' + pr.id + '"', p.money < pr.trip ? 'не хватает денег' : S.ap < 1, 'wide');
        else if (stage === 1) {
          const ch = E.negChances(S, pr), gift = R(pr.buy * 0.2);
          h += '<div class="grid g3">' +
            '<button class="card" data-a="proj" data-k="' + pr.id + '" data-h="share"' + (S.ap < 1 ? ' disabled' : '') + '><b>Взять в долю</b><span>шанс ' + R(ch.share) + '%</span><small>доход −25%</small></button>' +
            '<button class="card" data-a="proj" data-k="' + pr.id + '" data-h="bribe"' + (S.ap < 1 || p.money < gift ? ' disabled' : '') + '><b>Занести</b><span>шанс ' + R(ch.bribe) + '%</span><small>' + gift + ' тыс.</small></button>' +
            '<button class="card atk" data-a="proj" data-k="' + pr.id + '" data-h="force"' + (S.ap < 1 ? ' disabled' : '') + '><b>Надавить</b><span>шанс ' + R(ch.force) + '%</span><small>розыск +6</small></button></div>';
        } else h += btn(pr.buyLabel + ' · ' + pr.buy + ' тыс.', 'proj', 'data-k="' + pr.id + '"', p.money < pr.buy ? 'не хватает денег' : S.ap < 1, 'wide');
      }
      h += '</div>';
    });
    const ents = E.owned(S, S.player).filter(i => D.DISTRICTS[i].ent);
    if (ents.length) h += '<h3>Предприятия на твоих районах</h3><table class="tbl">' + ents.map(i => '<tr data-a="goto" data-i="' + i + '" class="link"><td>' + esc(D.DISTRICTS[i].ent.name) + '</td><td>' + (S.d[i].ent ? '<span class="good">+' + D.DISTRICTS[i].ent.inc + '</span>' : 'не взято') + '</td></tr>').join('') + '</table>';
    return h;
  }

  function paneClans() {
    const p = S.f[S.player];
    let h = '<h2>Кланы</h2><table class="tbl clans"><tr><th>Бригада</th><th>Районы</th><th>Сила</th><th></th></tr>';
    D.FACTIONS.slice().sort((a, b) => E.count(S, b.id) - E.count(S, a.id)).forEach(f => {
      const x = S.f[f.id], me = f.id === S.player;
      h += '<tr class="' + (x.alive ? '' : 'dead') + '"><td><i class="dot" style="background:' + f.color + '"></i>' + f.name + (me ? ' (ты)' : '') + '</td><td>' + E.count(S, f.id) + '</td><td>' + (x.alive ? R(E.power(x)) : '—') + '</td><td>';
      if (!me && x.alive) h += E.inTruce(S, f.id) ? '<span class="muted">мир до ' + E.date(S.truce[f.id]).label + '</span>' : '<button class="btn sm" data-a="truce" data-k="' + f.id + '"' + (S.ap < 1 || p.money < E.truceCost(S, f.id) ? ' disabled' : '') + '>Стрелка · ' + E.truceCost(S, f.id) + '</button>';
      h += '</td></tr>';
    });
    h += '</table><p class="muted">Стрелка: мир на год, если договоритесь. Чем выше авторитет и сила, тем сговорчивее соседи.</p><h3>Округа</h3><table class="tbl">';
    Object.keys(D.OKRUGS).forEach(ok => { const ids = E.okrugIds(ok), n = ids.filter(i => S.d[i].o === S.player).length; h += '<tr><td>' + D.OKRUGS[ok].name + '</td><td class="' + (n === ids.length ? 'good' : '') + '">' + n + ' из ' + ids.length + '</td></tr>'; });
    return h + '</table><p class="muted">Округ целиком: дань удвоена, +1 ход в месяц, авторитет +10.</p>';
  }

  function paneLog() {
    let h = '<h2>Хроника</h2><ul class="log">' + S.log.slice(0, 60).map(l => '<li class="' + l.k + '"><time>' + E.date(l.t).label + '</time>' + esc(l.s) + '</li>').join('') + '</ul>';
    h += confirmNew ? '<div class="box"><p>Начать заново? Текущая партия пропадёт.</p><div class="grid"><button class="btn" data-a="new2">Да, заново</button><button class="btn" data-a="new0">Отмена</button></div></div>' : btn('Новая игра', 'new1', '', false, 'wide ghost');
    return h;
  }

  function render() {
    if (!S) return;
    renderTop(); paintMap();
    $('#tabs').innerHTML = TABS.map(t => '<button class="' + (t[0] === tab ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>').join('');
    const pane = $('#pane'), keep = pane.dataset.key === tab + ':' + sel ? pane.scrollTop : 0;
    pane.innerHTML = ({ district: paneDistrict, gang: paneGang, law: paneLaw, biz: paneBiz, clans: paneClans, log: paneLog })[tab]();
    pane.dataset.key = tab + ':' + sel; pane.scrollTop = keep;
    if (S.over) showOver(); else if (S.event) showEvent();
  }

  // ---------- действия ----------
  let toastT = 0;
  function toast(msg, bad) { const t = $('#toast'); t.textContent = msg; t.className = bad ? 'bad' : ''; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3200); }
  function act(r) { if (!r) return; toast(r.msg, !r.ok || r.win === false); if (r.ok) save(); render(); }

  document.addEventListener('click', e => {
    const tb = e.target.closest('[data-tab]'); if (tb) { tab = tb.dataset.tab; confirmNew = false; render(); return; }
    const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
    const a = b.dataset.a, k = b.dataset.k;
    if (a === 'start') { S = E.newGame(k, (Math.random() * 2e9) | 0); sel = D.DISTRICTS.find(d => d.name === fd(k).home).id; tab = 'district'; report = null; view = FULL.slice(); applyView(); save(); closeModal(); render(); return; }
    if (a === 'continue') { closeModal(); render(); return; }
    if (a === 'menu') { wipe(); S = null; showStart(); return; }
    if (!S) return;
    if (a === 'attack') act(E.attack(S, sel, +b.dataset.l));
    else if (a === 'build') act(E.build(S, sel, k));
    else if (a === 'kidnap') act(E.kidnap(S, sel));
    else if (a === 'raid') act(E.raid(S, sel));
    else if (a === 'recruit') act(E.recruit(S));
    else if (a === 'guns') act(E.buyGuns(S));
    else if (a === 'car') act(E.buyCar(S));
    else if (a === 'hire') act(E.hire(S, k));
    else if (a === 'bribe') act(E.bribe(S));
    else if (a === 'truce') act(E.truce(S, k));
    else if (a === 'proj') act(E.projStep(S, k, b.dataset.h));
    else if (a === 'cashout') act(E.cashOut(S));
    else if (a === 'goto') { sel = +b.dataset.i; tab = 'district'; render(); }
    else if (a === 'new1') { confirmNew = true; render(); }
    else if (a === 'new0') { confirmNew = false; render(); }
    else if (a === 'new2') { confirmNew = false; wipe(); S = null; showStart(); }
    else if (a === 'opt') { const r = E.choose(S, +k); if (!r.ok) { toast(r.msg, true); return; } save(); showResult(r); }
    else if (a === 'close') { closeModal(); render(); }
  });
  $('#end').addEventListener('click', () => {
    if (!S || S.over) return;
    const before = S.f[S.player].money, r = E.endTurn(S);
    if (!r.ok) { toast(r.msg, true); return; }
    report = { money: R(S.f[S.player].money - before), law: S.lastLaw, lost: S.lost || [] };
    save(); render();
  });

  // ---------- модальные окна ----------
  const modal = $('#modal');
  function openModal(html, cls) { modal.innerHTML = '<div class="sheet ' + (cls || '') + '">' + html + '</div>'; modal.hidden = false; }
  function closeModal() { modal.hidden = true; modal.innerHTML = ''; }

  function showEvent() {
    const ev = E.currentEvent(S); if (!ev) return;
    let h = '<p class="eyebrow">' + E.date(S.turn).label + (ev.date ? ' · история' : '') + '</p>';
    if (report) {
      h += '<div class="report"><span>За прошлый месяц касса ' + sign(report.money) + ' тыс. $</span>';
      if (report.law) h += '<span class="bad">' + esc(report.law.text) + '</span>';
      if (report.lost.length) h += '<span class="bad">Потеряны районы: ' + esc(report.lost.join(', ')) + '</span>';
      h += '</div>';
    }
    h += '<h2>' + esc(ev.title) + '</h2><p class="lead">' + esc(ev.text) + '</p><div class="opts">';
    ev.opts.forEach((o, k) => { const os = E.optState(S, o); h += '<button class="opt" data-a="opt" data-k="' + k + '"' + (os.lock ? ' disabled' : '') + '><span>' + esc(o.t) + '</span>' + (os.cost ? '<em>' + os.cost + ' тыс.</em>' : '') + (os.lock ? '<small>' + esc(os.lock) + '</small>' : '') + '</button>'; });
    openModal(h + '</div>', 'event');
  }
  function showResult(r) {
    report = null;
    const d = r.delta, names = { money: 'Касса', rep: 'Авторитет', heat: 'Розыск', men: 'Бойцы', guns: 'Стволы', cars: 'Тачки', later: 'Вернётся позже' };
    let ch = '';
    Object.keys(names).forEach(k => { if (d[k]) { const good = k === 'heat' ? d[k] < 0 : d[k] > 0; ch += '<span class="' + (good ? 'good' : 'bad') + '">' + names[k] + ' ' + sign(d[k]) + '</span>'; } });
    openModal('<p class="eyebrow">' + esc(r.title) + '</p><p class="lead">' + esc(r.msg) + '</p><p class="deltas">' + (ch || '<span>Без последствий</span>') + '</p><button class="btn primary wide" data-a="close">Дальше</button>', 'event');
    renderTop();
  }
  function showOver() {
    const o = S.over; let h = '<p class="eyebrow">' + E.date(S.turn).label + '</p><h2>' + esc(o.title) + '</h2><p class="lead">' + esc(o.text) + '</p>';
    if (o.stats) h += '<dl class="kv"><dt>Счёт</dt><dd>' + o.score + '</dd><dt>Касса</dt><dd>' + o.stats.money + ' тыс. $</dd><dt>Районы</dt><dd>' + o.stats.districts + '</dd><dt>Авторитет</dt><dd>' + o.stats.rep + '</dd><dt>Связи</dt><dd>' + o.stats.conn + '</dd><dt>Белый доход</dt><dd>' + o.stats.white + '%</dd></dl>';
    openModal(h + '<button class="btn primary wide" data-a="menu">Новая игра</button>', 'event');
  }
  function showStart() {
    const sv = load();
    let h = '<p class="eyebrow">Москва · декабрь 1991 — декабрь 2007</p><h1>Передел</h1><p class="lead">Страны больше нет. У тебя один район и восемь пацанов. Через шестнадцать лет криминал станет частью власти. Реши, будешь ли ты среди тех, кто дожил.</p>';
    if (sv && !sv.over) h += '<button class="btn primary wide" data-a="continue">Продолжить: ' + fd(sv.player).name + ', ' + E.date(sv.turn).label + '</button>';
    h += '<h3>Выбери бригаду</h3><div class="factions">';
    D.FACTIONS.forEach(f => { const d = D.DISTRICTS.find(x => x.name === f.home); h += '<button class="fac" data-a="start" data-k="' + f.id + '"><i style="background:' + f.color + '"></i><b>' + f.name + '</b><span>' + f.home + ', ' + D.OKRUGS[d.ok].short + '</span><small>' + esc(f.perk) + '</small></button>'; });
    h += '</div><p class="muted">Ход — один месяц. В начале месяца случается событие с пятью решениями. Потом у тебя три хода: вербуй, вооружай, нападай на соседние районы, ставь точки, покупай людей во власти.</p>';
    if (sv && !sv.over) S = sv;
    openModal(h, 'start');
  }

  buildMap();
  function boot(data) { S = (data && data.S) || null; if (S) { sel = data.sel; render(); if (!S.event && !S.over) closeModal(); } else showStart(); }
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => ({ S, sel }));
  if (hot && hot.ready) hot.ready(boot); else boot((hot && hot.data) || {});
})();
