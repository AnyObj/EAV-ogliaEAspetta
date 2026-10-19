// Aspetto "Giorno": per l'uso di tutti i giorni da telefono. Una riga per treno, orario e minuti in grande,
// stato sempre scritto (mai solo un colore), riga alta abbastanza da toccarla col pollice.

import { el } from '../dom.js';
import { model, wire, withDays } from './_lib.js';

export const meta = { id: 'giorno', fantasmi: true };

export function render(ctx) {
  if (!ctx.rows.length) return el('div', { class: 'gi' }, el('p', { class: 'gi-empty', text: ctx.empty }));
  const rows = withDays(ctx, (r) => rowEl(r, ctx, r === ctx.rows[0]), sepEl);
  return el('div', { class: 'gi' }, el('ul', { class: 'gi-list' }, rows));
}

// "DOMANI / Tomorrow" -> "Domani"
function sepEl(testo) {
  const it = testo.split(' / ')[0].toLowerCase();
  return el('li', { class: 'gi-sep', text: it.charAt(0).toUpperCase() + it.slice(1) });
}

function rowEl(r, ctx, first) {
  const m = model(r, ctx);
  const { t } = m;
  const sub = [m.svcName, 'treno ' + t.num].filter(Boolean).join(' · ');
  const li = el('li', { class: 'gi-row ' + m.cls + (first ? ' gi-next' : ''), 'data-num': t.num },
    el('span', { class: 'gi-bar swatch', 'aria-hidden': 'true' }),
    el('div', { class: 'gi-when' },
      el('b', { class: 'gi-t strike', text: m.time }),
      m.prev ? el('small', { text: 'ora ' + m.prev }) : null),
    el('div', { class: 'gi-main' },
      el('span', { class: 'gi-d strike', text: m.dest }),
      el('span', { class: 'gi-sub', text: sub }),
      m.st.main ? el('span', { class: 'gi-st st ' + m.st.cls, text: m.st.main }) : null,
      m.targetText ? el('span', { class: 'gi-target', text: m.targetText }) : null),
    el('div', { class: 'gi-side' },
      m.eta !== null ? el('b', { class: 'gi-eta' }, String(m.eta), el('small', { text: ' min' })) : null,
      t.platform ? el('span', { class: 'gi-plat', text: 'Bin. ' + t.platform }) : null));
  // fermate: quelle di EAV se ci sono, altrimenti quelle degli orari programmati (con l'orario previsto)
  const daGtfs = !t.stops.length && m.gStops.length > 0;
  const stops = daGtfs ? m.gStops : t.stops;
  if (wire(li, { num: t.num, stops }, ctx)) li.append(el('p', { class: 'gi-full', text: (daGtfs ? 'Fermate previste: ' + m.gStopsFull : 'Ferma a: ' + m.stopsFull) }));
  else if (stops.length) li.querySelector('.gi-main').append(el('span', { class: 'gi-more', 'aria-hidden': 'true', text: 'Mostra le fermate' }));
  return li;
}
