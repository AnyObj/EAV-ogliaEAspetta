// Aspetto "Percorso": ogni treno e' una linea da questa stazione alla destinazione.
// Punto pieno = ferma, cerchietto vuoto = salta la stazione, tratteggiato = non si sa (diretto senza elenco).
// Il percorso viene dall'ordine delle stazioni sulla linea (catalogo) e dall'elenco "Ferma a:" di EAV.

import { el } from '../dom.js';
import * as L from '../logic.js';
import { SERVIZI } from '../config.js';

export const meta = { id: 'percorso', paginate: true, fantasmi: true };

export function render(ctx) {
  const rows = [];
  let prevDay = 0;
  for (const r of ctx.rows) {
    if (r.t.day > prevDay) { rows.push(el('li', { class: 'pc-sep', text: L.dayLabel(r.t.day) })); prevDay = r.t.day; }
    rows.push(rowEl(r, ctx));
  }
  if (!rows.length) rows.push(el('li', { class: 'pc-empty', text: ctx.empty }));
  return el('div', { class: 'pc' },
    el('p', { class: 'pc-legend', 'aria-hidden': 'true' },
      el('span', { class: 'lg stop' }), ' ferma  ', el('span', { class: 'lg skip' }), ' salta  ', el('span', { class: 'lg unknown' }), ' non noto  ', el('span', { class: 'lg nonservita' }), ' non servita'),
    el('ul', { class: 'pc-list' }, rows));
}

// Stazioni tra quella del tabellone (esclusa) e la destinazione (inclusa), con cosa fa il treno in ciascuna.
export function routeOf(r, ctx) {
  const { t, inf } = r;
  const { idx, station } = ctx;
  const destId = idx.resolve(t.dest);
  const haveList = t.stops.length > 0;
  const listed = (id) => t.stops.find((s) => idx.sameStation(s.name, id));
  const allStops = /^A(\s|$)/i.test(t.cat || ''); // un accelerato ferma ovunque
  const exact = Array.isArray(inf.fermate) ? new Set(inf.fermate) : null;

  // linea su cui si muove: tra le possibili, quella che contiene sia questa stazione sia la destinazione
  let lineName = null;
  if (destId) {
    const cands = (inf.lines.length ? inf.lines : [...idx.linesOf(station)]).filter((n) => {
      const p = idx.lines.get(n) && idx.lines.get(n).pos;
      return p && p.has(station) && p.has(destId);
    });
    lineName = cands.find((n) => idx.isTerminus(n, destId)) || cands[0] || null;
  }

  // Con l'elenco: nell'elenco = ferma; assente = salta, ma se EAV non monitora la stazione l'elenco non
  // puo' dirlo (un accelerato ci ferma comunque): "non noto", non "salta".
  const kind = (id) => {
    if (id === destId) return 'stop';
    if (idx.nonServita(id)) return 'nonservita'; // nessun treno la serve (dagli orari programmati)
    if (exact) return exact.has(id) ? 'stop' : 'skip'; // fermate esatte dagli orari programmati
    if (haveList) return listed(id) ? 'stop' : idx.unmonitored(id) ? 'unknown' : 'skip';
    return allStops ? 'stop' : 'unknown';
  };
  let ids = [];
  if (lineName) {
    const l = idx.lines.get(lineName);
    const i = l.pos.get(station), j = l.pos.get(destId), step = j > i ? 1 : -1;
    for (let k = i + step; k !== j + step; k += step) ids.push(l.stazioni[k]);
  } else {
    // linea non determinabile: si disegnano solo le fermate note
    ids = (exact ? inf.fermate : t.stops.map((s) => idx.resolve(s.name))).filter((id) => id && idx.byId.has(id));
    if (destId && !ids.includes(destId)) ids.push(destId);
  }
  return {
    nodes: ids.map((id) => ({ id, name: idx.byId.get(id).nome, kind: kind(id),
      time: (listed(id) || {}).time || null, target: id === ctx.vai, dest: id === destId })),
    approx: !lineName, destId,
  };
}

