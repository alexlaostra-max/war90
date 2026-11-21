/* Интерфейс: карта, панели, модальные окна, лобби онлайна */
(function () {
  const G = window.W90, E = G.Engine, D = G.DATA, GEO = G.GEO, Net = G.Net, A = G.ART;
  const SAVE = 'war90.save.v4';
  let S = null, me = null, sel = null, section = 'gang', confirmNew = false;
  // телефон: подробности (досье, район) выезжают поверх экрана отдельной панелью
  const mobile = () => matchMedia('(max-width: 860px)').matches;
  // Telegram Mini App: на весь экран, цвета игры, «Назад» Телеграма закрывает панели, ник из профиля
  const TG_BOT = 'peredelmskbot';
  const TG = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData ? window.Telegram.WebApp : null;
  const tgUser = () => (TG && TG.initDataUnsafe && TG.initDataUnsafe.user) || null;
  if (TG) {
    try { TG.ready(); TG.expand(); TG.setHeaderColor('#15121a'); TG.setBackgroundColor('#15121a'); if (TG.disableVerticalSwipes) TG.disableVerticalSwipes(); } catch (e) { /* старый клиент */ }
    document.documentElement.classList.add('tg');
    TG.BackButton.onClick(() => { if (sheet) { sheet = false; render(); } else if (modalKey === 'records' || modalKey === 'lawinfo') { closeModal(); if (S) render(); else showStart(); } });
  }
  if (TG) document.documentElement.classList.add('tg');
  // шторку досье на телефоне можно смахнуть вниз: за шапку всегда, за содержимое — когда оно прокручено к началу
  (function swipe() {
    const side = document.getElementById('side'), pane = document.getElementById('pane'); if (!side) return;
    let y0 = null, dy = 0, t0 = 0, armed = false;
    side.addEventListener('touchstart', e => {
      if (!sheet || e.touches.length !== 1 || e.target.closest('.xclose, input, select, textarea')) return;
      const head = e.target.closest('#sheethead'); armed = !!head || pane.scrollTop <= 1;
      if (!armed) return; y0 = e.touches[0].clientY; dy = 0; t0 = Date.now();
    }, { passive: true });
    side.addEventListener('touchmove', e => {
      if (y0 == null) return;
      dy = e.touches[0].clientY - y0;
      if (dy <= 0) { if (!e.target.closest('#sheethead')) { y0 = null; side.classList.remove('drag'); side.style.transform = ''; } return; } // тянут вверх — это прокрутка
      if (pane.scrollTop > 0 && !e.target.closest('#sheethead')) { y0 = null; return; }
      e.preventDefault(); side.classList.add('drag'); side.style.transform = 'translateY(' + dy + 'px)';
    }, { passive: false });
    const end = () => {
      if (y0 == null) return; y0 = null; side.classList.remove('drag');
      const fast = dy > 40 && dy / Math.max(1, Date.now() - t0) > 0.5;
      side.style.transform = '';
      if (dy > Math.min(140, side.offsetHeight * 0.25) || fast) { sheet = false; render(); }
    };
    side.addEventListener('touchend', end); side.addEventListener('touchcancel', end);
  })();
  // Раскладка телефона: высота нижней панели и вкладок (под неё поджимаются экран, шторка и всплывашки)
  // и отступы под системные кнопки Телеграма сверху и полоску «домой» снизу
  const rs = document.documentElement.style;
  function fitDock() {
    if (TG) {
      const sa = TG.safeAreaInset || {}, ca = TG.contentSafeAreaInset || {};
      let top = (sa.top || 0) + (ca.top || 0);
      // на весь экран Телеграм кладёт поверх свои кнопки «Закрыть» и «⌄ •••»; старые клиенты не сообщают их высоту
      if (!top && TG.isFullscreen) top = /android/i.test(TG.platform || navigator.userAgent) ? 80 : 92;
      rs.setProperty('--tgtop', top + 'px'); rs.setProperty('--tgbot', (sa.bottom || 0) + 'px');
    }
    const t = document.getElementById('top'), b = document.getElementById('tabbar');
    if (b) rs.setProperty('--tabh', b.offsetHeight + 'px');
    if (t) rs.setProperty('--toph', (getComputedStyle(t).position === 'fixed' ? t.offsetHeight : 0) + 'px');
  }
  if (window.ResizeObserver) { const ro = new ResizeObserver(fitDock); ['top', 'tabbar'].forEach(id => { const el = document.getElementById(id); if (el) ro.observe(el, { box: 'border-box' }); }); }
  window.addEventListener('resize', fitDock); window.addEventListener('orientationchange', () => setTimeout(fitDock, 300));
  if (TG && TG.onEvent) ['safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged', 'viewportChanged'].forEach(ev => { try { TG.onEvent(ev, fitDock); } catch (e) { /* старый клиент */ } });
  [0, 300, 1000, 2500].forEach(ms => setTimeout(fitDock, ms));
  const tgSync = () => { if (!TG) return; if (sheet || modalKey === 'records' || modalKey === 'lawinfo') TG.BackButton.show(); else TG.BackButton.hide(); };
  const haptic = kind => { try { if (TG && TG.HapticFeedback) TG.HapticFeedback.impactOccurred(kind || 'medium'); } catch (e) { /* ignore */ } };
  const DONATE = '+79936338436', DONATE_SHOW = '+7 993 633-84-36'; // донат автору: Т-Банк по номеру
  let sheet = false, perksOpen = false, confirmRetire = false;
  let net = null;          // онлайн: { room, token, lobby }
  let modalKey = '';       // что сейчас в модальном окне
  const FULL = GEO.box.slice(); let view = FULL.slice();
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fd = id => D.FACTIONS.find(f => f.id === id);
  const sign = v => (v > 0 ? '+' : '') + v;
  const R = Math.round;
  const P = () => S.f[me];

  function save() { if (net) return; try { localStorage.setItem(SAVE, JSON.stringify(S)); } catch (e) { /* без сохранения */ } cloudAuto(); }
  // облачное сохранение по коду: после первого раза партия сама уходит в облако раз в месяц игры
  const CLOUD = 'war90.cloud';
  const cloudCode = () => { try { return localStorage.getItem(CLOUD) || ''; } catch (e) { return ''; } };
  let cloudTurn = -1;
  function cloudPush(manual) {
    if (!S || net) return;
    Net.post('csave', { code: cloudCode() || null, state: S }).then(r => {
      if (r.ok) { try { localStorage.setItem(CLOUD, r.code); } catch (e) { /* ignore */ } cloudTurn = S.turn; if (manual) { toast('Сохранено в облако. Код: ' + r.code); render(); } }
      else if (manual) toast(r.err || 'Сервер недоступен', true);
    });
  }
  function cloudAuto() { if (S && !net && cloudCode() && Net.available() && S.turn !== cloudTurn) cloudPush(false); }
  const cloudHTML = () => { if (!Net.available()) return ''; const c = cloudCode(); return '<div class="box cloud"><h3>Облачное сохранение</h3>' + (c ? '<p>Твой код: <b class="code">' + c + '</b></p><p class="muted">Партия сама сохраняется в облако каждый месяц. Чтобы продолжить на другом устройстве или по новому адресу игры, введи этот код в меню.</p>' + btn('Сохранить сейчас', 'cloudsave', '', false, 'ghost') : '<p class="muted">Сохрани партию на сервер и получи код: по нему её можно продолжить с телефона, с компьютера или по новому адресу игры.</p>' + btn('Сохранить в облако и получить код', 'cloudsave', '', false, 'primary')) + '</div>'; };
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
  const up = e => { const was = ptrs.has(e.pointerId); ptrs.delete(e.pointerId); pinch = 0; if (was && moved <= 6 && e.type === 'pointerup') { const t = document.elementFromPoint(e.clientX, e.clientY); if (S && t && t.dataset && t.dataset.i != null) { sel = +t.dataset.i; section = 'map'; sheet = true; render(); } } };
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
      el.classList.toggle('watched', spectating && !!o && o === watchFid);
    });
    svg.querySelectorAll('.ent').forEach(el => el.classList.toggle('got', S.d[+el.dataset.m].ent));
    const s = svg.querySelector('.cell.sel'); if (s) s.parentNode.appendChild(s);
  }

  // ---------- шапка ----------
  function renderTop() {
    const p = P(), inc = E.income(S, me), L = E.lawLevel(p.heat), cap = E.menCap(S, me);
    $('#date').textContent = ''; // месяц и год — в карточке главы
    // показатель шапки: значок, подпись, число, пояснение
    // нажатие ведёт туда, где этим показателем управляют
    // рубли — настоящими рублями по курсу (68М, 2,4млрд), доллары — в тыс. $
    const cc = E.cur(p), rubShort = v => { const r = Math.max(0, v) * 1000 * E.rubRate(S), f = (x, u) => (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10).toLocaleString('ru-RU') + u; return v < 0 ? R(v) : r >= 1e9 ? f(r / 1e9, 'млрд') : r >= 1e6 ? f(r / 1e6, 'М') : r >= 1e3 ? f(r / 1e3, 'К') : String(Math.round(r)); };
    const usdShort = v => v >= 1000 ? (Math.round(v / 100) / 10).toLocaleString('ru-RU') + 'М' : v + 'К';
    const GO = { rub: 'fx', usd: 'fx', money: 'cash', men: 'gang:men', gun: 'gang:arms', car: 'gang:cars', rep: 'gang:boss', conn: 'law' };
    const st = (k, l, v, x, cls) => '<button class="st s-' + k + ' ' + (cls || '') + '" data-go="' + GO[k] + '" title="' + l + '">' + A.icon(k) + '<div><span>' + l + '</span><b>' + v + '</b>' + (x ? '<i>' + x + '</i>' : '') + '</div></button>';
    let pips = ''; for (let i = 0; i < E.apMax(S, me); i++) pips += '<u class="' + (i < p.ap ? 'on' : '') + '"></u>';
    $('#stats').innerHTML =
      st('rub', 'Рубли', rubShort(cc.rub), '≈ ' + cc.rub + ' тыс. $ · ' + plus(inc.total - inc.usd) + '/мес', p.money < 0 ? 'bad' : '') +
      st('usd', 'Доллары', usdShort(cc.usd), (inc.usd ? plus(inc.usd, true) + '/мес · ' : '') + 'на крупные дела и статус') +
      st('men', 'Бойцы', p.men, 'из ' + cap + ', ждут ' + E.pool(S, me)) + st('gun', 'Стволы', p.guns) + st('car', 'Тачки', p.cars) +
      st('conn', 'Связи', E.conn(S, me)) +
      '<button class="st heat l' + L + '" data-go="law" title="Розыск">' + A.icon('heat') + '<b class="hnum">' + R(p.heat) + '</b><div><span>Розыск · ' + D.LAW[L].name + '</span><div class="meter"><em style="width:' + p.heat + '%"></em><s style="left:20%"></s><s style="left:40%"></s><s style="left:60%"></s><s style="left:80%"></s></div><i>' + R(p.heat) + ' из 100, ' + sign(E.heatDelta(S, me)) + ' в мес.</i></div></button>' +
      '';
    $('#perks').innerHTML = fxStrip();
    $('#apm').innerHTML = '<div class="pips">' + pips + '</div><span class="tmr" hidden></span>';
    $('#ap').innerHTML = '<span>Ходы</span><div class="pips">' + pips + '</div><b>' + p.ap + ' из ' + E.apMax(S, me) + '</b><span class="tmr" hidden></span>';
    tickTimer();
    const end = $('#end');
    end.disabled = !!p.event || !!p.over || S.done;
    if (net) { const act = E.active(S), rd = act.filter(h => S.f[h].ready).length; end.textContent = p.ready ? 'Жду остальных ' + rd + '/' + act.length + ' · отменить' : 'Готов'; end.classList.toggle('waiting', !!p.ready); }
    else { end.textContent = 'Конец месяца'; end.classList.remove('waiting'); }
  }

  // ---------- вкладки ----------
  const VIEWS = [['gang', 'Банда'], ['cash', 'Общак'], ['map', 'Районы'], ['big', 'Крупные дела'], ['law', 'Власть'], ['clans', 'ОПГ'], ['fx', 'Обменник'], ['log', 'Хроника']];
  const TABS = { gang: ['men', 'Банда'], cash: ['money', 'Общак'], map: ['map', 'Районы'], big: ['deal', 'Дела'], law: ['law', 'Власть'], clans: ['gun', 'ОПГ'], fx: ['fx', 'Обмен'], log: ['log', 'Хроника'] };
  // деньги словами: тыс. $ → «9К $», рубли по курсу месяца → «1,5М ₽»
  const kfmt = v => { const a = Math.abs(v), f = (x, u) => (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10).toLocaleString('ru-RU') + u; return a >= 1e9 ? f(a / 1e9, ' млрд') : a >= 1e6 ? f(a / 1e6, 'М') : a >= 1e3 ? f(a / 1e3, 'К') : String(Math.round(a)); };
  const usdS = v => (v < 0 ? '−' : '') + kfmt(v * 1000) + ' $';
  const rubS = v => (v < 0 ? '−' : '') + kfmt(v * 1000 * E.rubRate(S)) + ' ₽';
  const money = (v, usd) => usd ? usdS(v) : rubS(v);
  const plus = (v, usd) => (v > 0 ? '+' : '') + money(v, usd);
  const btn = (label, a, attrs, lock, cls) => '<button class="btn ' + (cls || '') + '" data-a="' + a + '" ' + (attrs || '') + (lock ? ' disabled' : '') + '>' + label + (lock && typeof lock === 'string' ? '<small>' + esc(lock) + '</small>' : '') + '</button>';
  const kindTag = k => '<span class="tag ' + k + '">' + ({ w: 'белый', g: 'серый', b: 'чёрный' }[k]) + '</span>';
  const who = f => fd(f).name + (S.f[f].human && S.f[f].nick ? ' · ' + esc(S.f[f].nick) : '');

  const ROMAN = ['', 'I', 'II', 'III'];
  // польза точки на уровне: числа из описания умножаются на уровень (15% → 30% → 45%)
  const perkAt = (B, lv) => lv > 1 && (B.fx || B.rec || B.def) ? B.perk.replace(/\d+/g, n => +n * lv) : B.perk;
  // точки района: что стоит, что можно улучшить и что построить
  function pointsHTML(i) {
    const d = S.d[i], dd = D.DISTRICTS[i], p = P();
    const tR = d.b.reduce((a, b, x) => a + (D.BUILDS[b].usd ? 0 : E.pointInc(me, b, i) * E.pointLvl(d, x)), 0), tU = d.b.reduce((a, b, x) => a + (D.BUILDS[b].usd ? E.pointInc(me, b, i) * E.pointLvl(d, x) : 0), 0);
    const tot = [tR ? plus(tR) : '', tU ? plus(tU, true) : ''].filter(Boolean).join(' и ');
    let h = '<div class="pbuilt"><h3>Твои точки <span class="muted">' + d.b.length + ' из ' + dd.slots + ' мест' + (d.b.length ? ' · ' + tot + ' в мес.' : '') + '</span> ' + tipAsk('mine') + '</h3>';
    if (!d.b.length) h += '<p class="muted">Пока ни одной. Выбери, что построить, ниже.</p>';
    if (d.b.length) h += '<div class="ptiles">' + d.b.map((b, x) => {
      const B = D.BUILDS[b], lv = E.pointLvl(d, x), c = E.upgradeCost(S, i, x), inc = E.pointInc(me, b, i);
      return '<div class="ptile"><div class="pimg">' + A.build(b, lv) + '<b class="lvb">' + ROMAN[lv] + '</b></div><div class="pinfo"><b>' + B.name + '</b><span class="good">' + plus(inc * lv, B.usd) + ' в мес.' + (E.pointGood(b, i) ? ' · место +50%' : '') + '</span>' + (B.perk ? '<small class="perk">' + esc(perkAt(B, lv)) + '</small>' : '') + '</div>' +
        (lv >= E.MAX_LVL ? '<p class="muted pmax">Высший уровень</p>' : '<button class="btn sm pup" data-a="upgrade" data-i="' + i + '" data-x="' + x + '"' + (p.money < c ? ' disabled' : '') + '><span class="pnext">' + A.build(b, lv + 1, true) + '</span><span>До ' + ROMAN[lv + 1] + ' · ' + c + ' тыс. → ' + plus(inc * (lv + 1), B.usd) + (B.fx || B.rec || B.def ? '<small>' + esc(perkAt(B, lv + 1)) + '</small>' : '') + '</span></button>') + '</div>';
    }).join('') + '</div>';
    h += '</div>';
    if (d.b.length >= dd.slots) return h + '<p class="muted pfull">Свободных мест нет. Улучшай то, что стоит.</p>';
    h += '<div class="pnew"><h3>Построить новую <span class="muted">свободно мест: ' + (dd.slots - d.b.length) + '</span></h3>';
    const rank = k => D.BUILDS[k].need && k !== 'casino' ? 0 : E.pointGood(k, i) ? 1 : 2;
    const keys = Object.keys(D.BUILDS).filter(k => !(D.BUILDS[k].onlyMarket && !dd.m) && !(D.BUILDS[k].need && !D.BUILDS[k].need.some(t => dd.t.includes(t)))).sort((a, b) => rank(a) - rank(b));
    h += '<div class="grid">';
    keys.forEach(k => {
      const B = D.BUILDS[k], lock = E.canBuild(S, me, i, k), r = rank(k);
      h += '<button class="card bcard' + (r === 0 ? ' special' : r === 1 ? ' fit' : '') + '" data-a="build" data-i="' + i + '" data-k="' + k + '"' + (lock ? ' disabled' : '') + ' title="' + esc(B.desc) + '">' + A.build(k, 1, true) + (r === 0 ? '<em class="btag">особая</em>' : r === 1 ? '<em class="btag fit">+50% здесь</em>' : '') + '<b>' + B.name + '</b>' + kindTag(B.kind) + '<span>' + (B.cost ? B.cost + ' тыс. $' : 'бесплатно') + ' → ' + plus(E.pointInc(me, k, i), B.usd) + '/мес.' + (B.usd ? ' · валюта' : '') + '</span>' + (B.perk ? '<i class="perk">' + esc(B.perk) + '</i>' : '') + (lock ? '<small>' + esc(lock) + '</small>' : '') + '</button>';
    });
    return h + '</div></div>';
  }
  // особенности района: чипы с подсказкой, что это за место
  const traitChips = dd => '<div class="traits">' + dd.t.map(t => '<span class="trait" title="' + esc(D.TRAITS[t].desc) + '">' + D.TRAITS[t].name + '</span>').join('') + '</div>';
  // ---------- обучение: подсказки к экранам (показываются, пока не нажмёшь «Понятно»; «?» открывает снова) ----------
  const TIPS = {
    map: { title: 'Как брать районы', steps: [
      'Твои районы закрашены твоим цветом. Районы с <b>пунктирной обводкой</b> граничат с твоими — их можно брать.',
      'Нажми на пунктирный район. Откроется карточка с тремя кнопками: <b>Наезд</b> — едет треть бригады, <b>Разборка</b> — две трети, <b>Война</b> — все.',
      'Под кнопками написан шанс победы. Чем больше людей едет, тем выше шанс, но больше розыск и потери.',
      'Каждое нападение тратит один <b>ход</b> — жёлтые кружки внизу. В месяц 3 хода; правая рука и целые округа добавляют.',
      'Дальше перестрелка: каждый раунд выбираешь тактику, урон решают кубики. Победил — район твой.',
      'Сила — это бойцы <b>со стволами</b>. Без ствола боец почти бесполезен. Тачки везут на дело больше людей. Всё это — во вкладке «Банда».'] },
    mine: { title: 'Твой район: как он приносит деньги', steps: [
      'Каждый твой район платит <b>дань</b> раз в месяц. Но главные деньги дают <b>точки</b> — бизнесы, которые ты строишь ниже.',
      'Мест под точки мало: сколько занято и сколько всего — видно в заголовке «Точки».',
      'Метка <b>«+50% здесь»</b> — точка подходит району (у вокзала — вокзальная крыша, у реки — причал) и приносит в полтора раза больше. <b>«Особая»</b> — бывает только там, где есть рынок, вокзал или парк.',
      'Построенную точку можно улучшить до <b>III уровня</b>: с каждым уровнем доход растёт.',
      'Белые точки (ресторан, бутик) дают чистые деньги. Чёрные (бордель, цех) дают больше, но поднимают розыск.',
      'Поставь <b>смотрящего</b> — он поднимает оборону и дань района. А бригадир округа сам ставит смотрящих и строит точки.'] },
    cash: { title: 'Общак: откуда деньги и куда уходят', steps: [
      '<b>Касса</b> — все твои деньги. Ниже по строкам видно, что приходит за месяц (дань, точки) и что уходит (бойцы, люди во власти).',
      '<b>Белый нал</b> — отмытые деньги с белых точек: при облавах их не трогают. <b>Чёрный</b> — с улицы: при розыске от 60 милиция изымает часть.',
      'Часть кассы можно держать в <b>долларах</b>: рубль дешевеет каждый год, а в августе 1998-го будет дефолт.',
      'Если месяц в минусе — бери районы, строй точки или отпусти лишних бойцов.'] }
  };
  const TIP_KEY = 'war90.tips';
  const tipsSeen = () => { try { return JSON.parse(localStorage.getItem(TIP_KEY)) || {}; } catch (e) { return {}; } };
  let tipOpen = {}; // подсказки, открытые кнопкой «?»
  const tipOn = k => tipOpen[k] || !tipsSeen()[k];
  function tipHTML(k) {
    const T = TIPS[k]; if (!T || !tipOn(k)) return '';
    return '<div class="tip"><p class="eyebrow">Как играть</p><h3>' + T.title + '</h3><ol>' + T.steps.map(x => '<li>' + x + '</li>').join('') + '</ol><button class="btn sm primary" data-a="tipok" data-k="' + k + '">Понятно</button></div>';
  }
  const tipAsk = k => '<button class="tipq" data-a="tip" data-k="' + k + '" title="Как это работает" aria-label="Как это работает">?</button>';
  // подсказка на карте поверх неё, пока не закрыта; районы для нападения подсвечиваются
  function mapTip() {
    const box = $('#maptip'); if (!box) return;
    const on = S && section === 'map' && tipOn('map') && !P().over;
    box.hidden = !on; box.innerHTML = on ? tipHTML('map') : '';
    svg.classList.toggle('teach', on);
  }

  function paneDistrict() {
    if (sel == null) return spectating && P().over ? watchPane() : paneDist();
    const d = S.d[sel], dd = D.DISTRICTS[sel], p = P(), mine = d.o === me, c = E.conn(S, me);
    const ids = E.okrugIds(dd.ok), have = ids.filter(i => S.d[i].o === me).length;
    let h = '<button class="btn sm ghost back" data-a="dlist">← Все мои районы · ' + E.count(S, me) + '</button><h2>' + esc(dd.name) + '</h2><p class="sub">' + D.OKRUGS[dd.ok].name + ' · у тебя ' + have + ' из ' + ids.length + '</p>' + traitChips(dd);
    if (mine) h += tipHTML('mine');
    h += '<dl class="kv"><dt>Хозяин</dt><dd>' + (mine ? 'Ты' : d.o ? '<i class="dot" style="background:' + fd(d.o).color + '"></i>' + who(d.o) : 'Местная шпана') + '</dd><dt>Оборона</dt><dd>' + E.districtDef(S, sel) + '</dd>' + (mine ? (() => { const cp = E.crew(S, me).find(x => x.pos === 'capo' && x.ok === dd.ok); return '<dt>Бригадир</dt><dd>' + (cp ? '<button class="link" data-a="person" data-id="' + cp.id + '">' + esc(E.cname(cp)) + '</button>' : '<button class="link" data-a="slot" data-pos="capo" data-ok="' + dd.ok + '">нет, назначить</button>') + '</dd>'; })() : '') + '<dt>Дань</dt><dd>' + money(dd.inc) + ' в мес.</dd>' + (dd.m ? '<dt>Рынок</dt><dd>есть</dd>' : '') + '</dl>';
    if (dd.ent) {
      const e = dd.ent;
      h += '<div class="box"><h3>' + esc(e.name) + '</h3>';
      if (d.ent && mine) h += '<p class="good">Под тобой. ' + plus(e.inc) + ' в мес.</p>';
      else if (d.ent) h += '<p class="muted">Под хозяином района. Доход ' + money(e.inc) + ' в мес.</p>';
      else {
        const ok = (v, need) => '<b class="' + (v >= need ? 'good' : 'bad') + '">' + need + '</b>';
        h += '<p>Доход ' + money(e.inc) + ' в мес. Для захвата нужны бойцы ' + ok(p.men, e.men) + ', связи во власти ' + ok(c, e.conn) + ' и ' + ok(p.money, e.cost) + ' тыс. $ на суды и реестр.</p>';
        if (mine) h += btn('Захватить предприятие · 2 хода · шанс ' + R(E.raidOdds(S, me, sel)) + '%', 'raid', '', p.men < e.men || c < e.conn || p.money < e.cost || p.ap < 2, 'wide');
        else h += '<p class="muted">Сначала возьми район.</p>';
      }
      h += '</div>';
    }
    if (mine) {
      h += '<dl class="kv">' + watchLine(sel) + '</dl>' + pointsHTML(sel);
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
    let h = '<p class="eyebrow">Общак ' + tipAsk('cash') + '</p><h2>' + fd(me).name + '</h2><p class="sub">' + esc(fd(me).perk) + '</p>';
    h += '<dl class="kv"><dt>Сила бригады</dt><dd>' + R(E.power(p)) + '</dd><dt>Касса</dt><dd>' + R(p.money) + ' тыс. $</dd><dt>Белый нал</dt><dd class="good">' + E.cash(p).white + '</dd><dt>Чёрный нал</dt><dd>' + E.cash(p).black + '</dd><dt>В долларах</dt><dd class="good">' + E.cur(p).usd + '</dd><dt>В рублях</dt><dd>' + E.cur(p).rub + '</dd><dt>Авторитет</dt><dd>' + R(p.rep) + '</dd><dt>Бойцы</dt><dd>' + p.men + ' из ' + cap + '</dd><dt>Районы</dt><dd>' + E.count(S, me) + ' из 102</dd></dl>';
    h += '<h3>Касса за месяц</h3><table class="tbl">' + inc.rows.filter(r => r[1]).map(r => '<tr><td>' + r[0] + '</td><td class="' + (r[1] < 0 ? 'bad' : 'good') + '">' + plus(r[1], r[2] === 'usd') + '</td></tr>').join('') + '<tr class="sum"><td>Итого</td><td>' + [inc.total - inc.usd ? plus(inc.total - inc.usd) : '', inc.usd ? plus(inc.usd, true) : ''].filter(Boolean).join(' и ') + '</td></tr></table>';
    const tot = inc.white + inc.black;
    const k = p.usdK || 0, fee = R(E.exchangeFee(S, me) * 100), inf = E.inflation(S) * 100;
    h += '<div class="box fxlink"><p>Рубли и доллары — во вкладке <b>«Обменник»</b>: курс, обмен в обе стороны.</p>' + btn('В обменник', 'gofx', '', false, 'sm') + '</div>';
    h += '<p class="muted">Белый нал лежит на счетах: облавы его не трогают. Чёрный хранится наличкой, и при розыске от 60 его изымают. Траты идут сначала из чёрного. Белый приходит с белых точек, предприятий, легальных дел и через отмывку: казино и обменники.</p>';
    if (tot) h += '<p class="muted">Белый доход: ' + R(inc.white / tot * 100) + '%. К 2007 году выживут те, кто успел легализоваться.</p>';
    if (p.later.length) h += '<h3>Вложения и долги</h3><table class="tbl">' + p.later.map(l => '<tr><td>' + esc(l.why) + '<br><span class="muted">' + E.date(l.t).label + '</span></td><td class="' + (l.amt < 0 ? 'bad' : 'good') + '">' + sign(l.amt) + '</td></tr>').join('') + '</table>';
    if (p.jail.length) h += '<h3>На зоне</h3><table class="tbl">' + p.jail.map(j => '<tr><td>' + j.n + ' чел.</td><td>выйдут: ' + E.date(j.t + 1).label + '</td></tr>').join('') + '</table>';
    // концовка по своему решению
    const rl = E.retireLock(S, me);
    h += '<h3>Отойти от дел</h3><p class="muted">С белыми деньгами и чистым досье можно уйти на покой: районы отойдут местным, игра закончится концовкой «Тихий пенсионер».</p>' + (confirmRetire && !rl ? '<div class="box"><p>Точно уйти? Партия закончится.</p><div class="grid"><button class="btn primary" data-a="retire2">Да, на дачу</button><button class="btn" data-a="retire0">Нет, ещё повоюем</button></div></div>' : btn('Отойти от дел', 'retire1', '', rl || false, 'wide ghost'));
    if (!net) h += '<div class="box fxlink"><p>Хроника событий, достижения, запись партии, сохранение в облако и новая игра.</p>' + btn('Открыть хронику', 'golog', '', false, 'sm') + '</div>';
    return h + deadList();
  }
  // ---------- обменник: рубли и доллары по курсу тех лет, сумма ползунком ----------
  let fxDir = 'buy';
  const bigRub = v => v >= 1e9 ? (Math.round(v / 1e8) / 10).toLocaleString('ru-RU') + ' млрд' : v >= 1e6 ? (Math.round(v / 1e5) / 10).toLocaleString('ru-RU') + ' млн' : Math.round(v).toLocaleString('ru-RU');
  function fxCalc() {
    const r = $('#fxr'), box = $('#fxcalc'); if (!r || !box) return;
    const v = +r.value, fee = Math.round(v * E.exchangeFee(S, me)), rate = E.rubRate(S), rub = x => bigRub(x * 1000 * rate) + ' ₽';
    box.innerHTML = fxDir === 'buy'
      ? '<span>Отдаёшь <b>' + rub(v) + '</b><small>≈ ' + v + ' тыс. $</small></span><i>→</i><span>Получишь <b class="good">' + Math.max(0, v - fee) + ' тыс. $</b><small>комиссия ' + fee + ' тыс.</small></span>'
      : '<span>Отдаёшь <b class="good">' + v + ' тыс. $</b><small>&nbsp;</small></span><i>→</i><span>Получишь <b>' + rub(Math.max(0, v - fee)) + '</b><small>комиссия ' + fee + ' тыс. $</small></span>';
    const go = $('#fxgo'); if (go) go.disabled = v < 1;
  }
  function paneFx() {
    const p = P(), cc = E.cur(p), rate = E.rubRate(S), fee = R(E.exchangeFee(S, me) * 100), inf = E.inflation(S) * 100, y = E.date(S.turn).year;
    const max = fxDir === 'buy' ? Math.max(0, cc.rub) : Math.max(0, cc.usd);
    let h = '<h2>Обменник</h2><p class="sub">Курс как был в ' + y + '-м. Доход приходит в рублях, а рубли дешевеют вслед за курсом.</p>';
    h += '<div class="fx"><div class="fxw rub"><span>₽ Рубли</span><b>' + bigRub(Math.max(0, cc.rub) * 1000 * rate) + ' ₽</b><small>≈ ' + cc.rub + ' тыс. $</small></div><div class="fxw usd"><span>$ Доллары</span><b>' + cc.usd + ' тыс. $</b><small>' + (cc.usd ? 'не дешевеют' : 'пусто') + '</small></div></div>';
    h += '<div class="fxboard"><span>' + E.date(S.turn).label + '</span><b>1 $ = ' + rate.toLocaleString('ru-RU') + ' ₽</b>' + (y >= 1998 && y <= 1999 ? '<small>новые рубли (деноминация 1998-го)</small>' : '') + '<em class="' + (inf > 0.05 ? 'bad' : 'good') + '">' + (inf > 0.05 ? 'за месяц рубль подешевеет на ' + (Math.round(inf * 10) / 10) + '%' : inf < -0.05 ? 'за месяц рубль окрепнет на ' + (Math.round(-inf * 10) / 10) + '%' : 'рубль стоит на месте') + '</em></div>';
    h += '<div class="seg fxdir">' + [['buy', 'Купить $'], ['sell', 'Продать $']].map(d => '<button class="btn' + (fxDir === d[0] ? ' on' : '') + '" data-a="fxdir" data-k="' + d[0] + '">' + d[1] + '</button>').join('') + '</div>';
    if (!max) h += '<p class="muted">' + (fxDir === 'buy' ? 'Рублей в кассе нет — менять нечего.' : 'Долларов нет — продавать нечего.') + '</p>';
    else h += '<div class="fxslide"><input id="fxr" type="range" min="0" max="' + max + '" step="1" value="' + Math.round(max / 2) + '" aria-label="Сколько менять"><div class="fxticks"><button class="link" data-a="fxset" data-k="0">0</button><button class="link" data-a="fxset" data-k="0.25">¼</button><button class="link" data-a="fxset" data-k="0.5">½</button><button class="link" data-a="fxset" data-k="1">всё</button></div></div><div id="fxcalc" class="fxcalc"></div>' + btn(fxDir === 'buy' ? 'Обменять рубли на доллары' : 'Обменять доллары на рубли', 'fxgo', 'id="fxgo"', false, 'wide primary');
    h += '<div class="box usdwhy"><h3>Зачем доллары</h3><ul class="plain"><li><b>Крупные дела</b> — поездки, переговоры и вход в капитал оплачиваются только долларами.</li><li><b>Статус и большие покупки</b> — тоже только за доллары.</li><li>Всё остальное (бойцы, стволы, точки, взятки) — сначала рублями, а когда рубли кончатся, долларами.</li><li>Доллары не дешевеют, а рубли тают вслед за курсом — копи в долларах.</li></ul></div>';
    h += '<p class="muted">Комиссия обменника ' + fee + '%' + (fee < 3 ? '' : ' — свои обменники на районах снижают её на 1% каждый') + '. Траты идут сначала из рублей. В августе 1998-го рубль рухнет почти втрое.</p>';
    return h;
  }

  // собственная недвижимость: все точки по районам и статусные покупки
  function estateInc() { let r = 0, u = 0; E.owned(S, me).forEach(i => S.d[i].b.forEach((b, x) => { const v = E.pointInc(me, b, i) * E.pointLvl(S.d[i], x); if (D.BUILDS[b].usd) u += v; else r += v; })); return [r, u]; }
  function paneEstate() {
    const own = E.owned(S, me).filter(i => S.d[i].b.length), [r, u] = estateInc();
    let h = '<p class="eyebrow">Бригада · сила</p><h2>Недвижимость</h2><p class="sub">Точки на твоих районах и большие покупки. Доход: ' + pairS(r, u) + ' в мес.</p>';
    if (!own.length) h += '<p class="muted">Своих точек пока нет. Открой свой район на карте и построй первую.</p>';
    own.forEach(i => {
      const d = S.d[i];
      h += '<div class="estd"><button class="link" data-a="goto" data-i="' + i + '"><b>' + esc(D.DISTRICTS[i].name) + '</b></button><span class="muted"> · ' + D.OKRUGS[D.DISTRICTS[i].ok].short + ' · ' + d.b.length + ' из ' + D.DISTRICTS[i].slots + '</span><ul class="plain">' +
        d.b.map((b, x) => { const B = D.BUILDS[b], lv = E.pointLvl(d, x); return '<li>' + B.name + ' <span class="lvb sm">' + ROMAN[lv] + '</span> · <span class="good">' + plus(E.pointInc(me, b, i) * lv, B.usd) + '</span></li>'; }).join('') + '</ul></div>';
    });
    const st = D.STATUS.filter(X => E.has(S, me, X.id));
    h += '<h3>Большие покупки</h3>' + (st.length ? '<ul class="plain">' + st.map(X => '<li><b>' + X.name + '</b> — ' + esc(X.perk) + '</li>').join('') + '</ul>' : '<p class="muted">Пока ничего. Особняк, яхта и прочее — во вкладке «Дела» → «Крупные дела» → «Статус и большие покупки».</p>');
    return h;
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
    const brk = p.broken || {}, nb = Object.keys(brk).reduce((a, k) => a + (brk[k] || 0), 0);
    let h = '<p class="eyebrow">Рядовые</p><h2>Гараж</h2><p class="sub">Мест ' + seats + ', на разборку едут до ' + (10 + seats) + ' бойцов, сила колёс +' + R(E.mobility(p)) + '</p>' + disc('car', 'от автосервисов: и на покупку, и на ремонт');
    h += '<p class="muted">Машины изнашиваются и ломаются: сломанная стоит в гараже и бойцов не возит. Почини или продай на запчасти. Советские ломаются чаще, иномарки поновее — реже, автосервисы на районах берегут парк.</p>';
    if (nb) h += '<p class="bad">Сломано машин: ' + nb + '.</p>';
    h += '<div class="shop">';
    // сначала то, что уже есть в гараже, потом доступное, потом будущие модели
    const keys = Object.keys(D.CARS).sort((a, b) => ((gar[b] || 0) + (brk[b] || 0) > 0) - ((gar[a] || 0) + (brk[a] || 0) > 0) || (y >= D.CARS[b].from) - (y >= D.CARS[a].from) || D.CARS[a].from - D.CARS[b].from);
    keys.forEach(k => {
      const Cr = D.CARS[k], lock = y < Cr.from ? 'появится в ' + Cr.from + ' году' : '', nw = gar[k] || 0, nbk = brk[k] || 0, rc = E.repairCost(S, me, k);
      h += '<div class="item' + (lock ? ' locked' : '') + '">' + A.car(k) + '<div class="ii"><b>' + Cr.name + '</b><small>' + Cr.alt + ' · мест ' + Cr.seats + ', боец на ней +' + Cr.q + (Cr.rep ? ' · авторитет +' + Cr.rep : '') + '</small><span>на ходу: ' + nw + (nbk ? ' · <em class="bad">сломано: ' + nbk + '</em>' : '') + '</span><i>' + (lock || esc(Cr.desc)) + '</i><div class="row">' + buy('car', k, 1, E.carCost(S, me, k), 'Купить', lock) + '</div>';
      if (nw || nbk) h += '<div class="row">' + (nbk ? '<button class="btn sm" data-a="repair" data-k="' + k + '"' + (p.money < rc ? ' disabled' : '') + '>Починить · ' + rc + ' тыс.</button><button class="btn sm ghost" data-a="sellcar" data-k="' + k + '" data-n="1">На запчасти · +' + E.carSale(k, true) + '</button>' : '<button class="btn sm ghost" data-a="sellcar" data-k="' + k + '" data-n="0">Продать · +' + E.carSale(k, false) + '</button>') + '</div>';
      h += '</div></div>';
    });
    return h + '</div>' + (E.carTalk(S, me) ? '<p class="good">Представительские машины в гараже: переговоры +' + E.carTalk(S, me) + '%.</p>' : '') + (E.armorK(p) < 1 ? '<p class="good">Бронированный гелик: глава и бригадиры гибнут и ранятся вдвое реже.</p>' : '');
  }

  // ---------- семья: схема бригады (главный экран) и досье ----------
  let focus = null; // focus: { id } — человек, { pos, ok } — пустая должность
  const DD = W90.DATA, POSTS = DD.POSTS;
  const myOkrugs = () => Object.keys(DD.OKRUGS).filter(ok => E.owned(S, me).some(i => DD.DISTRICTS[i].ok === ok));
  const okDistricts = ok => E.owned(S, me).filter(i => DD.DISTRICTS[i].ok === ok);
  // порядок людей как на схеме: ближний круг, бригадиры, резерв
  function chartOrder() {
    const cr = E.crew(S, me), out = [];
    INNER.forEach(pos => { const c = cr.find(x => x.pos === pos); if (c) out.push(c); });
    myOkrugs().forEach(ok => { const c = cr.find(x => x.pos === 'capo' && x.ok === ok); if (c) out.push(c); });
    watchers().forEach(c => out.push(c));
    cr.forEach(c => { if (!out.includes(c) && c.pos) out.push(c); });
    cr.forEach(c => { if (!c.pos) out.push(c); });
    return out;
  }
  const INNER = ['right', 'cons', 'treas', 'lawyer'];
  const mini = (l, v) => '<i>' + l + '</i><u><s style="width:' + v * 10 + '%"></s></u><b>' + v + '</b>';
  const statBar = (l, v) => '<span class="stat"><i>' + l + '</i><b>' + v + '</b><u><s style="width:' + v * 10 + '%"></s></u></span>';
  function postEffect(c) {
    if (c.st !== 'ok') return '<p class="bad">Вне строя. Должность не работает, пока он не вернётся.</p>';
    const t = { right: '+1 ход в месяц, нападения +' + c.str * 2 + '%', cons: 'Переговоры и стрелки +' + c.wit * 3 + '%, взятки наверх −' + c.wit * 3 + '%', treas: c.loy <= 3 ? 'Будет подворовывать: доход −5%. Верность низкая' : 'Доход +' + c.wit * 2 + '%', lawyer: 'Задержанных отпускают чаще на ' + c.wit * 3 + '%, сроки короче на ' + c.wit * 4 + '%, изъятия меньше на ' + c.wit * 5 + '%', capo: 'Оборона районов округа +' + c.str * 2 + ', дань +' + c.str * 5 + '%, нападения в округе +' + c.str * 3 + '%. Сам ставит смотрящих из резерва и строит точки в округе на половину дани' + (c.fund ? ' (накоплено ' + Math.round(c.fund) + ' тыс.)' : '') + (c.wit < 5 ? '. Умом не блещет: строит не самое выгодное' : ''), watch: 'Оборона района +' + c.str * 3 + ', дань +' + c.str * 3 + '%, доход точек +' + c.wit * 4 + '%' }[c.pos];
    if (c.pos === 'lawyer' && c.loy <= 3) return '<p class="bad">Сливает дела следствию: розыск +2 в месяц, защиты никакой. Верность низкая</p>';
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
    return '<dt>Смотрящий</dt><dd>' + (w ? '<button class="link" data-a="person" data-id="' + w.id + '">' + esc(E.cname(w)) + '</button>' + (w.st !== 'ok' ? ' <span class="bad">(' + (w.st === 'hurt' ? 'ранен' : 'сидит') + ')</span>' : '') : '<span class="muted">' + (E.crew(S, me).some(c => c.pos === 'capo' && c.ok === DD.DISTRICTS[i].ok) ? 'нет — бригадир округа поставит из резерва' : 'нет — смотрящих ставит бригадир округа, а его нет') + '</span>') + '</dd>';
  }
  function node(c, role, slot, extra) {
    const isSel = focus && (c ? focus.id === c.id : focus.id == null && focus.pos === slot.pos && (focus.ok || null) === (slot.ok || null));
    if (!c) return '<button class="node vacant' + (isSel ? ' sel' : '') + '" data-a="vacant" data-pos="' + slot.pos + '" data-ok="' + (slot.ok || '') + '"><span class="ava">' + A.vacantFace() + '</span><span class="nb"><span class="role">' + role + '</span><b>Вакантно</b>' + (extra || '') + '<small>' + (slot.dis ? 'нужно больше районов' : 'подобрать человека') + '</small></span></button>';
    const st = c.st === 'hurt' ? '<em class="badge">ранен</em>' : c.st === 'jail' ? '<em class="badge">сидит</em>' : '';
    return '<button class="node' + (c.st !== 'ok' ? ' out' : '') + (c.leg ? ' legend' : '') + (isSel ? ' sel' : '') + (moveId === c.id ? ' moving' : '') + '" draggable="true" data-a="person" data-id="' + c.id + '"><span class="ava">' + A.face(c) + '</span><span class="nb"><span class="role">' + role + (c.leg ? ' · легенда' : '') + '</span>' + st + '<b>«' + esc(c.nick) + '»</b><small>' + esc(c.name) + ', ' + c.age + '</small>' + (extra || '') + '<span class="mini">' + mini('Сила', c.str) + mini('Ум', c.wit) + mini('Верн.', c.loy) + '</span></span></button>';
  }
  // компактная карточка: ближний круг и бригадиры стоят в ряд
  let moveId = null; // кого переставляем по схеме
  function cnode(c, role, slot, extra) {
    const isSel = focus && (c ? focus.id === c.id : focus.id == null && focus.pos === slot.pos && (focus.ok || null) === (slot.ok || null));
    const ds = ' data-slot="' + slot.pos + '|' + (slot.ok || '') + '"' + (moveId != null && !(c && c.id === moveId) ? ' data-drop="1"' : '');
    if (!c) return '<button class="cnode vacant' + (isSel ? ' sel' : '') + (moveId != null ? ' drop' : '') + '"' + ds + ' data-a="vacant" data-pos="' + slot.pos + '" data-ok="' + (slot.ok || '') + '"><span class="ava">' + A.vacantFace() + '</span><span class="role">' + role + '</span><b>Вакантно</b>' + (extra || '') + '<small>' + (slot.dis ? 'нужно больше районов' : 'назначить') + '</small></button>';
    const st = c.st === 'hurt' ? '<em class="badge">ранен</em>' : c.st === 'jail' ? '<em class="badge">сидит</em>' : '';
    const n = (l, v, warn) => '<i>' + l + '</i><span class="' + (warn ? 'bad' : '') + '">' + v + '</span>';
    return '<button class="cnode' + (c.st !== 'ok' ? ' out' : '') + (c.leg ? ' legend' : '') + (isSel ? ' sel' : '') + (moveId != null ? (c.id === moveId ? ' moving' : ' drop') : '') + '"' + ds + ' draggable="true" data-a="person" data-id="' + c.id + '" title="' + esc(E.cname(c)) + '"><span class="ava">' + A.face(c) + '</span>' + st + '<span class="role">' + role + '</span><b>' + esc(c.nick) + '</b>' + (extra || '') + '<span class="cst">' + n('С', c.str) + n('У', c.wit) + n('В', c.loy, c.loy <= 3) + '</span></button>';
  }
  function renderOrg() {
    const p = P(), cr = E.crew(S, me), total = E.count(S, me), capos = cr.filter(x => x.pos === 'capo'), max = E.capoMax(S, me), bench = cr.filter(x => !x.pos);
    const on = v => focus && focus.view === v ? ' sel' : '';
    let h = '<div class="tier"><button class="node boss' + on('boss') + '" data-a="unit" data-u="boss"><span class="ava">' + A.bossFace(fd(me)) + '</span><span class="nb"><span class="role">Глава ОПГ «' + fd(me).name + '»</span><b>Ты</b><small class="bossdate">' + E.date(S.turn).label + (net ? ' · ' + esc(net.lobby.name) : '') + '</small><span class="bossline">районов ' + total + ' · бойцов ' + p.men + ' · авторитет ' + R(p.rep) + '</span></span></button></div>';
    // сразу под главой — сама бригада: рядовые бойцы, их стволы и тачки
    const cap = E.menCap(S, me), seats = E.seatsOf(p), unit = (v, ic, title, big, line, warn) => '<button class="unit' + on(v) + '" data-a="unit" data-u="' + v + '">' + A.icon(ic) + '<span class="nb"><span class="role">' + title + '</span><b>' + big + '</b><small class="' + (warn ? 'bad' : '') + '">' + line + '</small></span></button>';
    h += '<p class="tlabel">Бригада · сила ' + R(E.power(p)) + '</p><div class="tier units">' +
      unit('men', 'men', 'Бойцы · вербовка', p.men + ' из ' + cap, 'ждут ' + E.pool(S, me) + ' · по ' + E.recruitPrice(S) + ' тыс.') +
      unit('arms', 'gun', 'Арсенал', Math.min(p.men, p.guns) + ' со стволом', p.guns < p.men ? 'без ствола ' + (p.men - p.guns) : 'все вооружены', p.guns < p.men) +
      unit('cars', 'car', 'Гараж', 'мест ' + seats, 'на разборку до ' + (10 + seats) + ' бойцов') +
      (() => { const ow = E.owned(S, me), np = ow.reduce((a, i) => a + S.d[i].b.length, 0), q = estateInc(); return unit('estate', 'home', 'Недвижимость', np + ' ' + (np % 10 === 1 && np % 100 !== 11 ? 'точка' : [2, 3, 4].includes(np % 10) && ![12, 13, 14].includes(np % 100) ? 'точки' : 'точек'), np ? pairS(q[0], q[1]) + ' в мес.' : 'строй точки на районах'); })() + '</div>';
    h += '<p class="tlabel">Ближний круг</p><div class="tier ctier">' + INNER.map(pos => cnode(cr.find(x => x.pos === pos), POSTS[pos].name, { pos })).join('') + '</div>';
    h += '<p class="tlabel">Бригадиры · ' + capos.length + ' из ' + max + '</p><div class="tier ctier">' + myOkrugs().map(ok => {
      const n = okDistricts(ok).length, zv = '<span class="zv">' + n + ' ' + (n === 1 ? 'район' : n < 5 ? 'района' : 'районов') + ' · ~' + Math.round(p.men * n / Math.max(1, total)) + '</span>';
      return cnode(capos.find(x => x.ok === ok), DD.OKRUGS[ok].short, { pos: 'capo', ok, dis: capos.length >= max }, zv);
    }).join('') + '</div>';
    const ws = watchers();
    h += '<p class="tlabel">Смотрящие · ' + ws.length + ' из ' + total + ' районов</p><div class="tier">' + (ws.length ? ws.map(c => '<button class="wchip' + (c.st !== 'ok' ? ' out' : '') + (focus && focus.id === c.id ? ' sel' : '') + '" data-a="person" data-id="' + c.id + '"><span class="ava">' + A.face(c) + '</span><span><b>«' + esc(c.nick) + '»</b><small>' + esc(DD.DISTRICTS[E.watchDist(c)].name) + '</small></span></button>').join('') : '<p class="muted">Смотрящих нет. Их ставят бригадиры округов из резерва — назначь бригадира, и он сам расставит людей и начнёт строить точки.</p>') + '</div>';
    const pc = E.promoteCost(S), plock = p.promoTurn === S.turn ? 'раз в месяц' : p.men < 6 ? 'нужно 6 бойцов' : p.money < pc ? 'не хватает денег' : '';
    h += '<p class="tlabel">Резерв · ' + bench.length + '</p><div class="tier bench">' + (bench.length ? bench.map(c => node(c, 'Резерв')).join('') : '<p class="muted">Пусто. Каждый месяц из бригады может выделиться новый человек.</p>') + '</div>';
    h += '<div class="tier promo">' + btn('Выдвинуть бойца из рядовых · ' + pc + ' тыс.', 'promote', '', plock || false, 'ghost') + '</div>';
    const mv = moveId != null && cr.find(x => x.id === moveId);
    if (moveId != null && !mv) moveId = null;
    $('#org').innerHTML = (mv ? '<div class="movebar"><span>Куда поставить «' + esc(mv.nick) + '»? Нажми на должность на схеме.</span>' + btn('В резерв', 'movebench', '', !mv.pos, 'sm') + btn('Отмена', 'move0', '', false, 'sm ghost') + '</div>' : '') + '<div class="mquest">' + questCard() + '</div>' + h;
  }
  // «Путь наверх»: карточка задания от наставника над досье
  function questCard() {
    const q = E.questNow(S, me); if (!q) return '';
    const done = E.questDone(S, me, q), n = (P().quest || 0) + 1, m = R(q.$ * (1 + S.turn / 60));
    return '<div class="quest' + (done ? ' done' : '') + '"><div class="qhead"><span class="ava">' + A.legendFace('hasan') + '</span><div><p class="eyebrow">Путь наверх · ' + n + ' из ' + D.QUESTS.length + '</p><b>' + q.title + '</b><small>Дед Хасан объясняет</small></div></div><p>' + q.text + '</p><p class="qhow">' + (done ? '✓ Сделано. ' : 'Задание: ') + q.how + '</p><div class="row">' +
      (done ? '<button class="btn sm primary" data-a="quest">Забрать: +' + m + ' тыс., авторитет +' + q.rep + '</button>' : '<button class="btn sm" data-a="qgo" data-k="' + q.go + '">Показать, где</button>') + '<button class="btn sm ghost" data-a="qskip">Пропустить обучение</button></div></div>';
  }
  // расправа над своим: казнить или подбросить наркоту (без крови, уезжает на зону)
  let doom = null;
  function doomHTML(c) {
    const p = P(), fc = E.frameCost(S);
    if (doom && doom.id === c.id) {
      const txt = doom.kind === 'frame'
        ? 'Подбросить «' + esc(c.nick) + '» наркоту? Операм ' + fc + ' тыс. Он уедет на зону и в семью не вернётся.' + (c.loy <= 3 ? ' Он неверен и может догадаться: тогда заговорит, розыск +8.' : '')
        : 'Казнить «' + esc(c.nick) + '»? Авторитет +2, розыск +4. Часть семьи затаит обиду: верность −1 у каждого четвёртого.';
      return '<div class="box doom"><p>' + txt + '</p><div class="grid">' + btn(doom.kind === 'frame' ? 'Да, подбросить' : 'Да, казнить', 'doom1', '', false, 'danger') + btn('Отмена', 'doom0', '', false, 'ghost') + '</div></div>';
    }
    return '<h3>Расправа</h3><div class="row doomrow">' +
      btn('Казнить', 'doom', 'data-id="' + c.id + '" data-k="exec"', p.execTurn === S.turn ? 'в этом месяце уже казнили' : false, 'sm danger') +
      btn('Подбросить наркоту · ' + fc + ' тыс.', 'doom', 'data-id="' + c.id + '" data-k="frame"', p.frameTurn === S.turn ? 'раз в месяц' : p.money < fc ? 'не хватает денег' : false, 'sm') + '</div>';
  }
  const paneDossier = () => questCard() + dossierInner();
  function dossierInner() {
    const cr = E.crew(S, me);
    if (focus && focus.id != null && !cr.some(x => x.id === focus.id)) focus = null;
    if (focus && focus.view) return { boss: paneBoss, men: paneMen, arms: paneArms, cars: paneCars, estate: paneEstate }[focus.view]();
    if (!focus) return '<h2>Досье</h2><p class="muted">Выбери человека или пустую должность на схеме бригады.</p>' + deadList();
    if (focus.id != null) {
      const c = cr.find(x => x.id === focus.id), order = chartOrder(), k = order.indexOf(c);
      let h = '';
      if (order.length > 1) { const pv = order[(k - 1 + order.length) % order.length], nx = order[(k + 1) % order.length]; h += '<div class="pnav"><button class="btn sm" data-a="person" data-id="' + pv.id + '">← ' + esc(pv.nick) + '</button><span>' + (k + 1) + ' из ' + order.length + '</span><button class="btn sm" data-a="person" data-id="' + nx.id + '">' + esc(nx.nick) + ' →</button></div>'; }
      h += '<div class="dhero"><span class="ava big">' + A.face(c) + '</span><div><p class="eyebrow">' + (c.pos ? slotName(c.pos, c.ok) : 'Резерв') + (c.leg ? ' · легенда эпохи' : '') + '</p><h2>' + esc(E.cname(c)) + '</h2><p class="sub">' + c.age + ' лет · в семье с ' + E.date(c.since).label + (c.st === 'hurt' ? ' · ранен, встанет: ' + E.date(c.until + 1).label : c.st === 'jail' ? ' · сидит, выйдет: ' + E.date(c.until + 1).label : '') + '</p></div></div>';
      h += '<p class="lead2">' + esc(c.bio) + '.</p><div class="stats">' + statBar('Сила', c.str) + statBar('Ум', c.wit) + statBar('Верность', c.loy) + '</div>';
      if (c.loy <= 3) h += '<p class="bad">Ненадёжен: может сдать на допросе или уйти с общаком.</p>';
      if (c.pos === 'right' && c.loy <= 2 && c.str >= 7) h += '<p class="bad">Опасен: сильный и неверный — может устроить переворот и убить тебя на стрелке. Сними его или подними верность.</p>';
      if (c.pos === 'treas' && c.loy <= 2) h += '<p class="bad">Может исчезнуть со всей кассой. Держи казначеем верного.</p>';
      if (c.pos) h += '<h3>Что даёт</h3>' + postEffect(c) + '<button class="btn sm" data-a="unassign" data-id="' + c.id + '">Снять в резерв</button>';
      if (c.st === 'ok') {
        const same = s => c.pos === s[0] && (c.ok || null) === (s[1] || null);
        const opt = s => { const hold = cr.find(x => x.pos === s[0] && (x.ok || null) === (s[1] || null)); return '<option value="' + s[0] + '|' + (s[1] || '') + '">' + (s[0] === 'watch' ? DD.DISTRICTS[E.watchDist({ ok: s[1] })].name : slotName(s[0], s[1])) + (hold ? ' — сейчас «' + esc(hold.nick) + '»' : ' — свободно') + '</option>'; };
        const top = INNER.map(x => [x]).concat(myOkrugs().map(ok => ['capo', ok])).filter(s => !same(s));
        h += '<h3>Назначить</h3><select class="pick" data-a="reassign" data-id="' + c.id + '" aria-label="Назначить на должность"><option value="">Выбрать должность…</option><optgroup label="Ближний круг и бригадиры">' + top.map(opt).join('') + '</optgroup></select><p class="muted">Смотрящих на районы ставят бригадиры сами.</p>';
        h += '<button class="btn sm primary" data-a="move" data-id="' + c.id + '">Переставить на схеме</button> ';
        if (!c.pos) h += '<button class="btn sm ghost" data-a="dismiss" data-id="' + c.id + '">Вернуть в рядовые</button>';
        h += doomHTML(c);
      }
      const hist = S.log.filter(l => (!l.to || l.to === me) && l.s.indexOf('«' + c.nick + '»') >= 0).slice(0, 8);
      if (hist.length) h += '<h3>История</h3><ul class="log">' + hist.map(l => '<li class="' + l.k + '"><time>' + E.date(l.t).label + '</time>' + esc(l.s) + '</li>').join('') + '</ul>';
      return h;
    }
    // пустая должность: подбор из резерва
    const pos = focus.pos, ok = focus.ok || null, hold = cr.find(x => x.pos === pos && (x.ok || null) === ok);
    if (hold) { focus = { id: hold.id }; return dossierInner(); }
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
    return '<h3>Выбыли из семьи</h3><ul class="log">' + p.dead.map(d => '<li class="' + (d.gone ? '' : 'bad') + '"><time>' + E.date(d.t).label + '</time>' + esc(d.n) + (d.pos ? ', ' + POSTS[d.pos].name.toLowerCase() : '') + ': ' + esc(d.how) + '</li>').join('') + '</ul>';
  }

  // Власть: наверху люди во власти (слева человек, справа что он даёт), «занести» отдельной кнопкой, ниже ступени розыска
  function paneLaw() {
    const p = P(), L = E.lawLevel(p.heat), y = E.date(S.turn).year, bc = E.bribeCost(S, me);
    const blk = p.heat < 5 ? 'вопросов нет' : p.money < bc ? 'не хватает денег' : p.ap < 1 ? 'нет ходов' : '';
    let h = '<div class="lawhead"><div><h2>Власть</h2><p class="sub">Розыск ' + R(p.heat) + ' из 100 · ' + D.LAW[L].name + ' · связи ' + E.conn(S, me) + ' <button class="info" data-a="lawinfo" aria-label="Что бывает при розыске" title="Что бывает при розыске">i</button></p></div>';
    h += '<button class="bribe" data-a="bribe"' + (blk ? ' disabled' : '') + '>' + A.icon('money') + '<span><b>Занести наверх</b><small>' + bc + ' тыс. · розыск −12 · 1 ход</small>' + (blk ? '<i>' + blk + '</i>' : '') + '</span></button></div>';
    h += rulersHTML();
    if (E.lawK(S) > 1) h += '<p class="bad lawk">Новая власть взялась за криминал: розыск растёт на ' + R((E.lawK(S) - 1) * 100) + '% быстрее, облавы чаще, занести наверх дороже.</p>';
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
    h += '</ol><p class="muted">Задержанных сажают, убивают при задержании или отпускают. От этого зависит авторитет. Чем больше связей, тем чаще отпускают.</p><p class="muted">Сбить розыск: занести наверх, купить людей во власти, бордель или ритуальные услуги на районе.</p>' + (E.lawK(S) > 1 ? '<p class="bad">С 2000 года розыск растёт на ' + R((E.lawK(S) - 1) * 100) + '% быстрее, облавы чаще.</p>' : '') + '<p class="muted">При облаве с розыска 60 изымают часть чёрного нала. Белый нал на счетах не трогают.</p>';
    openModal(h + btn('Понятно', 'close', '', false, 'wide'), '', 'lawinfo');
  }

  let showDone = false;
  // «Дела»: переключатель мелкие / крупные, внутри — раскрывающиеся группы по географии
  let bigTab = 'small', bigOpen = { 'small:msk': 1 };
  function dgroup(key, title, sub, body, n) {
    const open = !!bigOpen[key];
    return '<div class="dacc' + (open ? ' open' : '') + '"><button class="dacch" data-a="dacc" data-k="' + key + '" aria-expanded="' + open + '"><b>' + title + '</b><span>' + sub + '</span>' + (n != null ? '<em>' + n + '</em>' : '') + '<i>' + (open ? '▾' : '▸') + '</i></button>' + (open ? '<div class="daccb">' + body + '</div>' : '') + '</div>';
  }
  function paneBig() {
    let h = '<h2>Дела</h2><div class="seg bigtabs">' + [['small', 'Мелкие дела'], ['big', 'Крупные дела']].map(t => '<button class="btn' + (bigTab === t[0] ? ' on' : '') + '" data-a="bigtab" data-k="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>';
    return h + (bigTab === 'small' ? bizSmall() : bizBig() + dgroup('big:status', 'Статус и большие покупки', 'разовые покупки с постоянным эффектом', statusHTML()));
  }
  // статус: большие разовые покупки для поздней игры
  function statusHTML() {
    let h = '<p class="sub">Разовые покупки с постоянным эффектом. Ходов не тратят.</p><div class="stgrid">';
    D.STATUS.forEach(X => {
      const own = E.has(S, me, X.id), l = own ? null : E.statusLock(S, me, X);
      h += '<div class="box stat' + (own ? ' own' : '') + '"><h3>' + X.name + '</h3><p class="muted">' + X.desc + '.</p><p class="good">' + X.perk + '.</p>' +
        (own ? '<p class="owned">✓ Твоё</p>' : btn('Купить · $' + X.cost + ' тыс.', 'status', 'data-k="' + X.id + '"', l || false, 'wide')) + '</div>';
    });
    return h + '</div>';
  }
  // Районы делятся на три группы: где есть место под стройку, где есть что улучшать и где всё прокачано
  function paneDist() {
    const own = E.owned(S, me);
    if (!own.length) return '<h2>Районы</h2><p class="muted">Районов нет.</p>';
    const oks = Object.keys(D.OKRUGS);
    own.sort((a, b) => oks.indexOf(D.DISTRICTS[a].ok) - oks.indexOf(D.DISTRICTS[b].ok) || D.DISTRICTS[a].name.localeCompare(D.DISTRICTS[b].name, 'ru'));
    const free = i => D.DISTRICTS[i].slots - S.d[i].b.length;
    const ups = i => S.d[i].b.map((b, x) => x).filter(x => E.pointLvl(S.d[i], x) < E.MAX_LVL);
    const build = own.filter(i => free(i) > 0), up = own.filter(i => !free(i) && ups(i).length), done = own.filter(i => !free(i) && !ups(i).length);
    let h = '<h2>Мои районы <span class="muted">' + own.length + ' из 102</span></h2><p class="sub">Нажми на район в списке или на карте, чтобы открыть его точки. Стройка и улучшения стоят только денег, ходы не тратят.</p>';
    h += distGroup('Есть свободные места', 'можно строить новые точки', build, i => 'свободно ' + free(i));
    h += distGroup('Можно улучшить', 'все места заняты, но не всё на III уровне', up, i => { const c = Math.min(...ups(i).map(x => E.upgradeCost(S, i, x))); return 'улучшить ' + ups(i).length + ' · от ' + c + ' тыс.'; });
    h += '<div class="dgroup done"><button class="dgh" data-a="dshow" aria-expanded="' + showDone + '"><h3>Прокачано полностью <span class="muted">' + done.length + ' · ' + pairS(...sumParts(done)) + ' в мес.</span></h3><i>' + (done.length ? (showDone ? 'скрыть' : 'показать') : '') + '</i></button>';
    if (!done.length) h += '<p class="muted">Пока ни одного: все точки района на III уровне — и он попадёт сюда.</p>';
    else if (showDone) h += '<div class="dlist">' + done.map(i => distRow(i, 'готово')).join('') + '</div>';
    return h + '</div>';
  }
  // доход района по валютам: [рубли, доллары] в тыс. $
  function distParts(i) {
    const d = S.d[i], dd = D.DISTRICTS[i]; let u = 0;
    d.b.forEach((b, x) => { if (D.BUILDS[b].usd) u += E.pointInc(me, b, i) * E.pointLvl(d, x); });
    return [distInc(i) - u, u];
  }
  const pairS = (r, u) => [r ? plus(r) : '', u ? plus(u, true) : ''].filter(Boolean).join(' и ') || '0';
  const sumParts = ids => ids.reduce((a, i) => { const q = distParts(i); return [a[0] + q[0], a[1] + q[1]]; }, [0, 0]);
  function distInc(i) {
    const d = S.d[i], dd = D.DISTRICTS[i];
    return dd.inc * (E.okrugsHeld(S, me).includes(dd.ok) ? 2 : 1) + d.b.reduce((s, b, x) => s + E.pointInc(me, b, i) * E.pointLvl(d, x), 0) + (d.ent ? dd.ent.inc : 0);
  }
  function distGroup(title, note, ids, tag) {
    let h = '<div class="dgroup"><h3>' + title + ' <span class="muted">' + ids.length + (ids.length ? ' · ' + pairS(...sumParts(ids)) + ' в мес.' : '') + '</span></h3>';
    if (!ids.length) return h + '<p class="muted">Таких районов нет.</p></div>';
    return h + '<p class="muted">' + note + '</p><div class="dlist">' + ids.map(i => distRow(i, tag(i))).join('') + '</div></div>';
  }
  function distRow(i, tag) {
    const d = S.d[i], dd = D.DISTRICTS[i], w = E.watcherOf(S, me, i, true);
    return '<div class="drow"><button class="dhead" data-a="goto" data-i="' + i + '"><b>' + esc(dd.name) + '</b><span>' + D.OKRUGS[dd.ok].short + ' · ' + E.traitNames(dd.t) + ' · точек ' + d.b.length + '/' + dd.slots + (dd.ent ? ' · ' + (d.ent ? 'предприятие взято' : 'предприятие не взято') : '') + (w ? ' · смотрит «' + esc(w.nick) + '»' : ' · без смотрящего') + '</span><em>' + pairS(...distParts(i)) + '</em><i>' + tag + '</i></button></div>';
  }
  const FXL = [['car', 'Тачки дешевле', '%'], ['gun', 'Стволы дешевле', '%'], ['upkeep', 'Содержание бойцов дешевле', '%'], ['med', 'Потери в бою меньше', '%'], ['talk', 'Переговоры и стрелки', '%', '+'], ['hide', 'При облавах берут меньше', '%'], ['wash', 'Чёрного дохода отмывается', '%'], ['kid', 'Похищения удачнее', '%', '+'], ['cool', 'Розыск в месяц', '', '−'], ['conn', 'Связи', '', '+'], ['cap', 'Бригада больше', ' чел.', '+']];
  // плюшки империи — строкой под меню: что дают все точки вместе
  function fxStrip() {
    const rows = FXL.map(f => [f, E.fx(S, me, f[0])]).filter(r => r[1]);
    const recr = E.inflow(S, me).rows.filter(r => r[0] === 'Спортзалы' || r[0] === 'Другие точки').reduce((a, r) => a + r[1], 0);
    if (recr) rows.push([['rec', 'Новобранцы', '/мес.', '+'], recr]);
    const chips = rows.map(r => { const cap = W90.DATA.FX_CAP[r[0][0]]; return '<span class="perk' + (cap && r[1] >= cap ? ' max' : '') + '" title="' + (cap && r[1] >= cap ? 'Потолок' : '') + '">' + r[0][1] + ' <b>' + (r[0][3] || '') + r[1] + r[0][2] + '</b></span>'; }).join('');
    return '<button class="slabel" data-a="perkstoggle" aria-expanded="' + perksOpen + '">Плюшки империи' + (rows.length ? ' · ' + rows.length : '') + '<i>' + (perksOpen ? '▴' : '▾') + '</i></button>' + (chips || '<span class="muted">пока нет: строй точки на районах</span>');
  }
  // кто сейчас президент и мэр: карточки с портретом на странице власти
  const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  function rulersHTML() {
    const dt = E.date(S.turn), now = dt.year * 12 + dt.month, who = list => list.filter(r => r.from[0] * 12 + r.from[1] <= now).pop();
    const card = (role, list) => {
      const r = who(list), first = list.find(x => x.name === r.name);
      return '<div class="ruler"><span class="ava">' + A.rulerFace(r, dt.year - r.born) + '</span><div><p class="eyebrow">' + role + '</p><b>' + r.name + (r.note ? ' <i>' + (r.legend ? '«' + r.note + '»' : r.note) + '</i>' : '') + '</b><small>у власти с ' + MON[first.from[1] - 1] + ' ' + first.from[0] + ' · ' + (dt.year - r.born) + ' лет</small><p>' + r.desc + '.</p></div></div>';
    };
    return '<div class="rulers">' + card('Президент России', D.RULERS.pres) + card('Мэр Москвы', D.RULERS.mayor) + '</div>';
  }
  function bizSmall() {
    const p = P(), own = E.owned(S, me), kc = own.length ? null : 'нет районов';
    let b = '<div class="projs">';
    b += '<div class="box proj"><div class="dpic">' + (A.deal('kidnap') || A.eventScene('street', 'kidnap')) + '<em>свои районы</em></div><h3>Похищение коммерсанта ' + kindTag('b') + '</h3><p>Выкуп 20–50 тыс. (растёт с годами) · шанс ' + E.kidnapOdds(S, me) + '% · розыск +7, при провале +11 и потери. Раз в месяц, 1 ход.</p>' +
      btn('Похитить коммерсанта', 'kidnap', '', kc || (p.kidnapTurn === S.turn ? 'раз в месяц' : p.men < 4 ? 'нужно 4 бойца' : p.ap < 1), 'wide primary') + '</div>';
    const ents = own.filter(i => D.DISTRICTS[i].ent && !S.d[i].ent);
    b += '<div class="box proj"><div class="dpic">' + (A.deal('raid') || A.eventScene('law', 'raid')) + '<em>предприятия</em></div><h3>Захват предприятий ' + kindTag('w') + '</h3>' + (ents.length ? '<p>На твоих районах можно забрать через суды и реестр:</p><ul class="plain">' + ents.map(i => '<li><button class="link" data-a="goto" data-i="' + i + '">' + esc(D.DISTRICTS[i].ent.name) + '</button> · ' + D.DISTRICTS[i].name + ' · ' + plus(D.DISTRICTS[i].ent.inc) + ' в мес.</li>').join('') + '</ul>' : '<p class="muted">На твоих районах нет незахваченных предприятий. Бери районы с ромбиком на карте.</p>') + '</div></div>';
    return '<p class="sub">Быстрые дела без поездок: один ход, результат сразу.</p>' + dgroup('small:msk', 'Москва', 'на своих районах', b, 2) +
      dgroup('small:rus', 'Россия и СНГ', 'скоро', '<p class="muted">Мелких дел за пределами Москвы пока нет — они появятся в следующих обновлениях.</p>', 0);
  }
  // крупные дела: бизнес в Москве и по России и СНГ (поездка к нужным людям может быть и за границу)
  const MSK_DEALS = ['pyramid', 'bank', 'media', 'mall', 'gsm', 'slots', 'club', 'tower'];
  function bizBig() {
    const u = E.usdOf(P());
    // одним списком: сначала то, что уже работает или доступно, потом остальное по году
    const rank = pr => { const ps = E.projStatus(S, me, pr), st = ps.st.stage || 0; return st === 3 ? 0 : st > 0 ? 1 : ps.lock ? 3 : 2; };
    const list = D.PROJECTS.slice().sort((a, b) => rank(a) - rank(b) || (a.from || 0) - (b.from || 0));
    return '<p class="sub">Три шага: поездка, переговоры, вход в капитал. Один шаг в месяц.</p><div class="box usdnote"><b>$ ' + u + ' тыс.</b><span>Крупные дела платятся только долларами: рубли за границей и у серьёзных людей не берут.</span>' + btn('В обменник', 'gofx', '', false, 'sm') + '</div>' +
      '<div class="projs">' + list.map(projHTML).join('') + '</div>';
  }
  function projHTML(pr) {
    const p = P(); let h = '';
    {
      const ps = E.projStatus(S, me, pr), stage = ps.st.stage || 0, pi = E.projIncome(S, me, pr);
      h += '<div class="box proj ' + (stage === 3 ? 'live' : '') + (ps.lock ? ' locked' : '') + '"><div class="dpic">' + A.deal(pr.id) + (stage === 3 ? '<em>в деле</em>' : '<em>' + esc(pr.where) + '</em>') + '</div><h3>' + pr.name + ' ' + kindTag(pr.kind) + '</h3>';
      h += '<p>' + (stage === 3 ? '<b class="good">' + plus(pi, true) + ' в мес.</b>' : 'Доход ' + money(pr.inc, true) + ' в мес.') + (pr.heat ? ' · розыск ' + sign(pr.heat) + ' в мес.' : '') + (pr.note ? ' · ' + pr.note : '') + '</p>';
      if (stage === 3) { if (pr.pyramid) h += btn('Соскочить и вывезти кассу · +' + pi * 2, 'cashout', '', p.ap < 1, 'wide'); }
      else {
        h += '<ol class="steps"><li class="' + (stage > 0 ? 'done' : 'cur') + '">Поездка: ' + pr.where + '</li><li class="' + (stage > 1 ? 'done' : stage === 1 ? 'cur' : '') + '">Переговоры: ' + pr.who + '</li><li class="' + (stage === 2 ? 'cur' : '') + '">' + pr.buyLabel + '</li></ol>';
        if (ps.lock) h += '<p class="muted">' + ps.lock + '</p>';
        else if (stage === 0) h += btn('Лететь в ' + pr.where + ' · $' + pr.trip + ' тыс.', 'proj', 'data-k="' + pr.id + '"', E.usdOf(p) < pr.trip ? 'нужны доллары: $' + pr.trip + ' тыс. — в обменник' : p.ap < 1, 'wide');
        else if (stage === 1) {
          const ch = E.negChances(S, me), gift = R(pr.buy * 0.2);
          h += '<div class="grid g3">' +
            '<button class="card" data-a="proj" data-k="' + pr.id + '" data-h="share"' + (p.ap < 1 ? ' disabled' : '') + '><b>Взять в долю</b><span>шанс ' + R(ch.share) + '%</span><small>доход −25%</small></button>' +
            '<button class="card" data-a="proj" data-k="' + pr.id + '" data-h="bribe"' + (p.ap < 1 || E.usdOf(p) < gift ? ' disabled' : '') + '><b>Занести</b><span>шанс ' + R(ch.bribe) + '%</span><small>$' + gift + ' тыс.</small></button>' +
            '<button class="card atk" data-a="proj" data-k="' + pr.id + '" data-h="force"' + (p.ap < 1 ? ' disabled' : '') + '><b>Надавить</b><span>шанс ' + R(ch.force) + '%</span><small>розыск +6</small></button></div>';
        } else h += btn(pr.buyLabel + ' · $' + pr.buy + ' тыс.', 'proj', 'data-k="' + pr.id + '"', E.usdOf(p) < pr.buy ? 'нужны доллары: $' + pr.buy + ' тыс. — в обменник' : p.ap < 1, 'wide');
      }
      h += '</div>';
    }
    return h;
  }

  // ---------- чат комнаты ----------
  const QUICK = ['Готов', 'Жди, думаю', 'Мир?', 'Забьём стрелку', 'Без обид'];
  const hhmm = t => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  function chatLogHTML() {
    const L = net.lobby, list = L.chat || [], my = L.me && L.me.cid;
    if (!list.length) return '<p class="muted">Тишина. Напиши первым.</p>';
    return list.map(m => { if (m.sys) return '<p class="sys">' + esc(m.x) + ' <time>' + hhmm(m.t) + '</time></p>'; const f = m.f && D.FACTIONS.find(x => x.id === m.f); return '<p class="' + (m.c === my ? 'me' : '') + '"><b' + (f ? ' style="color:' + f.color + '"' : '') + '>' + esc(m.n) + '</b>' + (f ? ' <small>' + f.name + '</small>' : '') + ' <time>' + hhmm(m.t) + '</time><br>' + esc(m.x) + '</p>'; }).join('');
  }
  function chatHTML() {
    if (!net || !net.lobby) return '';
    return '<div class="box chat"><h3>Чат комнаты</h3><div id="chatlog" class="chatlog">' + chatLogHTML() + '</div>' +
      '<div class="chatin"><input id="chatin" maxlength="300" placeholder="Сообщение" autocomplete="off" enterkeyhint="send"><button class="btn primary" data-a="say">Отправить</button></div>' +
      '<div class="quick">' + QUICK.map(q => '<button class="btn sm ghost" data-a="sayq" data-k="' + esc(q) + '">' + q + '</button>').join('') + '</div></div>';
  }
  const chatBottom = () => { const lg = $('#chatlog'); if (lg) lg.scrollTop = lg.scrollHeight; };
  const typing = () => document.activeElement && document.activeElement.id === 'chatin';
  // пока человек печатает, панель не перерисовывается целиком, иначе слетит фокус и клавиатура на телефоне
  function chatOnly() { const lg = $('#chatlog'); if (!lg || !typing()) return false; lg.innerHTML = chatLogHTML(); chatBottom(); return true; }
  function chatSeen() { if (!net || !net.lobby) return; const l = net.lobby.chat || []; net.seenT = l.length ? l[l.length - 1].t : 0; net.unread = 0; }
  // новые сообщения от других: счётчик на вкладке и всплывашка, если чат сейчас не на экране
  function chatNews(prev) {
    const L = net.lobby, list = L.chat || [], my = L.me && L.me.cid;
    if (net.seenT == null) { chatSeen(); return; } // история при входе непрочитанной не считается
    const alerts = list.filter(m => m.t > (prev || 0) && m.sys && m.alert);
    if (alerts.length) { const a = alerts[alerts.length - 1]; toast(a.x + ' · открыть', false, 6500); chatToast = true; if (!(S && section === 'log')) net.unread = (net.unread || 0) + alerts.length; haptic('heavy'); if (G.Sfx) G.Sfx.play('event'); }
    const fresh = list.filter(m => m.t > (prev || 0) && m.c !== my && !m.sys);
    const shown = (!S && modalKey === 'lobby') || (S && section === 'log');
    if (shown) { chatSeen(); return; }
    if (!fresh.length) return;
    net.unread = (net.unread || 0) + fresh.length;
    const m = fresh[fresh.length - 1]; toast('💬 ' + m.n + ': ' + m.x.slice(0, 80) + ' · открыть'); chatToast = true; haptic('light'); if (G.Sfx) G.Sfx.play('msg');
  }
  function say(text) {
    text = String(text || '').trim(); if (!text || !net) return;
    netCall('say', { text }).then(r => { if (r.ok) { const i = $('#chatin'); if (i && i.value.trim() === text) i.value = ''; } });
  }

  // ---------- сделки между живыми игроками ----------
  let dealWith = null, dealKind = 'truce', offersSeen = {};
  const DEAL_KINDS = [['truce', 'Мир'], ['pay', 'Отдать деньги'], ['ask', 'Попросить денег'], ['sell', 'Продать район'], ['buy', 'Купить район']];
  const dealDistricts = (kind, other) => kind === 'sell'
    ? E.owned(S, me).filter(i => !E.isHome(S, me, i) && E.attackable(S, other, i))
    : E.owned(S, other).filter(i => !E.isHome(S, other, i) && E.attackable(S, me, i));
  function offersHTML() {
    const mine = (S.offers || []).filter(o => o.from === me);
    if (!net || !mine.length) return '';
    return '<div class="box"><h3>Твои предложения</h3>' + mine.map(o => '<div class="row offrow"><span>' + who(o.to) + ': ' + esc(E.offerText(o)) + '</span>' + btn('Отозвать', 'ocancel', 'data-k="' + o.id + '"', false, 'sm ghost') + '</div>').join('') + '<p class="muted">Предложения сгорают в конце месяца.</p></div>';
  }
  function showDeal() {
    const x = S.f[dealWith]; if (!x || !x.alive || x.over) { dealWith = null; closeModal(); return; }
    const key = 'deal:' + dealWith + ':' + dealKind + ':' + S.turn + ':' + (S.offers || []).length; if (modalKey === key) return;
    const f = fd(dealWith), p = P();
    let h = '<div class="dhero"><span class="ava big">' + A.bossFace(f) + '</span><div><p class="eyebrow">Сделка с живым игроком</p><h2>' + esc(f.name) + '</h2><p class="sub">' + esc(x.nick || 'игрок') + (x.auto ? ' · сейчас за него бот, ответит, когда вернётся' : '') + '</p></div></div>';
    if (E.inTruce(S, me, dealWith)) h += '<p class="good">Мир до ' + E.date(p.truce[dealWith]).label + '.</p>';
    h += '<div class="seg dkinds">' + DEAL_KINDS.map(k => '<button class="' + (k[0] === dealKind ? 'on' : '') + '" data-a="dkind" data-k="' + k[0] + '">' + k[1] + '</button>').join('') + '</div>';
    if (dealKind === 'truce') h += '<label class="field"><span>Срок мира</span><select id="dx">' + [3, 6, 12, 24].map(m => '<option value="' + m + '"' + (m === 12 ? ' selected' : '') + '>' + m + ' мес.</option>').join('') + '</select></label><p class="muted">Пока действует мир, вы не можете нападать на районы друг друга.</p>';
    else if (dealKind === 'pay' || dealKind === 'ask') h += '<label class="field"><span>Сумма, тыс. $' + (dealKind === 'pay' ? ' (у тебя ' + R(p.money) + ')' : '') + '</span><input id="dx" type="number" inputmode="numeric" min="1" value="50"></label>';
    else {
      const ds = dealDistricts(dealKind, dealWith);
      if (!ds.length) h += '<p class="muted">' + (dealKind === 'sell' ? 'Нет районов на продажу: продать можно не родной район, который граничит с их землёй.' : 'Купить нечего: можно только их не родной район рядом с твоими.') + '</p>';
      else h += '<label class="field"><span>Район</span><select id="di">' + ds.map(i => '<option value="' + i + '">' + D.DISTRICTS[i].name + ' · ' + D.OKRUGS[D.DISTRICTS[i].ok].short + ' · точек ' + S.d[i].b.length + '</option>').join('') + '</select></label><label class="field"><span>Цена, тыс. $</span><input id="dx" type="number" inputmode="numeric" min="1" value="100"></label>';
    }
    h += '<div class="grid">' + btn('Предложить', 'dsend', '', dealKind !== 'truce' && dealKind !== 'pay' && dealKind !== 'ask' && !dealDistricts(dealKind, dealWith).length, 'primary') + btn('Закрыть', 'dclose', '', false, 'ghost') + '</div>';
    h += '<p class="muted">Игрок увидит предложение и решит сам. Ходов не тратит.</p>';
    openModal(h, '', key);
  }
  const incoming = () => (S.offers || []).find(o => o.to === me);
  function showOffer() {
    const o = incoming(); if (!o) return;
    const key = 'offer:' + o.id; if (modalKey === key) return;
    if (!offersSeen[o.id]) { offersSeen[o.id] = 1; haptic('medium'); if (G.Sfx) G.Sfx.play('msg'); }
    const f = fd(o.from), x = S.f[o.from];
    let h = '<div class="dhero"><span class="ava big">' + A.bossFace(f) + '</span><div><p class="eyebrow">Предложение</p><h2>' + esc(f.name) + '</h2><p class="sub">' + esc(x.nick || 'игрок') + '</p></div></div>';
    h += '<p class="lead2">' + esc(f.boss) + ' ' + esc(E.offerText(o)) + '.</p>';
    if (o.kind === 'sell') h += '<p class="muted">Ты платишь ' + o.x + ' тыс. и получаешь ' + D.DISTRICTS[o.i].name + '.</p>';
    if (o.kind === 'buy') h += '<p class="muted">Ты получаешь ' + o.x + ' тыс. и отдаёшь ' + D.DISTRICTS[o.i].name + '.</p>';
    if (o.kind === 'ask') h += '<p class="muted">У тебя ' + R(P().money) + ' тыс.</p>';
    if (o.kind === 'truce') h += '<p class="muted">Ни ты, ни они не сможете нападать друг на друга до ' + E.date(S.turn + o.x).label + '.</p>';
    h += '<div class="grid">' + btn('Принять', 'oyes', 'data-k="' + o.id + '"', false, 'primary') + btn('Отказаться', 'ono', 'data-k="' + o.id + '"', false, 'ghost') + '</div>';
    openModal(h, '', key);
  }

  // ---------- таймер хода в онлайне ----------
  const mmss = ms => { const t = Math.ceil(ms / 1000); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  function tickTimer() {
    const els = document.querySelectorAll('.tmr'); if (!els.length) return;
    const left = net && net.endAt ? net.endAt - Date.now() : null;
    els.forEach(el => { el.hidden = left == null; if (left == null) return; el.textContent = '⏱ ' + mmss(Math.max(0, left)); el.classList.toggle('bad', left < 30e3); });
  }
  setInterval(tickTimer, 1000);

  function paneClans() {
    const p = P();
    let h = '<h2>Группировки</h2><p class="sub">Сложность: ' + E.dif(S).name.toLowerCase() + '. Первые ' + E.dif(S).grace + ' месяцев боты не нападают на живых игроков. Родной район держится в ' + E.dif(S).home + ' раза крепче.</p>' + offersHTML() + '<table class="tbl clans"><tr><th>Бригада</th><th>Районы</th><th>Сила</th><th></th></tr>';
    D.FACTIONS.filter(f => !S.f[f.id].absent).sort((a, b) => E.count(S, b.id) - E.count(S, a.id)).forEach(f => {
      const x = S.f[f.id], mine = f.id === me;
      h += '<tr class="' + (x.alive ? '' : 'dead') + '"><td><span class="ava xs">' + A.bossFace(f) + '</span><i class="dot" style="background:' + f.color + '"></i>' + f.name + (mine ? ' (ты)' : x.human ? ' · ' + esc(x.nick || 'игрок') : '') + (!mine && !x.human && x.alive ? '<br><small class="' + relCls(E.rel(S, me, f.id)) + '">' + relName(E.rel(S, me, f.id)) + (E.inTruce(S, me, f.id) ? ' · мир до ' + E.date(p.truce[f.id]).label : '') + '</small>' : '') + '</td><td>' + E.count(S, f.id) + '</td><td>' + (x.alive ? R(E.power(x)) : '—') + '</td><td>';
      if (!mine && x.alive) {
        if (x.human) h += '<span class="' + (x.auto ? 'bad' : x.ready ? 'good' : 'muted') + '">' + (x.auto ? 'ведёт бот' : x.ready ? 'готов' : 'ходит') + '</span>' + (E.inTruce(S, me, f.id) ? '<br><small class="good">мир до ' + E.date(p.truce[f.id]).label + '</small>' : '') + (net && !x.over ? ' ' + btn('Сделка', 'deal', 'data-k="' + f.id + '"', false, 'sm') : '');
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

  // запись партии в файл: помесячная статистика, решения в событиях, хроника и полное состояние
  function exportGame() {
    const p = P(), data = { game: 'Передел', format: 1, exported: new Date().toISOString(), online: !!net, faction: me, name: fd(me).name, difficulty: E.dif(S).name, date: E.date(S.turn).label, turn: S.turn, over: p.over || null,
      hist: p.hist || [], log: S.log.filter(l => !l.to || l.to === me), state: S };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const dt = E.date(S.turn); a.download = 'peredel-' + me + '-' + dt.year + '-' + String(dt.month).padStart(2, '0') + '.json';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    toast('Запись партии сохранена: ' + a.download);
  }
  function paneLog() {
    let h = (net ? '<div class="chatpage">' + chatHTML() + '</div>' : '') + '<h2>Хроника</h2>' + cloudHTML() + '<div class="box">' + achHTML() + '</div><div class="box rec"><p>Запись партии: что было каждый месяц, какие решения ты принимал. Пришли файл разработчику — по нему настроят баланс.</p>' + btn('Скачать запись партии', 'export', '', false, 'wide') + '</div><ul class="log">' + S.log.filter(l => !l.to || l.to === me).slice(0, 60).map(l => '<li class="' + l.k + '"><time>' + E.date(l.t).label + '</time>' + esc(l.s) + '</li>').join('') + '</ul>';
    if (net) return h + btn('Выйти в меню', 'menu', '', false, 'wide ghost') + '<p class="muted">Комната останется, вернуться можно с этого же устройства.</p>';
    h += confirmNew ? '<div class="box"><p>Начать заново? Текущая партия пропадёт.</p><div class="grid"><button class="btn" data-a="new2">Да, заново</button><button class="btn" data-a="new0">Отмена</button></div></div>' : btn('Новая игра', 'new1', '', false, 'wide ghost');
    return h;
  }

  function render() {
    if (!S) return;
    setTimeout(fxCalc, 0);
    renderTop(); const sb = $('#specbar'); if (sb) { sb.innerHTML = specHTML(); sb.hidden = !sb.innerHTML; } paintMap(); achSync(); tgSync(); mapTip();
    // меню разделов под шапкой; у «Банды» и «Районов» справа панель, остальные разделы во всю ширину
    if (net && section === 'log') chatSeen();
    const un = v => v === 'log' && net && net.unread ? '<i class="unread" title="Непрочитанных: ' + net.unread + '" aria-label="Непрочитанных сообщений: ' + net.unread + '">!</i>' : '';
    const vname = v => net && v[0] === 'log' ? 'Чат' : v[1], tab = v => net && v === 'log' ? ['chat', 'Чат'] : TABS[v];
    $('#menu').innerHTML = VIEWS.map(v => '<button class="' + (v[0] === section ? 'on' : '') + '" data-view="' + v[0] + '">' + vname(v) + un(v[0]) + '</button>').join('');
    $('#tabbar').innerHTML = VIEWS.filter(v => v[0] !== 'log' || net).map(v => '<button class="' + (v[0] === section ? 'on' : '') + '" data-view="' + v[0] + '"' + (v[0] === section ? ' aria-current="page"' : '') + '>' + A.icon(tab(v[0])[0]) + '<span>' + tab(v[0])[1] + '</span>' + un(v[0]) + '</button>').join('');
    if (section !== 'gang' && section !== 'map') sheet = false;
    $('#main').classList.toggle('msheet', sheet);
    $('#sheettitle').textContent = section === 'map' ? (sel == null ? 'Мои районы' : D.DISTRICTS[sel].name) : focus && focus.view ? { boss: 'Общак', men: 'Бойцы', arms: 'Арсенал', cars: 'Гараж', estate: 'Недвижимость' }[focus.view] : 'Досье';
    $('#strip').classList.toggle('open', perksOpen);
    const split = section === 'gang' || section === 'map';
    $('#main').classList.toggle('wide', !split); $('#side').hidden = !split;
    $('#org').hidden = section !== 'gang'; $('#mapview').hidden = section !== 'map'; $('#page').hidden = split;
    if (section === 'gang') renderOrg();
    const host = split ? $('#pane') : $('#page'), pk = section + ':' + (section === 'map' ? sel : section === 'gang' ? JSON.stringify(focus) : ''), keep = host.dataset.key === pk ? host.scrollTop : 0;
    const fn = { gang: paneDossier, cash: () => tipHTML('cash') + paneBoss(), map: paneDistrict, big: paneBig, law: paneLaw, clans: paneClans, fx: paneFx, log: paneLog }[section];
    if (!(section === 'log' && chatOnly())) {
      host.innerHTML = split ? fn() : '<div class="inner' + (section === 'big' ? ' wide' : '') + '">' + fn() + '</div>';
      host.dataset.key = pk; host.scrollTop = keep; chatBottom();
    }
    if (P().over && (!spectating || S.done || overPeek)) showOver(); else if (P().over) { if (/^(over|heat):/.test(modalKey)) closeModal(); } else if (P().battle) showBattle(); else if ((P().assaults || []).length) showAssault(); else if (P().event) showEvent(); else if (heatWarn()) showHeat(); else if (net && incoming()) showOffer(); else if (dealWith) showDeal(); else if (parleyWith) showParley(); else if (/^(offer|deal):/.test(modalKey)) closeModal();
  }

  // ---------- действия ----------
  let toastT = 0;
  let chatToast = false;
  function toast(msg, bad, ms) { chatToast = false; const t = $('#toast'); t.textContent = msg; t.className = bad ? 'bad' : ''; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms || 3200); }
  function done(r) {
    if (!r) return;
    const msg = r.msg || r.err;
    if (r.event && r.ok) { save(); showResult(r); return; }
    if (r.battleEnd && r.ok) { if (G.Sfx) G.Sfx.play(r.win ? 'cash' : 'shot'); save(); showBattleEnd(r); if (!net) render(); return; }
    if (r.ok && (r.battle || r.round)) { haptic('heavy'); if (G.Sfx) G.Sfx.play('shot'); if (!net) { save(); render(); } return; }
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

  $('#toast').addEventListener('click', () => { if (!chatToast || !S) return; $('#toast').hidden = true; section = 'log'; sheet = false; closeModalIfFree(); render(); $('#page').scrollTop = 0; });
  // окно не закрываем, если в нём событие, бой или ответ на сделку
  function closeModalIfFree() { if (/^(parley|deal:)/.test(modalKey)) { parleyWith = null; dealWith = null; closeModal(); } }
  document.addEventListener('keydown', e => { if (e.target && e.target.id === 'chatin' && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); say(e.target.value); e.target.blur(); } });
  document.addEventListener('click', e => {
    const vb = e.target.closest('#menu [data-view], #tabbar [data-view]'); if (vb) { if (!S) return; section = vb.dataset.view; confirmNew = false; sheet = false; render(); if (section === 'map') applyView(); $('#page').scrollTop = 0; return; }
    const go = e.target.closest('#stats [data-go]'); if (go) { if (!S) return; const g = go.dataset.go.split(':'); section = g[0]; if (g[1]) { focus = { view: g[1] }; sheet = true; } else sheet = false; confirmNew = false; render(); return; }
    const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
    const a = b.dataset.a, k = b.dataset.k;
    // меню и лобби
    if (a === 'start') { S = E.newGame(k, (Math.random() * 2e9) | 0, null, null, diff, scen); achShown = null; me = k; net = null; sel = D.DISTRICTS.find(d => d.name === fd(k).home).id; section = 'gang'; focus = { pos: 'right' }; view = FULL.slice(); applyView(); save(); closeModal(); render(); return; }
    if (a === 'continue') { const sv = load(); if (sv) { S = sv; me = S.humans[0]; net = null; achShown = null; closeModal(); render(); } return; }
    if (a === 'menu') { leaveToMenu(); return; }
    if (a === 'create') { const nick = nickValue(); Net.post('create', { name: $('#roomname').value, nick, diff, scen }).then(r => r.room ? enterRoom(r.room, r.token) : toast(r.err, true)); return; }
    if (a === 'join') { Net.post('join', { room: k, nick: nickValue(), token: (Net.recall() || {})[k] }).then(r => r.room ? enterRoom(r.room, r.token) : toast(r.err, true)); return; }
    if (a === 'refresh') { showStart(); return; }
    if (a === 'scen') { scen = k; try { localStorage.setItem('war90.scen', k); } catch (er) { /* ignore */ } document.querySelectorAll('[data-a=scen]').forEach(x => { x.classList.toggle('on', x.dataset.k === k); x.setAttribute('aria-pressed', x.dataset.k === k); }); $('#scennote').textContent = D.SCENARIOS[k].desc; return; }
    if (a === 'records') { showRecords(); return; }
    if (a === 'mclose') { dismissModal(); return; }
    if (a === 'cloudsave') { cloudPush(true); return; }
    if (a === 'cloudload') { Net.post('cload', { code: ($('#cloudcode') || {}).value || '' }).then(r => { if (!r.ok) { toast(r.err || 'Сервер недоступен', true); return; } S = E.migrate(r.state); me = S.humans[0]; net = null; achShown = null; try { localStorage.setItem(CLOUD, r.code); } catch (er) { /* ignore */ } cloudTurn = S.turn; save(); closeModal(); render(); toast('Партия загружена: ' + fd(me).name + ', ' + E.date(S.turn).label); }); return; }
    if (a === 'install') { if (installEv) { installEv.prompt(); installEv.userChoice.finally(() => { installEv = null; const bx = $('#installbox'); if (bx) bx.hidden = true; }); } return; }
    if (a === 'menu0') { showStart(); return; }
    if (a === 'sendscore') { const nk = ($('#scorenick') || {}).value || ''; const o = P().over; try { localStorage.setItem('war90.nick', nk.trim()); } catch (er) { /* ignore */ } Net.post('score', { nick: nk, fid: me, title: o.title, score: o.score || E.scoreOf(S, me), date: E.date(S.turn).label, scen: S.scen || 's91', diff: S.diff }).then(r => { if (r.ok) { P().scoreSent = true; save(); toast('Ты в таблице рекордов: ' + r.place + '-е место'); const box = $('#scorebox'); if (box) box.innerHTML = '<p class="good">Записано: ' + r.place + '-е место в зале славы.</p>'; } else toast(r.err || 'Не вышло', true); }); return; }
    if (a === 'diff') { diff = k; try { localStorage.setItem('war90.diff', k); } catch (er) { /* ignore */ } document.querySelectorAll('[data-a=diff]').forEach(x => { x.classList.toggle('on', x.dataset.k === k); x.setAttribute('aria-pressed', x.dataset.k === k); }); $('#diffnote').textContent = DIFF_NOTE[k]; return; }
    if (a === 'tipok') { const m = tipsSeen(); m[k] = 1; try { localStorage.setItem(TIP_KEY, JSON.stringify(m)); } catch (er) { /* ignore */ } delete tipOpen[k]; render(); return; }
    if (a === 'tip') { tipOpen[k] = 1; if (k === 'map') { section = 'map'; sheet = false; } render(); if (k !== 'map') { const h = $(sheet ? '#pane' : '#page'); if (h) h.scrollTop = 0; const pn = $('#pane'); if (pn) pn.scrollTop = 0; } return; }
    if (a === 'pick') { netCall('pick', { fid: k || null }); return; }
    if (a === 'say') { const i = $('#chatin'); say(i && i.value); if (i) i.blur(); return; }
    if (a === 'sayq') { say(k); return; }
    if (a === 'slot') { netCall('slot', { fid: k, mode: b.dataset.m }); return; }
    if (a === 'go') { netCall('start'); return; }
    if (a === 'leave') { netCall('leave').then(r => { if (r.ok) { forget(net.room); leaveToMenu(); } }); return; }
    if (a === 'export') { if (S) exportGame(); return; }
    if (a === 'copyphone') { (navigator.clipboard ? navigator.clipboard.writeText(DONATE) : Promise.reject()).then(() => toast('Номер скопирован. Спасибо!'), () => toast(DONATE_SHOW)); return; }
    if (a === 'tgshare') { const link = 'https://t.me/' + TG_BOT + '?startapp=room-' + net.room; TG.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent('Заходи в «Передел»: комната «' + net.lobby.name + '»')); return; }
    if (a === 'copy') { const t = TG ? 'https://t.me/' + TG_BOT + '?startapp=room-' + net.room : location.origin + location.pathname + '#room-' + net.room; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Ссылка скопирована'), () => toast(t)); return; }
    if (!S) return;
    const di = b.dataset.i != null ? +b.dataset.i : sel;
    if (a === 'attack') act('attack', [sel, +b.dataset.l]);
    else if (a === 'build') act('build', [di, k]);
    else if (a === 'upgrade') act('upgrade', [di, +b.dataset.x]);
    else if (a === 'dshow') { showDone = !showDone; render(); }
    else if (a === 'dlist') { sel = null; section = 'map'; sheet = true; render(); }
    else if (a === 'sheetclose') { sheet = false; render(); }
    else if (a === 'perkstoggle') { perksOpen = !perksOpen; render(); }
    else if (a === 'unit') { focus = { view: b.dataset.u }; section = 'gang'; sheet = true; render(); }
    else if (a === 'kidnap') act('kidnap', [null]);
    else if (a === 'raid') act('raid', [di]);
    else if (a === 'unassign') act('unassign', [+b.dataset.id]);
    else if (a === 'dismiss') act('dismiss', [+b.dataset.id]);
    else if (a === 'move') { moveId = +b.dataset.id; section = 'gang'; sheet = false; render(); setTimeout(() => { const t = document.querySelector('#org .ctier'); if (t) t.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 60); }
    else if (a === 'move0') { moveId = null; render(); }
    else if (a === 'movebench') { const id = moveId; moveId = null; act('unassign', [id]); }
    else if (a === 'heatok') { heatSeen = S.turn; closeModal(); render(); }
    else if (a === 'heatgo') { heatSeen = S.turn; closeModal(); section = 'law'; sheet = false; render(); }
    else if (a === 'spectate') { spectating = true; overPeek = false; closeModal(); section = 'map'; sel = null; sheet = false; render(); }
    else if (a === 'specover') { overPeek = true; render(); }
    else if (a === 'doom') { doom = { id: +b.dataset.id, kind: k }; render(); }
    else if (a === 'doom0') { doom = null; render(); }
    else if (a === 'doom1') { const d = doom; doom = null; act(d.kind === 'frame' ? 'frame' : 'execute', [d.id]); }
    else if (a === 'deal') { dealWith = k; dealKind = 'truce'; showDeal(); }
    else if (a === 'dkind') { dealKind = k; showDeal(); }
    else if (a === 'dclose') { dealWith = null; closeModal(); render(); }
    else if (a === 'dsend') { const x = +(($('#dx') || {}).value || 0), i = $('#di') ? +$('#di').value : null; const to = dealWith; dealWith = null; closeModal(); act('offer', [to, dealKind, x, i]); }
    else if (a === 'oyes' || a === 'ono') { closeModal(); act('answer', [+k, a === 'oyes' ? 1 : 0]); }
    else if (a === 'ocancel') act('answer', [+k, 0]);
    else if (a === 'tmr') netCall('timer', { min: +k });
    else if (a === 'recruit') act('recruit', [+b.dataset.n || 1]);
    else if (a === 'guns') act('buyGuns', [k || 'pm', +b.dataset.n || 5]);
    else if (a === 'vests') act('buyVests', [+b.dataset.n || 5]);
    else if (a === 'car') act('buyCar', [k || 'nine']);
    else if (a === 'repair') act('repairCar', [k]);
    else if (a === 'quest') act('quest', [0]);
    else if (a === 'status') act('buyStatus', [k]);
    else if (a === 'usd') act('setUsd', [+k]);
    else if (a === 'fxdir') { fxDir = k; render(); fxCalc(); }
    else if (a === 'fxset') { const r = $('#fxr'); if (r) { r.value = Math.round(+r.max * +k); fxCalc(); } }
    else if (a === 'fxgo') { const r = $('#fxr'); if (r && +r.value > 0) act('exchange', [fxDir, +r.value]); }
    else if (a === 'golog') { section = 'log'; sheet = false; render(); $('#page').scrollTop = 0; }
    else if (a === 'bigtab') { bigTab = k; render(); $('#page').scrollTop = 0; }
    else if (a === 'dacc') { if (bigOpen[k]) delete bigOpen[k]; else bigOpen[k] = 1; render(); }
    else if (a === 'gofx') { section = 'fx'; sheet = false; render(); }
    else if (a === 'retire1') { confirmRetire = true; render(); }
    else if (a === 'retire0') { confirmRetire = false; render(); }
    else if (a === 'retire2') { confirmRetire = false; act('retire', []); }
    else if (a === 'qskip') act('quest', [1]);
    else if (a === 'qgo') { const g = k.split(':'); if (g[0] === 'vacant') { focus = { pos: g[1], ok: g[1] === 'capo' ? myOkrugs()[0] || null : null }; section = 'gang'; sheet = true; } else if (g[0] === 'unit') { focus = { view: g[1] }; section = 'gang'; sheet = true; } else { section = g[1]; sheet = false; if (g[1] === 'map') sel = null; } render(); if (section === 'map') applyView(); }
    else if (a === 'sellcar') act('sellCar', [k, b.dataset.n === '1' ? 1 : 0]);
    else if (a === 'hire') act('hire', [k]);
    else if (a === 'bribe') act('bribe', []);
    else if (a === 'lawinfo') showLawInfo();
    else if (a === 'truce') act('truce', [k]);
    else if (a === 'parley') { parleyWith = k; showParley(); }
    else if (a === 'talk') act('parley', [parleyWith, k, b.dataset.i != null ? +b.dataset.i : null]);
    else if (a === 'pclose') { parleyWith = null; closeModal(); render(); }
    else if (a === 'tac') act('battle', [k]);
    else if (a === 'defend') act('defend', [+k, b.dataset.h]);
    else if (a === 'promote') act('promote', []);
    else if (a === 'proj') act('projStep', [k, b.dataset.h || null]);
    else if (a === 'cashout') act('cashOut', []);
    else if (a === 'opt') act('choose', [+k]);
    else if (a === 'force') netCall('force');
    else if (a === 'goto') { sel = +b.dataset.i; section = 'map'; sheet = true; showOnMap(sel); render(); }
    else if (moveId != null && b.dataset.drop) { const sl = b.dataset.slot.split('|'), id = moveId; moveId = null; act('assign', [id, sl[0], sl[1] || null]); }
    else if (a === 'person') { focus = { id: +b.dataset.id }; section = 'gang'; sheet = true; render(); }
    else if (a === 'vacant') { focus = { pos: b.dataset.pos, ok: b.dataset.ok || null }; section = 'gang'; sheet = true; render(); }
    else if (a === 'appoint') { focus = { id: +b.dataset.id }; act('assign', [+b.dataset.id, b.dataset.pos, b.dataset.ok || null]); }
    else if (a === 'new1') { confirmNew = true; render(); }
    else if (a === 'new0') { confirmNew = false; render(); }
    else if (a === 'new2') { confirmNew = false; wipe(); leaveToMenu(); }
    else if (a === 'close') { closeModal(); render(); }
  });
  // перетаскивание мышью: человека — на должность, на резерв — снять с должности
  document.addEventListener('dragstart', e => { const n = e.target.closest && e.target.closest('#org [draggable][data-id]'); if (!n) return; moveId = +n.dataset.id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(moveId)); } catch (er) { /* ignore */ } setTimeout(() => { document.querySelectorAll('#org .cnode[data-slot]').forEach(x => { if (+x.dataset.id !== moveId) x.classList.add('drop'); }); }, 0); });
  document.addEventListener('dragover', e => { if (moveId == null) return; const t = e.target.closest && e.target.closest('#org .cnode[data-slot], #org .tier.bench'); if (t) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } });
  document.addEventListener('drop', e => { if (moveId == null) return; const t = e.target.closest && e.target.closest('#org .cnode[data-slot], #org .tier.bench'); if (!t) return; e.preventDefault(); const id = moveId; moveId = null; if (t.classList.contains('bench')) act('unassign', [id]); else { const sl = t.dataset.slot.split('|'); if (+t.dataset.id !== id) act('assign', [id, sl[0], sl[1] || null]); else render(); } });
  document.addEventListener('dragend', () => { if (moveId != null) { moveId = null; render(); } });
  document.addEventListener('input', e => { if (e.target && e.target.id === 'fxr') fxCalc(); });
  document.addEventListener('change', e => { const t = e.target; if (t.dataset && t.dataset.a === 'watch') { watchFid = t.value; sel = null; section = 'map'; sheet = true; render(); return; } if (t.dataset && t.dataset.a === 'reassign' && t.value) { const v = t.value.split('|'); act('assign', [+t.dataset.id, v[0], v[1] || null]); } });
  $('#end').addEventListener('click', () => {
    if (!S || P().over) return;
    if (net) { netCall('ready', { ready: !P().ready }); return; }
    const r = E.endTurn(S);
    if (!r.ok) { toast(r.msg, true); return; }
    save(); render();
  });

  // ---------- модальные окна ----------
  const modal = $('#modal');
  // окна, которые можно просто закрыть: крестик справа сверху и свайп вниз
  const closable = key => /^(records|lawinfo|parley:|deal:)/.test(key || '');
  function openModal(html, cls, key) {
    const x = closable(key) ? '<i class="grab mgrab" aria-hidden="true"></i><button class="xclose mclose" data-a="mclose" aria-label="Закрыть">×</button>' : '';
    modal.innerHTML = '<div class="sheet ' + (cls || '') + (x ? ' closable' : '') + '">' + x + html + '</div>'; modal.hidden = false; modalKey = key || '';
  }
  function dismissModal() {
    const k = modalKey;
    if (/^parley:/.test(k)) parleyWith = null;
    if (/^deal:/.test(k)) dealWith = null;
    closeModal(); if (S) render(); else showStart();
  }
  (function modalSwipe() {
    let y0 = null, dy = 0, t0 = 0, sh = null;
    modal.addEventListener('touchstart', e => {
      sh = e.target.closest('.sheet.closable'); if (!sh || e.touches.length !== 1 || e.target.closest('.xclose, input, select, textarea')) { y0 = null; return; }
      if (sh.scrollTop > 1) { y0 = null; return; }
      y0 = e.touches[0].clientY; dy = 0; t0 = Date.now();
    }, { passive: true });
    modal.addEventListener('touchmove', e => {
      if (y0 == null) return; dy = e.touches[0].clientY - y0;
      if (dy <= 0 || sh.scrollTop > 1) { if (dy < 0) { y0 = null; sh.style.transform = ''; } return; }
      e.preventDefault(); sh.style.transition = 'none'; sh.style.transform = 'translateY(' + dy + 'px)'; sh.style.opacity = String(Math.max(0.4, 1 - dy / 600));
    }, { passive: false });
    const end = () => {
      if (y0 == null || !sh) return; y0 = null;
      const fast = dy > 40 && dy / Math.max(1, Date.now() - t0) > 0.5;
      sh.style.transition = 'transform .18s ease, opacity .18s ease';
      if (dy > Math.min(140, sh.offsetHeight * 0.25) || fast) { sh.style.transform = 'translateY(100%)'; sh.style.opacity = '0'; setTimeout(dismissModal, 160); }
      else { sh.style.transform = ''; sh.style.opacity = ''; }
    };
    modal.addEventListener('touchend', end); modal.addEventListener('touchcancel', end);
  })();
  function closeModal() { modal.hidden = true; modal.innerHTML = ''; modalKey = ''; }

  function showEvent() {
    const p = P(), ev = E.currentEvent(S, me); if (!ev) return;
    const key = 'ev:' + S.turn + ':' + ev.id + ':' + R(p.money); if (modalKey === key) return;
    const kind = ev.extra === 'law' ? 'law' : ev.extra === 'crew' ? 'crew' : ev.date ? 'history' : 'street';
    if (G.Sfx) G.Sfx.play(kind === 'law' ? 'siren' : 'event');
    let h = '<div class="evscene">' + A.eventScene(kind, ev.id) + '</div><p class="eyebrow">' + E.date(S.turn).label + (ev.date ? ' · история' : ev.extra === 'law' ? ' · пришли из власти' : ev.extra === 'crew' ? ' · внутри семьи' : '') + '</p>';
    const rp = !ev.extra && p.report;
    if (rp) {
      h += '<div class="report"><span>За прошлый месяц касса ' + sign(rp.money) + ' тыс. $</span>';
      if (rp.law) h += '<span class="bad">' + esc(rp.law) + '</span>';
      if (rp.infl) h += '<span class="bad">Инфляция съела ' + rp.infl + ' тыс. рублёвой кассы' + (rp.fx ? ', обмен в доллары: −' + rp.fx : '') + '</span>';
      if (rp.lost && rp.lost.length) h += '<span class="bad">Потеряны районы: ' + esc(rp.lost.join(', ')) + '</span>';
      h += '</div>';
    }
    const tx = s => esc(E.evText(S, me, s)), w = E.evWho(S, me), L = ev.npc && D.LEGENDS[ev.npc];
    h += '<h2>' + tx(ev.title) + '</h2>';
    if (L) h += '<div class="evwho"><span class="ava">' + A.legendFace(ev.npc) + '</span><div><b>' + esc(L.nick) + '</b><small>' + esc(L.name) + ', ' + esc(L.bio.charAt(0).toLowerCase() + L.bio.slice(1)) + '</small></div></div>';
    else if (ev.off) h += '<div class="evwho"><span class="ava">' + A.officialFace(ev.off) + '</span><div><b>' + esc(D.OFFICIALS[ev.off].name) + '</b><small>Пришёл не с пустыми руками: с папкой.' + (p.off[ev.off] ? ' Свой такой у тебя уже есть, но этот — чужой.' : '') + '</small></div></div>';
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
    let h = '<p class="eyebrow">' + (B.def ? 'Оборона' : E.KINDS[B.lvl]) + ' · раунд ' + (B.round + 1) + ' из ' + E.BATTLE_ROUNDS + '</p><h2>' + (B.def ? 'Отбиваемся: ' : 'Перестрелка: ') + esc(dd.name) + '</h2>';
    h += '<div class="vs"><div><span class="ava">' + (l ? A.face(l) : A.bossFace(fd(me))) + '</span><b>' + (l ? esc(E.cname(l)) : 'Ты лично') + '</b><small>ведёт ' + B.men + ' бойцов</small>' + bar(B.a, B.a0, 'our', true) + '<small>силы ' + R(Math.max(0, B.a)) + ' из ' + R(B.a0) + '</small></div><i>×</i><div><span class="ava">' + (foe ? A.bossFace(foe) : shpana(B.i)) + '</span><b>' + (foe ? esc(foe.name) : 'Местная шпана') + '</b><small>' + (foe ? esc(foe.boss) : 'держат дворы') + '</small>' + bar(B.d, B.d0, 'their') + '<small>' + (B.def ? 'натиск ' : 'оборона ') + R(Math.max(0, B.d)) + ' из ' + R(B.d0) + '</small></div></div>';
    h += '<p class="muted">' + (B.def ? 'Отобьёмся, если их натиск упадёт до нуля или продержимся ' + E.BATTLE_ROUNDS + ' раундов. Если наших сил останется меньше черты, бойцы дрогнут и район уйдёт.' : 'Район наш, когда оборона упадёт до нуля. Если наших сил останется меньше черты, бойцы дрогнут. На всё ' + E.BATTLE_ROUNDS + ' раундов.') + '</p>';
    h += '<p class="units">Урон за раунд: наш <b>' + R(Math.max(0, B.a) * 0.32) + '</b>, их <b>' + R(Math.max(0, B.d) * 0.28) + '</b> · броня: наша <b>' + R((B.armU || 0) * 100) + '%</b>, их <b>' + R((B.armT || 0) * 100) + '%</b> · кубики 2d6: ×0.71…×1.29, ⚅⚅ — в упор ×1.5, ⚀⚀ — осечка ×0.5</p>';
    const die = n => '⚀⚁⚂⚃⚄⚅'[n - 1];
    if (B.log.length) h += '<ol class="blog">' + B.log.map(x => '<li><b>' + E.TACTICS[x.t].name + '</b>' + (x.note ? ' · ' + esc(x.note) : '') + (x.du ? '<span class="dice">мы <i>' + die(x.du[0]) + die(x.du[1]) + '</i> ' + x.bu + ' × ' + x.our + ' × ' + x.ku + ' → <em class="good">' + x.dealt + '</em> · они <i>' + die(x.dt[0]) + die(x.dt[1]) + '</i> ' + x.bt + ' × ' + x.their + ' × ' + x.kt + ' → <em class="bad">' + x.took + '</em></span>' : '<span><em class="good">урон ' + x.dealt + '</em> <em class="bad">получили ' + x.took + '</em></span>') + '</li>').join('') + '</ol>';
    h += '<div class="tacts">' + Object.keys(E.TACTICS).map(t => {
      const T = E.TACTICS[t], lock = E.tacticLock(S, me, t), extra = t === 'flank' ? 'удача ' + R(E.flankOdds(S, me) * 100) + '%' : t === 'talk' ? 'шанс ' + R(E.talkOdds(S, me)) + '%' : t === 'rpg' ? 'РПГ: ' + ((p.arms || {}).rpg || 0) : t === 'snipe' ? 'СВД: ' + ((p.arms || {}).svd || 0) : '';
      return '<button class="card' + (t === 'storm' || t === 'flank' || t === 'rpg' ? ' atk' : '') + (t === 'retreat' ? ' ghost' : '') + '" data-a="tac" data-k="' + t + '"' + (lock ? ' disabled' : '') + '><b>' + T.name + '</b><span>' + esc(T.desc) + '</span>' + (extra ? '<small>' + extra + '</small>' : '') + (lock ? '<small class="bad">' + lock + '</small>' : '') + '</button>';
    }).join('') + '</div>';
    openModal(h, 'event battle', key);
  }
  // наезд на район: вступить в бой, откупиться, сдать или положиться на своих
  function showAssault() {
    const p = P(), x = p.assaults[0]; if (!x) return;
    const key = 'as:' + x.att + ':' + x.i + ':' + p.assaults.length; if (modalKey === key) return;
    const dd = D.DISTRICTS[x.i], f = fd(x.att), our = E.districtDef(S, x.i), odds = R(E.defendOdds(S, me, x, true) * 100), oddsA = R(E.defendOdds(S, me, x, false) * 100), cost = E.buyOffCost(S, x), cp = E.crew(S, me).find(c => c.st === 'ok' && c.pos === 'capo' && c.ok === dd.ok);
    if (G.Sfx) G.Sfx.play('siren');
    let h = '<div class="evscene">' + A.eventScene('law', 'as' + x.i) + '</div><p class="eyebrow">Наезд · ' + E.date(S.turn).label + (p.assaults.length > 1 ? ' · ещё ' + (p.assaults.length - 1) : '') + '</p><h2>' + esc(f.name) + ' напали на ' + esc(dd.name) + '</h2>';
    h += '<div class="vs"><div><span class="ava">' + (cp ? A.face(cp) : A.bossFace(fd(me))) + '</span><b>' + (cp ? esc(E.cname(cp)) : 'Твои на районе') + '</b><small>оборона ' + R(our) + '</small></div><i>×</i><div><span class="ava">' + A.bossFace(f) + '</span><b>' + esc(f.name) + '</b><small>едут ' + x.men + ' бойцов · сила ' + x.a + '</small></div></div>';
    h += '<p class="lead">Машины у ' + esc(dd.name) + ', пацаны с битами и стволами. Решать надо сейчас.</p><div class="opts">';
    h += '<button class="opt" data-a="defend" data-k="0" data-h="fight"><span>Вступить в бой: приводишь подмогу, сам командуешь по раундам</span><em>отобьёмся ~' + odds + '%</em></button>';
    h += '<button class="opt" data-a="defend" data-k="0" data-h="auto"><span>' + (cp ? 'Пусть ' + esc(cp.nick) + ' разберётся сам' : 'Пусть пацаны на районе разберутся сами') + '</span><em>~' + oddsA + '%</em></button>';
    h += '<button class="opt" data-a="defend" data-k="0" data-h="pay"' + (p.money < cost ? ' disabled' : '') + '><span>Откупиться</span><em>' + cost + ' тыс.</em>' + (p.money < cost ? '<small>Не хватает денег</small>' : '') + '</button>';
    h += '<button class="opt" data-a="defend" data-k="0" data-h="give"><span>Сдать район без крови</span><em class="bad">авторитет −4</em></button></div>';
    h += '<p class="muted">Если ничего не решить до конца месяца, бой пройдёт без тебя.</p>';
    openModal(h, 'event', key);
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
    if (d.dead) ch += '<span class="bad">Казнён: ' + esc(d.dead) + '</span>';
    if (d.demote) ch += '<span class="bad">Снят в резерв: ' + esc(d.demote) + '</span>';
    if (G.Sfx && d.money > 0) G.Sfx.play('cash'); else if (G.Sfx && d.dead) G.Sfx.play('shot');
    const wc = r.who != null && E.crew(S, me).find(c => c.id === r.who), rain = d.money > 0 ? '<div class="cashrain">' + A.moneyRain() + '</div>' : '';
    openModal(rain + '<p class="eyebrow">' + esc(r.title) + '</p>' + (wc ? '<div class="evwho"><span class="ava">' + A.face(wc) + '</span><div><b>' + esc(E.cname(wc)) + '</b><small>' + (wc.st === 'hurt' ? 'ранен' : wc.st === 'jail' ? 'сидит' : 'сила ' + wc.str + ', ум ' + wc.wit + ', верность ' + wc.loy) + '</small></div></div>' : '') + '<p class="lead">' + esc(r.msg) + '</p><p class="deltas">' + (ch || '<span>Без последствий</span>') + '</p><button class="btn primary wide" data-a="close">Дальше</button>', 'event', 'result');
    if (!net) renderTop();
  }
  const WHY = { 'СИЗО «Лефортово»': 'Розыск дошёл до 100 из 100. На этом уровне за тобой приходит ФСБ, и откупиться можно, только если связей во власти 8 и больше и в кассе хватает денег. Розыск сбивают люди во власти (вкладка «Власть»), «Занести наверх», юрист и перерыв в нападениях.', 'Вынесли из Москвы': 'У бригады не осталось ни одного района: их забрали соседи. Оборону держат смотрящие, бригадиры и бойцы со стволами.', 'Убит на стрелке': 'Правая рука — сильный и неверный (верность 2 и ниже) — устроил переворот. Таких лучше снимать с должности или казнить заранее.', 'Казначей в бегах с общаком': 'Казначей с верностью 2 и ниже сбежал со всей кассой. Казначеем нужно ставить верного.' };
  function showOver() {
    const o = P().over, key = 'over:' + S.done; if (modalKey === key) return;
    let h = '<p class="eyebrow">' + E.date(S.turn).label + '</p><h2>' + esc(o.title) + '</h2><p class="lead">' + esc(o.text) + '</p>';
    if (WHY[o.title]) h += '<div class="box why"><h3>Почему так вышло</h3><p>' + WHY[o.title] + '</p></div>';
    if (net && !S.done) h += btn('👁 Смотреть за игрой дальше', 'spectate', '', false, 'wide primary') + '<p class="muted">Карта, чат и бригады других игроков — до конца партии.</p>';
    if (o.stats) h += '<dl class="kv"><dt>Счёт</dt><dd>' + o.score + '</dd><dt>Касса</dt><dd>' + o.stats.money + ' тыс. $</dd><dt>Районы</dt><dd>' + o.stats.districts + '</dd><dt>Авторитет</dt><dd>' + o.stats.rep + '</dd><dt>Связи</dt><dd>' + o.stats.conn + '</dd><dt>Белый доход</dt><dd>' + o.stats.white + '%</dd></dl>';
    if (net && S.humans.length > 1) {
      h += '<h3>Игроки</h3><table class="tbl">' + S.humans.map(f => { const x = S.f[f]; return '<tr><td><i class="dot" style="background:' + fd(f).color + '"></i>' + who(f) + '</td><td>' + (x.over ? esc(x.over.title) + (x.over.score ? ' · ' + x.over.score : '') : 'ещё играет') + '</td></tr>'; }).join('') + '</table>';
      if (!S.done) h += '<p class="muted">Остальные доигрывают. Итоги обновятся здесь.</p>';
    }
    if (Net.available() && !P().scoreSent && o.title && D.ENDINGS.includes(o.title)) h += '<div class="box" id="scorebox"><h3>Зал славы</h3><div class="row"><label class="field"><span>Имя в таблице рекордов</span><input id="scorenick" maxlength="20" value="' + esc(savedNick()) + '"></label><button class="btn primary" data-a="sendscore">Записать · ' + (o.score || E.scoreOf(S, me)) + '</button></div></div>';
    h += '<div class="donate"><p>Понравилась игра? Поддержи автора — каждый перевод идёт на новые районы, события и музыку.</p><div class="drow"><span><b>Т-Банк</b><small>перевод по номеру телефона</small></span><button class="btn" data-a="copyphone" title="Скопировать номер">' + DONATE_SHOW + '<small>нажми, чтобы скопировать</small></button></div></div>';
    openModal(h + '<button class="btn wide" data-a="export">Скачать запись партии</button><button class="btn primary wide" data-a="menu">В меню</button>', 'event', key);
  }

  // предупреждение о розыске: от 80 раз в месяц, чтобы СИЗО не стало сюрпризом
  let heatSeen = -1;
  const heatWarn = () => !P().over && P().heat >= 80 && heatSeen !== S.turn;
  function showHeat() {
    const p = P(), key = 'heat:' + S.turn; if (modalKey === key) return;
    const ok = E.conn(S, me) >= 8, c = Math.round(300 * E.era(S));
    let h = '<p class="eyebrow">Опасно</p><h2>Розыск ' + Math.round(p.heat) + ' из 100</h2><p class="lead">Тобой занимается ФСБ. Когда розыск дойдёт до <b>100</b>, тебя возьмут — это конец игры (СИЗО «Лефортово»).</p>';
    h += '<p>' + (ok ? 'Связей во власти ' + E.conn(S, me) + ' — откупиться получится, если в кассе будет ' + c + ' тыс.' : 'Связей во власти ' + E.conn(S, me) + ' из 8 нужных — откупиться не выйдет.') + ' Сейчас розыск меняется на ' + sign(E.heatDelta(S, me)) + ' в месяц.</p>';
    h += '<h3>Как сбить</h3><ul class="plain"><li>Купить людей во власти — каждый снижает розыск каждый месяц.</li><li>«Занести наверх» — разово минус розыск.</li><li>Перестать нападать: каждое нападение поднимает розыск.</li><li>Назначить верного юриста, вложиться в благотворительность.</li></ul>';
    h += '<div class="grid">' + btn('Во «Власть»', 'heatgo', '', false, 'primary') + btn('Понятно', 'heatok', '', false, 'ghost') + '</div>';
    openModal(h, 'event', key); haptic('heavy'); if (G.Sfx) G.Sfx.play('siren');
  }

  // ---------- наблюдение: выбывший игрок смотрит за партией и за выбранной бригадой ----------
  let spectating = false, watchFid = null, overPeek = false;
  function specHTML() {
    if (!spectating || !P().over || S.done) return '';
    const alive = D.FACTIONS.filter(f => S.f[f.id] && S.f[f.id].alive && !S.f[f.id].absent && f.id !== me && !(S.f[f.id].human && S.f[f.id].over));
    if (!watchFid || !alive.some(f => f.id === watchFid)) watchFid = (alive.find(f => S.f[f.id].human) || alive[0] || {}).id || null;
    let h = '<div class="spec"><span>👁 Ты выбыл: <b>' + esc(P().over.title) + '</b>. Смотришь за игрой.</span><label>Следить за <select data-a="watch">' + alive.map(f => '<option value="' + f.id + '"' + (f.id === watchFid ? ' selected' : '') + '>' + who(f.id) + ' · ' + E.count(S, f.id) + ' р.</option>').join('') + '</select></label>' + btn('Итоги', 'specover', '', false, 'sm ghost') + '</div>';
    return h;
  }
  function watchPane() {
    const x = S.f[watchFid]; if (!x) return '<h2>Наблюдение</h2><p class="muted">Следить не за кем.</p>';
    const f = fd(watchFid), own = E.owned(S, watchFid);
    let h = '<div class="dhero"><span class="ava big">' + A.bossFace(f) + '</span><div><p class="eyebrow">Наблюдение</p><h2>' + esc(f.name) + '</h2><p class="sub">' + (x.human ? esc(x.nick || 'игрок') + (x.auto ? ' · ведёт бот' : x.ready ? ' · закончил месяц' : ' · ходит') : 'бот') + '</p></div></div>';
    h += '<dl class="kv"><dt>Районы</dt><dd>' + own.length + '</dd><dt>Бойцы</dt><dd>' + R(x.men) + '</dd><dt>Стволы</dt><dd>' + R(x.guns) + '</dd><dt>Тачки</dt><dd>' + R(x.cars) + '</dd><dt>Сила</dt><dd>' + R(E.power(x)) + '</dd><dt>Авторитет</dt><dd>' + R(x.rep) + '</dd></dl>';
    h += '<h3>Районы</h3><p>' + (own.length ? own.map(i => '<button class="link" data-a="goto" data-i="' + i + '">' + D.DISTRICTS[i].name + '</button>').join(', ') : 'нет') + '</p>';
    const lg = S.log.filter(l => !l.to && l.s.indexOf(f.name) >= 0).slice(0, 8);
    if (lg.length) h += '<h3>Что о них слышно</h3><ul class="log">' + lg.map(l => '<li class="' + l.k + '"><time>' + E.date(l.t).label + '</time>' + esc(l.s) + '</li>').join('') + '</ul>';
    return h;
  }

  // ---------- меню ----------
  const nickValue = () => { const v = ($('#nick') ? $('#nick').value : '').trim().slice(0, 20); try { localStorage.setItem('war90.nick', v); } catch (e) { /* ignore */ } return v; };
  const DIFF_NOTE = { easy: 'Боты не трогают тебя два года, родной район почти не взять', norm: 'Полтора года тишины, потом не больше одного района в месяц', hard: 'Через год боты приходят всерьёз и могут отнять три района за месяц' };
  let diff = (() => { try { const v = localStorage.getItem('war90.diff'); return E.DIFF[v] ? v : 'norm'; } catch (e) { return 'norm'; } })();
  const diffHTML = () => '<div class="seg" role="group" aria-label="Сложность"><span>Сложность</span>' + Object.keys(E.DIFF).map(k => '<button class="' + (k === diff ? 'on' : '') + '" data-a="diff" data-k="' + k + '" aria-pressed="' + (k === diff) + '">' + E.DIFF[k].name + '</button>').join('') + '<small id="diffnote">' + DIFF_NOTE[diff] + '</small></div>';
  let scen = (() => { try { const v = localStorage.getItem('war90.scen'); return D.SCENARIOS[v] ? v : 's91'; } catch (e) { return 's91'; } })();
  const scenHTML = () => '<div class="seg" role="group" aria-label="Начало"><span>Начало</span>' + Object.keys(D.SCENARIOS).map(k => '<button class="' + (k === scen ? 'on' : '') + '" data-a="scen" data-k="' + k + '" aria-pressed="' + (k === scen) + '">' + D.SCENARIOS[k].name + '</button>').join('') + '<small id="scennote">' + D.SCENARIOS[scen].desc + '</small></div>';
  // достижения за все партии хранятся в браузере; концовки идут как отдельные достижения
  const ACH_KEY = 'war90.ach';
  const achAll = () => { try { return JSON.parse(localStorage.getItem(ACH_KEY)) || {}; } catch (e) { return {}; } };
  const achSave = m => { try { localStorage.setItem(ACH_KEY, JSON.stringify(m)); } catch (e) { /* ignore */ } };
  let achShown = null;
  function achSync() {
    const p = S && me && S.f[me]; if (!p) return;
    const got = Object.keys(p.ach || {}), all = achAll();
    if (!achShown) achShown = new Set(got); // при загрузке партии старые не показываем заново
    const fresh = got.filter(id => !achShown.has(id));
    got.forEach(id => { achShown.add(id); all[id] = all[id] || Date.now(); });
    if (p.over && p.over.title) all['end:' + p.over.title] = all['end:' + p.over.title] || Date.now();
    achSave(all);
    fresh.forEach((id, i) => { const a = D.ACH.find(x => x.id === id); if (a) setTimeout(() => { toast('🏆 Достижение: «' + a.name + '»'); if (G.Sfx) G.Sfx.play('ach'); }, 400 + i * 1800); });
  }
  function achHTML() {
    const p = S && me ? S.f[me] : null, mine = (p && p.ach) || {}, all = achAll(), groups = {};
    D.ACH.forEach(a => { (groups[a.group] = groups[a.group] || []).push(a); });
    const total = D.ACH.length + D.ENDINGS.length, got = D.ACH.filter(a => all[a.id]).length + D.ENDINGS.filter(t => all['end:' + t]).length;
    let h = '<h3>Достижения <span class="muted">' + got + ' из ' + total + ' за все партии' + (p ? ' · в этой: ' + Object.keys(mine).length : '') + '</span></h3>';
    Object.keys(groups).forEach(g => { h += '<p class="achg">' + g + '</p><div class="achs">' + groups[g].map(a => '<div class="ach' + (mine[a.id] != null ? ' now' : all[a.id] ? ' got' : '') + '" title="' + esc(a.desc) + '"><b>' + (mine[a.id] != null || all[a.id] ? '🏆 ' : '') + a.name + '</b><small>' + a.desc + '</small></div>').join('') + '</div>'; });
    h += '<p class="achg">Концовки</p><div class="achs">' + D.ENDINGS.map(t => '<div class="ach' + (all['end:' + t] ? ' got' : '') + '"><b>' + (all['end:' + t] ? '🏁 ' : '') + t + '</b></div>').join('') + '</div>';
    return h;
  }
  // таблица рекордов с сервера
  function showRecords() {
    const keepS = S; S = null;
    let h = '<p class="eyebrow">Зал славы</p><h2>Рекорды и достижения</h2><div id="records"><p class="muted">Загружаю таблицу…</p></div>' + achHTML();
    S = keepS;
    openModal(h + btn('Назад', 'menu0', '', false, 'wide'), 'start', 'records');
    fetch('api/scores').then(r => r.json()).then(j => {
      const box = $('#records'); if (!box) return;
      const list = j.scores || [];
      box.innerHTML = list.length ? '<table class="tbl recs"><tr><th>#</th><th>Игрок</th><th>Концовка</th><th>Счёт</th></tr>' + list.map((x, i) => '<tr><td>' + (i + 1) + '</td><td><i class="dot" style="background:' + fd(x.fid).color + '"></i>' + esc(x.nick) + '<br><small class="muted">' + fd(x.fid).name + ' · ' + esc(x.date) + '</small></td><td>' + esc(x.title) + '</td><td>' + x.score + '</td></tr>').join('') + '</table>' : '<p class="muted">Пока пусто. Закончи партию и впиши своё имя первым.</p>';
    }).catch(() => { const box = $('#records'); if (box) box.innerHTML = '<p class="muted">Таблица рекордов работает, когда игра открыта с сервера.</p>'; });
  }
  // установка на телефон: Android/Chrome отдают событие, на iPhone — подсказка
  let installEv = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEv = e; const b = $('#installbox'); if (b) b.hidden = false; });
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const installHTML = () => standalone() || TG ? '' : '<div class="box install" id="installbox"' + (installEv || /iPhone|iPad/.test(navigator.userAgent) ? '' : ' hidden') + '><b>Игра на телефоне как приложение</b><p class="muted">' + (/iPhone|iPad/.test(navigator.userAgent) ? 'В Safari нажми «Поделиться» и выбери «На экран „Домой“».' : 'Иконка на рабочем столе, запуск на весь экран, одиночная игра без интернета.') + '</p>' + (/iPhone|iPad/.test(navigator.userAgent) ? '' : btn('Установить', 'install', '', false, 'primary')) + '</div>';
  const savedNick = () => { let v = ''; try { v = localStorage.getItem('war90.nick') || ''; } catch (e) { /* ignore */ } const u = tgUser(); return v || (u ? (u.first_name || u.username || '').slice(0, 20) : ''); };
  function showStart() {
    const sv = load();
    let h = '<p class="eyebrow">Москва · декабрь 1991 — декабрь 2007</p><h1>Передел</h1><p class="lead">Страны больше нет. У тебя один район и восемь пацанов. Через шестнадцать лет криминал станет частью власти. Реши, будешь ли ты среди тех, кто дожил.</p>' + diffHTML() + scenHTML() + '<button class="btn ghost sm" data-a="records">Рекорды и достижения</button>' + installHTML();
    h += '<div class="modes"><section><h3>Онлайн</h3><div id="online"><p class="muted">Ищу сервер…</p></div></section><section><h3>Одиночная игра</h3>';
    h += '<div class="row cloadrow"><label class="field"><span>Продолжить по коду из облака</span><input id="cloudcode" maxlength="9" placeholder="K7F3-9QX2" autocapitalize="characters" value="' + esc(cloudCode()) + '"></label><button class="btn" data-a="cloudload">Загрузить</button></div>';
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

  // ---------- обновление игры: сервер на новой версии — просим переподключиться ----------
  const VER = (document.querySelector('meta[name="app-ver"]') || {}).content || '';
  let verAsked = false;
  function checkVer(v) {
    if (!VER || !v || v === VER || verAsked) return;
    verAsked = true;
    const box = document.createElement('div'); box.id = 'upd';
    box.innerHTML = '<div><b>Игра обновилась</b><span>Переподключись, чтобы играть в новую версию. ' + (net ? 'Комната и бригада останутся.' : 'Партия сохранена.') + '</span></div><button class="btn primary" id="updgo">Переподключиться</button>';
    document.body.appendChild(box); haptic('medium');
    $('#updgo').addEventListener('click', () => { try { if (!net && S) { save(); sessionStorage.setItem('war90.resume', '1'); } } catch (e) { /* ignore */ } location.reload(); });
  }
  // одиночная игра тоже узнаёт об обновлении: спрашиваем сервер при возврате в игру и раз в 3 минуты
  const pollVer = () => { if (!VER || verAsked || !/^https?:/.test(location.protocol)) return; fetch('api/version', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => j && checkVer(j.v)).catch(() => {}); };
  setInterval(pollVer, 180e3); document.addEventListener('visibilitychange', () => { if (!document.hidden) pollVer(); });

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
    checkVer(msg.ver);
    const prevT = net.lobby && net.lobby.chat && net.lobby.chat.length ? net.lobby.chat[net.lobby.chat.length - 1].t : 0;
    net.lobby = msg.lobby; chatNews(prevT);
    net.endAt = msg.lobby.left != null ? Date.now() + msg.lobby.left : null;
    if (!msg.state) { S = null; showLobby(); return; }
    const first = !S; S = msg.state; me = S.me; if (first) achShown = null;
    if (first) { sel = E.owned(S, me)[0]; if (sel == null) sel = null; section = 'gang'; focus = { pos: 'right' }; if (modalKey === 'lobby') closeModal(); }
    render();
  }
  function showLobby() {
    const L = net.lobby, my = L.me && L.me.fid, humans = L.players.filter(p => p.fid).length;
    let h = '<p class="eyebrow">Комната · набор игроков · сложность: ' + (E.DIFF[L.diff] || E.DIFF.norm).name.toLowerCase() + '</p><h2>' + esc(L.name) + '</h2>';
    h += '<p class="muted">Игроки: ' + L.players.map(p => '<span class="' + (p.online ? 'good' : '') + '">' + esc(p.nick) + (p.host ? ' (создатель)' : '') + '</span>').join(', ') + '</p>';
    if (TG) h += btn('Позвать друзей в Телеграме', 'tgshare', '', false, 'wide primary');
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
    const TM = [[0, 'нет'], [3, '3 мин'], [5, '5 мин'], [10, '10 мин']];
    h += '<h3>Таймер хода</h3><p class="muted">Время на месяц. Кончилось — месяц закрывается за всех. Кто пропал дольше 3 минут, за того играет бот, пока не вернётся.</p>' + (L.host ? '<div class="seg">' + TM.map(t => '<button class="' + (t[0] === L.timer ? 'on' : '') + '" data-a="tmr" data-k="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>' : '<p>' + (L.timer ? L.timer + ' мин на месяц' : 'без таймера') + '</p>');
    if (L.host) h += btn('Начать игру', 'go', '', humans ? false : 'сначала займи бригаду', 'primary wide');
    else h += '<p class="muted">Игру начнёт создатель комнаты.</p>';
    if (modalKey === 'lobby' && chatOnly()) return;
    h += chatHTML();
    const sc = modal.firstChild && modalKey === 'lobby' ? modal.firstChild.scrollTop : 0;
    openModal(h + btn('Выйти из комнаты', 'leave', '', false, 'wide ghost'), 'start', 'lobby');
    modal.firstChild.scrollTop = sc; chatBottom(); chatSeen();
  }

  buildMap();
  function boot(data) {
    if (data && data.S) { S = E.migrate(data.S); me = S.humans[0]; sel = data.sel; render(); return; }
    const sp = TG && TG.initDataUnsafe && TG.initDataUnsafe.start_param, m = /^#room-([\w-]+)$/.exec(location.hash) || (sp && /^room-([\w-]+)$/.exec(sp)), rec = Net.recall() || {};
    if (m && rec[m[1]]) { enterRoom(m[1], rec[m[1]]); return; }
    let resume = false; try { resume = sessionStorage.getItem('war90.resume') === '1'; sessionStorage.removeItem('war90.resume'); } catch (e) { /* ignore */ }
    if (resume && !m) { const sv = load(); if (sv) { S = sv; me = S.humans[0]; achShown = null; render(); return; } }
    showStart();
    if (m) Net.rooms().then(l => { if (l) Net.post('join', { room: m[1], nick: savedNick() }).then(r => r.room ? enterRoom(r.room, r.token) : toast(r.err, true)); });
  }
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => (net ? {} : { S, sel }));
  if (hot && hot.ready) hot.ready(boot); else boot((hot && hot.data) || {});
})();
