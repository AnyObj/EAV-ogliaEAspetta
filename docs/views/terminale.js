// Aspetto "Terminale": monitor a fosfori verdi, solo testo a righe fisse, cursore che lampeggia.

import { el } from '../dom.js';
import * as L from '../logic.js';
import { model, wire } from './_lib.js';

export const meta = { id: 'terminale', paginate: true };

const CODICE = { sorrento: 'SOR', torre: 'TOR', poggiomarino: 'POG', sarno: 'SAR', baiano: 'BAI', pomigliano: 'POM',
  cumana: 'CUM', circumflegrea: 'CIR', l7: 'L7', napoli: 'NAP' };
const W = 50; // colonne
const up = (s, n) => String(s || '').toUpperCase().slice(0, n).padEnd(n, ' ');

function statusText(m) {
  if (m.t.cancelled) return 'SOPPRESSO';
  if (m.st.cls === 'go') return 'IN PARTENZA';
  if (m.t.delay === null) return 'IN RITARDO';
  if (m.t.delay > 0) return 'RIT +' + m.t.delay + ' MIN';
  if (m.st.cls === 'gone') return 'SUPERATO';
  return m.t.day === 0 ? 'IN ORARIO' : '';
}

export function render(ctx) {
  const name = ctx.idx.byId.get(ctx.station).nome;
  const line = (text, cls) => el('div', { class: 'tm-l' + (cls ? ' ' + cls : ''), text });
  const out = [
    line('EAV-OGLIA(E)ASPETTA v1.0  TERMINALE', 'tm-dim'),
    line('STAZIONE: ' + name.toUpperCase() + '  [' + (ctx.tipo === 'P' ? 'PARTENZE' : 'ARRIVI') + ']'),
    line('='.repeat(W), 'tm-dim'),
    line('ORA   CAT LIN DESTINAZIONE    BIN STATO', 'tm-head'),
    line('-'.repeat(W), 'tm-dim'),
  ];
  let prevDay = 0;
  for (const r of ctx.rows) {
    if (r.t.day > prevDay) { out.push(line('--- ' + L.dayLabel(r.t.day).split(' / ')[0] + ' ' + '-'.repeat(W - 8), 'tm-dim')); prevDay = r.t.day; }
    out.push(rowEl(r, ctx));
  }
  if (!ctx.rows.length) out.push(line('> ' + ctx.empty));
  out.push(line('-'.repeat(W), 'tm-dim'));
  out.push(el('div', { class: 'tm-l' }, '> ', el('span', { class: 'tm-cur', text: '█' })));
  return el('div', { class: 'tm' }, el('div', { class: 'tm-screen' }, out));
}

function rowEl(r, ctx) {
  const m = model(r, ctx);
  const { t } = m;
  const text = m.time + ' ' + up(t.cat, 3) + ' ' + up(CODICE[r.inf.service] || '---', 3) + ' ' + up(t.dest, 15) + ' ' + up(t.platform || '-', 3) + ' ' + statusText(m);
  const box = el('div', { class: 'tm-row ' + m.cls, 'data-num': t.num }, el('div', { class: 'tm-l', text: text.replace(/\s+$/, '') }));
  if (m.targetText) box.append(el('div', { class: 'tm-l tm-note', text: '    ' + m.targetText.toUpperCase() }));
  if (wire(box, t, ctx)) box.append(el('div', { class: 'tm-l tm-note tm-wrap', text: '    FERMA A: ' + m.stopsFull.toUpperCase() }));
  return box;
}
