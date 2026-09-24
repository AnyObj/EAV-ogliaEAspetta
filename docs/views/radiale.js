// Aspetto "Orologio radiale": un quadrante di 60 minuti. Ogni treno e' un punto; piu' e' vicino al centro,
// prima parte. Ogni linea ha il suo settore. Sotto (o accanto) l'elenco dei prossimi.

import { el } from '../dom.js';
import * as L from '../logic.js';
import { SERVIZI } from '../config.js';
import { model } from './_lib.js';

export const meta = { id: 'radiale', paginate: false };

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) e.setAttribute(k, v);
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c);
  return e;
};

const C = 320, R = 290, RMIN = 46, FINESTRA = 60; // centro, raggio, raggio minimo, minuti mostrati
const rad = (minuti) => RMIN + (R - RMIN) * Math.min(Math.max(minuti, 0), FINESTRA) / FINESTRA;
const pt = (a, r) => [C + r * Math.cos(a), C + r * Math.sin(a)];

export function render(ctx) {
  const all = ctx.rows.map((r) => ({ r, m: model(r, ctx), fra: L.expMin(r.t) - ctx.now.min }));
  const visible = all.filter((x) => x.fra >= -5 && x.fra <= FINESTRA); // vale anche a cavallo della mezzanotte
  const later = all.filter((x) => !visible.includes(x)).length;

  // un settore del quadrante per ogni servizio presente
  const keys = Object.keys(SERVIZI).filter((k) => visible.some((x) => x.r.inf.service === k));
  if (visible.some((x) => !x.r.inf.service)) keys.push('_');
  const sector = (k) => keys.indexOf(k === undefined || k === null ? '_' : k);
  const n = Math.max(keys.length, 1);
  const width = (2 * Math.PI) / n;
  const angleOf = (x, i, group) => {
    const s = sector(x.r.inf.service);
    const a0 = -Math.PI / 2 + s * width;
    const k = group.indexOf(x);
    return a0 + width / 2 + (k - (group.length - 1) / 2) * Math.min(0.16, (width * 0.8) / Math.max(group.length, 1));
  };

  const striped = Object.values(SERVIZI).filter((v) => v.strisce);
  const defs = svg('defs', {},
    ...striped.map((v) => svg('pattern', { id: 'rd-strisce-' + v.css, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
      svg('rect', { width: 3, height: 6, style: 'fill:var(--r-' + v.css + ')' }), svg('rect', { x: 3, width: 3, height: 6, fill: 'transparent' }))),
    svg('linearGradient', { id: 'rd-arcobaleno', x1: 0, y1: 0, x2: 0, y2: 1 },
      ...[['sor', 0], ['sar', 25], ['bai', 50], ['pog', 75]].flatMap(([c, o]) => [
        svg('stop', { offset: o + '%', class: 'rd-s-' + c }), svg('stop', { offset: (o + 25) + '%', class: 'rd-s-' + c })])));

  const parts = [defs];
  // settori
  if (n > 1) {
    keys.forEach((k, s) => {
      const a0 = -Math.PI / 2 + s * width, a1 = a0 + width;
      const [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R);
      const svc = SERVIZI[k];
      parts.push(svg('path', { d: `M${C} ${C} L${x0} ${y0} A${R} ${R} 0 ${width > Math.PI ? 1 : 0} 1 ${x1} ${y1} Z`,
        class: 'rd-wedge s-' + (svc ? svc.css : 'neu') + (svc && svc.arcobaleno ? ' arcobaleno' : '') + (s % 2 ? ' odd' : '') }));
      const [lx, ly] = pt(a0 + width / 2, R + 18);
      parts.push(svg('text', { x: lx, y: ly, class: 'rd-lab s-' + (svc ? svc.css : 'neu'), 'text-anchor': 'middle', 'dominant-baseline': 'middle' },
        svc ? svc.nome : 'Altre'));
    });
  }
  // anelli dei minuti
  for (const min of [10, 20, 30, 45, 60]) {
    parts.push(svg('circle', { cx: C, cy: C, r: rad(min), class: 'rd-ring' }));
    parts.push(svg('text', { x: C + 4, y: C - rad(min) + 12, class: 'rd-min' }, min + '′'));
  }
  parts.push(svg('circle', { cx: C, cy: C, r: RMIN - 6, class: 'rd-core' }));
  const nowT = L.romeNow();
  parts.push(svg('text', { x: C, y: C - 4, class: 'rd-now', 'text-anchor': 'middle' }, L.pad2(nowT.h) + ':' + L.pad2(nowT.m)));
  parts.push(svg('text', { x: C, y: C + 14, class: 'rd-now-sub', 'text-anchor': 'middle' }, 'adesso'));

  // treni
  const groups = new Map();
  for (const x of visible) {
    const k = x.r.inf.service || '_';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(x);
  }
  visible.forEach((x, i) => {
    const { r, m } = x;
    const a = angleOf(x, i, groups.get(r.inf.service || '_'));
    const [px, py] = pt(a, rad(x.fra));
    const hit = r.match === 'si', dim = r.match === 'no';
    const g = svg('g', { class: 'rd-dot ' + m.cls + (hit ? ' hit' : '') + (dim ? ' dim' : ''), 'data-num': r.t.num, tabindex: '0' },
      svg('title', {}, `${m.time} ${m.dest}${m.prev ? ' (previsto ' + m.prev + ')' : ''} · ${m.st.main || ''}${m.targetText ? ' · ' + m.targetText : ''}`));
    if (r.t.delay > 0 && !r.t.cancelled) { // coda: dall'orario programmato a quello previsto
      const [sx, sy] = pt(a, rad(x.fra - r.t.delay));
      g.append(svg('line', { x1: sx, y1: sy, x2: px, y2: py, class: 'rd-tail' }));
    }
    if (r.t.cancelled) {
      g.append(svg('text', { x: px, y: py, class: 'rd-x', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, '✕'));
    } else {
      const rs = r.inf.service && SERVIZI[r.inf.service];
      g.append(svg('circle', { cx: px, cy: py, r: hit ? 13 : 9, class: 'rd-c',
        style: rs && rs.strisce ? 'fill:url(#rd-strisce-' + rs.css + ');stroke:var(--c);stroke-width:2' : null }));
    }
    if (hit || (!ctxHasVai(ctx) && i < 3)) {
      g.append(svg('text', { x: px, y: py - 16, class: 'rd-tag', 'text-anchor': 'middle' }, m.time + ' ' + m.dest.slice(0, 14)));
    }
    parts.push(g);
  });

  const dial = svg('svg', { viewBox: `0 0 ${2 * C} ${2 * C}`, class: 'rd-svg', role: 'img',
    'aria-label': 'Quadrante dei prossimi 60 minuti: ' + visible.length + ' treni' }, parts);

  // elenco dei prossimi, in ordine di partenza
  const next = [...visible].sort((a, b) => a.fra - b.fra).slice(0, 8);
  const list = el('ul', { class: 'rd-next' }, next.length
    ? next.map((x) => el('li', { class: 'rd-item ' + x.m.cls },
      el('i', { class: 'swatch' }),
      el('strong', { class: 'strike', text: x.m.eta !== null && !x.r.t.cancelled ? x.m.eta + '′' : x.m.time }),
      el('span', { class: 'rd-d strike', text: x.m.dest }),
      el('small', { text: x.m.st.main }),
      x.m.targetText ? el('em', { text: x.m.targetText }) : null))
    : el('li', { class: 'rd-none', text: ctx.rows.length ? 'Nessun treno nei prossimi 60 minuti.' : ctx.empty }));

  return el('div', { class: 'rd' }, dial, el('div', { class: 'rd-side' }, list,
    later ? el('p', { class: 'rd-later', text: '+ ' + later + ' treni più tardi (oltre un\'ora o domani)' }) : null));
}

const ctxHasVai = (ctx) => !!ctx.vai;
