// Tabellone a schermo intero, aspetto "metropolitana": Helvetica bianca su nero, cerchio di linea, minuti in grande.
import { el } from '../dom.js';
import { renderTabellone, cell, statoBreve } from './_tab.js';

export const meta = { id: 'tab-metro', paginate: false };

const cols = [
  { cls: 'c-bullet hn', label: '', hn: true },
  { cls: 'c-dest', label: 'DESTINAZIONE' },
  { cls: 'c-st', label: 'STATO' },
  { cls: 'c-plat', label: 'BIN.' },
  { cls: 'c-eta', label: 'PARTE' },
];
const cfg = {
  id: 'tab-metro', cols,
  cells: (m) => [
    cell(cols[0], el('b', { class: 'swatch', 'aria-label': m.svcName || 'Linea non riconosciuta', text: m.lineId ? m.lineId.replace(/^L/, '') : '•' })),
    cell(cols[1], el('span', { class: 'strike', text: m.dest })),
    cell(cols[2], el('span', { class: 'st-' + m.st.cls, text: statoBreve(m) })),
    cell(cols[3], m.t.platform ? el('b', { text: m.t.platform }) : null),
    cell(cols[4], m.eta !== null && !m.t.cancelled ? m.eta + ' min' : m.time),
  ],
};
export const colonne = cols; // per i test
export const render = (ctx) => renderTabellone(ctx, cfg);
