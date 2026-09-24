// Tabellone EAV: interfaccia. La logica pura sta in logic.js, la configurazione in config.js.
// Regola di sicurezza: i dati del Worker entrano nella pagina SOLO come testo (textContent), mai come HTML.

import { API, SERVIZI, LINEA_SERVIZIO, CFG, RIGHE_INIZIALI, INATTIVITA_MS } from './config.js';
import * as L from './logic.js';

const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c);
  return e;
};
const safeStore = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* memoria del browser non disponibile */ } },
};

const state = {
  idx: null,
  station: null, tipo: 'P', vai: null, solo: false,
  filtro: null, showAll: false,
  board: null, rows: [], version: 0, fetchedAt: null, error: null, backoff: 0,
  paused: false, lastActivity: Date.now(), kiosk: false,
  timer: null, ctrl: null, renderedKey: '', open: new Set(), intervalMs: null,
};

// ---------- avvio ----------

init().catch((e) => {
  console.error(e);
  showHome('Impossibile caricare l\'elenco delle stazioni. Riprova tra poco.');
});

async function init() {
  applyTheme(safeStore.get('tema'));
  const res = await fetch('stazioni.json');
  if (!res.ok) throw new Error('stazioni.json: HTTP ' + res.status);
  state.idx = L.buildIndex(await res.json());

  document.querySelectorAll('[data-theme-toggle]').forEach((b) => b.addEventListener('click', toggleTheme));
  $('#home-q').addEventListener('input', renderHome);
  setupBoardControls();
  for (const ev of ['pointerdown', 'keydown', 'touchstart', 'wheel']) {
    addEventListener(ev, onActivity, { passive: true });
  }
  document.addEventListener('visibilitychange', onVisibility);
  addEventListener('popstate', route);
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(fitStops, 150); });
  setInterval(tickClock, 1000);
  route();
}

// ---------- tema ----------

function applyTheme(t) {
  if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme')
    || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const next = cur === 'light' ? 'dark' : 'light';
  applyTheme(next);
  safeStore.set('tema', next);
}

// ---------- navigazione ----------

function navigate(search) {
  history.pushState(null, '', search ? '?' + search : location.pathname);
  route();
}

function route() {
  const p = new URLSearchParams(location.search);
  const id = p.get('stazione');
  state.kiosk = p.get('kiosk') === '1';
  if (id && state.idx.byId.has(id)) {
    showBoard(id, p.get('tipo') === 'A' ? 'A' : 'P', p.get('vai'));
  } else {
    stopUpdates();
    state.station = null;
    showHome(id ? 'Stazione non trovata: scegline una dall\'elenco.' : null);
  }
}

function syncUrl() {
  const p = new URLSearchParams();
  p.set('stazione', state.station);
  p.set('tipo', state.tipo);
  if (state.vai) p.set('vai', state.vai);
  if (state.kiosk) p.set('kiosk', '1');
  history.replaceState(null, '', '?' + p);
}

// ---------- elenco stazioni ----------

const CIRCUMVESUVIANA = new Set(['L1', 'L4', 'L6', 'L8', 'L8Dir']);
const lineLabel = (l) => l.id + ' · ' + L.titleCase(l.nome).replace(/-/g, ' – ');
const serviceOfLine = (nome) => SERVIZI[LINEA_SERVIZIO[nome]] || null;

function dotFor(lineName) {
  const svc = serviceOfLine(lineName);
  return el('span', { class: 'dot s-' + (svc ? svc.css : 'neu') + (svc && svc.strisce ? ' strisce' : ''), title: lineName });
}

function stationLink(s, extra) {
  const dots = [...state.idx.linesOf(s.id)].map(dotFor);
  return el('a', { href: '?stazione=' + s.id + '&tipo=P', onclick: (e) => {
    if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); navigate('stazione=' + s.id + '&tipo=P'); }
  } }, el('span', { class: 'dots' }, dots), el('span', { text: L.titleCase(s.nome) }), extra);
}

function showHome(msg) {
  $('#board').hidden = true;
  $('#home').hidden = false;
  document.title = 'EAV ogliaEAspettà';
  const m = $('#home-msg');
  m.hidden = !msg; m.textContent = msg || '';
  renderHome();
}

