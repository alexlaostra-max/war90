/* Интерфейс: карта, панели, модальные окна, лобби онлайна */
(function () {
  const G = window.W90, E = G.Engine, D = G.DATA, GEO = G.GEO, Net = G.Net;
  const SAVE = 'war90.save.v3';
  let S = null, me = null, sel = null, tab = 'district', confirmNew = false;
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
  function load() { try { const s = JSON.parse(localStorage.getItem(SAVE)); return s && s.v === 3 && !s.done ? s : null; } catch (e) { return null; } }
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
  const up = e => { const was = ptrs.has(e.pointerId); ptrs.delete(e.pointerId); pinch = 0; if (was && moved <= 6 && e.type === 'pointerup') { const t = document.elementFromPoint(e.clientX, e.clientY); if (S && t && t.dataset && t.dataset.i != null) { sel = +t.dataset.i; tab = 'district'; render(); } } };
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
    const st = (l, v, x, cls) => '<div class="st ' + (cls || '') + '"><span>' + l + '</span><b>' + v + '</b>' + (x ? '<i>' + x + '</i>' : '') + '</div>';
    let pips = ''; for (let i = 0; i < E.apMax(S, me); i++) pips += '<u class="' + (i < p.ap ? 'on' : '') + '"></u>';
    $('#stats').innerHTML =
      st('Касса, тыс. $', R(p.money), sign(inc.total) + ' в мес.', p.money < 0 ? 'bad' : '') +
      st('Бойцы', p.men, 'из ' + cap) + st('Стволы', p.guns) + st('Тачки', p.cars) +
      st('Авторитет', R(p.rep)) + st('Связи', E.conn(S, me)) +
      '<div class="st heat l' + L + '"><span>Розыск · ' + D.LAW[L].name + '</span><div class="meter"><em style="width:' + p.heat + '%"></em><s style="left:20%"></s><s style="left:40%"></s><s style="left:60%"></s><s style="left:80%"></s></div><i>' + R(p.heat) + ' из 100, ' + sign(E.heatDelta(S, me)) + ' в мес.</i></div>' +
      '<div class="st ap"><span>Ходы</span><div class="pips">' + pips + '</div></div>';
    const end = $('#end');
    end.disabled = !!p.event || !!p.over || S.done;
    if (net) { const act = E.active(S), rd = act.filter(h => S.f[h].ready).length; end.textContent = p.ready ? 'Жду остальных ' + rd + '/' + act.length + ' · отменить' : 'Готов'; end.classList.toggle('waiting', !!p.ready); }
    else { end.textContent = 'Конец месяца'; end.classList.remove('waiting'); }
  }

  // ---------- вкладки ----------
  const TABS = [['district', 'Район'], ['gang', 'Братва'], ['law', 'Власть'], ['biz', 'Бизнес'], ['clans', 'Кланы'], ['log', 'Хроника']];
  const btn = (label, a, attrs, lock, cls) => '<button class="btn ' + (cls || '') + '" data-a="' + a + '" ' + (attrs || '') + (lock ? ' disabled' : '') + '>' + label + (lock && typeof lock === 'string' ? '<small>' + esc(lock) + '</small>' : '') + '</button>';
  const kindTag = k => '<span class="tag ' + k + '">' + ({ w: 'белый', g: 'серый', b: 'чёрный' }[k]) + '</span>';
  const who = f => fd(f).name + (S.f[f].human && S.f[f].nick ? ' · ' + esc(S.f[f].nick) : '');

  const ROMAN = ['', 'I', 'II', 'III'];
  // точки района: что стоит, что можно улучшить и что построить
  function pointsHTML(i) {
    const d = S.d[i], dd = D.DISTRICTS[i], p = P();
    let h = '<h3>Точки <span class="muted">' + d.b.length + ' из ' + dd.slots + '</span></h3>';
    if (d.b.length) h += '<table class="tbl pts">' + d.b.map((b, x) => {
      const B = D.BUILDS[b], lv = E.pointLvl(d, x), c = E.upgradeCost(S, i, x), inc = E.pointInc(me, b);
      return '<tr><td>' + B.name + ' <b class="lv">' + ROMAN[lv] + '</b></td><td class="good">+' + inc * lv + '</td><td>' + (lv >= E.MAX_LVL ? '<span class="muted">макс.</span>' : '<button class="btn sm" data-a="upgrade" data-i="' + i + '" data-x="' + x + '"' + (p.money < c || p.ap < 1 ? ' disabled' : '') + '>Улучшить · ' + c + ' → +' + inc * (lv + 1) + '</button>') + '</td></tr>';
    }).join('') + '</table>';
    if (d.b.length >= dd.slots) return h + '<p class="muted">Свободных мест нет. Улучшай то, что стоит.</p>';
    h += '<div class="grid">';
    Object.keys(D.BUILDS).forEach(k => {
      const B = D.BUILDS[k], lock = E.canBuild(S, me, i, k);
      if (B.onlyMarket && !dd.m) return;
      h += '<button class="card" data-a="build" data-i="' + i + '" data-k="' + k + '"' + (lock || p.ap < 1 ? ' disabled' : '') + ' title="' + esc(B.desc) + '"><b>' + B.name + '</b>' + kindTag(B.kind) + '<span>' + (B.cost ? B.cost + ' тыс.' : 'бесплатно') + ' → +' + E.pointInc(me, k) + '/мес.</span>' + (lock ? '<small>' + esc(lock) + '</small>' : '') + '</button>';
    });
    return h + '</div>';
  }
  function paneDistrict() {
    if (sel == null) return '<p class="muted">Выбери район на карте. Нападать можно только на районы, которые граничат с твоими: они обведены пунктиром.</p>';
    const d = S.d[sel], dd = D.DISTRICTS[sel], p = P(), mine = d.o === me, c = E.conn(S, me);
    const ids = E.okrugIds(dd.ok), have = ids.filter(i => S.d[i].o === me).length;
    let h = '<h2>' + esc(dd.name) + '</h2><p class="sub">' + D.OKRUGS[dd.ok].name + ' · у тебя ' + have + ' из ' + ids.length + '</p>';
    h += '<dl class="kv"><dt>Хозяин</dt><dd>' + (mine ? 'Ты' : d.o ? '<i class="dot" style="background:' + fd(d.o).color + '"></i>' + who(d.o) : 'Местная шпана') + '</dd><dt>Оборона</dt><dd>' + E.districtDef(S, sel) + '</dd><dt>Дань</dt><dd>' + dd.inc + ' в мес.</dd>' + (dd.m ? '<dt>Рынок</dt><dd>есть</dd>' : '') + '</dl>';
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
      h += pointsHTML(sel);
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

  function paneGang() {
    const p = P(), inc = E.income(S, me), cap = E.menCap(S, me);
    let h = '<h2>' + fd(me).name + '</h2><p class="sub">' + esc(fd(me).perk) + '</p>';
    h += '<dl class="kv"><dt>Сила бригады</dt><dd>' + R(E.power(p)) + '</dd><dt>Бойцы</dt><dd>' + p.men + ' из ' + cap + '</dd><dt>Со стволом</dt><dd>' + Math.min(p.men, p.guns) + '</dd><dt>На колёсах</dt><dd>' + Math.min(p.men, p.cars * 4) + '</dd><dt>Районы</dt><dd>' + E.count(S, me) + ' из 102</dd></dl>';
    h += '<div class="grid">' +
      '<button class="card" data-a="recruit"' + (p.ap < 1 || p.men >= cap ? ' disabled' : '') + '><b>Вербовать</b><span>1 ход, бесплатно</span>' + (p.men >= cap ? '<small>предел: нужны районы и авторитет</small>' : '') + '</button>' +
      '<button class="card" data-a="guns"' + (p.money < E.gunPrice(S, me) * 5 ? ' disabled' : '') + '><b>5 стволов</b><span>' + E.gunPrice(S, me) * 5 + ' тыс., без хода</span></button>' +
      '<button class="card" data-a="car"' + (p.money < E.CAR_PRICE ? ' disabled' : '') + '><b>Тачка</b><span>' + E.CAR_PRICE + ' тыс., без хода</span></button></div>';
    h += '<p class="muted">Боец со стволом дерётся за двоих. Тачка возит четверых на разборку. Стволы и тачки поднимают авторитет.</p>';
    h += '<h3>Касса за месяц</h3><table class="tbl">' + inc.rows.filter(r => r[1]).map(r => '<tr><td>' + r[0] + '</td><td class="' + (r[1] < 0 ? 'bad' : 'good') + '">' + sign(r[1]) + '</td></tr>').join('') + '<tr class="sum"><td>Итого</td><td>' + sign(inc.total) + '</td></tr></table>';
    const tot = inc.white + inc.black;
    if (tot) h += '<p class="muted">Белый доход: ' + R(inc.white / tot * 100) + '%. К 2007 году выживут те, кто успел легализоваться.</p>';
    if (p.later.length) h += '<h3>Вложения в пути</h3><table class="tbl">' + p.later.map(l => '<tr><td>' + esc(l.why) + '</td><td class="good">+' + l.amt + '</td></tr>').join('') + '</table>';
    if (p.jail.length) h += '<h3>На зоне</h3><table class="tbl">' + p.jail.map(j => '<tr><td>' + j.n + ' чел.</td><td>выйдут: ' + E.date(j.t + 1).label + '</td></tr>').join('') + '</table>';
    return h;
  }

  function paneLaw() {
    const p = P(), L = E.lawLevel(p.heat), y = E.date(S.turn).year, bc = E.bribeCost(S, me);
    let h = '<h2>Власть</h2><p class="sub">Розыск ' + R(p.heat) + ' из 100 · ' + D.LAW[L].name + '</p><ol class="ladder">';
    const what = ['', 'Берут по одному-два бойца', 'Облавы: до пяти бойцов', 'Десятая часть бригады и арест счетов', 'Пятая часть бригады, счета, бизнес. На 100 придут за тобой'];
    D.LAW.forEach((l, i) => { if (i) h += '<li class="' + (i === L ? 'cur' : i < L ? 'past' : '') + '"><b>' + l.name + '</b><span>от ' + l.at + ' · ' + what[i] + '</span></li>'; });
    h += '</ol><p class="muted">Задержанных сажают, убивают при задержании или отпускают. От этого зависит авторитет. Чем больше связей, тем чаще отпускают.</p>';
    h += btn('Занести наверх · ' + bc + ' тыс. · розыск −12', 'bribe', '', p.heat < 5 ? 'вопросов нет' : p.money < bc ? 'не хватает денег' : p.ap < 1, 'wide');
    h += '<h3>Люди во власти <span class="muted">связи: ' + E.conn(S, me) + '</span></h3><div class="grid">';
    Object.keys(D.OFFICIALS).forEach(k => {
      const O = D.OFFICIALS[k], c = E.officialCost(S, me, k), lock = y < O.from ? 'с ' + O.from + ' года' : p.off[k] >= D.OFFICIAL_MAX ? 'больше не купить' : p.money < c ? 'не хватает денег' : '';
      h += '<button class="card" data-a="hire" data-k="' + k + '"' + (lock || p.ap < 1 ? ' disabled' : '') + '><b>' + O.name + '</b><em>' + p.off[k] + ' из ' + D.OFFICIAL_MAX + '</em><span>' + c + ' тыс. и ' + O.keep + ' в мес.</span><span>связи +' + O.w + ', розыск −' + O.cool + ' в мес.</span>' + (lock ? '<small>' + lock + '</small>' : '') + '</button>';
    });
    return h + '</div>';
  }

  let bizView = 'districts'; const openD = new Set();
  function paneBiz() {
    const seg = '<div class="seg"><button class="' + (bizView === 'districts' ? 'on' : '') + '" data-a="biz" data-k="districts">Районы</button><button class="' + (bizView === 'big' ? 'on' : '') + '" data-a="biz" data-k="big">Крупный и чёрный</button></div>';
    return '<h2>Бизнес</h2>' + seg + (bizView === 'districts' ? bizDistricts() : bizBig());
  }
  function bizDistricts() {
    const p = P(), own = E.owned(S, me), held = E.okrugsHeld(S, me), c = E.conn(S, me);
    if (!own.length) return '<p class="muted">Районов нет.</p>';
    const oks = Object.keys(D.OKRUGS);
    own.sort((a, b) => oks.indexOf(D.DISTRICTS[a].ok) - oks.indexOf(D.DISTRICTS[b].ok) || D.DISTRICTS[a].name.localeCompare(D.DISTRICTS[b].name, 'ru'));
    let h = '<p class="sub">Твои районы: что стоит, что можно построить и улучшить. Каждая стройка и улучшение — один ход.</p><div class="dlist">';
    own.forEach(i => {
      const d = S.d[i], dd = D.DISTRICTS[i], open = openD.has(i);
      const pts = d.b.reduce((s, b, x) => s + E.pointInc(me, b) * E.pointLvl(d, x), 0), tribute = dd.inc * (held.includes(dd.ok) ? 2 : 1), ent = d.ent ? dd.ent.inc : 0;
      const canUp = d.b.some((b, x) => E.pointLvl(d, x) < E.MAX_LVL);
      h += '<div class="drow' + (open ? ' open' : '') + '"><button class="dhead" data-a="dopen" data-i="' + i + '" aria-expanded="' + open + '"><b>' + esc(dd.name) + '</b><span>' + D.OKRUGS[dd.ok].short + ' · точек ' + d.b.length + '/' + dd.slots + (dd.ent ? ' · ' + (d.ent ? 'предприятие взято' : 'есть предприятие') : '') + '</span><em>+' + (tribute + pts + ent) + '</em><i>' + (d.b.length < dd.slots ? 'строить' : canUp ? 'улучшать' : 'готово') + '</i></button>';
      if (open) {
        h += '<div class="dbody"><p class="muted">Дань ' + tribute + ', точки ' + pts + (ent ? ', предприятие ' + ent : '') + ' в мес.</p>' + pointsHTML(i);
        if (dd.ent) {
          const e = dd.ent;
          h += '<h3>' + esc(e.name) + '</h3>' + (d.ent ? '<p class="good">Под тобой. +' + e.inc + ' в мес.</p>' : '<p class="muted">Доход ' + e.inc + '. Нужны бойцы ' + e.men + ', связи ' + e.conn + ', ' + e.cost + ' тыс.</p>' + btn('Захватить · 2 хода · шанс ' + R(E.raidOdds(S, me, i)) + '%', 'raid', 'data-i="' + i + '"', p.men < e.men || c < e.conn || p.money < e.cost || p.ap < 2, 'wide'));
        }
        h += btn('Показать на карте', 'goto', 'data-i="' + i + '"', false, 'wide ghost') + '</div>';
      }
      h += '</div>';
    });
    return h + '</div>';
  }
  function bizBig() {
    const p = P();
    let h = '<p class="sub">Три шага: поездка, переговоры, вход в капитал. Один шаг в месяц.</p>';
    D.PROJECTS.forEach(pr => {
      const ps = E.projStatus(S, me, pr), stage = ps.st.stage || 0, pi = E.projIncome(S, me, pr);
      h += '<div class="box proj ' + (stage === 3 ? 'live' : '') + '"><h3>' + pr.name + ' ' + kindTag(pr.kind) + '</h3>';
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
    return h;
  }

  function paneClans() {
    const p = P();
    let h = '<h2>Кланы</h2><table class="tbl clans"><tr><th>Бригада</th><th>Районы</th><th>Сила</th><th></th></tr>';
    D.FACTIONS.filter(f => !S.f[f.id].absent).sort((a, b) => E.count(S, b.id) - E.count(S, a.id)).forEach(f => {
      const x = S.f[f.id], mine = f.id === me;
      h += '<tr class="' + (x.alive ? '' : 'dead') + '"><td><i class="dot" style="background:' + f.color + '"></i>' + f.name + (mine ? ' (ты)' : x.human ? ' · ' + esc(x.nick || 'игрок') : '') + '</td><td>' + E.count(S, f.id) + '</td><td>' + (x.alive ? R(E.power(x)) : '—') + '</td><td>';
      if (!mine && x.alive) {
        if (x.human) h += '<span class="' + (x.ready ? 'good' : 'muted') + '">' + (x.ready ? 'готов' : 'ходит') + '</span>';
        else h += E.inTruce(S, me, f.id) ? '<span class="muted">мир до ' + E.date(p.truce[f.id]).label + '</span>' : '<button class="btn sm" data-a="truce" data-k="' + f.id + '"' + (p.ap < 1 || p.money < E.truceCost(S, f.id) ? ' disabled' : '') + '>Стрелка · ' + E.truceCost(S, f.id) + '</button>';
      }
      h += '</td></tr>';
    });
    h += '</table><p class="muted">Стрелка: мир с ботом на год, если договоритесь. Чем выше авторитет и сила, тем сговорчивее соседи.' + (net ? ' С живыми игроками договаривайся сам.' : '') + '</p>';
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
    $('#tabs').innerHTML = TABS.map(t => '<button class="' + (t[0] === tab ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>').join('');
    const pane = $('#pane'), pk = tab + ':' + (tab === 'district' ? sel : ''), keep = pane.dataset.key === pk ? pane.scrollTop : 0;
    pane.innerHTML = ({ district: paneDistrict, gang: paneGang, law: paneLaw, biz: paneBiz, clans: paneClans, log: paneLog })[tab]();
    pane.dataset.key = pk; pane.scrollTop = keep;
    if (P().over) showOver(); else if (P().event) showEvent();
  }

  // ---------- действия ----------
  let toastT = 0;
  function toast(msg, bad) { const t = $('#toast'); t.textContent = msg; t.className = bad ? 'bad' : ''; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3200); }
  function done(r) {
    if (!r) return;
    const msg = r.msg || r.err;
    if (r.event && r.ok) { save(); showResult(r); return; }
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
    const tb = e.target.closest('[data-tab]'); if (tb) { tab = tb.dataset.tab; confirmNew = false; render(); return; }
    const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
    const a = b.dataset.a, k = b.dataset.k;
    // меню и лобби
    if (a === 'start') { S = E.newGame(k, (Math.random() * 2e9) | 0); me = k; net = null; sel = D.DISTRICTS.find(d => d.name === fd(k).home).id; tab = 'district'; view = FULL.slice(); applyView(); save(); closeModal(); render(); return; }
    if (a === 'continue') { const sv = load(); if (sv) { S = sv; me = S.humans[0]; net = null; closeModal(); render(); } return; }
    if (a === 'menu') { leaveToMenu(); return; }
    if (a === 'create') { const nick = nickValue(); Net.post('create', { name: $('#roomname').value, nick }).then(r => r.room ? enterRoom(r.room, r.token) : toast(r.err, true)); return; }
    if (a === 'join') { Net.post('join', { room: k, nick: nickValue(), token: (Net.recall() || {})[k] }).then(r => r.room ? enterRoom(r.room, r.token) : toast(r.err, true)); return; }
    if (a === 'refresh') { showStart(); return; }
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
    else if (a === 'biz') { bizView = k; render(); }
    else if (a === 'dopen') { if (openD.has(di)) openD.delete(di); else openD.add(di); render(); }
    else if (a === 'kidnap') act('kidnap', [sel]);
    else if (a === 'raid') act('raid', [di]);
    else if (a === 'recruit') act('recruit', []);
    else if (a === 'guns') act('buyGuns', []);
    else if (a === 'car') act('buyCar', []);
    else if (a === 'hire') act('hire', [k]);
    else if (a === 'bribe') act('bribe', []);
    else if (a === 'truce') act('truce', [k]);
    else if (a === 'proj') act('projStep', [k, b.dataset.h || null]);
    else if (a === 'cashout') act('cashOut', []);
    else if (a === 'opt') act('choose', [+k]);
    else if (a === 'force') netCall('force');
    else if (a === 'goto') { sel = +b.dataset.i; tab = 'district'; render(); }
    else if (a === 'new1') { confirmNew = true; render(); }
    else if (a === 'new0') { confirmNew = false; render(); }
    else if (a === 'new2') { confirmNew = false; wipe(); leaveToMenu(); }
    else if (a === 'close') { closeModal(); render(); }
  });
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
    h += '<h2>' + esc(ev.title) + '</h2><p class="lead">' + esc(ev.text) + '</p><div class="opts">';
    ev.opts.forEach((o, k) => { const os = E.optState(S, me, o); h += '<button class="opt" data-a="opt" data-k="' + k + '"' + (os.lock ? ' disabled' : '') + '><span>' + esc(o.t) + '</span>' + (os.cost ? '<em>' + os.cost + ' тыс.</em>' : '') + (os.lock ? '<small>' + esc(os.lock) + '</small>' : '') + '</button>'; });
    openModal(h + '</div>', 'event', key);
  }
  function showResult(r) {
    const d = r.delta, names = { money: 'Касса', rep: 'Авторитет', heat: 'Розыск', men: 'Бойцы', guns: 'Стволы', cars: 'Тачки', later: 'Вернётся позже' };
    let ch = '';
    Object.keys(names).forEach(k => { if (d[k]) { const good = k === 'heat' ? d[k] < 0 : d[k] > 0; ch += '<span class="' + (good ? 'good' : 'bad') + '">' + names[k] + ' ' + sign(d[k]) + '</span>'; } });
    openModal('<p class="eyebrow">' + esc(r.title) + '</p><p class="lead">' + esc(r.msg) + '</p><p class="deltas">' + (ch || '<span>Без последствий</span>') + '</p><button class="btn primary wide" data-a="close">Дальше</button>', 'event', 'result');
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
  const savedNick = () => { try { return localStorage.getItem('war90.nick') || ''; } catch (e) { return ''; } };
  function showStart() {
    const sv = load();
    let h = '<p class="eyebrow">Москва · декабрь 1991 — декабрь 2007</p><h1>Передел</h1><p class="lead">Страны больше нет. У тебя один район и восемь пацанов. Через шестнадцать лет криминал станет частью власти. Реши, будешь ли ты среди тех, кто дожил.</p>';
    h += '<div class="modes"><section><h3>Онлайн</h3><div id="online"><p class="muted">Ищу сервер…</p></div></section><section><h3>Одиночная игра</h3>';
    if (sv) h += '<button class="btn primary wide" data-a="continue">Продолжить: ' + fd(sv.humans[0]).name + ', ' + E.date(sv.turn).label + '</button>';
    h += '<p class="muted">Выбери бригаду. Остальных ведут боты.</p><div class="factions">';
    D.FACTIONS.forEach(f => { const d = D.DISTRICTS.find(x => x.name === f.home); h += '<button class="fac" data-a="start" data-k="' + f.id + '"><i style="background:' + f.color + '"></i><b>' + f.name + '</b><span>' + f.home + ', ' + D.OKRUGS[d.ok].short + '</span><small>' + esc(f.perk) + '</small></button>'; });
    h += '</div></section></div><p class="muted">Ход — один месяц. В начале месяца случается событие с пятью решениями. Потом у тебя три хода: вербуй, вооружай, нападай на соседние районы, ставь точки, покупай людей во власти.</p>';
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
    if (first) { sel = E.owned(S, me)[0]; if (sel == null) sel = null; tab = 'district'; if (modalKey === 'lobby') closeModal(); }
    render();
  }
  function showLobby() {
    const L = net.lobby, my = L.me && L.me.fid, humans = L.players.filter(p => p.fid).length;
    let h = '<p class="eyebrow">Комната · набор игроков</p><h2>' + esc(L.name) + '</h2>';
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
    if (data && data.S) { S = data.S; me = S.humans[0]; sel = data.sel; render(); return; }
    const m = /^#room-([\w-]+)$/.exec(location.hash), rec = Net.recall() || {};
    if (m && rec[m[1]]) { enterRoom(m[1], rec[m[1]]); return; }
    showStart();
    if (m) Net.rooms().then(l => { if (l) Net.post('join', { room: m[1], nick: savedNick() }).then(r => r.room ? enterRoom(r.room, r.token) : toast(r.err, true)); });
  }
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => (net ? {} : { S, sel }));
  if (hot && hot.ready) hot.ready(boot); else boot((hot && hot.data) || {});
})();
