// Tabellone a schermo intero, aspetto "classico": blu petrolio, orari ambra, barra colorata di linea a sinistra.
import { el } from '../dom.js';
import { renderTabellone, cell, statoBreve } from './_tab.js';

export const meta = { id: 'tab-classico', paginate: false };

const cols = [
  { cls: 'c-bar', label: '' },
  { cls: 'c-time', label: 'ORA' },
  { cls: 'c-dest', label: 'DESTINAZIONE' },
  { cls: 'c-plat', label: 'BIN.' },
  { cls: 'c-st', label: 'STATO' },
];
const cfg = {
  id: 'tab-classico', cols,
  cells: (m) => [
    cell(cols[0], el('i', { class: 'swatch' })),
    cell(cols[1], m.time),
    cell(cols[2], el('span', { class: 'strike', text: m.dest }), m.t.cat ? el('em', { class: 'c-cat', text: m.t.cat }) : null),
    cell(cols[3], m.t.platform ? el('b', { text: m.t.platform }) : null),
    cell(cols[4], el('span', { class: 'st-' + m.st.cls, text: statoBreve(m) })),
  ],
};
export const colonne = cols; // per i test
export const render = (ctx) => renderTabellone(ctx, cfg);