function renderHome() {
  const q = $('#home-q').value.trim();
  const box = $('#home-list');
  if (q) {
    const found = L.searchStations(q, state.idx, 25);
    box.replaceChildren(found.length
      ? el('ul', { class: 'results' }, found.map((s) => el('li', {}, stationLink(s,
        el('span', { class: 'l', text: [...state.idx.linesOf(s.id)].map((n) => n.split('-').pop()).map(L.titleCase).join(' · ') })))))
      : el('p', { class: 'empty', text: 'Nessuna stazione trovata.' }));
    return;
  }
  const groups = [
    ['Circumvesuviana', state.idx.catalogo.linee.filter((l) => CIRCUMVESUVIANA.has(l.id))],
    ['Cumana, Circumflegrea e Linea 7', state.idx.catalogo.linee.filter((l) => !CIRCUMVESUVIANA.has(l.id))],
  ];
  box.replaceChildren(...groups.map(([title, lines]) => el('div', { class: 'group' },
    el('h2', { text: title }),
    lines.map((l) => el('details', { class: 'linegroup' },
      el('summary', {}, dotFor(l.nome), el('span', { text: lineLabel(l) }), el('span', { class: 'n', text: l.stazioni.length + ' stazioni' })),
      el('ul', { class: 'stlist' }, l.stazioni.map((id) => state.idx.byId.get(id)).filter(Boolean)
        .map((s) => el('li', {}, stationLink(s)))))))));
}

// ---------- tabellone: comandi ----------

function setupBoardControls() {
  $('#back').addEventListener('click', (e) => { e.preventDefault(); navigate(''); });
  $('#tipo-P').addEventListener('click', () => setTipo('P'));
  $('#tipo-A').addEventListener('click', () => setTipo('A'));
  $('#solo').addEventListener('change', (e) => { state.solo = e.target.checked; renderRows(true); });
  $('#more').addEventListener('click', () => { state.showAll = true; renderRows(true); });
  $('#vai-clear').addEventListener('click', () => { setVai(null); $('#vai').focus(); });

  const input = $('#vai'), list = $('#vai-list');
  let items = [], active = -1;
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; input.removeAttribute('aria-activedescendant'); };
  const highlight = () => {
    [...list.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
    if (active >= 0) input.setAttribute('aria-activedescendant', 'vai-o' + active);
  };
  const choose = (s) => { setVai(s.id); close(); };
  input.addEventListener('input', () => {
    if (!input.value.trim()) { if (state.vai) setVai(null); close(); return; }
    items = L.searchStations(input.value, state.idx, 8).filter((s) => s.id !== state.station);
    list.replaceChildren(...items.map((s, i) => el('li', { id: 'vai-o' + i, role: 'option', 'aria-selected': 'false',
      onpointerdown: (e) => { e.preventDefault(); choose(s); } },
    el('span', { class: 'dots' }, [...state.idx.linesOf(s.id)].map(dotFor)), el('span', { text: L.titleCase(s.nome) }))));
    list.hidden = !items.length;
    input.setAttribute('aria-expanded', String(items.length > 0));
    active = items.length ? 0 : -1; highlight();
  });
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { active = (active + 1) % items.length; highlight(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = (active - 1 + items.length) % items.length; highlight(); e.preventDefault(); }
    else if (e.key === 'Enter' && active >= 0) { choose(items[active]); e.preventDefault(); }
    else if (e.key === 'Escape') { close(); }
  });
  input.addEventListener('blur', close);
}

function setTipo(t) {
  if (state.tipo === t) return;
  state.tipo = t;
  state.board = null; state.rows = []; state.filtro = null; state.showAll = false;
  syncUrl(); renderHeader(); renderRows(true); refresh();
}

function setVai(id) {
  state.vai = id;
  $('#vai').value = id ? L.titleCase(state.idx.byId.get(id).nome) : '';
  annotate(); syncUrl(); renderHeader(); renderRows(true);
}

// ---------- tabellone: dati ----------

function showBoard(id, tipo, vai) {
  stopUpdates();
  Object.assign(state, { station: id, tipo, board: null, rows: [], filtro: null, showAll: false,
    error: null, backoff: 0, paused: false, fetchedAt: null, renderedKey: '', open: new Set(), lastActivity: Date.now() });
  state.vai = vai && state.idx.byId.has(vai) && vai !== id ? vai : null;
  state.solo = false; $('#solo').checked = false;
  $('#vai').value = state.vai ? L.titleCase(state.idx.byId.get(state.vai).nome) : '';
  $('#home').hidden = true;
  $('#board').hidden = false;
  syncUrl(); renderHeader(); renderRows(true); tickClock();
  refresh();
}

