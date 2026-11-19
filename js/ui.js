/* Интерфейс: карта, панели, модальные окна, лобби онлайна */
(function () {
  const G = window.W90, E = G.Engine, D = G.DATA, GEO = G.GEO, Net = G.Net, A = G.ART;
  const SAVE = 'war90.save.v4';
  let S = null, me = null, sel = null, section = 'gang', confirmNew = false;
  let net = null;          // онлайн: { room, token, lobby }
  let modalKey = '';       // что сейчас в модальном окне
  const FULL = GEO.box.slice(); let view = FULL.slice();
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fd = id => D.FACTIONS.find(f => f.id === id);
  const sign = v => (v > 0 ? '+' : '') + v;
  const R = Math.round;
  const P = () => S.f[me];

  function save() { if (net) return; try { localStorage.setItem(SAVE, JSON.stringify(S)); } catch (e) { /* без сохранения */ } }
  function load() { try { const s = JSON.parse(localStorage.getItem(SAVE)); return s && s.v === 4 && !s.done ? E.migrate(s) : null; } catch (e) { return null; } }
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
  function applyView() { svg.setAttribute('viewBox', view.map(v => v.toFixed(1)).join(' ')); svg.classList.toggle('zoomed', view[2] < FULL[2] * 0.62); }
  function zoomAt(f, cx, cy) {
    const w = Math.max(FULL[2] * 0.22, Math.min(FULL[2], view[2] * f)), k = w / view[2];
    view = [cx - (cx - view[0]) * k, cy - (cy - view[1]) * k, w, view[3] * k];
    clampView(); applyView();
  }
  function clampView() {
    view[0] = Math.max(FULL[0] - view[2] * 0.3, Math.min(FULL[0] + FULL[2] - view[2] * 0.7, view[0]));
    view[1] = Math.max(FULL[1] - view[3] * 0.3, Math.min(FULL[1] + FULL[3] - view[3] * 0.7, view[1]));
  }
  // выбранный из списка район должен быть виден на карте
  function showOnMap(i) {
    const c = GEO.centers[i], m = 0.12;
    if (c[0] > view[0] + view[2] * m && c[0] < view[0] + view[2] * (1 - m) && c[1] > view[1] + view[3] * m && c[1] < view[1] + view[3] * (1 - m)) return;
    view[0] = c[0] - view[2] / 2; view[1] = c[1] - view[3] / 2; clampView(); applyView();
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
  const up = e => { const was = ptrs.has(e.pointerId); ptrs.delete(e.pointerId); pinch = 0; if (was && moved <= 6 && e.type === 'pointerup') { const t = document.elementFromPoint(e.clientX, e.clientY); if (S && t && t.dataset && t.dataset.i != null) { sel = +t.dataset.i; section = 'map'; render(); } } };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  svg.addEventListener('wheel', e => { e.preventDefault(); const p = svgPoint(e); zoomAt(e.deltaY > 0 ? 1.18 : 0.85, p[0], p[1]); }, { passive: false });
  $('#zoom').addEventListener('click', e => { const z = e.target.dataset.z; if (!z) return; if (z === '0') { view = FULL.slice(); applyView(); } else zoomAt(z === '1' ? 0.7 : 1.4, view[0] + view[2] / 2, view[1] + view[3] / 2); });

  function paintMap() {
    svg.querySelectorAll('.cell').forEach(el => {
      const i = +el.dataset.i, o = S.d[i].o;
      el.style.fill = o ? fd(o).color : '';
      el.classList.toggle('mine', o === me);
      el.classList.toggle('foe', !!o && o !== me);
      el.classList.toggle('target', E.attackable(S, me, i));
      el.classList.toggle('sel', i === sel);
    });
    svg.querySelectorAll('.ent').forEach(el => el.classList.toggle('got', S.d[+el.dataset.m].ent));
    const s = svg.querySelector('.cell.sel'); if (s) s.parentNode.appendChild(s);
  }

  // ---------- шапка ----------
  function renderTop() {
    const p = P(), inc = E.income(S, me), L = E.lawLevel(p.heat), cap = E.menCap(S, me);
    $('#date').textContent = E.date(S.turn).label + (net ? ' · ' + net.lobby.name : '');
    // показатель шапки: значок, подпись, число, пояснение
    // нажатие ведёт туда, где этим показателем управляют
    const GO = { money: 'gang:boss', men: 'gang:men', gun: 'gang:arms', car: 'gang:cars', rep: 'gang:boss', conn: 'law' };
    const st = (k, l, v, x, cls) => '<button class="st s-' + k + ' ' + (cls || '') + '" data-go="' + GO[k] + '" title="' + l + '">' + A.icon(k) + '<div><span>' + l + '</span><b>' + v + '</b>' + (x ? '<i>' + x + '</i>' : '') + '</div></button>';
    let pips = ''; for (let i = 0; i < E.apMax(S, me); i++) pips += '<u class="' + (i < p.ap ? 'on' : '') + '"></u>';
    $('#stats').innerHTML =
      st('money', 'Касса, тыс. $', R(p.money), sign(inc.total) + ' в мес.', p.money < 0 ? 'bad' : '') +
      st('men', 'Бойцы', p.men, 'из ' + cap + ', ждут ' + E.pool(S, me)) + st('gun', 'Стволы', p.guns) + st('car', 'Тачки', p.cars) +
      st('rep', 'Авторитет', R(p.rep)) + st('conn', 'Связи', E.conn(S, me)) +
      '<button class="st heat l' + L + '" data-go="law" title="Розыск">' + A.icon('heat') + '<div><span>Розыск · ' + D.LAW[L].name + '</span><div class="meter"><em style="width:' + p.heat + '%"></em><s style="left:20%"></s><s style="left:40%"></s><s style="left:60%"></s><s style="left:80%"></s></div><i>' + R(p.heat) + ' из 100, ' + sign(E.heatDelta(S, me)) + ' в мес.</i></div></button>' +
      '';
    $('#ap').innerHTML = '<span>Ходы</span><div class="pips">' + pips + '</div><b>' + p.ap + ' из ' + E.apMax(S, me) + '</b>';
    const end = $('#end');
    end.disabled = !!p.event || !!p.over || S.done;
    if (net) { const act = E.active(S), rd = act.filter(h => S.f[h].ready).length; end.textContent = p.ready ? 'Жду остальных ' + rd + '/' + act.length + ' · отменить' : 'Готов'; end.classList.toggle('waiting', !!p.ready); }
    else { end.textContent = 'Конец месяца'; end.classList.remove('waiting'); }
  }

  // ---------- вкладки ----------
  const VIEWS = [['gang', 'Банда'], ['map', 'Районы'], ['big', 'Крупные дела'], ['law', 'Власть'], ['clans', 'Группировки'], ['log', 'Хроника']];
  const btn = (label, a, attrs, lock, cls) => '<button class="btn ' + (cls || '') + '" data-a="' + a + '" ' + (attrs || '') + (lock ? ' disabled' : '') + '>' + label + (lock && typeof lock === 'string' ? '<small>' + esc(lock) + '</small>' : '') + '</button>';
  const kindTag = k => '<span class="tag ' + k + '">' + ({ w: 'белый', g: 'серый', b: 'чёрный' }[k]) + '</span>';
  const who = f => fd(f).name + (S.f[f].human && S.f[f].nick ? ' · ' + esc(S.f[f].nick) : '');

  const ROMAN = ['', 'I', 'II', 'III'];
  // точки района: что стоит, что можно улучшить и что построить
  function pointsHTML(i) {
    const d = S.d[i], dd = D.DISTRICTS[i], p = P();
    let h = '<h3>Точки <span class="muted">' + d.b.length + ' из ' + dd.slots + '</span></h3>';
    if (d.b.length) h += '<div class="ptiles">' + d.b.map((b, x) => {
      const B = D.BUILDS[b], lv = E.pointLvl(d, x), c = E.upgradeCost(S, i, x), inc = E.pointInc(me, b);
      return '<div class="ptile"><div class="pimg">' + A.build(b, lv) + '<b class="lvb">' + ROMAN[lv] + '</b></div><div class="pinfo"><b>' + B.name + '</b><span class="good">+' + inc * lv + ' в мес.</span>' + (B.perk ? '<small class="perk">' + esc(B.perk) + (lv > 1 && (B.fx || B.rec || B.def) ? ', ×' + lv : '') + '</small>' : '') + '</div>' +
        (lv >= E.MAX_LVL ? '<p class="muted pmax">Высший уровень</p>' : '<button class="btn sm pup" data-a="upgrade" data-i="' + i + '" data-x="' + x + '"' + (p.money < c ? ' disabled' : '') + '><span class="pnext">' + A.build(b, lv + 1) + '</span><span>До ' + ROMAN[lv + 1] + ' · ' + c + ' тыс. → +' + inc * (lv + 1) + '</span></button>') + '</div>';
    }).join('') + '</div>';
    if (d.b.length >= dd.slots) return h + '<p class="muted">Свободных мест нет. Улучшай то, что стоит.</p>';
    h += '<div class="grid">';
    Object.keys(D.BUILDS).forEach(k => {
      const B = D.BUILDS[k], lock = E.canBuild(S, me, i, k);
      if (B.onlyMarket && !dd.m) return;
      h += '<button class="card bcard" data-a="build" data-i="' + i + '" data-k="' + k + '"' + (lock ? ' disabled' : '') + ' title="' + esc(B.desc) + '">' + A.build(k, 1) + '<b>' + B.name + '</b>' + kindTag(B.kind) + '<span>' + (B.cost ? B.cost + ' тыс.' : 'бесплатно') + ' → +' + E.pointInc(me, k) + '/мес.</span>' + (B.perk ? '<i class="perk">' + esc(B.perk) + '</i>' : '') + (lock ? '<small>' + esc(lock) + '</small>' : '') + '</button>';
    });
    return h + '</div>';
  }
  function paneDistrict() {
    if (sel == null) return paneDist();
    const d = S.d[sel], dd = D.DISTRICTS[sel], p = P(), mine = d.o === me, c = E.conn(S, me);
    const ids = E.okrugIds(dd.ok), have = ids.filter(i => S.d[i].o === me).length;
    let h = '<button class="btn sm ghost back" data-a="dlist">← Все мои районы · ' + E.count(S, me) + '</button><h2>' + esc(dd.name) + '</h2><p class="sub">' + D.OKRUGS[dd.ok].name + ' · у тебя ' + have + ' из ' + ids.length + '</p>';
    h += '<dl class="kv"><dt>Хозяин</dt><dd>' + (mine ? 'Ты' : d.o ? '<i class="dot" style="background:' + fd(d.o).color + '"></i>' + who(d.o) : 'Местная шпана') + '</dd><dt>Оборона</dt><dd>' + E.districtDef(S, sel) + '</dd>' + (mine ? (() => { const cp = E.crew(S, me).find(x => x.pos === 'capo' && x.ok === dd.ok); return '<dt>Бригадир</dt><dd>' + (cp ? '<button class="link" data-a="person" data-id="' + cp.id + '">' + esc(E.cname(cp)) + '</button>' : '<button class="link" data-a="slot" data-pos="capo" data-ok="' + dd.ok + '">нет, назначить</button>') + '</dd>'; })() : '') + '<dt>Дань</dt><dd>' + dd.inc + ' в мес.</dd>' + (dd.m ? '<dt>Рынок</dt><dd>есть</dd>' : '') + '</dl>';
    if (dd.ent) {
      const e = dd.ent;
      h += '<div class="box"><h3>' + esc(e.name) + '</h3>';
      if (d.ent && mine) h += '<p class="good">Под тобой. +' + e.inc + ' в мес.</p>';
      else if (d.ent) h += '<p class="muted">Под хозяином района. Доход ' + e.inc + ' в мес.</p>';
      else {
        const ok = (v, need) => '<b class="' + (v >= need ? 'good' : 'bad') + '">' + need + '</b>';
        h += '<p>Доход ' + e.inc + ' в мес. Для захвата нужны бойцы ' + ok(p.men, e.men) + ', связи во власти ' + ok(c, e.conn) + ' и ' + ok(p.money, e.cost) + ' тыс. $ на суды и реестр.</p>';
        if (mine) h += btn('Захватить предприятие · 2 хода · шанс ' + R(E.raidOdds(S, me, sel)) + '%', 'raid', '', p.men < e.men || c < e.conn || p.money < e.cost || p.ap < 2, 'wide');
        else h += '<p class="muted">Сначала возьми район.</p>';
      }
      h += '</div>';
    }
    if (mine) {
      h += '<dl class="kv">' + watchLine(sel) + '</dl>' + pointsHTML(sel);
      h += btn('Похитить коммерсанта', 'kidnap', '', p.kidnapTurn === S.turn ? 'раз в месяц' : p.men < 4 ? 'нужно 4 бойца' : p.ap < 1, 'wide');
    } else if (E.attackable(S, me, sel)) {
      if (d.o && !S.f[d.o].human && E.inTruce(S, me, d.o)) h += '<p class="muted">С бригадой перемирие до ' + E.date(p.truce[d.o]).label + '.</p>';
      else {
        h += '<h3>Нападение</h3><div class="grid g3">';
        E.KINDS.forEach((k, l) => { h += '<button class="card atk" data-a="attack" data-l="' + l + '"' + (p.ap < 1 || p.men < 3 ? ' disabled' : '') + '><b>' + k + '</b><span>едут ' + E.strike(p, E.SHARES[l]) + ' бойцов</span><span>шанс ' + R(E.winOdds(S, me, sel, l) * 100) + '%</span><small>розыск +' + E.HEATS[l] + '</small></button>'; });
        h += '</div><p class="muted">На дело едут на тачках: 4 бойца на машину, ещё 10 доберутся сами.</p>';
      }
    } else h += '<p class="muted">Район не граничит с твоей территорией.</p>';
    return h;
  }

  // общак: что приходит и уходит за месяц, вложения, кто на зоне
  function paneBoss() {
    const p = P(), inc = E.income(S, me), cap = E.menCap(S, me);
    let h = '<p class="eyebrow">Глава · общак</p><h2>' + fd(me).name + '</h2><p class="sub">' + esc(fd(me).perk) + '</p>';
    h += '<dl class="kv"><dt>Сила бригады</dt><dd>' + R(E.power(p)) + '</dd><dt>Касса</dt><dd>' + R(p.money) + ' тыс. $</dd><dt>Авторитет</dt><dd>' + R(p.rep) + '</dd><dt>Бойцы</dt><dd>' + p.men + ' из ' + cap + '</dd><dt>Районы</dt><dd>' + E.count(S, me) + ' из 102</dd></dl>';
    h += '<h3>Касса за месяц</h3><table class="tbl">' + inc.rows.filter(r => r[1]).map(r => '<tr><td>' + r[0] + '</td><td class="' + (r[1] < 0 ? 'bad' : 'good') + '">' + sign(r[1]) + '</td></tr>').join('') + '<tr class="sum"><td>Итого</td><td>' + sign(inc.total) + '</td></tr></table>';
    const tot = inc.white + inc.black;
    if (tot) h += '<p class="muted">Белый доход: ' + R(inc.white / tot * 100) + '%. К 2007 году выживут те, кто успел легализоваться.</p>';
    if (p.later.length) h += '<h3>Вложения и долги</h3><table class="tbl">' + p.later.map(l => '<tr><td>' + esc(l.why) + '<br><span class="muted">' + E.date(l.t).label + '</span></td><td class="' + (l.amt < 0 ? 'bad' : 'good') + '">' + sign(l.amt) + '</td></tr>').join('') + '</table>';
    if (p.jail.length) h += '<h3>На зоне</h3><table class="tbl">' + p.jail.map(j => '<tr><td>' + j.n + ' чел.</td><td>выйдут: ' + E.date(j.t + 1).label + '</td></tr>').join('') + '</table>';
    return h + deadList();
  }
  // рядовые: вербовка
  function paneMen() {
    const p = P(), cap = E.menCap(S, me);
    let h = '<p class="eyebrow">Рядовые</p><h2>Бойцы <span class="muted">' + p.men + ' из ' + cap + '</span></h2>';
    h += '<dl class="kv"><dt>Со стволом</dt><dd>' + Math.min(p.men, p.guns) + '</dd><dt>На колёсах</dt><dd>' + Math.min(p.men, p.cars * 4) + '</dd><dt>Сила бригады</dt><dd>' + R(E.power(p)) + '</dd></dl>';
    const inf = E.inflow(S, me), have = E.pool(S, me), price = E.recruitPrice(S), room = cap - p.men, can = Math.max(0, Math.min(have, room, Math.floor(p.money / price)));
    const why = room < 1 ? 'бригада полна: нужны районы и авторитет' : have < 1 ? 'желающих нет до следующего месяца' : p.money < price ? 'не хватает денег' : '';
    h += '<h3>Вербовка <span class="muted">ждут ' + have + ' чел., боец стоит ' + price + ' тыс.</span></h3><div class="grid g3">' +
      [1, 5, can].map((n, x) => { const m = x === 2 ? Math.max(can, 1) : n; return '<button class="card" data-a="recruit" data-n="' + m + '"' + (can < m || (x === 2 && can < 1) ? ' disabled' : '') + '><b>' + (x === 2 ? 'Всех: ' + can : 'Нанять ' + n) + '</b><span>' + m * price + ' тыс.</span>' + (x === 0 && why ? '<small>' + why + '</small>' : '') + '</button>'; }).join('') + '</div>';
    h += '<table class="tbl">' + inf.rows.filter(r => r[1]).map(r => '<tr><td>' + r[0] + '</td><td>+' + r[1] + '</td></tr>').join('') + '<tr class="sum"><td>Приходит каждый месяц</td><td>+' + inf.total + '</td></tr></table>';
    h += '<p class="muted">Вербовка не тратит ход. Кого не нанял, подождут, но не больше трёх месячных притоков. Больше людей дают спортзалы и ЧОПы на районах: строй и улучшай их во вкладке «Районы».</p>';
    if (p.jail.length) h += '<h3>На зоне</h3><table class="tbl">' + p.jail.map(j => '<tr><td>' + j.n + ' чел.</td><td>выйдут: ' + E.date(j.t + 1).label + '</td></tr>').join('') + '</table>';
    return h;
  }

  // ---------- арсенал и гараж ----------
  const disc = (key, what) => E.fx(S, me, key) ? '<p class="muted">Скидка ' + E.fx(S, me, key) + '% ' + what + '.</p>' : '';
  const buy = (a, k, n, cost, label, lock) => '<button class="btn sm" data-a="' + a + '" data-k="' + k + '" data-n="' + n + '"' + (lock || P().money < cost ? ' disabled' : '') + '>' + label + ' · ' + cost + ' тыс.</button>';
  function paneArms() {
    const p = P(), y = E.date(S.turn).year, arms = p.arms || {}, armed = Math.min(p.men, p.guns);
    let h = '<p class="eyebrow">Рядовые</p><h2>Арсенал</h2><p class="sub">Со стволом ' + armed + ' из ' + p.men + ', сила стволов +' + R(E.armedValue(p)) + '</p>' + disc('gun', 'от охотничьих магазинов' + (me === 'kopt' ? ' и ещё 30% от армейских складов' : '')) + '<div class="shop">';
    Object.keys(D.ARMS).forEach(k => {
      const W = D.ARMS[k], lock = y < W.from ? 'появится в ' + W.from + ' году' : '', n2 = W.pack === 1 ? 5 : 20;
      h += '<div class="item' + (lock ? ' locked' : '') + '">' + A.arm(k) + '<div class="ii"><b>' + W.name + '</b><small>' + W.alt + ' · боец с ним +' + W.q + ' к силе</small><span>в арсенале: ' + (arms[k] || 0) + '</span><i>' + (lock || esc(W.desc)) + '</i><div class="row">' + buy('guns', k, W.pack, E.armCost(S, me, k, W.pack), '×' + W.pack, lock) + buy('guns', k, n2, E.armCost(S, me, k, n2), '×' + n2, lock) + '</div></div></div>';
    });
    const V = D.VEST, vlock = y < V.from ? 'появятся в ' + V.from + ' году' : '';
    h += '<div class="item' + (vlock ? ' locked' : '') + '">' + A.vest() + '<div class="ii"><b>' + V.name + '</b><small>' + V.alt + '</small><span>на складе: ' + (p.vests || 0) + '</span><i>' + (vlock || esc(V.desc)) + '</i><div class="row">' + buy('vests', 'v', 5, E.vestCost(S, me, 5), '×5', vlock) + buy('vests', 'v', 20, E.vestCost(S, me, 20), '×20', vlock) + '</div></div></div></div>';
    return h + '<p class="muted">Лучшие стволы достаются бойцам первыми. Потери в бою списывают самое дешёвое. Покупка не тратит ход и поднимает авторитет.</p>';
  }
  function paneCars() {
    const p = P(), y = E.date(S.turn).year, gar = p.garage || {}, seats = E.seatsOf(p);
    let h = '<p class="eyebrow">Рядовые</p><h2>Гараж</h2><p class="sub">Мест ' + seats + ', на разборку едут до ' + (10 + seats) + ' бойцов, сила колёс +' + R(E.mobility(p)) + '</p>' + disc('car', 'от автосервисов') + '<div class="shop">';
    Object.keys(D.CARS).forEach(k => {
      const Cr = D.CARS[k], lock = y < Cr.from ? 'появится в ' + Cr.from + ' году' : '';
      h += '<div class="item' + (lock ? ' locked' : '') + '">' + A.car(k) + '<div class="ii"><b>' + Cr.name + '</b><small>' + Cr.alt + ' · мест ' + Cr.seats + ', боец на ней +' + Cr.q + (Cr.rep ? ' · авторитет +' + Cr.rep : '') + '</small><span>в гараже: ' + (gar[k] || 0) + '</span><i>' + (lock || esc(Cr.desc)) + '</i><div class="row">' + buy('car', k, 1, E.carCost(S, me, k), 'Купить', lock) + '</div></div></div>';
    });
    return h + '</div>' + (E.carTalk(S, me) ? '<p class="good">Шестисотые в гараже: переговоры +' + E.carTalk(S, me) + '%.</p>' : '') + (E.armorK(p) < 1 ? '<p class="good">Бронированный гелик: глава и бригадиры гибнут и ранятся вдвое реже.</p>' : '');
  }

  // ---------- семья: схема бригады (главный экран) и досье ----------
  let focus = null; // focus: { id } — человек, { pos, ok } — пустая должность
  const DD = W90.DATA, POSTS = DD.POSTS;
  const myOkrugs = () => Object.keys(DD.OKRUGS).filter(ok => E.owned(S, me).some(i => DD.DISTRICTS[i].ok === ok));
  const okDistricts = ok => E.owned(S, me).filter(i => DD.DISTRICTS[i].ok === ok);
  // порядок людей как на схеме: ближний круг, бригадиры, резерв
  function chartOrder() {
    const cr = E.crew(S, me), out = [];
    ['right', 'cons', 'treas'].forEach(pos => { const c = cr.find(x => x.pos === pos); if (c) out.push(c); });
    myOkrugs().forEach(ok => { const c = cr.find(x => x.pos === 'capo' && x.ok === ok); if (c) out.push(c); });
    watchers().forEach(c => out.push(c));
    cr.forEach(c => { if (!out.includes(c) && c.pos) out.push(c); });
    cr.forEach(c => { if (!c.pos) out.push(c); });
    return out;
  }
  const mini = (l, v) => '<i>' + l + '</i><u><s style="width:' + v * 10 + '%"></s></u><b>' + v + '</b>';
  const statBar = (l, v) => '<span class="stat"><i>' + l + '</i><b>' + v + '</b><u><s style="width:' + v * 10 + '%"></s></u></span>';
  function postEffect(c) {
    if (c.st !== 'ok') return '<p class="bad">Вне строя. Должность не работает, пока он не вернётся.</p>';
    const t = { right: '+1 ход в месяц, нападения +' + c.str * 2 + '%', cons: 'Переговоры и стрелки +' + c.wit * 3 + '%, взятки наверх −' + c.wit * 3 + '%', treas: c.loy <= 3 ? 'Будет подворовывать: доход −5%. Верность низкая' : 'Доход +' + c.wit * 2 + '%', capo: 'Оборона районов округа +' + c.str * 2 + ', дань +' + c.str * 5 + '%, нападения в округе +' + c.str * 3 + '%', watch: 'Оборона района +' + c.str * 3 + ', дань +' + c.str * 3 + '%, доход точек +' + c.wit * 4 + '%' }[c.pos];
    if (c.pos === 'watch' && c.loy <= 3) return '<p class="bad">Будет утаивать половину дани района: верность низкая</p>';
    return '<p class="good">' + t + '</p>';
  }
  const slotName = (pos, ok) => POSTS[pos].name + (pos === 'capo' && ok ? ' · ' + DD.OKRUGS[ok].short : pos === 'watch' && ok ? ' · ' + DD.DISTRICTS[E.watchDist({ ok })].name : '');
  // смотрящие по районам, в порядке округов и названий
  function watchers() {
    const oks = Object.keys(DD.OKRUGS), name = c => DD.DISTRICTS[E.watchDist(c)];
    return E.crew(S, me).filter(c => c.pos === 'watch').sort((a, b) => oks.indexOf(name(a).ok) - oks.indexOf(name(b).ok) || name(a).name.localeCompare(name(b).name, 'ru'));
  }
  // строка «смотрящий» для страницы района
  function watchLine(i) {
    const w = E.watcherOf(S, me, i, true);
    return '<dt>Смотрящий</dt><dd>' + (w ? '<button class="link" data-a="person" data-id="' + w.id + '">' + esc(E.cname(w)) + '</button>' + (w.st !== 'ok' ? ' <span class="bad">(' + (w.st === 'hurt' ? 'ранен' : 'сидит') + ')</span>' : '') : '<button class="link" data-a="vacant" data-pos="watch" data-ok="' + E.watchKey(i) + '">нет, назначить</button>') + '</dd>';
  }
  function node(c, role, slot, extra) {
    const isSel = focus && (c ? focus.id === c.id : focus.id == null && focus.pos === slot.pos && (focus.ok || null) === (slot.ok || null));
    if (!c) return '<button class="node vacant' + (isSel ? ' sel' : '') + '" data-a="vacant" data-pos="' + slot.pos + '" data-ok="' + (slot.ok || '') + '"><span class="ava">' + A.vacantFace() + '</span><span class="nb"><span class="role">' + role + '</span><b>Вакантно</b>' + (extra || '') + '<small>' + (slot.dis ? 'нужно больше районов' : 'подобрать человека') + '</small></span></button>';
    const st = c.st === 'hurt' ? '<em class="badge">ранен</em>' : c.st === 'jail' ? '<em class="badge">сидит</em>' : '';
    return '<button class="node' + (c.st !== 'ok' ? ' out' : '') + (c.leg ? ' legend' : '') + (isSel ? ' sel' : '') + '" data-a="person" data-id="' + c.id + '"><span class="ava">' + A.face(c) + '</span><span class="nb"><span class="role">' + role + (c.leg ? ' · легенда' : '') + '</span>' + st + '<b>«' + esc(c.nick) + '»</b><small>' + esc(c.name) + ', ' + c.age + '</small>' + (extra || '') + '<span class="mini">' + mini('Сила', c.str) + mini('Ум', c.wit) + mini('Верн.', c.loy) + '</span></span></button>';
  }
  function renderOrg() {
    const p = P(), cr = E.crew(S, me), total = E.count(S, me), capos = cr.filter(x => x.pos === 'capo'), max = E.capoMax(S, me), bench = cr.filter(x => !x.pos);
    const on = v => focus && focus.view === v ? ' sel' : '';
    let h = '<div class="tier"><button class="node boss' + on('boss') + '" data-a="unit" data-u="boss"><span class="ava">' + A.bossFace(fd(me)) + '</span><span class="nb"><span class="role">Глава · общак</span><b>Ты</b><small>' + fd(me).name + '</small><span class="bossline">касса ' + R(p.money) + ' тыс. · ' + sign(E.income(S, me).total) + ' в мес. · районов ' + total + '</span></span></button></div>';
    // сразу под главой — сама бригада: рядовые бойцы, их стволы и тачки
    const cap = E.menCap(S, me), seats = E.seatsOf(p), unit = (v, ic, title, big, line, warn) => '<button class="unit' + on(v) + '" data-a="unit" data-u="' + v + '">' + A.icon(ic) + '<span class="nb"><span class="role">' + title + '</span><b>' + big + '</b><small class="' + (warn ? 'bad' : '') + '">' + line + '</small></span></button>';
    h += '<p class="tlabel">Бригада · сила ' + R(E.power(p)) + '</p><div class="tier units">' +
      unit('men', 'men', 'Бойцы · вербовка', p.men + ' из ' + cap, 'ждут ' + E.pool(S, me) + ' · по ' + E.recruitPrice(S) + ' тыс.') +
      unit('arms', 'gun', 'Арсенал', Math.min(p.men, p.guns) + ' со стволом', p.guns < p.men ? 'без ствола ' + (p.men - p.guns) : 'все вооружены', p.guns < p.men) +
      unit('cars', 'car', 'Гараж', 'мест ' + seats, 'на разборку до ' + (10 + seats) + ' бойцов') + '</div>';
    h += '<p class="tlabel">Ближний круг</p><div class="tier">' + ['right', 'cons', 'treas'].map(pos => node(cr.find(x => x.pos === pos), POSTS[pos].name, { pos })).join('') + '</div>';
    h += '<p class="tlabel">Бригадиры · ' + capos.length + ' из ' + max + '</p><div class="tier">' + myOkrugs().map(ok => {
      const n = okDistricts(ok).length, zv = '<span class="zv">' + n + ' ' + (n === 1 ? 'район' : n < 5 ? 'района' : 'районов') + ' · ~' + Math.round(p.men * n / Math.max(1, total)) + ' бойцов</span>';
      return node(capos.find(x => x.ok === ok), 'Бригадир · ' + DD.OKRUGS[ok].short, { pos: 'capo', ok, dis: capos.length >= max }, zv);
    }).join('') + '</div>';
    const ws = watchers();
    h += '<p class="tlabel">Смотрящие · ' + ws.length + ' из ' + total + ' районов</p><div class="tier">' + (ws.length ? ws.map(c => '<button class="wchip' + (c.st !== 'ok' ? ' out' : '') + (focus && focus.id === c.id ? ' sel' : '') + '" data-a="person" data-id="' + c.id + '"><span class="ava">' + A.face(c) + '</span><span><b>«' + esc(c.nick) + '»</b><small>' + esc(DD.DISTRICTS[E.watchDist(c)].name) + '</small></span></button>').join('') : '<p class="muted">Смотрящих нет. Назначь человека из резерва на район: в его досье или на странице района.</p>') + '</div>';
    const pc = E.promoteCost(S), plock = p.promoTurn === S.turn ? 'раз в месяц' : p.men < 6 ? 'нужно 6 бойцов' : p.money < pc ? 'не хватает денег' : '';
    h += '<p class="tlabel">Резерв · ' + bench.length + '</p><div class="tier">' + (bench.length ? bench.map(c => node(c, 'Резерв')).join('') : '<p class="muted">Пусто. Каждый месяц из бригады может выделиться новый человек.</p>') + '</div>';
    h += '<div class="tier promo">' + btn('Выдвинуть бойца из рядовых · ' + pc + ' тыс.', 'promote', '', plock || false, 'ghost') + '</div>';
    $('#org').innerHTML = h;
  }
  function paneDossier() {
    const cr = E.crew(S, me);
    if (focus && focus.id != null && !cr.some(x => x.id === focus.id)) focus = null;
    if (focus && focus.view) return { boss: paneBoss, men: paneMen, arms: paneArms, cars: paneCars }[focus.view]();
    if (!focus) return '<h2>Досье</h2><p class="muted">Выбери человека или пустую должность на схеме бригады.</p>' + deadList();
    if (focus.id != null) {
      const c = cr.find(x => x.id === focus.id), order = chartOrder(), k = order.indexOf(c);
      let h = '';
      if (order.length > 1) { const pv = order[(k - 1 + order.length) % order.length], nx = order[(k + 1) % order.length]; h += '<div class="pnav"><button class="btn sm" data-a="person" data-id="' + pv.id + '">← ' + esc(pv.nick) + '</button><span>' + (k + 1) + ' из ' + order.length + '</span><button class="btn sm" data-a="person" data-id="' + nx.id + '">' + esc(nx.nick) + ' →</button></div>'; }
      h += '<div class="dhero"><span class="ava big">' + A.face(c) + '</span><div><p class="eyebrow">' + (c.pos ? slotName(c.pos, c.ok) : 'Резерв') + (c.leg ? ' · легенда эпохи' : '') + '</p><h2>' + esc(E.cname(c)) + '</h2><p class="sub">' + c.age + ' лет · в семье с ' + E.date(c.since).label + (c.st === 'hurt' ? ' · ранен, встанет: ' + E.date(c.until + 1).label : c.st === 'jail' ? ' · сидит, выйдет: ' + E.date(c.until + 1).label : '') + '</p></div></div>';
      h += '<p class="lead2">' + esc(c.bio) + '.</p><div class="stats">' + statBar('Сила', c.str) + statBar('Ум', c.wit) + statBar('Верность', c.loy) + '</div>';
      if (c.loy <= 3) h += '<p class="bad">Ненадёжен: может сдать на допросе или уйти с общаком.</p>';
      if (c.pos) h += '<h3>Что даёт</h3>' + postEffect(c) + '<button class="btn sm" data-a="unassign" data-id="' + c.id + '">Снять в резерв</button>';
      if (c.st === 'ok') {
        const same = s => c.pos === s[0] && (c.ok || null) === (s[1] || null);
        const opt = s => { const hold = cr.find(x => x.pos === s[0] && (x.ok || null) === (s[1] || null)); return '<option value="' + s[0] + '|' + (s[1] || '') + '">' + (s[0] === 'watch' ? DD.DISTRICTS[E.watchDist({ ok: s[1] })].name : slotName(s[0], s[1])) + (hold ? ' (сейчас ' + esc(hold.nick) + ')' : '') + '</option>'; };
        const top = [['right'], ['cons'], ['treas']].concat(myOkrugs().map(ok => ['capo', ok])).filter(s => !same(s));
        const ws = E.owned(S, me).slice().sort((a, b) => DD.DISTRICTS[a].name.localeCompare(DD.DISTRICTS[b].name, 'ru')).map(i => ['watch', E.watchKey(i)]).filter(s => !same(s));
        h += '<h3>Назначить</h3><select class="pick" data-a="reassign" data-id="' + c.id + '" aria-label="Назначить на должность"><option value="">Выбрать должность…</option><optgroup label="Ближний круг и бригадиры">' + top.map(opt).join('') + '</optgroup><optgroup label="Смотрящий за районом">' + ws.map(opt).join('') + '</optgroup></select>';
        if (!c.pos) h += '<button class="btn sm ghost" data-a="dismiss" data-id="' + c.id + '">Вернуть в рядовые</button>';
      }
      const hist = S.log.filter(l => (!l.to || l.to === me) && l.s.indexOf('«' + c.nick + '»') >= 0).slice(0, 8);
      if (hist.length) h += '<h3>История</h3><ul class="log">' + hist.map(l => '<li class="' + l.k + '"><time>' + E.date(l.t).label + '</time>' + esc(l.s) + '</li>').join('') + '</ul>';
      return h;
    }
    // пустая должность: подбор из резерва
    const pos = focus.pos, ok = focus.ok || null, hold = cr.find(x => x.pos === pos && (x.ok || null) === ok);
    if (hold) { focus = { id: hold.id }; return paneDossier(); }
    const capFull = pos === 'capo' && cr.filter(x => x.pos === 'capo').length >= E.capoMax(S, me);
    const key = pos === 'right' || pos === 'capo' || pos === 'watch' ? 'str' : 'wit';
    const cand = cr.filter(x => !x.pos && x.st === 'ok').sort((a, b) => b[key] - a[key] || b.loy - a.loy);
    let h = '<p class="eyebrow">Вакантно</p><h2>' + slotName(pos, ok) + '</h2><p class="sub">' + POSTS[pos].alt + '</p><p>' + POSTS[pos].desc + '.</p>';
    if (capFull) h += '<p class="bad">Бригадиров уже ' + E.capoMax(S, me) + ': на большее не хватает районов. Один бригадир на каждые шесть районов.</p>';
    h += '<h3>Кандидаты из резерва <span class="muted">лучшие по ' + (key === 'str' ? 'силе' : 'уму') + '</span></h3>';
    if (!cand.length) return h + '<p class="muted">Свободных людей нет. Они выделяются из бригады каждый месяц; чем больше бойцов, тем чаще.</p>';
    return h + cand.map(c => '<div class="cand"><span class="ava">' + A.face(c) + '</span><div><b>' + esc(E.cname(c)) + '</b><small>' + esc(c.bio) + '</small><span class="mini">' + mini('Сила', c.str) + mini('Ум', c.wit) + mini('Верн.', c.loy) + '</span>' + postEffect(Object.assign({}, c, { pos, ok })) + '</div><div class="cbtn"><button class="btn sm" data-a="appoint" data-id="' + c.id + '" data-pos="' + pos + '" data-ok="' + (ok || '') + '"' + (capFull ? ' disabled' : '') + '>Назначить</button><button class="btn sm ghost" data-a="person" data-id="' + c.id + '">Досье</button></div></div>').join('');
  }
  function deadList() {
    const p = P();
    if (!p.dead || !p.dead.length) return '';
    return '<h3>Кладбище</h3><ul class="log">' + p.dead.map(d => '<li class="bad"><time>' + E.date(d.t).label + '</time>' + esc(d.n) + (d.pos ? ', ' + POSTS[d.pos].name.toLowerCase() : '') + ': ' + esc(d.how) + '</li>').join('') + '</ul>';
  }

  // Власть: наверху люди во власти (слева человек, справа что он даёт), «занести» отдельной кнопкой, ниже ступени розыска
  function paneLaw() {
    const p = P(), L = E.lawLevel(p.heat), y = E.date(S.turn).year, bc = E.bribeCost(S, me);
    const blk = p.heat < 5 ? 'вопросов нет' : p.money < bc ? 'не хватает денег' : p.ap < 1 ? 'нет ходов' : '';
    let h = '<div class="lawhead"><div><h2>Власть</h2><p class="sub">Розыск ' + R(p.heat) + ' из 100 · ' + D.LAW[L].name + ' · связи ' + E.conn(S, me) + ' <button class="info" data-a="lawinfo" aria-label="Что бывает при розыске" title="Что бывает при розыске">i</button></p></div>';
    h += '<button class="bribe" data-a="bribe"' + (blk ? ' disabled' : '') + '>' + A.icon('money') + '<span><b>Занести наверх</b><small>' + bc + ' тыс. · розыск −12 · 1 ход</small>' + (blk ? '<i>' + blk + '</i>' : '') + '</span></button></div>';
    h += '<h3>Люди во власти <span class="muted">каждого можно купить до ' + D.OFFICIAL_MAX + ' раз, покупка тратит ход</span></h3><div class="offs">';
    Object.keys(D.OFFICIALS).forEach(k => {
      const O = D.OFFICIALS[k], c = E.officialCost(S, me, k), n = p.off[k] || 0, soon = y < O.from;
      const lock = soon ? 'появится в ' + O.from + ' году' : n >= D.OFFICIAL_MAX ? 'больше не купить' : p.money < c ? 'не хватает денег' : p.ap < 1 ? 'нет ходов' : '';
      let pips = ''; for (let i = 0; i < D.OFFICIAL_MAX; i++) pips += '<u class="' + (i < n ? 'on' : '') + '"></u>';
      h += '<div class="offrow' + (soon ? ' soon' : '') + (n ? ' have' : '') + '"><div class="offwho"><span class="ava">' + A.officialFace(k) + '</span><div><b>' + O.name + '</b><span class="pips">' + pips + '</span><small>' + (n ? 'свои: ' + n + ' из ' + D.OFFICIAL_MAX : 'своих нет') + '</small></div></div>';
      h += '<div class="offwhat"><p>' + esc(O.desc || '') + '.</p><p class="fx"><span class="good">связи +' + O.w + '</span> · <span class="good">розыск −' + O.cool + ' в мес.</span> · содержание ' + O.keep + ' в мес.</p>' +
        '<button class="btn sm" data-a="hire" data-k="' + k + '"' + (lock ? ' disabled' : '') + '>Купить · ' + c + ' тыс.' + (lock ? '<small>' + lock + '</small>' : '') + '</button></div></div>';
    });
    return h + '</div>';
  }
  // памятка про розыск: открывается кнопкой «i» на странице власти
  function showLawInfo() {
    const p = P(), L = E.lawLevel(p.heat);
    const what = ['', 'Берут по одному-два бойца', 'Облавы: до пяти бойцов', 'Десятая часть бригады и арест счетов', 'Пятая часть бригады, счета, бизнес. На 100 придут за тобой'];
    let h = '<p class="eyebrow">Памятка</p><h2>Розыск</h2><p class="sub">Сейчас ' + R(p.heat) + ' из 100 · ' + D.LAW[L].name + ' · ' + sign(E.heatDelta(S, me)) + ' в мес.</p><ol class="ladder">';
    D.LAW.forEach((l, i) => { if (i) h += '<li class="' + (i === L ? 'cur' : i < L ? 'past' : '') + '"><b>' + l.name + '</b><span>от ' + l.at + ' · ' + what[i] + '</span></li>'; });
    h += '</ol><p class="muted">Задержанных сажают, убивают при задержании или отпускают. От этого зависит авторитет. Чем больше связей, тем чаще отпускают.</p><p class="muted">Сбить розыск: занести наверх, купить людей во власти, бордель на районе.</p>';
    openModal(h + btn('Понятно', 'close', '', false, 'wide'), '', 'lawinfo');
  }

  let showDone = false;
  const paneBig = () => '<h2>Крупные дела</h2>' + bizBig();
  // Районы делятся на три группы: где есть место под стройку, где есть что улучшать и где всё прокачано
  function paneDist() {
    const own = E.owned(S, me);
    if (!own.length) return '<h2>Районы</h2><p class="muted">Районов нет.</p>';
    const oks = Object.keys(D.OKRUGS);
    own.sort((a, b) => oks.indexOf(D.DISTRICTS[a].ok) - oks.indexOf(D.DISTRICTS[b].ok) || D.DISTRICTS[a].name.localeCompare(D.DISTRICTS[b].name, 'ru'));
    const free = i => D.DISTRICTS[i].slots - S.d[i].b.length;
    const ups = i => S.d[i].b.map((b, x) => x).filter(x => E.pointLvl(S.d[i], x) < E.MAX_LVL);
    const build = own.filter(i => free(i) > 0), up = own.filter(i => !free(i) && ups(i).length), done = own.filter(i => !free(i) && !ups(i).length);
    let h = '<h2>Мои районы <span class="muted">' + own.length + ' из 102</span></h2><p class="sub">Нажми на район в списке или на карте, чтобы открыть его точки. Стройка и улучшения стоят только денег, ходы не тратят.</p>' + fxSummary();
    h += distGroup('Есть свободные места', 'можно строить новые точки', build, i => 'свободно ' + free(i));
    h += distGroup('Можно улучшить', 'все места заняты, но не всё на III уровне', up, i => { const c = Math.min(...ups(i).map(x => E.upgradeCost(S, i, x))); return 'улучшить ' + ups(i).length + ' · от ' + c + ' тыс.'; });
    h += '<div class="dgroup done"><button class="dgh" data-a="dshow" aria-expanded="' + showDone + '"><h3>Прокачано полностью <span class="muted">' + done.length + ' · ' + sign(done.reduce((a, i) => a + distInc(i), 0)) + ' в мес.</span></h3><i>' + (done.length ? (showDone ? 'скрыть' : 'показать') : '') + '</i></button>';
    if (!done.length) h += '<p class="muted">Пока ни одного: все точки района на III уровне — и он попадёт сюда.</p>';
    else if (showDone) h += '<div class="dlist">' + done.map(i => distRow(i, 'готово')).join('') + '</div>';
    return h + '</div>';
  }
  function distInc(i) {
    const d = S.d[i], dd = D.DISTRICTS[i];
    return dd.inc * (E.okrugsHeld(S, me).includes(dd.ok) ? 2 : 1) + d.b.reduce((s, b, x) => s + E.pointInc(me, b) * E.pointLvl(d, x), 0) + (d.ent ? dd.ent.inc : 0);
  }
  function distGroup(title, note, ids, tag) {
    let h = '<div class="dgroup"><h3>' + title + ' <span class="muted">' + ids.length + (ids.length ? ' · ' + sign(ids.reduce((a, i) => a + distInc(i), 0)) + ' в мес.' : '') + '</span></h3>';
    if (!ids.length) return h + '<p class="muted">Таких районов нет.</p></div>';
    return h + '<p class="muted">' + note + '</p><div class="dlist">' + ids.map(i => distRow(i, tag(i))).join('') + '</div></div>';
  }
  function distRow(i, tag) {
    const d = S.d[i], dd = D.DISTRICTS[i], w = E.watcherOf(S, me, i, true);
    return '<div class="drow"><button class="dhead" data-a="goto" data-i="' + i + '"><b>' + esc(dd.name) + '</b><span>' + D.OKRUGS[dd.ok].short + ' · точек ' + d.b.length + '/' + dd.slots + (dd.ent ? ' · ' + (d.ent ? 'предприятие взято' : 'предприятие не взято') : '') + (w ? ' · смотрит «' + esc(w.nick) + '»' : ' · без смотрящего') + '</span><em>+' + distInc(i) + '</em><i>' + tag + '</i></button></div>';
  }
  const FXL = [['car', 'Тачки дешевле', '%'], ['gun', 'Стволы дешевле', '%'], ['upkeep', 'Содержание бойцов дешевле', '%'], ['med', 'Потери в бою меньше', '%'], ['talk', 'Переговоры и стрелки', '%', '+'], ['hide', 'При облавах берут меньше', '%'], ['wash', 'Чёрного дохода отмывается', '%'], ['kid', 'Похищения удачнее', '%', '+'], ['cool', 'Розыск в месяц', '', '−'], ['conn', 'Связи', '', '+'], ['cap', 'Бригада больше', ' чел.', '+']];
  function fxSummary() {
    const rows = FXL.map(f => [f, E.fx(S, me, f[0])]).filter(r => r[1]);
    const recr = E.inflow(S, me).rows.filter(r => r[0] === 'Спортзалы' || r[0] === 'ЧОПы').reduce((a, r) => a + r[1], 0);
    if (recr) rows.push([['rec', 'Новобранцев в месяц', '', '+'], recr]);
    if (!rows.length) return '<div class="box"><h3>Что дают точки империи</h3><p class="muted">Пока ничего. Автосервис удешевляет тачки, спортзал даёт людей, бордель сбивает розыск, казино отмывает деньги. Польза растёт с уровнем точки.</p></div>';
    return '<div class="box"><h3>Что дают точки империи</h3><div class="fxgrid">' + rows.map(r => { const cap = W90.DATA.FX_CAP[r[0][0]]; return '<div><span>' + r[0][1] + '</span><b class="good">' + (r[0][3] || '') + r[1] + r[0][2] + (cap && r[1] >= cap ? ' · потолок' : '') + '</b></div>'; }).join('') + '</div></div>';
  }
  function bizBig() {
    const p = P();
    let h = '<p class="sub">Три шага: поездка, переговоры, вход в капитал. Один шаг в месяц.</p><div class="projs">';
    D.PROJECTS.forEach(pr => {
      const ps = E.projStatus(S, me, pr), stage = ps.st.stage || 0, pi = E.projIncome(S, me, pr);
      h += '<div class="box proj ' + (stage === 3 ? 'live' : '') + (ps.lock ? ' locked' : '') + '"><div class="dpic">' + A.deal(pr.id) + (stage === 3 ? '<em>в деле</em>' : '<em>' + esc(pr.where) + '</em>') + '</div><h3>' + pr.name + ' ' + kindTag(pr.kind) + '</h3>';
      h += '<p>' + (stage === 3 ? '<b class="good">+' + pi + ' в мес.</b>' : 'Доход ' + pr.inc + ' в мес.') + (pr.heat ? ' · розыск ' + sign(pr.heat) + ' в мес.' : '') + (pr.note ? ' · ' + pr.note : '') + '</p>';
      if (stage === 3) { if (pr.pyramid) h += btn('Соскочить и вывезти кассу · +' + pi * 2, 'cashout', '', p.ap < 1, 'wide'); }
      else {
        h += '<ol class="steps"><li class="' + (stage > 0 ? 'done' : 'cur') + '">Поездка: ' + pr.where + '</li><li class="' + (stage > 1 ? 'done' : stage === 1 ? 'cur' : '') + '">Переговоры: ' + pr.who + '</li><li class="' + (stage === 2 ? 'cur' : '') + '">' + pr.buyLabel + '</li></ol>';
        if (ps.lock) h += '<p class="muted">' + ps.lock + '</p>';
        else if (stage === 0) h += btn('Лететь в ' + pr.where + ' · ' + pr.trip + ' тыс.', 'proj', 'data-k="' + pr.id + '"', p.money < pr.trip ? 'не хватает денег' : p.ap < 1, 'wide');
        else if (stage === 1) {
          const ch = E.negChances(S, me), gift = R(pr.buy * 0.2);
          h += '<div class="grid g3">' +
            '<button class="card" data-a="proj" data-k="' + pr.id + '" data-h="share"' + (p.ap < 1 ? ' disabled' : '') + '><b>Взять в долю</b><span>шанс ' + R(ch.share) + '%</span><small>доход −25%</small></button>' +
            '<button class="card" data-a="proj" data-k="' + pr.id + '" data-h="bribe"' + (p.ap < 1 || p.money < gift ? ' disabled' : '') + '><b>Занести</b><span>шанс ' + R(ch.bribe) + '%</span><small>' + gift + ' тыс.</small></button>' +
            '<button class="card atk" data-a="proj" data-k="' + pr.id + '" data-h="force"' + (p.ap < 1 ? ' disabled' : '') + '><b>Надавить</b><span>шанс ' + R(ch.force) + '%</span><small>розыск +6</small></button></div>';
        } else h += btn(pr.buyLabel + ' · ' + pr.buy + ' тыс.', 'proj', 'data-k="' + pr.id + '"', p.money < pr.buy ? 'не хватает денег' : p.ap < 1, 'wide');
      }
      h += '</div>';
    });
    return h + '</div>';
  }

  function paneClans() {
    const p = P();
    let h = '<h2>Группировки</h2><p class="sub">Сложность: ' + E.dif(S).name.toLowerCase() + '. Первые ' + E.dif(S).grace + ' месяцев боты не нападают на живых игроков. Родной район держится в ' + E.dif(S).home + ' раза крепче.</p><table class="tbl clans"><tr><th>Бригада</th><th>Районы</th><th>Сила</th><th></th></tr>';
    D.FACTIONS.filter(f => !S.f[f.id].absent).sort((a, b) => E.count(S, b.id) - E.count(S, a.id)).forEach(f => {
      const x = S.f[f.id], mine = f.id === me;
      h += '<tr class="' + (x.alive ? '' : 'dead') + '"><td><span class="ava xs">' + A.bossFace(f) + '</span><i class="dot" style="background:' + f.color + '"></i>' + f.name + (mine ? ' (ты)' : x.human ? ' · ' + esc(x.nick || 'игрок') : '') + (!mine && !x.human && x.alive ? '<br><small class="' + relCls(E.rel(S, me, f.id)) + '">' + relName(E.rel(S, me, f.id)) + (E.inTruce(S, me, f.id) ? ' · мир до ' + E.date(p.truce[f.id]).label : '') + '</small>' : '') + '</td><td>' + E.count(S, f.id) + '</td><td>' + (x.alive ? R(E.power(x)) : '—') + '</td><td>';
      if (!mine && x.alive) {
        if (x.human) h += '<span class="' + (x.ready ? 'good' : 'muted') + '">' + (x.ready ? 'готов' : 'ходит') + '</span>';
        else h += '<button class="btn sm" data-a="parley" data-k="' + f.id + '">Стрелка</button>';
      }
      h += '</td></tr>';
    });
    h += '</table><p class="muted">Стрелка — встреча с главой бригады: мир, подарок, совместное дело, покупка района или дань. Один разговор с каждой бригадой в месяц, тратит ход. От 50 в отношениях бригада тебя не трогает, от −50 охотится за твоими районами.' + (net ? ' С живыми игроками договаривайся сам.' : '') + '</p>';
    if (net && net.lobby.host) h += btn('Завершить месяц за всех', 'force', '', false, 'wide ghost') + '<p class="muted">Если кто-то пропал. Кто не решил событие, пропустит его.</p>';
    h += '<h3>Округа</h3><table class="tbl">';
    Object.keys(D.OKRUGS).forEach(ok => { const ids = E.okrugIds(ok), n = ids.filter(i => S.d[i].o === me).length; h += '<tr><td>' + D.OKRUGS[ok].name + '</td><td class="' + (n === ids.length ? 'good' : '') + '">' + n + ' из ' + ids.length + '</td></tr>'; });
    return h + '</table><p class="muted">Округ целиком: дань удвоена, +1 ход в месяц, авторитет +10.</p>';
  }

  function paneLog() {
    let h = '<h2>Хроника</h2><ul class="log">' + S.log.filter(l => !l.to || l.to === me).slice(0, 60).map(l => '<li class="' + l.k + '"><time>' + E.date(l.t).label + '</time>' + esc(l.s) + '</li>').join('') + '</ul>';
    if (net) return h + btn('Выйти в меню', 'menu', '', false, 'wide ghost') + '<p class="muted">Комната останется, вернуться можно с этого же устройства.</p>';
    h += confirmNew ? '<div class="box"><p>Начать заново? Текущая партия пропадёт.</p><div class="grid"><button class="btn" data-a="new2">Да, заново</button><button class="btn" data-a="new0">Отмена</button></div></div>' : btn('Новая игра', 'new1', '', false, 'wide ghost');
    return h;
  }

  function render() {
    if (!S) return;
    renderTop(); paintMap();
    // меню разделов под шапкой; у «Банды» и «Районов» справа панель, остальные разделы во всю ширину
    $('#menu').innerHTML = VIEWS.map(v => '<button class="' + (v[0] === section ? 'on' : '') + '" data-view="' + v[0] + '">' + v[1] + '</button>').join('');
    const split = section === 'gang' || section === 'map';
    $('#main').classList.toggle('wide', !split); $('#side').hidden = !split;
    $('#org').hidden = section !== 'gang'; $('#mapview').hidden = section !== 'map'; $('#page').hidden = split;
    if (section === 'gang') renderOrg();
    const host = split ? $('#pane') : $('#page'), pk = section + ':' + (section === 'map' ? sel : section === 'gang' ? JSON.stringify(focus) : ''), keep = host.dataset.key === pk ? host.scrollTop : 0;
    const fn = { gang: paneDossier, map: paneDistrict, big: paneBig, law: paneLaw, clans: paneClans, log: paneLog }[section];
    host.innerHTML = split ? fn() : '<div class="inner' + (section === 'big' ? ' wide' : '') + '">' + fn() + '</div>';
    host.dataset.key = pk; host.scrollTop = keep;
    if (P().over) showOver(); else if (P().event) showEvent(); else if (P().battle) showBattle(); else if (parleyWith) showParley();
  }

  // ---------- действия ----------
  let toastT = 0;
  function toast(msg, bad) { const t = $('#toast'); t.textContent = msg; t.className = bad ? 'bad' : ''; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3200); }
  function done(r) {
    if (!r) return;
    const msg = r.msg || r.err;
    if (r.event && r.ok) { save(); showResult(r); return; }
    if (r.battleEnd && r.ok) { save(); showBattleEnd(r); if (!net) render(); return; }
    if (r.ok && (r.battle || r.round)) { if (!net) { save(); render(); } return; }
    if (msg) toast(msg, !r.ok || r.win === false);
    if (r.ok && !net) { save(); render(); }
  }
  // одно действие: в одиночной игре считает браузер, в онлайне — сервер
  function act(name, args) {
    if (!S) return;
    if (net) Net.post('act', { room: net.room, token: net.token, name, args }).then(done);
    else done(E.ACTIONS[name](S, me, ...args));
  }
  const netCall = (name, body) => Net.post(name, Object.assign({ room: net.room, token: net.token }, body || {})).then(r => { if (r.err || r.ok === false) toast(r.err || r.msg, true); return r; });

  document.addEventListener('click', e => {
    const vb = e.target.closest('#menu [data-view]'); if (vb) { if (!S) return; section = vb.dataset.view; confirmNew = false; render(); if (section === 'map') applyView(); return; }
    const go = e.target.closest('#stats [data-go]'); if (go) { if (!S) return; const g = go.dataset.go.split(':'); section = g[0]; if (g[1]) focus = { view: g[1] }; confirmNew = false; render(); return; }
    const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
    const a = b.dataset.a, k = b.dataset.k;
    // меню и лобби
    if (a === 'start') { S = E.newGame(k, (Math.random() * 2e9) | 0, null, null, diff); me = k; net = null; sel = D.DISTRICTS.find(d => d.name === fd(k).home).id; section = 'gang'; focus = { pos: 'right' }; view = FULL.slice(); applyView(); save(); closeModal(); render(); return; }
    if (a === 'continue') { const sv = load(); if (sv) { S = sv; me = S.humans[0]; net = null; closeModal(); render(); } return; }
    if (a === 'menu') { leaveToMenu(); return; }
    if (a === 'create') { const nick = nickValue(); Net.post('create', { name: $('#roomname').value, nick, diff }).then(r => r.room ? enterRoom(r.room, r.token) : toast(r.err, true)); return; }
    if (a === 'join') { Net.post('join', { room: k, nick: nickValue(), token: (Net.recall() || {})[k] }).then(r => r.room ? enterRoom(r.room, r.token) : toast(r.err, true)); return; }
    if (a === 'refresh') { showStart(); return; }
    if (a === 'diff') { diff = k; try { localStorage.setItem('war90.diff', k); } catch (er) { /* ignore */ } document.querySelectorAll('[data-a=diff]').forEach(x => { x.classList.toggle('on', x.dataset.k === k); x.setAttribute('aria-pressed', x.dataset.k === k); }); $('#diffnote').textContent = DIFF_NOTE[k]; return; }
    if (a === 'pick') { netCall('pick', { fid: k || null }); return; }
    if (a === 'slot') { netCall('slot', { fid: k, mode: b.dataset.m }); return; }
    if (a === 'go') { netCall('start'); return; }
    if (a === 'leave') { netCall('leave').then(r => { if (r.ok) { forget(net.room); leaveToMenu(); } }); return; }
    if (a === 'copy') { const t = location.origin + location.pathname + '#room-' + net.room; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Ссылка скопирована'), () => toast(t)); return; }
    if (!S) return;
    const di = b.dataset.i != null ? +b.dataset.i : sel;
    if (a === 'attack') act('attack', [sel, +b.dataset.l]);
    else if (a === 'build') act('build', [di, k]);
    else if (a === 'upgrade') act('upgrade', [di, +b.dataset.x]);
    else if (a === 'dshow') { showDone = !showDone; render(); }
    else if (a === 'dlist') { sel = null; render(); }
    else if (a === 'unit') { focus = { view: b.dataset.u }; section = 'gang'; render(); }
    else if (a === 'kidnap') act('kidnap', [sel]);
    else if (a === 'raid') act('raid', [di]);
    else if (a === 'unassign') act('unassign', [+b.dataset.id]);
    else if (a === 'dismiss') act('dismiss', [+b.dataset.id]);
    else if (a === 'recruit') act('recruit', [+b.dataset.n || 1]);
    else if (a === 'guns') act('buyGuns', [k || 'pm', +b.dataset.n || 5]);
    else if (a === 'vests') act('buyVests', [+b.dataset.n || 5]);
    else if (a === 'car') act('buyCar', [k || 'nine']);
    else if (a === 'hire') act('hire', [k]);
    else if (a === 'bribe') act('bribe', []);
    else if (a === 'lawinfo') showLawInfo();
    else if (a === 'truce') act('truce', [k]);
    else if (a === 'parley') { parleyWith = k; showParley(); }
    else if (a === 'talk') act('parley', [parleyWith, k, b.dataset.i != null ? +b.dataset.i : null]);
    else if (a === 'pclose') { parleyWith = null; closeModal(); render(); }
    else if (a === 'tac') act('battle', [k]);
    else if (a === 'promote') act('promote', []);
    else if (a === 'proj') act('projStep', [k, b.dataset.h || null]);
    else if (a === 'cashout') act('cashOut', []);
    else if (a === 'opt') act('choose', [+k]);
    else if (a === 'force') netCall('force');
    else if (a === 'goto') { sel = +b.dataset.i; section = 'map'; showOnMap(sel); render(); }
    else if (a === 'person') { focus = { id: +b.dataset.id }; section = 'gang'; render(); }
    else if (a === 'vacant') { focus = { pos: b.dataset.pos, ok: b.dataset.ok || null }; section = 'gang'; render(); }
    else if (a === 'appoint') { focus = { id: +b.dataset.id }; act('assign', [+b.dataset.id, b.dataset.pos, b.dataset.ok || null]); }
    else if (a === 'new1') { confirmNew = true; render(); }
    else if (a === 'new0') { confirmNew = false; render(); }
    else if (a === 'new2') { confirmNew = false; wipe(); leaveToMenu(); }
    else if (a === 'close') { closeModal(); render(); }
  });
  document.addEventListener('change', e => { const t = e.target; if (t.dataset && t.dataset.a === 'reassign' && t.value) { const v = t.value.split('|'); act('assign', [+t.dataset.id, v[0], v[1] || null]); } });
  $('#end').addEventListener('click', () => {
    if (!S || P().over) return;
    if (net) { netCall('ready', { ready: !P().ready }); return; }
    const r = E.endTurn(S);
    if (!r.ok) { toast(r.msg, true); return; }
    save(); render();
  });

  // ---------- модальные окна ----------
  const modal = $('#modal');
  function openModal(html, cls, key) { modal.innerHTML = '<div class="sheet ' + (cls || '') + '">' + html + '</div>'; modal.hidden = false; modalKey = key || ''; }
  function closeModal() { modal.hidden = true; modal.innerHTML = ''; modalKey = ''; }

  function showEvent() {
    const p = P(), ev = E.currentEvent(S, me); if (!ev) return;
    const key = 'ev:' + S.turn + ':' + ev.id + ':' + R(p.money); if (modalKey === key) return;
    let h = '<p class="eyebrow">' + E.date(S.turn).label + (ev.date ? ' · история' : '') + '</p>';
    const rp = p.report;
    if (rp) {
      h += '<div class="report"><span>За прошлый месяц касса ' + sign(rp.money) + ' тыс. $</span>';
      if (rp.law) h += '<span class="bad">' + esc(rp.law) + '</span>';
      if (rp.lost && rp.lost.length) h += '<span class="bad">Потеряны районы: ' + esc(rp.lost.join(', ')) + '</span>';
      h += '</div>';
    }
    const tx = s => esc(E.evText(S, me, s)), w = E.evWho(S, me), L = ev.npc && D.LEGENDS[ev.npc];
    h += '<h2>' + tx(ev.title) + '</h2>';
    if (L) h += '<div class="evwho"><span class="ava">' + A.legendFace(ev.npc) + '</span><div><b>' + esc(L.nick) + '</b><small>' + esc(L.name) + ', ' + esc(L.bio.charAt(0).toLowerCase() + L.bio.slice(1)) + '</small></div></div>';
    else if (w) h += '<div class="evwho"><span class="ava">' + A.face(w) + '</span><div><b>' + esc(E.cname(w)) + '</b><small>' + (w.pos ? slotName(w.pos, w.ok) : 'резерв') + ' · сила ' + w.str + ', ум ' + w.wit + ', верность ' + w.loy + (ev.advice ? '. Чем умнее советчик, тем вернее его совет' : '') + '</small></div></div>';
    h += '<p class="lead">' + tx(ev.text) + '</p><div class="opts">';
    ev.opts.forEach((o, k) => { const os = E.optState(S, me, o); h += '<button class="opt" data-a="opt" data-k="' + k + '"' + (os.lock ? ' disabled' : '') + '><span>' + tx(o.t) + '</span>' + (os.cost ? '<em>' + os.cost + ' тыс.</em>' : '') + (os.lock ? '<small>' + esc(os.lock) + '</small>' : '') + '</button>'; });
    openModal(h + '</div>', 'event', key);
  }
  const relName = v => (v >= 50 ? 'дружба' : v >= 15 ? 'тепло' : v > -15 ? 'нейтрально' : v > -50 ? 'холодно' : 'вражда') + ' · ' + sign(v);
  const relCls = v => v >= 15 ? 'good' : v <= -15 ? 'bad' : 'muted';
  const shpana = i => A.face({ seed: 'shpana' + i, name: 'Местная шпана', age: 22, str: 6, wit: 3, loy: 5, look: { cloth: 'tracksuit' } }, { label: 'Местная шпана' });
  function showBattle() {
    const p = P(), B = p.battle; if (!B) return;
    const key = 'battle:' + B.round + ':' + B.i; if (modalKey === key) return;
    const dd = D.DISTRICTS[B.i], foe = B.foe && S.f[B.foe] ? fd(B.foe) : null, l = E.crew(S, me).find(c => c.st === 'ok' && ((c.pos === 'capo' && c.ok === dd.ok) || c.pos === 'right'));
    const bar = (v, v0, cls, brk) => '<div class="bbar ' + cls + '"><em style="width:' + Math.max(0, Math.min(100, v / v0 * 100)) + '%"></em>' + (brk ? '<s style="left:' + E.BREAK * 100 + '%"></s>' : '') + '</div>';
    let h = '<p class="eyebrow">' + E.KINDS[B.lvl] + ' · раунд ' + (B.round + 1) + ' из ' + E.BATTLE_ROUNDS + '</p><h2>Перестрелка: ' + esc(dd.name) + '</h2>';
    h += '<div class="vs"><div><span class="ava">' + (l ? A.face(l) : A.bossFace(fd(me))) + '</span><b>' + (l ? esc(E.cname(l)) : 'Ты лично') + '</b><small>ведёт ' + B.men + ' бойцов</small>' + bar(B.a, B.a0, 'our', true) + '<small>силы ' + R(Math.max(0, B.a)) + ' из ' + R(B.a0) + '</small></div><i>×</i><div><span class="ava">' + (foe ? A.bossFace(foe) : shpana(B.i)) + '</span><b>' + (foe ? esc(foe.name) : 'Местная шпана') + '</b><small>' + (foe ? esc(foe.boss) : 'держат дворы') + '</small>' + bar(B.d, B.d0, 'their') + '<small>оборона ' + R(Math.max(0, B.d)) + ' из ' + R(B.d0) + '</small></div></div>';
    h += '<p class="muted">Район наш, когда оборона упадёт до нуля. Если наших сил останется меньше черты, бойцы дрогнут. На всё ' + E.BATTLE_ROUNDS + ' раундов.</p>';
    if (B.log.length) h += '<ol class="blog">' + B.log.map(x => '<li><b>' + E.TACTICS[x.t].name + '</b>' + (x.note ? ' · ' + esc(x.note) : '') + '<span><em class="good">урон ' + x.dealt + '</em> <em class="bad">получили ' + x.took + '</em></span></li>').join('') + '</ol>';
    h += '<div class="tacts">' + Object.keys(E.TACTICS).map(t => {
      const T = E.TACTICS[t], lock = E.tacticLock(S, me, t), extra = t === 'flank' ? 'удача ' + R(E.flankOdds(S, me) * 100) + '%' : t === 'talk' ? 'шанс ' + R(E.talkOdds(S, me)) + '%' : t === 'rpg' ? 'РПГ: ' + ((p.arms || {}).rpg || 0) : t === 'snipe' ? 'СВД: ' + ((p.arms || {}).svd || 0) : '';
      return '<button class="card' + (t === 'storm' || t === 'flank' || t === 'rpg' ? ' atk' : '') + (t === 'retreat' ? ' ghost' : '') + '" data-a="tac" data-k="' + t + '"' + (lock ? ' disabled' : '') + '><b>' + T.name + '</b><span>' + esc(T.desc) + '</span>' + (extra ? '<small>' + extra + '</small>' : '') + (lock ? '<small class="bad">' + lock + '</small>' : '') + '</button>';
    }).join('') + '</div>';
    openModal(h, 'event battle', key);
  }
  function showBattleEnd(r) {
    openModal('<p class="eyebrow">Итог перестрелки</p><h2>' + esc(r.title) + '</h2><p class="lead ' + (r.win ? 'good' : 'bad') + '">' + esc(r.msg) + '</p><button class="btn primary wide" data-a="close">Дальше</button>', 'event', 'bres');
    if (!net) renderTop();
  }
  let parleyWith = null;
  function showParley() {
    const f = fd(parleyWith), x = S.f[parleyWith], p = P(); if (!x || !x.alive) { parleyWith = null; closeModal(); return; }
    const key = 'parley:' + parleyWith + ':' + S.turn + ':' + R(p.money) + ':' + p.ap + ':' + E.rel(S, me, parleyWith) + ':' + E.count(S, parleyWith); if (modalKey === key) return;
    const rl = E.rel(S, me, parleyWith), busy = E.parleyCheck(S, me, parleyWith) || (p.ap < 1 ? 'нет ходов' : '');
    let h = '<div class="dhero"><span class="ava big">' + A.bossFace(f) + '</span><div><p class="eyebrow">Стрелка · ' + esc(f.name) + '</p><h2>' + esc(f.boss) + '</h2><p class="sub">районов ' + E.count(S, parleyWith) + ' · сила ' + R(E.power(x)) + ' (у тебя ' + R(E.power(p)) + ')</p></div></div>';
    h += '<div class="relm"><span>Отношения</span><div><em class="' + (rl < 0 ? 'neg' : 'pos') + '" style="' + (rl < 0 ? 'right:50%;width:' + (-rl / 2) : 'left:50%;width:' + (rl / 2)) + '%"></em><s></s></div><b class="' + relCls(rl) + '">' + relName(rl) + '</b></div>';
    if (E.inTruce(S, me, parleyWith)) h += '<p class="good">Мир до ' + E.date(p.truce[parleyWith]).label + '.</p>';
    if (busy) h += '<p class="bad">' + esc(busy) + '</p>';
    const card = (kind, title, sub, note, lock, arg) => '<button class="card" data-a="talk" data-k="' + kind + '"' + (arg != null ? ' data-i="' + arg + '"' : '') + (busy || lock ? ' disabled' : '') + '><b>' + title + '</b><span>' + sub + '</span>' + (note ? '<small>' + note + '</small>' : '') + (lock ? '<small class="bad">' + lock + '</small>' : '') + '</button>';
    h += '<div class="grid">';
    const tc = E.truceCost(S, parleyWith);
    h += card('truce', 'Мир на год', tc + ' тыс. · шанс ' + R(E.truceOdds(S, me, parleyWith)) + '%', 'отношения +15', E.inTruce(S, me, parleyWith) ? 'мир уже есть' : p.money < tc ? 'не хватает денег' : '');
    h += card('gift', 'Подарок', E.giftCost(S) + ' тыс.', 'отношения +20 без риска', p.money < E.giftCost(S) ? 'не хватает денег' : '');
    h += card('deal', 'Совместное дело', E.dealCost(S) + ' тыс. · шанс ' + R(E.dealOdds(S, me, parleyWith)) + '%', 'вернётся ×1,8 через 3–6 мес.', rl < -20 ? 'с врагами дел не ведут' : p.money < E.dealCost(S) ? 'не хватает денег' : '');
    h += card('tribute', 'Потребовать дань', E.tributeSum(S, parleyWith) + ' тыс. · шанс ' + R(E.tributeOdds(S, me, parleyWith)) + '%', 'отказ — вражда', E.tributeOk(S, me, parleyWith) ? '' : 'нужно быть сильнее в 1,3 раза');
    h += '</div>';
    const ids = E.owned(S, parleyWith).filter(i => E.attackable(S, me, i) && !E.isHome(S, parleyWith, i));
    h += '<h3>Купить район <span class="muted">шанс ' + R(E.buyOdds(S, me, parleyWith)) + '%, деньги берут только при согласии</span></h3>';
    h += ids.length ? '<div class="grid">' + ids.map(i => { const c = E.buyPrice(S, me, i); return card('buy', esc(D.DISTRICTS[i].name), c + ' тыс. · дань ' + D.DISTRICTS[i].inc, D.DISTRICTS[i].ent ? esc(D.DISTRICTS[i].ent.name) : '', p.money < c ? 'не хватает денег' : '', i); }).join('') + '</div>' : '<p class="muted">У них нет районов на твоей границе, кроме родного.</p>';
    openModal(h + '<button class="btn wide ghost" data-a="pclose">Уйти со стрелки</button>', 'event', key);
  }
  function showResult(r) {
    const d = r.delta, names = { money: 'Касса', rep: 'Авторитет', heat: 'Розыск', men: 'Бойцы', guns: 'Стволы', cars: 'Тачки', vests: 'Бронежилеты', later: d.later < 0 ? 'Долг, заберут позже' : 'Вернётся позже', loy: 'Верность', str: 'Сила', wit: 'Ум' };
    let ch = '';
    Object.keys(names).forEach(k => { if (d[k]) { const good = k === 'heat' ? d[k] < 0 : d[k] > 0; ch += '<span class="' + (good ? 'good' : 'bad') + '">' + names[k] + ' ' + sign(d[k]) + '</span>'; } });
    if (d.arm) ch += '<span class="good">' + esc(d.arm) + '</span>';
    if (d.car) ch += '<span class="good">В гараже: ' + esc(d.car) + '</span>';
    if (d.join) ch += '<span class="good">В семье: ' + esc(d.join) + '</span>';
    if (d.truce) ch += '<span class="good">Мир на год: ' + esc(d.truce) + '</span>';
    if (d.rel) ch += '<span class="' + (d.rel > 0 ? 'good' : 'bad') + '">Отношения со всеми ' + sign(d.rel) + '</span>';
    if (d.gone) ch += '<span class="bad">Ушёл: ' + esc(d.gone) + '</span>';
    const wc = r.who != null && E.crew(S, me).find(c => c.id === r.who);
    openModal('<p class="eyebrow">' + esc(r.title) + '</p>' + (wc ? '<div class="evwho"><span class="ava">' + A.face(wc) + '</span><div><b>' + esc(E.cname(wc)) + '</b><small>' + (wc.st === 'hurt' ? 'ранен' : wc.st === 'jail' ? 'сидит' : 'сила ' + wc.str + ', ум ' + wc.wit + ', верность ' + wc.loy) + '</small></div></div>' : '') + '<p class="lead">' + esc(r.msg) + '</p><p class="deltas">' + (ch || '<span>Без последствий</span>') + '</p><button class="btn primary wide" data-a="close">Дальше</button>', 'event', 'result');
    if (!net) renderTop();
  }
  function showOver() {
    const o = P().over, key = 'over:' + S.done; if (modalKey === key) return;
    let h = '<p class="eyebrow">' + E.date(S.turn).label + '</p><h2>' + esc(o.title) + '</h2><p class="lead">' + esc(o.text) + '</p>';
    if (o.stats) h += '<dl class="kv"><dt>Счёт</dt><dd>' + o.score + '</dd><dt>Касса</dt><dd>' + o.stats.money + ' тыс. $</dd><dt>Районы</dt><dd>' + o.stats.districts + '</dd><dt>Авторитет</dt><dd>' + o.stats.rep + '</dd><dt>Связи</dt><dd>' + o.stats.conn + '</dd><dt>Белый доход</dt><dd>' + o.stats.white + '%</dd></dl>';
    if (net && S.humans.length > 1) {
      h += '<h3>Игроки</h3><table class="tbl">' + S.humans.map(f => { const x = S.f[f]; return '<tr><td><i class="dot" style="background:' + fd(f).color + '"></i>' + who(f) + '</td><td>' + (x.over ? esc(x.over.title) + (x.over.score ? ' · ' + x.over.score : '') : 'ещё играет') + '</td></tr>'; }).join('') + '</table>';
      if (!S.done) h += '<p class="muted">Остальные доигрывают. Итоги обновятся здесь.</p>';
    }
    openModal(h + '<button class="btn primary wide" data-a="menu">В меню</button>', 'event', key);
  }

  // ---------- меню ----------
  const nickValue = () => { const v = ($('#nick') ? $('#nick').value : '').trim().slice(0, 20); try { localStorage.setItem('war90.nick', v); } catch (e) { /* ignore */ } return v; };
  const DIFF_NOTE = { easy: 'Боты не трогают тебя два года, родной район почти не взять', norm: 'Полтора года тишины, потом не больше одного района в месяц', hard: 'Через год боты приходят всерьёз и могут отнять три района за месяц' };
  let diff = (() => { try { const v = localStorage.getItem('war90.diff'); return E.DIFF[v] ? v : 'norm'; } catch (e) { return 'norm'; } })();
  const diffHTML = () => '<div class="seg" role="group" aria-label="Сложность"><span>Сложность</span>' + Object.keys(E.DIFF).map(k => '<button class="' + (k === diff ? 'on' : '') + '" data-a="diff" data-k="' + k + '" aria-pressed="' + (k === diff) + '">' + E.DIFF[k].name + '</button>').join('') + '<small id="diffnote">' + DIFF_NOTE[diff] + '</small></div>';
  const savedNick = () => { try { return localStorage.getItem('war90.nick') || ''; } catch (e) { return ''; } };
  function showStart() {
    const sv = load();
    let h = '<p class="eyebrow">Москва · декабрь 1991 — декабрь 2007</p><h1>Передел</h1><p class="lead">Страны больше нет. У тебя один район и восемь пацанов. Через шестнадцать лет криминал станет частью власти. Реши, будешь ли ты среди тех, кто дожил.</p>' + diffHTML();
    h += '<div class="modes"><section><h3>Онлайн</h3><div id="online"><p class="muted">Ищу сервер…</p></div></section><section><h3>Одиночная игра</h3>';
    if (sv) h += '<button class="btn primary wide" data-a="continue">Продолжить: ' + fd(sv.humans[0]).name + ', ' + E.date(sv.turn).label + '</button>';
    h += '<p class="muted">Выбери бригаду. Остальных ведут боты.</p><div class="factions">';
    D.FACTIONS.forEach(f => { const d = D.DISTRICTS.find(x => x.name === f.home); h += '<button class="fac" data-a="start" data-k="' + f.id + '"><span class="ava">' + A.bossFace(f) + '</span><i style="background:' + f.color + '"></i><b>' + f.name + '</b><span>' + f.home + ', ' + D.OKRUGS[d.ok].short + '</span><small>' + esc(f.perk) + '</small></button>'; });
    h += '</div></section></div><p class="muted">Ход — один месяц. В начале месяца случается событие с пятью решениями. Потом у тебя три хода: нападай на соседние районы, похищай, покупай людей во власти, веди крупный бизнес. Бойцы, стволы, тачки, точки на районах и их улучшения стоят только денег.</p>';
    openModal(h, 'start', 'start');
    Net.rooms().then(list => {
      const box = $('#online'); if (!box || modalKey !== 'start') return;
      if (!list) { box.innerHTML = '<p class="muted">Онлайн работает, когда игра открыта с игрового сервера (<code>node server.js</code>). Здесь доступна одиночная игра.</p>'; return; }
      const mine = Net.recall() || {};
      let o = '<label class="field"><span>Твоё имя</span><input id="nick" maxlength="20" value="' + esc(savedNick()) + '" placeholder="Как тебя звать"></label>';
      o += '<div class="row"><label class="field"><span>Новая комната</span><input id="roomname" maxlength="40" placeholder="Название"></label><button class="btn primary" data-a="create">Создать</button></div>';
      o += '<h3>Комнаты <button class="btn sm" data-a="refresh">Обновить</button></h3>';
      o += list.length ? '<table class="tbl">' + list.map(r => '<tr><td><b>' + esc(r.name) + '</b><br><span class="muted">' + (esc(r.players.join(', ')) || 'пусто') + '</span></td><td>' + (r.started ? r.date : 'набор') + '</td><td>' + (!r.started || mine[r.id] ? '<button class="btn sm" data-a="join" data-k="' + r.id + '">' + (mine[r.id] ? 'Вернуться' : 'Войти') + '</button>' : '<span class="muted">идёт</span>') + '</td></tr>').join('') + '</table>' : '<p class="muted">Пока ни одной. Создай первую.</p>';
      box.innerHTML = o;
    });
  }
  function leaveToMenu() { Net.close(); net = null; S = null; me = null; if (location.hash) history.replaceState(null, '', location.pathname); showStart(); }

  // ---------- онлайн ----------
  let leaving = false; window.addEventListener('pagehide', () => { leaving = true; }); window.addEventListener('beforeunload', () => { leaving = true; });
  function forget(room) { const m = Net.recall() || {}; delete m[room]; Net.remember(m); }
  function enterRoom(room, token) {
    const m = Net.recall() || {}; m[room] = token; Net.remember(m);
    net = { room, token, lobby: null }; S = null;
    try { history.replaceState(null, '', '#room-' + room); } catch (e) { /* ignore */ }
    Net.open(room, token, onSync, () => { if (leaving) return; toast('Комната закрыта или связь потеряна', true); leaveToMenu(); });
  }
  function onSync(msg) {
    if (!net) return;
    net.lobby = msg.lobby;
    if (!msg.state) { S = null; showLobby(); return; }
    const first = !S; S = msg.state; me = S.me;
    if (first) { sel = E.owned(S, me)[0]; if (sel == null) sel = null; section = 'gang'; focus = { pos: 'right' }; if (modalKey === 'lobby') closeModal(); }
    render();
  }
  function showLobby() {
    const L = net.lobby, my = L.me && L.me.fid, humans = L.players.filter(p => p.fid).length;
    let h = '<p class="eyebrow">Комната · набор игроков · сложность: ' + (E.DIFF[L.diff] || E.DIFF.norm).name.toLowerCase() + '</p><h2>' + esc(L.name) + '</h2>';
    h += '<p class="muted">Игроки: ' + L.players.map(p => '<span class="' + (p.online ? 'good' : '') + '">' + esc(p.nick) + (p.host ? ' (создатель)' : '') + '</span>').join(', ') + '</p>';
    h += btn('Скопировать ссылку на комнату', 'copy', '', false, 'wide ghost');
    h += '<h3>Бригады</h3><p class="muted">Займи бригаду. Свободные ведёт бот' + (L.host ? '; ты можешь убрать любую из игры.' : '; создатель комнаты может убрать любую из игры.') + '</p><div class="factions">';
    D.FACTIONS.forEach(f => {
      const pl = L.players.find(p => p.fid === f.id), mode = pl ? 'human' : L.slots[f.id], d = D.DISTRICTS.find(x => x.name === f.home);
      h += '<div class="fac slot ' + mode + (my === f.id ? ' mine' : '') + '"><i style="background:' + f.color + '"></i><b>' + f.name + '</b><span>' + f.home + ', ' + D.OKRUGS[d.ok].short + '</span><small>' + esc(f.perk) + '</small>';
      h += '<em>' + (pl ? 'Человек: ' + esc(pl.nick) : mode === 'off' ? 'Вне игры' : 'Бот') + '</em><div class="row">';
      if (my === f.id) h += '<button class="btn sm" data-a="pick">Освободить</button>';
      else if (!pl) {
        h += '<button class="btn sm" data-a="pick" data-k="' + f.id + '">Занять</button>';
        if (L.host) h += '<button class="btn sm" data-a="slot" data-k="' + f.id + '" data-m="' + (mode === 'off' ? 'bot' : 'off') + '">' + (mode === 'off' ? 'Вернуть бота' : 'Убрать') + '</button>';
      }
      h += '</div></div>';
    });
    h += '</div>';
    if (L.host) h += btn('Начать игру', 'go', '', humans ? false : 'сначала займи бригаду', 'primary wide');
    else h += '<p class="muted">Игру начнёт создатель комнаты.</p>';
    const sc = modal.firstChild && modalKey === 'lobby' ? modal.firstChild.scrollTop : 0;
    openModal(h + btn('Выйти из комнаты', 'leave', '', false, 'wide ghost'), 'start', 'lobby');
    modal.firstChild.scrollTop = sc;
  }

  buildMap();
  function boot(data) {
    if (data && data.S) { S = E.migrate(data.S); me = S.humans[0]; sel = data.sel; render(); return; }
    const m = /^#room-([\w-]+)$/.exec(location.hash), rec = Net.recall() || {};
    if (m && rec[m[1]]) { enterRoom(m[1], rec[m[1]]); return; }
    showStart();
    if (m) Net.rooms().then(l => { if (l) Net.post('join', { room: m[1], nick: savedNick() }).then(r => r.room ? enterRoom(r.room, r.token) : toast(r.err, true)); });
  }
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => (net ? {} : { S, sel }));
  if (hot && hot.ready) hot.ready(boot); else boot((hot && hot.data) || {});
})();
