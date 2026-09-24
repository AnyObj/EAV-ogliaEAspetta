// Aspetto "Per direzione": una scheda per destinazione. In grande quanto manca al prossimo treno,
// sotto gli altri orari. Risponde a "quanto aspetto per andare verso X?" senza leggere una tabella.

import { el } from '../dom.js';
import * as L from '../logic.js';
import { SERVIZI } from '../config.js';

export const meta = { id: 'carte', paginate: false }; // raggruppa lui: riceve tutti i treni

const PROSSIMI = 4; // orari mostrati sotto il primo, prima di espandere la scheda

export function render(ctx) {
  const groups = new Map();
  for (const r of ctx.rows) {
    const key = ctx.idx.resolve(r.t.dest) || L.norm(r.t.dest);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  // schede ordinate per il primo treno utile; i treni sono gia' in ordine di orario
  const cards = [...groups.entries()].map(([key, rows]) => card(key, rows, ctx))
    .sort((a, b) => a.when - b.when).map((c) => c.node);
  return el('div', { class: 'cd-grid' }, cards.length ? cards : el('p', { class: 'cd-empty', text: ctx.empty }));
}

function card(key, rows, ctx) {
  const { now, idx } = ctx;
  const upcoming = (r) => !r.t.cancelled && (r.t.day > 0 || L.expMin(r.t) - now.min >= -5);
  const first = rows.find(upcoming) || rows[0];
  const { t, inf } = first;
  const svc = inf.service ? SERVIZI[inf.service] : null;
  const lineSvc = inf.lineService ? SERVIZI[inf.lineService] : null;
  const st = L.statusOf(t, now.min);
  const eta = L.etaMin(t, now.min);
  const isOpen = ctx.open.has('g:' + key);

  const anyHit = rows.some((r) => r.match === 'si');
  const allNo = ctx.vai && rows.every((r) => r.match === 'no');
  const cls = ['cd', 's-' + (svc ? svc.css : 'neu'), svc && svc.strisce && 'strisce', svc && svc.arcobaleno && 'arcobaleno',
    anyHit && 'hit', allNo && 'dim'].filter(Boolean).join(' ');

  const others = rows.filter((r) => r !== first);
  const listed = isOpen ? others : others.slice(0, PROSSIMI);

  const hero = t.cancelled
    ? el('div', { class: 'cd-hero cancel' }, el('strong', { text: '✕' }), el('span', { text: 'soppresso' }))
    : eta !== null
      ? el('div', { class: 'cd-hero' }, el('strong', { text: String(eta) }), el('span', { text: 'min' }))
      : el('div', { class: 'cd-hero far' }, el('strong', { text: L.fmtHM(L.schedMin(t)) }),
        el('span', { text: t.day > 0 ? 'domani' : 'più tardi' }));

  const target = ctx.vai && first.match !== 'no' && first.match !== null ? ctx.vai : null;
  const targetStop = target ? t.stops.find((s) => idx.resolve(s.name) === target) : null;

  const node = el('article', { class: cls, 'data-num': t.num, tabindex: '0', 'aria-expanded': String(isOpen),
    title: 'Tocca per vedere tutti gli orari' },
  el('header', { class: 'cd-top' },
    el('h3', { text: L.titleCase(t.dest) }),
    svc ? el('span', { class: 'cd-svc', text: svc.nome + (svc.arcobaleno && lineSvc ? ' · ' + lineSvc.nome : '') }) : null),
  el('div', { class: 'cd-main' },
    hero,
    el('div', { class: 'cd-info' },
      el('div', { class: 'cd-time' }, L.fmtHM(L.schedMin(t)), t.delay > 0 && !t.cancelled ? el('small', { text: ' → ' + L.fmtHM(L.expMin(t)) }) : null),
      el('div', { class: 'st ' + st.cls, text: st.main }),
      el('div', { class: 'cd-sub', text: 'Treno ' + t.num + ' · ' + (t.cat || '–') }))),
  el('div', { class: 'cd-plat' + (t.platform ? '' : ' none'), 'aria-label': 'Binario', text: t.platform ? 'Binario ' + t.platform : 'Binario da assegnare' }),
  target ? el('p', { class: 'cd-arrivo', text: '→ ' + L.titleCase(idx.byId.get(target).nome)
    + (targetStop ? ' ' + targetStop.time : first.match === 'forse' ? ' (probabile)' : '') }) : null,
  others.length ? el('ul', { class: 'cd-next' }, listed.map((r) => chip(r, ctx))) : null,
  others.length > PROSSIMI ? el('p', { class: 'cd-more', text: isOpen ? 'Mostra meno' : '+ altri ' + (others.length - PROSSIMI) + ' orari' }) : null,
  isOpen && t.stops.length ? el('p', { class: 'cd-stops', text: 'Il primo ferma a: ' + t.stops.map((s) => L.titleCase(s.name) + ' ' + s.time).join(' · ') }) : null);

  const toggle = () => ctx.toggle('g:' + key);
  node.addEventListener('click', toggle);
  node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  return { node, when: t.cancelled && !upcoming(first) ? Infinity : L.expMin(t) };
}

function chip(r, ctx) {
  const { t, match } = r;
  const cls = ['cd-chip', t.cancelled && 'cancel', match === 'si' && 'hit', match === 'no' && 'dim'].filter(Boolean).join(' ');
  return el('li', { class: cls },
    t.day > 0 ? el('em', { text: t.day === 1 ? 'dom.' : 'dopo' }) : null,
    L.fmtHM(L.schedMin(t)),
    t.delay > 0 && !t.cancelled ? el('small', { text: '+' + t.delay }) : t.delay === null && !t.cancelled ? el('small', { text: 'rit.' }) : null,
    t.platform ? el('span', { class: 'cd-bin', text: t.platform }) : null);
}