function stopUpdates() {
  clearTimeout(state.timer);
  if (state.ctrl) state.ctrl.abort();
}

async function refresh() {
  clearTimeout(state.timer);
  if (state.ctrl) state.ctrl.abort();
  const ctrl = new AbortController();
  state.ctrl = ctrl;
  const key = state.station + '|' + state.tipo;
  const timeout = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(API + '/?stazione=' + encodeURIComponent(state.station) + '&tipo=' + state.tipo, { signal: ctrl.signal });
    if (res.status === 404) throw Object.assign(new Error('Stazione non riconosciuta dal servizio.'), { fatal: true });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const board = L.sanitizeBoard(await res.json());
    if (!board) throw new Error('Risposta non valida');
    if (ctrl !== state.ctrl || key !== state.station + '|' + state.tipo) return; // sostituita da una richiesta piu' recente
    state.board = board; state.error = null; state.backoff = 0; state.fetchedAt = Date.now(); state.version++;
    state.rows = board.trains.map((t) => ({ t, inf: L.inferService(t, state.station, state.idx, CFG), match: null }));
    annotate();
  } catch (e) {
    if (ctrl !== state.ctrl || key !== state.station + '|' + state.tipo) return; // annullata di proposito
    state.error = { fatal: !!e.fatal, msg: e.name === 'AbortError' ? 'Il servizio non risponde.' : (e.fatal ? e.message : 'Servizio non raggiungibile.') };
    state.backoff = Math.min(state.backoff + 1, 4);
  } finally {
    clearTimeout(timeout);
  }
  renderHeader(); renderRows(true); schedule();
}

function annotate() {
  for (const r of state.rows) {
    r.match = state.vai && state.tipo === 'P' ? L.goesTo(r.t, state.station, state.vai, state.idx, r.inf.lines) : null;
  }
}

// ---------- aggiornamento adattivo ----------

function schedule() {
  clearTimeout(state.timer);
  state.intervalMs = null;
  if (state.paused || document.hidden || !state.station || (state.error && state.error.fatal)) { renderStatus(); return; }
  const ms = state.error
    ? [15, 30, 60, 60, 120][state.backoff] * 1000
    : L.nextRefreshMs(state.board ? state.board.trains : [], L.romeNow().min);
  state.intervalMs = ms;
  state.timer = setTimeout(() => {
    if (!state.kiosk && Date.now() - state.lastActivity > INATTIVITA_MS) { state.paused = true; renderStatus(); return; }
    refresh();
  }, ms);
  renderStatus();
}

function onActivity() {
  state.lastActivity = Date.now();
  if (state.paused && state.station && !$('#board').hidden) resume();
}
function resume() { if (!state.paused) return; state.paused = false; state.lastActivity = Date.now(); refresh(); }

function onVisibility() {
  if (!state.station || $('#board').hidden) return;
  if (document.hidden) { clearTimeout(state.timer); return; }
  if (!state.paused) {
    const age = Date.now() - (state.fetchedAt || 0);
    if (age >= 10000) refresh(); else schedule();
  }
}

// ---------- disegno del tabellone ----------

function tickClock() {
  if ($('#board').hidden) return;
  const n = L.romeNow();
  $('#clock').replaceChildren(L.pad2(n.h) + ':' + L.pad2(n.m), el('small', { text: ':' + L.pad2(n.s) }));
  renderRows(false); // ridisegna solo se e' cambiato il minuto o i dati
}

function renderHeader() {
  const s = state.idx.byId.get(state.station);
  const name = L.titleCase(s.nome);
  $('#station-name').textContent = name;
  $('#sub').textContent = state.tipo === 'P' ? 'Partenze / Departures' : 'Arrivi / Arrivals';
  document.title = name + ' · ' + (state.tipo === 'P' ? 'Partenze' : 'Arrivi') + ' · EAV ogliaEAspettà';
  $('#tipo-P').setAttribute('aria-pressed', String(state.tipo === 'P'));
  $('#tipo-A').setAttribute('aria-pressed', String(state.tipo === 'A'));
  const vaiOk = state.tipo === 'P';
  $('#vai').disabled = !vaiOk;
  $('#vai').title = vaiOk ? '' : 'Disponibile solo per le partenze';
  $('#vai-clear').hidden = !state.vai;
  $('#solo-wrap').hidden = !state.vai || !vaiOk;
  renderStatus();
}

