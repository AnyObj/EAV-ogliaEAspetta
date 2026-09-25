// Aspetto "LED": pannello a matrice di punti come le insegne di banchina. Prime righe fisse, resto in scorrimento.

import { el } from '../dom.js';
import { model } from './_lib.js';

export const meta = { id: 'led', paginate: false };

const FISSE = 4;
const up = (s) => String(s || '').toUpperCase();

function statusText(m) {
  if (m.t.cancelled) return 'SOPPRESSO';
  if (m.st.cls === 'go') return 'IN PARTENZA';
  if (m.t.delay === null) return 'IN RITARDO';
  if (m.t.delay > 0) return 'RIT +' + m.t.delay;
  return m.t.day === 0 ? 'IN ORARIO' : '';
}

export function render(ctx) {
  if (!ctx.rows.length) return el('div', { class: 'ld' }, el('div', { class: 'ld-panel' }, el('p', { class: 'ld-empty', text: up(ctx.empty) })));
  // con "Vai a" si mostrano prima i treni che ci arrivano
  const ordered = ctx.vai ? [...ctx.rows.filter((r) => r.match !== 'no'), ...ctx.rows.filter((r) => r.match === 'no')] : ctx.rows;
  const fixed = ordered.slice(0, FISSE).map((r) => model(r, ctx));
  const rest = ordered.slice(FISSE).map((r) => model(r, ctx));

  const rows = fixed.map((m) => el('li', { class: 'ld-row ' + m.cls, 'data-num': m.t.num },
    el('i', { class: 'ld-line swatch', 'aria-hidden': 'true' }),
    el('span', { class: 'ld-t', text: m.time + (m.t.day > 0 ? '+' : '') }),
    el('span', { class: 'ld-d', text: up(m.dest) }),
    el('span', { class: 'ld-b', text: m.t.platform ? 'BIN ' + m.t.platform : '' }),
    el('span', { class: 'ld-s', text: statusText(m) })));

  const ticker = rest.length
    ? rest.map((m) => m.time + (m.t.day > 0 ? '+' : '') + ' ' + up(m.dest) + (m.t.platform ? ' BIN ' + m.t.platform : '') + (m.t.cancelled ? ' SOPPRESSO' : m.t.delay > 0 ? ' RIT +' + m.t.delay : '')).join('   ●   ')
    : '';
  // "Vai a": il nome della stazione una volta sola, poi gli orari di arrivo dei treni che ci vanno
  const note = ctx.vai ? noteFor(ordered.filter((r) => r.match === 'si' || r.match === 'forse').map((r) => model(r, ctx)), ctx) : '';

  return el('div', { class: 'ld' },
    el('div', { class: 'ld-panel' },
      el('div', { class: 'ld-head', 'aria-hidden': 'true' }, el('span'), el('span', { text: 'ORA' }), el('span', { text: 'DESTINAZIONE' }), el('span', { text: 'BINARIO' }), el('span', { text: 'STATO' })),
      el('ul', { class: 'ld-rows' }, rows),
      ticker ? el('div', { class: 'ld-tlabel', 'aria-hidden': 'true', text: 'ALTRI TRENI' }) : null,
      ticker ? el('div', { class: 'ld-ticker', role: 'marquee', 'aria-label': 'Altri treni: ' + ticker },
        el('div', { class: 'ld-track', style: '--dur:' + Math.max(20, Math.round(ticker.length * 0.22)) + 's', 'aria-hidden': 'true' },
          el('span', { text: ticker + '   ●   ' }), el('span', { text: ticker + '   ●   ' }))) : null,
      note ? el('div', { class: 'ld-note', text: note }) : null));
}

function noteFor(hits, ctx) {
  const name = up(ctx.idx.byId.get(ctx.vai).nome);
  if (!hits.length) return 'NESSUN TRENO PER ' + name;
  const known = hits.filter((m) => m.targetTime).map((m) => m.targetTime);
  const unknown = hits.length - known.length;
  const parts = [...known.slice(0, 8), unknown ? '+' + unknown + ' SENZA ORARIO' : null].filter(Boolean);
  const probable = hits.some((m) => m.match === 'forse');
  return 'PER ' + name + ': ' + parts.join('  ●  ') + (probable ? '  ·  ALCUNI PROBABILI' : '');
}
