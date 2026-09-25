// Base dei "tabelloni a schermo intero": stili AGGIUNTIVI, autonomi, che non toccano nulla dell'app.
// Ogni tabellone copre da solo lo schermo (position: fixed), disegna sempre lo stesso numero di righe
// (15, 18, 20 o 25; le mancanti sono vuote), mostra solo i primi treni, senza pagine e senza scorrere.
// Le dimensioni le decide il CSS dall'altezza e dalla larghezza dello schermo (unita' del contenitore).

import { el } from '../dom.js';
import * as L from '../logic.js';
import { model } from './_lib.js';

export const OPZIONI = [15, 18, 20, 25];
export const PREDEFINITE = 18;
const CHIAVE = 'tabellone_righe';

export function righe() {
  try { const v = parseInt(localStorage.getItem(CHIAVE), 10); return OPZIONI.includes(v) ? v : PREDEFINITE; } catch { return PREDEFINITE; }
}
function salvaRighe(n) { try { localStorage.setItem(CHIAVE, String(n)); } catch { /* memoria del browser non disponibile */ } }

// Esattamente n voci: i primi treni, poi null per le righe vuote.
export function slots(rows, n) {
  const out = rows.slice(0, n);
  while (out.length < n) out.push(null);
  return out;
}

// Stato in poche lettere maiuscole, per i tabelloni con colonna stretta.
export function statoBreve(m) {
  const { t, st } = m;
  if (t.cancelled) return 'SOPPRESSO';
  if (st.cls === 'go') return 'IN PARTENZA';
  if (t.delay === null) return 'IN RITARDO';
  if (t.delay > 0) return 'RIT +' + t.delay + ' MIN';
  if (st.cls === 'gone') return 'SUPERATO';
  return t.day === 0 || st.cls === 'ok' ? 'IN ORARIO' : '';
}

// Una cella della riga: `col` = { cls, label, hn } (hn = nascosta sugli schermi stretti).
export const cell = (col, ...kids) => el('span', { class: col.cls + (col.hn ? ' hn' : '') }, ...kids);

// Il CSS comune si carica da solo (quello dello stile lo carica l'app).
if (typeof document !== 'undefined' && !document.querySelector('link[data-ui-css="_tab"]')) {
  document.head.append(el('link', { rel: 'stylesheet', href: 'views/_tab.css', 'data-ui-css': '_tab' }));
}

let last = null, ctl = null, clockTimer = null;
const pad = (n) => String(n).padStart(2, '0');

// cfg: { id, cols: [{cls, label, hn?}], cells(m, ctx) -> nodi (uno per colonna) }
export function renderTabellone(ctx, cfg) {
  last = { ctx, cfg };
  ensureControls();
  ensureClock();
  syncControls();
  return build(ctx, cfg);
}

function build(ctx, cfg) {
  const n = righe();
  const items = slots(ctx.rows, n);
  const nome = L.titleCase(ctx.idx.byId.get(ctx.station).nome);
  const filtro = document.querySelector('#routes .chip[aria-pressed="true"]');
  const cancellati = ctx.all.filter((r) => r.t.cancelled);
  const upd = [...document.querySelectorAll('#status span')].find((s) => /^Aggiornato/.test(s.textContent));
  const avvisi = [...document.querySelectorAll('#status .err, #status .warn')].map((s) => s.textContent).join('  ');

  const rowEl = (r) => {
    const m = model(r, ctx);
    return el('li', { class: 'tb-row ' + m.cls, 'data-num': m.t.num }, el('div', { class: 'tb-in' }, cfg.cells(m, ctx)));
  };
  const blank = () => el('li', { class: 'tb-row blank', 'aria-hidden': 'true' },
    el('div', { class: 'tb-in' }, cfg.cols.map((c) => cell(c))));

  const now = L.romeNow();
  return el('div', { class: 'tb tb-' + cfg.id, style: '--n:' + n, role: 'region', 'aria-label': (ctx.tipo === 'P' ? 'Partenze' : 'Arrivi') + ' a ' + nome },
    el('header', { class: 'tb-head' },
      el('div', { class: 'tb-title' },
        el('h2', { text: nome }),
        el('span', { class: 'tb-sub', text: ctx.tipo === 'P' ? 'Partenze / Departures' : 'Arrivi / Arrivals' }),
        filtro ? el('button', { type: 'button', class: 'tb-tag', title: 'Togli il filtro', onclick: () => filtro.click(), text: 'Solo ' + filtro.textContent + ' ✕' }) : null,
        ctx.vai ? el('button', { type: 'button', class: 'tb-tag', title: 'Togli l\'evidenziazione', onclick: () => document.querySelector('#vai-clear').click(),
          text: '→ ' + L.titleCase(ctx.idx.byId.get(ctx.vai).nome) + ' ✕' }) : null),
      el('div', { class: 'tb-clock', 'aria-hidden': 'true', text: pad(now.h) + ':' + pad(now.m) + ':' + pad(now.s) })),
    el('div', { class: 'tb-colswrap', 'aria-hidden': 'true' }, el('div', { class: 'tb-cols' }, cfg.cols.map((c) => cell(c, c.label || '')))),
    el('ol', { class: 'tb-rows' }, items.map((r) => (r ? rowEl(r) : blank()))),
    el('footer', { class: 'tb-foot' },
      cancellati.length ? el('div', { class: 'tb-alert', text: cancellati.map((r) => 'Treno ' + r.t.num + ' per ' + L.titleCase(r.t.dest) + ' delle ' + r.t.time + ' soppresso').join('   ·   ') + '   /   Cancelled' }) : null,
      el('span', { class: 'tb-upd', text: upd ? upd.textContent : '' }),
      avvisi ? el('span', { class: 'tb-warn', text: avvisi }) : null));
}

