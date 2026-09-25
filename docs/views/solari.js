// Aspetto "Solari": tabellone a palette meccaniche. Ogni carattere e' una tessera; quando il testo cambia
// (o alla prima apertura) le tessere interessate "girano".

import { el } from '../dom.js';
import * as L from '../logic.js';
import { SERVIZI } from '../config.js';

export const meta = { id: 'solari', paginate: true, fantasmi: true };

let ns = '';              // stazione+tipo: se cambia si riparte da zero e girano tutte le tessere
const shown = new Map();  // campo -> testo mostrato l'ultima volta (per far girare solo cio' che cambia)

function tiles(key, text, len, cls) {
  const s = String(text || '').toUpperCase().slice(0, len).padEnd(len, ' ');
  const old = shown.get(key);
  shown.set(key, s);
  const box = el('span', { class: 'sl-f ' + cls, role: 'img', 'aria-label': String(text || '') });
  for (let i = 0; i < len; i++) {
    const changed = old === undefined || old[i] !== s[i];
    box.append(el('span', {
      class: 'ch' + (changed ? ' flip' : ''), 'aria-hidden': 'true', text: s[i] === ' ' ? '' : s[i],
      style: changed ? '--d:' + (i * 16 + (old === undefined ? Math.round(Math.random() * 260) : 0)) + 'ms' : null,
    }));
  }
  return box;
}

function statusText(t, st) {
  if (t.fantasma) return 'PREVISTO';
  if (t.cancelled) return 'SOPPRESSO';
  if (st.cls === 'go') return 'IN PARTENZA';
  if (t.delay === null) return 'IN RITARDO';
  if (t.delay > 0) return 'RIT +' + t.delay + ' MIN';
  if (st.cls === 'gone') return 'SUPERATO';
  return t.day === 0 ? 'IN ORARIO' : '';
}

export function render(ctx) {
  const key = ctx.station + '|' + ctx.tipo;
  if (key !== ns) { ns = key; shown.clear(); }

  const rows = [];
  let prevDay = 0;
  for (const r of ctx.rows) {
    if (r.t.day > prevDay) { rows.push(el('li', { class: 'sl-sep', text: L.dayLabel(r.t.day) })); prevDay = r.t.day; }
    rows.push(rowEl(r, ctx));
  }
  if (!rows.length) rows.push(el('li', { class: 'sl-empty', text: ctx.empty }));

  const h = (a) => el('span', { text: a });
  return el('div', { class: 'sl' },
    el('div', { class: 'sl-head', 'aria-hidden': 'true' }, h('ORA'), h('CAT'), h('DESTINAZIONE'), h('BIN'), h('STATO')),
    el('ul', { class: 'sl-list' }, rows));
}

function rowEl(r, ctx) {
  const { t, inf, match } = r;
  const svc = inf.service ? SERVIZI[inf.service] : null;
  const st = L.statusOf(t, ctx.now.min);
  const k = (f) => t.num + '|' + f;
  const target = ctx.vai && match !== 'no' && match !== null ? ctx.vai : null;
  const targetStop = target ? t.stops.find((s) => ctx.idx.resolve(s.name) === target) : null;
  const cls = ['sl-row', 's-' + (svc ? svc.css : 'neu'), svc && svc.strisce && 'strisce', svc && svc.arcobaleno && 'arcobaleno',
    t.cancelled && 'cancel', t.fantasma && 'ghost', match === 'si' && 'hit', match === 'no' && 'dim', 'st-' + st.cls].filter(Boolean).join(' ');

  const li = el('li', { class: cls, 'data-num': t.num, tabindex: t.stops.length ? '0' : null },
    el('span', { class: 'sl-bar', 'aria-hidden': 'true' }),
    tiles(k('h'), L.fmtHM(L.schedMin(t)), 5, 'sl-time'),
    tiles(k('c'), t.cat, 3, 'sl-cat'),
    tiles(k('d'), t.dest, 20, 'sl-dest'),
    tiles(k('p'), t.platform, 2, 'sl-plat'),
    tiles(k('s'), statusText(t, st), 11, 'sl-st'));

  if (t.fantasma) li.append(el('p', { class: 'sl-note', text: 'Previsto, non in elenco' }));
  if (target) {
    li.append(el('p', { class: 'sl-note', text: (ctx.tipo === 'A' ? '← ' : '→ ') + L.titleCase(ctx.idx.byId.get(target).nome)
      + (targetStop ? ' ' + targetStop.time : match === 'forse' ? ' (probabile)' : '') }));
  }
  if (t.stops.length) {
    if (ctx.open.has(t.num)) li.append(el('p', { class: 'sl-note', text: 'Ferma a: ' + t.stops.map((s) => L.titleCase(s.name) + ' ' + s.time).join(' · ') }));
    const toggle = () => ctx.toggle(t.num);
    li.addEventListener('click', toggle);
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  }
  return li;
}
