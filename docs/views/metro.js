// Aspetto "Metropolitana": segnaletica da metro. Cerchio di linea, destinazione in grassetto, minuti in grande a destra.

import { el } from '../dom.js';
import { model, wire, withDays } from './_lib.js';

export const meta = { id: 'metro', paginate: true };

export function render(ctx) {
  const rows = withDays(ctx, (r) => rowEl(r, ctx), (t) => el('li', { class: 'mt-sep', text: t }));
  if (!rows.length) rows.push(el('li', { class: 'mt-empty', text: ctx.empty }));
  return el('ul', { class: 'mt-list' }, rows);
}

function rowEl(r, ctx) {
  const m = model(r, ctx);
  const { t } = m;
  const big = m.eta !== null && !t.cancelled
    ? [el('strong', { text: String(m.eta) }), el('span', { text: 'min' })]
    : [el('strong', { class: 'far', text: m.time }), el('span', { text: t.day > 0 ? 'domani' : '' })];
  const li = el('li', { class: 'mt-row ' + m.cls, 'data-num': t.num },
    el('span', { class: 'mt-bullet swatch', 'aria-label': m.svcName || 'Linea non riconosciuta' },
      el('b', { text: m.lineId ? m.lineId.replace(/^L/, '') : '•' })),
    el('div', { class: 'mt-main' },
      el('div', { class: 'mt-dest strike', text: m.dest }),
      el('div', { class: 'mt-sub' },
        el('span', { class: 'mt-tag', text: t.cat || '–' }),
        el('span', { text: 'Treno ' + t.num + (m.svcName ? ' · ' + m.svcName : '') }),
        m.st.main ? el('span', { class: 'mt-st st ' + m.st.cls, text: m.st.main }) : null,
        m.prev ? el('span', { text: 'previsto ' + m.prev }) : null),
      m.targetText ? el('div', { class: 'mt-target', text: m.targetText }) : null),
    el('div', { class: 'mt-eta' }, big),
    el('div', { class: 'mt-plat' + (t.platform ? '' : ' none'), 'aria-label': 'Binario', text: t.platform || '–' }));
  if (wire(li, t, ctx)) li.append(el('p', { class: 'mt-stops', text: 'Ferma a: ' + m.stopsFull }));
  return li;
}