// L'orologio si aggiorna da solo ogni secondo (l'app ridisegna le righe solo ogni minuto o a ogni dato nuovo).
function ensureClock() {
  if (clockTimer) return;
  clockTimer = setInterval(() => {
    const c = document.querySelectorAll('.tb-clock');
    if (!c.length) return;
    const t = L.romeNow();
    const s = pad(t.h) + ':' + pad(t.m) + ':' + pad(t.s);
    c.forEach((e) => { e.textContent = s; });
  }, 1000);
}

// Comandi flottanti, fuori dall'area ridisegnata: restano al loro posto (e aperti) anche quando arrivano dati nuovi.
function core() { return document.querySelector('#board [data-ui-select]'); }
// L'evento si crea con la finestra del documento: cosi' funziona in qualunque ambiente.
function cambiaAspetto(id) { const s = core(); if (s) { s.value = id; s.dispatchEvent(new s.ownerDocument.defaultView.Event('change')); } }

function ensureControls() {
  if (ctl && ctl.isConnected) return;
  const panel = el('div', { class: 'tb-panel', id: 'tb-panel', hidden: true },
    el('label', {}, 'Righe', el('select', { id: 'tb-righe', onchange: (e) => {
      salvaRighe(+e.target.value);
      const root = document.querySelector('.tb');
      if (root && last) root.replaceWith(build(last.ctx, last.cfg));
    } })),
    el('label', {}, 'Aspetto', el('select', { id: 'tb-aspetto', onchange: (e) => cambiaAspetto(e.target.value) })),
    el('button', { type: 'button', class: 'tb-btn', onclick: () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    }, text: 'Schermo intero' }),
    el('button', { type: 'button', class: 'tb-btn', onclick: () => { const b = document.querySelector('#back'); if (b) b.click(); }, text: 'Cambia stazione' }),
    el('button', { type: 'button', class: 'tb-btn', onclick: () => cambiaAspetto('classico'), text: 'Esci dal tabellone' }));
  const gear = el('button', { type: 'button', class: 'tb-gear', 'aria-label': 'Impostazioni del tabellone', 'aria-expanded': 'false', 'aria-controls': 'tb-panel',
    onclick: () => { const open = panel.hidden; panel.hidden = !open; gear.setAttribute('aria-expanded', String(open)); } }, '⚙');
  ctl = el('div', { class: 'tb-ctl' }, panel, gear);
  document.body.append(ctl);
}

function syncControls() {
  const r = document.querySelector('#tb-righe');
  if (r) { r.replaceChildren(...OPZIONI.map((n) => el('option', { value: String(n), text: n + ' righe' }))); r.value = String(righe()); }
  const a = document.querySelector('#tb-aspetto'), c = core();
  if (a && c && !a.options.length) {
    a.replaceChildren(...[...c.querySelectorAll('option')].map((o) => el('option', { value: o.value, text: o.textContent })));
  }
  if (a) a.value = document.documentElement.getAttribute('data-ui') || '';
}
