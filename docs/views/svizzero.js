// Aspetto "Svizzero": tipografia da manifesto. Orari enormi, filetti neri, colore solo dove serve (linea e ritardi).

import { el } from '../dom.js';
import { model, wire, withDays } from './_lib.js';

export const meta = { id: 'svizzero', paginate: true };

export function render(ctx) {
  const rows = withDays(ctx, (r) => rowEl(r, ctx), (t) => el('li', { class: 'sv-sep', text: t }));
  if (!rows.length) rows.push(el('li', { class: 'sv-empty', text: ctx.empty }));
  return el('div', { class: 'sv' },
    el('div', { class: 'sv-head', 'aria-hidden': 'true' },
      el('span', { text: 'Ora' }), el('span', { text: 'Destinazione' }), el('span', { text: 'Linea' }), el('span', { text: 'Binario' }), el('span', { text: 'Stato' })),
    el('ul', { class: 'sv-list' }, rows));
}

function rowEl(r, ctx) {
  const m = model(r, ctx);
  const { t } = m;
  const li = el('li', { class: 'sv-row ' + m.cls, 'data-num': t.num },
    el('div', { class: 'sv-time strike' }, m.time, m.prev ? el('small', { text: '→ ' + m.prev }) : null),
    el('div', { class: 'sv-dest' },
      el('span', { class: 'strike', text: m.dest }),
      el('small', { text: t.cat + ' · ' + t.num + (m.targetText ? '   ' + m.targetText : '') })),
    el('div', { class: 'sv-line' }, el('i', { class: 'swatch' }), m.svcName || '—'),
    el('div', { class: 'sv-plat', 'aria-label': 'Binario', text: t.platform || '' }),
    el('div', { class: 'sv-st st ' + m.st.cls, text: m.st.main + (m.eta !== null && m.st.cls !== 'go' && !t.cancelled ? ' · ' + m.eta + '′' : '') }));
  if (wire(li, t, ctx)) li.append(el('p', { class: 'sv-stops', text: m.stopsFull }));
  return li;
}
