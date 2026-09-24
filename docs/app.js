// Tabellone EAV: interfaccia. La logica pura sta in logic.js, la configurazione in config.js.
// Regola di sicurezza: i dati del Worker entrano nella pagina SOLO come testo (textContent), mai come HTML.

import { API, SERVIZI, LINEA_SERVIZIO, CFG, RIGHE_INIZIALI, INATTIVITA_MS, UI_LISTA } from './config.js';
import * as L from './logic.js';
import { $, el, safeStore } from './dom.js';

const state = {
  idx: null,
  station: null, tipo: 'P', vai: null, solo: false,
  filtro: null, showAll: false,
  board: null, rows: [], version: 0, fetchedAt: null, error: null, backoff: 0,
  paused: false, lastActivity: Date.now(), kiosk: false,
  timer: null, ctrl: null, renderedKey: '', open: new Set(), intervalMs: null,
  ui: 'classico', view: null, // aspetto grafico attivo e suo modulo (views/<id>.js)
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
  document.querySelectorAll('[data-ui-select]').forEach((sel) => {
    const gruppi = [...new Set(UI_LISTA.map((u) => u.gruppo))];
    sel.replaceChildren(...gruppi.map((g) => el('optgroup', { label: g },
      UI_LISTA.filter((u) => u.gruppo === g).map((u) => el('option', { value: u.id, text: u.nome, title: u.desc })))));
    sel.addEventListener('change', () => { safeStore.set('ui', sel.value); loadUi(sel.value); });
  });
  await loadUi(new URLSearchParams(location.search).get('ui') || safeStore.get('ui'));
  $('#home-q').addEventListener('input', renderHome);
  setupBoardControls();
  for (const ev of ['pointerdown', 'keydown', 'touchstart', 'wheel']) {
    addEventListener(ev, onActivity, { passive: true });
  }
  document.addEventListener('visibilitychange', onVisibility);
  addEventListener('popstate', route);
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => state.view && state.view.after && state.view.after($('#view')), 150); });
  setInterval(tickClock, 1000);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => state.view && state.view.after && state.view.after($('#view')));
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
  const u = p.get('ui');
  if (u && u !== state.ui && UI_LISTA.some((x) => x.id === u)) loadUi(u);
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
  if (state.ui !== 'classico') p.set('ui', state.ui);
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
  if (!state.view) return; // la vista si sta ancora caricando: loadUi() ridisegna appena pronta
  const now = L.romeNow();
  const key = [state.ui, state.version, state.tipo, state.filtro, state.vai, state.solo, state.showAll, state.error ? 1 : 0,
    state.open.size, Math.floor(now.min)].join('|');
  if (!force && key === state.renderedKey) return;
  state.renderedKey = key;

  const view = $('#view');
  const focusedNum = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.num : null;

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
  // le viste a righe usano il limite; quelle che raggruppano (meta.paginate === false) ricevono tutto
  const shown = state.view.meta.paginate === false || state.showAll || state.vai ? rows : rows.slice(0, RIGHE_INIZIALI);

  // contesto per la vista: solo dati e azioni, nessuno stato interno dell'app
  const ctx = {
    rows: shown, all: rows, now, idx: state.idx, station: state.station, tipo: state.tipo, vai: state.vai,
    open: state.open, empty: emptyMessage(),
    toggle: (k) => { if (state.open.has(k)) state.open.delete(k); else state.open.add(k); renderRows(true); },
  };
  view.replaceChildren(state.view.render(ctx));

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

  if (state.view.after) state.view.after(view);

  if (focusedNum) {
    const again = view.querySelector('[data-num="' + CSS.escape(focusedNum) + '"]');
    if (again) again.focus({ preventScroll: true });
  }
}

// ---------- aspetto grafico ----------

async function loadUi(id) {
  if (!UI_LISTA.some((u) => u.id === id)) id = 'classico';
  try {
    const mod = await import('./views/' + id + '.js');
    for (const css of id === 'classico' ? [] : ['_common', id]) { // il CSS comune va prima di quello dell'aspetto
      if (!document.querySelector('link[data-ui-css="' + css + '"]')) {
        document.head.append(el('link', { rel: 'stylesheet', href: 'views/' + css + '.css', 'data-ui-css': css }));
      }
    }
    state.view = mod;
    state.ui = id;
  } catch (e) {
    console.error('Aspetto "' + id + '" non caricabile', e);
    if (id !== 'classico') return loadUi('classico');
    throw e;
  }
  document.documentElement.setAttribute('data-ui', id);
  document.querySelectorAll('[data-ui-select]').forEach((sel) => { sel.value = id; });
  state.renderedKey = '';
  if (state.station) { syncUrl(); renderRows(true); }
}

function emptyMessage() {
  if (!state.board) return state.error ? 'Nessun dato disponibile.' : 'Carico i treni…';
  if (state.rows.length) return state.vai && state.solo ? 'Nessun treno di questo elenco arriva lì.' : 'Nessun treno per questa linea.';
  const s = state.idx.byId.get(state.station);
  return s && s.dati === false
    ? 'EAV non mostra treni per questa stazione in questo momento. Alcune stazioni non hanno dati la sera: riprova domani mattina.'
    : 'EAV non mostra treni per questa stazione in questo momento.';
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