function rowEl(r, ctx) {
  const { t, inf, match } = r;
  const svc = inf.service ? SERVIZI[inf.service] : null;
  const lineSvc = inf.lineService ? SERVIZI[inf.lineService] : null;
  const st = L.statusOf(t, ctx.now.min);
  const eta = L.etaMin(t, ctx.now.min);
  const isOpen = ctx.open.has(t.num);
  const route = routeOf(r, ctx);
  const cls = ['pc-row', 's-' + (svc ? svc.css : 'neu'), svc && svc.strisce && 'strisce', svc && svc.arcobaleno && 'arcobaleno',
    t.cancelled && 'cancel', t.fantasma && 'ghost', match === 'si' && 'hit', match === 'no' && 'dim'].filter(Boolean).join(' ');

  const origin = L.titleCase(ctx.idx.byId.get(ctx.station).nome);
  const skipNS = route.nodes.filter((n) => n.kind === 'nonservita').length;
  const stopsN = route.nodes.filter((n) => n.kind === 'stop').length;
  const skipN = route.nodes.filter((n) => n.kind === 'skip').length;
  const caption = route.nodes.length
    ? stopsN + (stopsN === 1 ? ' fermata' : ' fermate') + (skipN ? ' · salta ' + skipN : '')
      + (route.nodes.some((n) => n.kind === 'unknown') ? ' · fermate non note' : '') + (skipNS ? ' · ' + skipNS + ' non servit' + (skipNS === 1 ? 'a' : 'e') : '')
    : 'percorso non disponibile';

  const strip = el('div', { class: 'pc-strip', role: 'img',
    'aria-label': 'Da ' + origin + ' a ' + L.titleCase(t.dest) + ': ' + caption },
  el('span', { class: 'pc-node origin' }, el('i'), el('b', { text: origin })),
  route.nodes.map((n) => el('span', { class: 'pc-node ' + n.kind + (n.target ? ' target' : '') + (n.dest ? ' dest' : ''),
    title: L.titleCase(n.name) + (n.time ? ' ' + n.time : '') + (n.kind === 'skip' ? ' (salta)' : n.kind === 'nonservita' ? ' (non servita)' : '') },
  el('i'), n.target || n.dest ? el('b', { text: L.titleCase(n.name) }) : null)));

  const li = el('li', { class: cls, 'data-num': t.num, tabindex: '0', title: 'Tocca per vedere tutte le stazioni' },
    el('div', { class: 'pc-time' }, L.fmtHM(L.schedMin(t)),
      t.delay > 0 && !t.cancelled ? el('small', { text: 'prev. ' + L.fmtHM(L.expMin(t)) }) : null),
    el('div', { class: 'pc-body' },
      el('div', { class: 'pc-head' },
        el('span', { class: 'pc-dest', text: L.titleCase(t.dest) }),
        el('span', { class: 'tag', text: t.cat || '–' }),
        el('span', { class: 'pc-num', text: 'Treno ' + t.num }),
        svc ? el('span', { class: 'pc-svc' }, svc.nome,
          svc.arcobaleno && lineSvc ? [' · ', el('span', { class: 'lc s-' + lineSvc.css, text: lineSvc.nome })] : null) : null,
        st.main ? el('span', { class: 'st pc-st ' + st.cls, text: st.main + (eta !== null && st.cls !== 'go' && !t.cancelled ? ' · tra ' + eta + ' min' : '') }) : null),
      strip,
      el('div', { class: 'pc-cap', text: caption + (ctx.vai && match === 'forse' ? ' · ' + L.titleCase(ctx.idx.byId.get(ctx.vai).nome) + ': probabile' : '') })),
    el('div', { class: 'plat' + (t.platform ? '' : ' none'), 'aria-label': 'Binario', text: t.platform || '–' }));

  if (isOpen) {
    li.append(el('ol', { class: 'pc-all' }, route.nodes.map((n) => el('li', { class: n.kind + (n.target ? ' target' : '') },
      el('i'), L.titleCase(n.name), n.time ? el('small', { text: ' ' + n.time }) : null,
      n.kind === 'skip' ? el('small', { text: ' · salta' }) : n.kind === 'nonservita' ? el('small', { text: ' · non servita' }) : null))));
  }
  const toggle = () => ctx.toggle(t.num);
  li.addEventListener('click', toggle);
  li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  return li;
}
