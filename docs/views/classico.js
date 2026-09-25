// Aspetto "Classico": il tabellone da stazione (barra colorata, orario ambra, binario in riquadro).

import { el } from '../dom.js';
import * as L from '../logic.js';
import { SERVIZI } from '../config.js';

export const meta = { id: 'classico', paginate: true, fantasmi: true };

export function render(ctx) {
  const out = [];
  let prevDay = 0;
  for (const r of ctx.rows) {
    if (r.t.day > prevDay) { out.push(el('li', { class: 'sep', text: L.dayLabel(r.t.day) })); prevDay = r.t.day; }
    out.push(rowEl(r, ctx));
  }
  if (!out.length) out.push(el('li', { class: 'empty', text: ctx.empty }));
  const col = (a, b, style) => el('span', { style }, a, el('i', { text: b }));
  return el('div', {},
    el('div', { class: 'head', 'aria-hidden': 'true' },
      col('ORA', 'Time'), col('DESTINAZIONE', 'Destination'), col('BIN.', 'Platf.'), col('STATO', 'Status'), col('TRA', 'In', 'text-align:right')),
    el('ol', { class: 'rows' }, out));
}

// Le fermate che non ci stanno in una riga scorrono avanti e indietro (come il testo scorrevole del sito EAV).
export function after(container) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  requestAnimationFrame(() => {
    for (const box of container.querySelectorAll('.stops')) {
      const inner = box.firstElementChild;
      const over = Math.max(box.scrollWidth, inner ? Math.ceil(inner.getBoundingClientRect().width) : 0) - box.clientWidth;
      box.classList.toggle('scroll', over > 4);
      if (over > 4) {
        box.style.setProperty('--shift', -over + 'px');
        box.style.setProperty('--dur', Math.max(8, over / 30 + 4).toFixed(1) + 's');
      }
    }
  });
}

function rowEl(r, ctx) {
  const { t, inf, match } = r;
  const { now, idx } = ctx;
  const svc = inf.service ? SERVIZI[inf.service] : null;
  const st = L.statusOf(t, now.min);
  const eta = L.etaMin(t, now.min);
  const isOpen = ctx.open.has(t.num);
  const lineSvc = inf.lineService ? SERVIZI[inf.lineService] : null;
  const cls = ['row', 's-' + (svc ? svc.css : 'neu'), svc && svc.strisce && 'strisce', svc && svc.arcobaleno && 'arcobaleno', t.cancelled && 'cancel', t.fantasma && 'ghost',
    match === 'si' && 'hit', match === 'no' && 'dim', st.cls === 'go' && 'soon'].filter(Boolean).join(' ');

  const stopsText = t.stops.map((s) => L.titleCase(s.name)).join(', ');
  const target = ctx.vai && match !== 'no' && match !== null ? ctx.vai : null;
  const targetStop = target ? t.stops.find((s) => idx.resolve(s.name) === target) : null;
  const inline = st.main ? st.main + (eta !== null && st.cls !== 'go' && !t.cancelled ? ' · tra ' + eta + ' min' : '') : '';

  const li = el('li', { class: cls, 'data-num': t.num, tabindex: t.stops.length ? '0' : null,
    title: t.stops.length ? 'Tocca per vedere tutte le fermate' : null },
  el('div', { class: 'time' }, L.fmtHM(L.schedMin(t)),
    t.delay > 0 && !t.cancelled ? el('small', { text: 'prev. ' + L.fmtHM(L.expMin(t)) }) : null),
  el('div', {},
    el('div', { class: 'dest', text: L.titleCase(t.dest) }),
    el('div', { class: 'meta' },
      el('span', { class: 'tag', text: t.cat || '–' }),
      el('span', { text: 'Treno ' + t.num }),
      svc ? el('span', { class: 'svc' + (svc.arcobaleno ? ' plain' : '') }, svc.nome,
        svc.arcobaleno && lineSvc ? [' · ', el('span', { class: 'lc s-' + lineSvc.css, text: lineSvc.nome })] : null) : null,
      target ? el('span', { class: 'arrivo', text: (ctx.tipo === 'A' ? '← ' : '→ ') + L.titleCase(idx.byId.get(target).nome)
        + (targetStop ? ' ' + targetStop.time : match === 'forse' ? ' (probabile)' : '') }) : null,
      stopsText ? el('span', { class: 'stops' }, el('span', { class: 'stops-in', text: 'Ferma a: ' + stopsText })) : null),
    inline ? el('div', { class: 'st-inline st ' + st.cls, text: inline }) : null),
  el('div', { class: 'plat' + (t.platform ? '' : ' none'), 'aria-label': 'Binario', text: t.platform || '–' }),
  el('div', { class: 'col-st st ' + st.cls }, st.main, st.sub ? el('small', { text: st.sub }) : null),
  el('div', { class: 'col-eta eta' }, eta !== null && !t.cancelled ? [String(eta), el('small', { text: 'min' })] : null));

  if (t.stops.length) {
    if (isOpen) li.append(el('p', { class: 'stops-full', text: 'Ferma a: ' + t.stops.map((s) => L.titleCase(s.name) + ' ' + s.time).join(' · ') }));
    const toggle = () => ctx.toggle(t.num);
    li.addEventListener('click', toggle);
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  }
  return li;
}
