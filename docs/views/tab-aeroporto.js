// Tabellone a schermo intero, aspetto "aeroporto": blu notte e giallo, righe a fasce alterne.
import { el } from '../dom.js';
import { renderTabellone, cell, statoBreve } from './_tab.js';

export const meta = { id: 'tab-aeroporto', paginate: false };

const cols = [
  { cls: 'c-time', label: 'ORA · TIME' },
  { cls: 'c-dest', label: 'DESTINAZIONE · DESTINATION' },
  { cls: 'c-line hn', label: 'LINEA', hn: true },
  { cls: 'c-plat', label: 'BIN.' },
  { cls: 'c-st', label: 'STATO · STATUS' },
];
const cfg = {
  id: 'tab-aeroporto', cols,
  cells: (m) => [
    cell(cols[0], m.time),
    cell(cols[1], el('span', { class: 'strike', text: m.dest.toUpperCase() })),
    cell(cols[2], el('i', { class: 'swatch' }), m.svcName ? el('span', { text: m.svcName }) : null),
    cell(cols[3], m.t.platform ? el('b', { text: m.t.platform }) : null),
    cell(cols[4], el('span', { class: 'st-' + m.st.cls, text: statoBreve(m) })),
  ],
};
export const render = (ctx) => renderTabellone(ctx, cfg);
