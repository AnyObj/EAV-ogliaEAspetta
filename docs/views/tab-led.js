// Tabellone a schermo intero, aspetto "LED": matrice di punti ambra su nero.
import { el } from '../dom.js';
import { renderTabellone, cell, statoBreve } from './_tab.js';

export const meta = { id: 'tab-led', paginate: false };

const cols = [
  { cls: 'c-line', label: '' },
  { cls: 'c-time', label: 'ORA' },
  { cls: 'c-dest', label: 'DESTINAZIONE' },
  { cls: 'c-plat', label: 'BIN' },
  { cls: 'c-st', label: 'STATO' },
];
const cfg = {
  id: 'tab-led', cols,
  cells: (m) => [
    cell(cols[0], el('i', { class: 'swatch' })),
    cell(cols[1], m.time),
    cell(cols[2], el('span', { class: 'strike', text: m.dest.toUpperCase() })),
    cell(cols[3], m.t.platform || ''),
    cell(cols[4], el('span', { class: 'st-' + m.st.cls, text: statoBreve(m) })),
  ],
};
export const render = (ctx) => renderTabellone(ctx, cfg);