function renderRows(force) {
  const now = L.romeNow();
  const key = [state.version, state.tipo, state.filtro, state.vai, state.solo, state.showAll, state.error ? 1 : 0,
    state.open.size, Math.floor(now.min)].join('|');
  if (!force && key === state.renderedKey) return;
  state.renderedKey = key;

  const focusedNum = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.num : null;
  const listEl = $('#rows');

  // chip delle linee presenti nel tabellone (solo quelle riconosciute)
  const present = Object.keys(SERVIZI).filter((k) => state.rows.some((r) => r.inf.service === k));
  $('#routes').replaceChildren(...(present.length > 1 ? present.map((k) => {
    const svc = SERVIZI[k];
    return el('button', { type: 'button', class: 'chip s-' + svc.css + (svc.strisce ? ' strisce' : '') + (svc.arcobaleno ? ' arcobaleno' : ''),
      'aria-pressed': String(state.filtro === k), text: svc.nome,
      onclick: () => { state.filtro = state.filtro === k ? null : k; renderRows(true); } });
  }) : []));

  let rows = state.rows.filter((r) => !state.filtro || r.inf.service === state.filtro);
  if (state.vai && state.solo) rows = rows.filter((r) => r.match !== 'no');
  const limit = state.showAll || state.vai ? rows.length : RIGHE_INIZIALI;
  const shown = rows.slice(0, limit);

  const out = [];
  let prevDay = 0;
  for (const r of shown) {
    if (r.t.day > prevDay) { out.push(el('li', { class: 'sep', text: L.dayLabel(r.t.day) })); prevDay = r.t.day; }
    out.push(rowEl(r, now));
  }
  if (!out.length) out.push(el('li', { class: 'empty', text: emptyMessage() }));
  listEl.replaceChildren(...out);

  const hidden = rows.length - shown.length;
  const more = $('#more');
  more.hidden = hidden <= 0;
  more.textContent = 'Mostra altri ' + hidden + ' treni';

  // avviso: treni soppressi, altrimenti il messaggio di EAV
  const cancelled = state.rows.filter((r) => r.t.cancelled);
  const tk = $('#ticker');
  const msg = cancelled.length
    ? cancelled.map((r) => 'Treno ' + r.t.num + ' per ' + L.titleCase(r.t.dest) + ' delle ' + r.t.time + ' soppresso').join('   ·   ') + '   /   Cancelled'
    : (state.board && state.board.notice) || '';
  tk.hidden = !msg; tk.textContent = msg; tk.classList.toggle('alert', cancelled.length > 0);

  fitStops();

  if (focusedNum) {
    const again = listEl.querySelector('[data-num="' + CSS.escape(focusedNum) + '"]');
    if (again) again.focus({ preventScroll: true });
  }
}

// Le fermate che non ci stanno in una riga scorrono avanti e indietro (come il testo scorrevole del sito EAV).
function fitStops() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  requestAnimationFrame(() => {
    for (const box of document.querySelectorAll('#rows .stops')) {
      const over = box.scrollWidth - box.clientWidth;
      box.classList.toggle('scroll', over > 4);
      if (over > 4) {
        box.style.setProperty('--shift', -over + 'px');
        box.style.setProperty('--dur', Math.max(8, over / 30 + 4).toFixed(1) + 's');
      }
    }
  });
}

function emptyMessage() {
  if (!state.board) return state.error ? 'Nessun dato disponibile.' : 'Carico i treni…';
  if (state.rows.length) return state.vai && state.solo ? 'Nessun treno di questo elenco arriva lì.' : 'Nessun treno per questa linea.';
  const s = state.idx.byId.get(state.station);
  return s && s.dati === false
    ? 'EAV non mostra treni per questa stazione in questo momento. Alcune stazioni non hanno dati la sera: riprova domani mattina.'
    : 'EAV non mostra treni per questa stazione in questo momento.';
}

