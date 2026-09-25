// Aspetto "Aeroporto": blu notte e giallo, righe a fasce alterne, come i tabelloni degli aeroporti.

import { el } from '../dom.js';
import { model, wire, withDays } from './_lib.js';

export const meta = { id: 'aeroporto', paginate: true, fantasmi: true };

function statusText(m) {
  if (m.t.fantasma) return 'PREVISTO';
  if (m.t.cancelled) return 'SOPPRESSO';
  if (m.st.cls === 'go') return 'IN PARTENZA';
  if (m.t.delay === null) return 'IN RITARDO';
  if (m.t.delay > 0) return 'RITARDO +' + m.t.delay;
  return m.t.day === 0 ? 'IN ORARIO' : '';
}

export function render(ctx) {
  const rows = withDays(ctx, (r) => rowEl(r, ctx), (t) => el('li', { class: 'ap-sep', text: t }));
  if (!rows.length) rows.push(el('li', { class: 'ap-empty', text: ctx.empty }));
  const h = (a, b) => el('span', {}, a, el('i', { text: b }));
  return el('div', { class: 'ap' },
    el('div', { class: 'ap-head', 'aria-hidden': 'true' }, h('ORA', 'Time'), h('DESTINAZIONE', 'Destination'), h('LINEA', 'Line'), h('BINARIO', 'Platform'), h('STATO', 'Status')),
    el('ul', { class: 'ap-list' }, rows));
}

function rowEl(r, ctx) {
  const m = model(r, ctx);
  const { t } = m;
  const li = el('li', { class: 'ap-row ' + m.cls, 'data-num': t.num },
    el('span', { class: 'ap-time strike', text: m.time }),
    el('span', { class: 'ap-dest strike' }, m.dest.toUpperCase(), m.t.fantasma ? el('small', { text: 'Previsto, non in elenco' }) : m.targetText ? el('small', { text: m.targetText }) : null),
    el('span', { class: 'ap-line' }, el('i', { class: 'swatch' }), el('span', { text: m.svcName || '—' })),
    el('span', { class: 'ap-plat' + (t.platform ? '' : ' none'), 'aria-label': 'Binario', text: t.platform || '' }),
    el('span', { class: 'ap-st st ' + m.st.cls, text: statusText(m) }));
  if (wire(li, t, ctx)) li.append(el('p', { class: 'ap-stops', text: 'Ferma a: ' + m.stopsFull }));
  return li;
}
