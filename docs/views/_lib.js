// Base condivisa dalle viste: trasforma una riga (treno + linea inferita + esito di "Vai a") in tutto cio' che serve
// per disegnarla, cosi' ogni aspetto si occupa solo della grafica.

import * as L from '../logic.js';
import { SERVIZI } from '../config.js';

export function model(r, ctx) {
  const { t, inf, match } = r;
  const { idx, now } = ctx;
  const svc = inf.service ? SERVIZI[inf.service] : null;
  const lineSvc = inf.lineService ? SERVIZI[inf.lineService] : null;
  const st = L.statusOf(t, now.min);
  const eta = L.etaMin(t, now.min);
  const target = ctx.vai && match !== 'no' && match !== null ? ctx.vai : null;
  const targetStop = target ? t.stops.find((s) => idx.sameStation(s.name, target)) : null;
  const line = inf.lines.length === 1 ? idx.lines.get(inf.lines[0]) : null;
  return {
    t, inf, match, svc, lineSvc, st, eta,
    lineId: line ? line.id : null,                                   // "L1", "L4", ... come li chiama EAV
    time: L.fmtHM(L.schedMin(t)),
    prev: t.delay > 0 && !t.cancelled ? L.fmtHM(L.expMin(t)) : null,
    dest: L.titleCase(t.dest),
    svcName: svc ? svc.nome + (svc.arcobaleno && lineSvc ? ' · ' + lineSvc.nome : '') : '',
    statusText: st.main ? st.main + (eta !== null && st.cls !== 'go' && !t.cancelled ? ' · tra ' + eta + ' min' : '') : '',
    targetName: target ? L.titleCase(idx.byId.get(target).nome) : null,   // stazione scelta con "Vai a"
    targetTime: targetStop ? targetStop.time : null,                       // orario di arrivo li', se EAV lo da'
    targetText: target ? (ctx.tipo === 'A' ? '← ' : '→ ') + L.titleCase(idx.byId.get(target).nome)
      + (targetStop ? ' ' + targetStop.time : match === 'forse' ? ' (probabile)' : '') : null,
    stopsText: t.stops.map((s) => L.titleCase(s.name)).join(', '),
    stopsFull: t.stops.map((s) => L.titleCase(s.name) + ' ' + s.time).join(' · '),
    cls: ['s-' + (svc ? svc.css : 'neu'), svc && svc.strisce && 'strisce', svc && svc.arcobaleno && 'arcobaleno', t.cancelled && 'cancel', t.fantasma && 'ghost',
      match === 'si' && 'hit', match === 'no' && 'dim', 'st-' + st.cls].filter(Boolean).join(' '),
  };
}

// Se il treno ha l'elenco delle fermate, clic/Invio sulla riga lo apre e lo chiude.
export function wire(node, t, ctx) {
  if (!t.stops.length) return false;
  node.setAttribute('tabindex', '0');
  const toggle = () => ctx.toggle(t.num);
  node.addEventListener('click', toggle);
  node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  return ctx.open.has(t.num);
}

// Righe con separatore di giorno ("DOMANI") gia' pronte, per le viste a elenco.
export function withDays(ctx, makeRow, makeSep) {
  const out = [];
  let prevDay = 0;
  for (const r of ctx.rows) {
    if (r.t.day > prevDay) { out.push(makeSep(L.dayLabel(r.t.day))); prevDay = r.t.day; }
    out.push(makeRow(r));
  }
  return out;
}
