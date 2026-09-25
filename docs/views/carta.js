// Aspetto "Carta": l'orario ferroviario stampato. Carattere con grazie, puntini di riempimento, timbro rosso sui soppressi.

import { el } from '../dom.js';
import { model, wire, withDays } from './_lib.js';

export const meta = { id: 'carta', paginate: true, fantasmi: true };

export function render(ctx) {
  const rows = withDays(ctx, (r) => rowEl(r, ctx), (t) => el('li', { class: 'ct-sep', text: t }));
  if (!rows.length) rows.push(el('li', { class: 'ct-empty', text: ctx.empty }));
  return el('div', { class: 'ct' },
    el('p', { class: 'ct-title', text: 'Orario dei treni' }),
    el('ul', { class: 'ct-list' }, rows));
}

function rowEl(r, ctx) {
  const m = model(r, ctx);
  const { t } = m;
  const li = el('li', { class: 'ct-row ' + m.cls, 'data-num': t.num },
    el('span', { class: 'ct-time strike', text: m.time }),
    el('div', { class: 'ct-body' },
      el('div', { class: 'ct-line' },
        el('span', { class: 'ct-dest strike', text: m.dest }),
        el('span', { class: 'ct-fill', 'aria-hidden': 'true' }),
        t.platform ? el('span', { class: 'ct-bin', text: 'bin. ' + t.platform }) : null,
        m.st.main ? el('span', { class: 'ct-st st ' + m.st.cls, text: m.statusText }) : null),
      el('div', { class: 'ct-sub' },
        el('i', { class: 'swatch' }),
        el('span', { class: 'ct-svc', text: m.svcName || 'linea non riconosciuta' }),
        el('span', { text: (t.cat || '–') + ' · treno ' + t.num + (m.prev ? ' · previsto ' + m.prev : '') }),
        m.stopsText ? el('span', { class: 'ct-stops', text: 'ferma a ' + m.stopsText }) : null),
      m.targetText ? el('div', { class: 'ct-target', text: m.targetText }) : null),
    t.cancelled ? el('span', { class: 'ct-stamp', text: 'Soppresso' }) : null);
  if (wire(li, t, ctx)) li.append(el('p', { class: 'ct-full', text: 'Ferma a: ' + m.stopsFull }));
  return li;
}
