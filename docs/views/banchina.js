// Aspetto "Banchina": il prossimo treno in grande in alto, poi l'elenco compatto. Nero e bianco, come le insegne moderne.

import { el } from '../dom.js';
import * as L from '../logic.js';
import { model, wire, withDays } from './_lib.js';

export const meta = { id: 'banchina', paginate: true, tabellone: true };

export function render(ctx) {
  if (!ctx.rows.length) return el('div', { class: 'bc' }, el('p', { class: 'bc-empty', text: ctx.empty }));
  const [first, ...rest] = ctx.rows;
  const restCtx = { ...ctx, rows: rest };
  const list = withDays(restCtx, (r) => rowEl(r, ctx), (t) => el('li', { class: 'bc-sep', text: t }));
  return el('div', { class: 'bc' }, hero(first, ctx), el('ul', { class: 'bc-list' }, list));
}

function hero(r, ctx) {
  const m = model(r, ctx);
  const { t } = m;
  const big = t.cancelled ? el('strong', { class: 'x', text: 'SOPPRESSO' })
    : m.eta !== null ? [el('strong', { text: String(m.eta) }), el('span', { text: 'min' })]
      : [el('strong', { class: 'far', text: m.time }), el('span', { text: t.day > 0 ? 'domani' : '' })];
  const node = el('section', { class: 'bc-hero ' + m.cls, 'data-num': t.num, 'aria-label': 'Prossimo treno' },
    el('span', { class: 'bc-band swatch', 'aria-hidden': 'true' }),
    el('div', { class: 'bc-main' },
      el('p', { class: 'bc-kicker', text: 'Prossimo treno · ' + m.time + (m.prev ? ' (previsto ' + m.prev + ')' : '') }),
      el('h2', { class: 'strike', text: m.dest }),
      el('p', { class: 'bc-sub', text: (m.svcName ? m.svcName + ' · ' : '') + (t.cat || '–') + ' · treno ' + t.num }),
      m.st.main ? el('p', { class: 'bc-st st ' + m.st.cls, text: m.st.main }) : null,
      m.targetText ? el('p', { class: 'bc-target', text: m.targetText }) : null,
      m.stopsText ? el('p', { class: 'bc-stops', text: 'Ferma a: ' + m.stopsText }) : null),
    el('div', { class: 'bc-eta' }, big),
    el('div', { class: 'bc-plat' + (t.platform ? '' : ' none'), 'aria-label': 'Binario' },
      el('small', { text: 'Binario' }), el('b', { text: t.platform || '–' })));
  return node;
}

function rowEl(r, ctx) {
  const m = model(r, ctx);
  const { t } = m;
  const li = el('li', { class: 'bc-row ' + m.cls, 'data-num': t.num },
    el('span', { class: 'bc-dot swatch', 'aria-hidden': 'true' }),
    el('span', { class: 'bc-t strike', text: m.time }),
    el('span', { class: 'bc-d strike' }, m.dest, m.targetText ? el('small', { text: m.targetText }) : null),
    el('span', { class: 'bc-p', text: t.platform ? 'bin. ' + t.platform : '' }),
    el('span', { class: 'bc-s st ' + m.st.cls, text: m.st.main ? m.st.main + (m.eta !== null && m.st.cls !== 'go' && !t.cancelled ? ' · ' + m.eta + '′' : '') : '' }));
  if (wire(li, t, ctx)) li.append(el('p', { class: 'bc-full', text: 'Ferma a: ' + m.stopsFull }));
  return li;
}