function rowEl(r, now) {
  const { t, inf, match } = r;
  const svc = inf.service ? SERVIZI[inf.service] : null;
  const st = L.statusOf(t, now.min);
  const eta = L.etaMin(t, now.min);
  const isOpen = state.open.has(t.num);
  const lineSvc = inf.lineService ? SERVIZI[inf.lineService] : null;
  const cls = ['row', 's-' + (svc ? svc.css : 'neu'), svc && svc.strisce && 'strisce', svc && svc.arcobaleno && 'arcobaleno', t.cancelled && 'cancel',
    match === 'si' && 'hit', match === 'no' && 'dim', st.cls === 'go' && 'soon'].filter(Boolean).join(' ');

  const stopsText = t.stops.map((s) => L.titleCase(s.name)).join(', ');
  const target = state.vai && match !== 'no' && match !== null ? state.vai : null;
  const targetStop = target ? t.stops.find((s) => state.idx.resolve(s.name) === target) : null;
  const inline = st.main ? st.main + (eta !== null && st.cls !== 'go' && !t.cancelled ? ' · tra ' + eta + ' min' : '') : '';

  const li = el('li', { class: cls, 'data-num': t.num, tabindex: t.stops.length ? '0' : null,
    title: t.stops.length ? 'Tocca per vedere tutte le fermate' : null },
  el('div', { class: 'time' }, L.fmtHM(L.schedMin(t)),
    t.delay > 0 && !t.cancelled ? el('small', { text: 'prev. ' + L.fmtHM(L.expMin(t)) }) : null),
  el('div', {},
    el('div', { class: 'dest', text: L.titleCase(t.dest) }),
    el('div', { class: 'meta' },
      el('span', { class: 'tag', text: t.cat || '–' }),
      el('span', { text: 'Treno ' + t.num }),
      svc ? el('span', { class: 'svc' + (svc.arcobaleno ? ' plain' : ''),
        text: svc.nome + (svc.arcobaleno && lineSvc ? ' · ' + lineSvc.nome : '') }) : null,
      target ? el('span', { class: 'arrivo', text: '→ ' + L.titleCase(state.idx.byId.get(target).nome)
        + (targetStop ? ' ' + targetStop.time : match === 'forse' ? ' (probabile)' : '') }) : null,
      stopsText ? el('span', { class: 'stops' }, el('span', { class: 'stops-in', text: 'Ferma a: ' + stopsText })) : null),
    inline ? el('div', { class: 'st-inline st ' + st.cls, text: inline }) : null),
  el('div', { class: 'plat' + (t.platform ? '' : ' none'), 'aria-label': 'Binario', text: t.platform || '–' }),
  el('div', { class: 'col-st st ' + st.cls }, st.main, st.sub ? el('small', { text: st.sub }) : null),
  el('div', { class: 'col-eta eta' }, eta !== null && !t.cancelled ? [String(eta), el('small', { text: 'min' })] : null));

  if (t.stops.length) {
    const full = () => el('p', { class: 'stops-full', text: 'Ferma a: ' + t.stops.map((s) => L.titleCase(s.name) + ' ' + s.time).join(' · ') });
    if (isOpen) li.append(full());
    const toggle = () => { if (state.open.has(t.num)) state.open.delete(t.num); else state.open.add(t.num); renderRows(true); };
    li.addEventListener('click', toggle);
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  }
  return li;
}

function renderStatus() {
  const box = $('#status');
  if ($('#board').hidden) return;
  const parts = [];
  if (state.fetchedAt) {
    const t = L.romeNow(new Date(state.fetchedAt));
    parts.push(el('span', { text: 'Aggiornato alle ' + L.pad2(t.h) + ':' + L.pad2(t.m) + ':' + L.pad2(t.s) }));
  }
  if (state.board && state.board.stale) parts.push(el('span', { class: 'warn', text: 'EAV non risponde: dati non aggiornati' }));
  if (state.error) {
    parts.push(el('span', { class: 'err', text: state.error.msg + (state.error.fatal ? '' : ' Riprovo a breve.') }));
  }
  if (state.paused) {
    parts.push(el('span', { class: 'warn', text: 'Aggiornamento in pausa per inattività.' }),
      el('button', { type: 'button', class: 'btn', onclick: resume, text: 'Riprendi' }));
  } else if (state.intervalMs && !state.error) {
    parts.push(el('span', { text: 'Prossimo aggiornamento tra circa ' + Math.round(state.intervalMs / 1000) + ' s' }));
  }
  box.replaceChildren(...parts);
}
