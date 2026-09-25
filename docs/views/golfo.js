// Aspetto "Golfo": il tabellone che parla. In cima una frase semplice e un disco giallo con i minuti;
// i treni sono biglietti con la linguetta perforata dell'orario. Blu mare, limone, linguaggio di tutti i giorni.

import { el } from '../dom.js';
import * as L from '../logic.js';
import { model, wire, withDays } from './_lib.js';

export const meta = { id: 'golfo', paginate: true };

const seg = (t, b) => ({ t, b: !!b });
const minuti = (n) => n + (n === 1 ? ' minuto' : ' minuti');
const binario = (m) => (m.t.platform ? [seg(', dal '), seg('binario ' + m.t.platform, true)] : []);

// La frase in cima e il numero grande. Funzione pura (nessun DOM), provata dai test.
// Ritorna { segments: [{t, b}], big: {main, unit} | null, tone: 'ok'|'late'|'cancel'|'far'|'none' }
export function frase(ctx) {
  const list = ctx.rows.map((r) => model(r, ctx));
  if (!list.length) return { segments: [seg(ctx.empty)], big: null, tone: 'none' };

  if (ctx.vai) {
    const nome = L.titleCase(ctx.idx.byId.get(ctx.vai).nome);
    const hit = list.find((m) => m.match === 'si' && !m.t.cancelled) || list.find((m) => m.match === 'forse' && !m.t.cancelled);
    if (!hit) return { segments: [seg('Nessuno dei prossimi treni arriva a '), seg(nome, true), seg('.')], big: null, tone: 'none' };
    const arrivo = hit.targetTime;
    const parts = hit.match === 'si'
      ? [seg('Per '), seg(nome, true), seg(' il prossimo treno parte alle '), seg(hit.time, true), ...(arrivo ? [seg(' e ci arrivi alle '), seg(arrivo, true)] : []), ...binario(hit), seg('.')]
      : [seg('Probabilmente ferma a '), seg(nome, true), seg(': è il treno delle '), seg(hit.time, true), seg(' per '), seg(hit.dest, true), seg('.')];
    if (hit.t.delay > 0) parts.push(seg(' Ha ' + minuti(hit.t.delay) + ' di ritardo.'));
    return { segments: parts, big: bigOf(hit), tone: hit.t.delay > 0 || hit.t.delay === null ? 'late' : 'ok' };
  }

  const vicino = (m) => m.t.day === 0 || L.expMin(m.t) - ctx.now.min <= 180;
  const prossimo = list.find((m) => vicino(m) && (m.t.cancelled || L.expMin(m.t) - ctx.now.min >= -5)) || list[0];
  if (prossimo.t.cancelled) {
    const dopo = list.find((m) => !m.t.cancelled && L.expMin(m.t) >= L.expMin(prossimo.t));
    const parts = [seg('Il treno delle '), seg(prossimo.time, true), seg(' per '), seg(prossimo.dest, true), seg(' è soppresso.')];
    if (dopo) parts.push(seg(' Il successivo parte alle '), seg(dopo.time, true), seg(' per '), seg(dopo.dest, true), seg('.'));
    return { segments: parts, big: { main: '✕', unit: 'soppresso' }, tone: 'cancel' };
  }
  const { eta } = prossimo;
  let parts;
  if (eta !== null && eta <= 1) {
    parts = [seg('Il treno per '), seg(prossimo.dest, true), seg(' sta partendo'), ...binario(prossimo), seg('.')];
  } else if (eta !== null) {
    parts = [seg('Il prossimo treno per '), seg(prossimo.dest, true), seg(' parte tra '), seg(minuti(eta), true), ...binario(prossimo), seg('.')];
  } else if (prossimo.t.day > 0 && !vicino(prossimo)) {
    parts = [seg('Per ora non ci sono altri treni: il prossimo è domani alle '), seg(prossimo.time, true), seg(' per '), seg(prossimo.dest, true), seg('.')];
  } else {
    parts = [seg('Il prossimo treno per '), seg(prossimo.dest, true), seg(' parte alle '), seg(prossimo.time, true), ...binario(prossimo), seg('.')];
  }
  if (!prossimo.t.platform && eta !== null) parts.push(seg(' Il binario non è ancora stato assegnato.'));
  if (prossimo.t.delay > 0) parts.push(seg(' È in ritardo di ' + minuti(prossimo.t.delay) + '.'));
  else if (prossimo.t.delay === null) parts.push(seg(' È in ritardo, ma EAV non dice di quanto.'));
  const late = prossimo.t.delay > 0 || prossimo.t.delay === null;
  return { segments: parts, big: bigOf(prossimo), tone: late ? 'late' : eta === null ? 'far' : 'ok' };
}

function bigOf(m) {
  if (m.t.cancelled) return { main: '✕', unit: 'soppresso' };
  if (m.eta !== null) return m.eta <= 1 ? { main: 'Ora', unit: '' } : { main: String(m.eta), unit: 'min' };
  return { main: m.time, unit: m.t.day > 0 ? 'domani' : 'più tardi' };
}

// Stato in parole semplici (il colore da solo non basta: c'e' anche un simbolo, vedi CSS).
export function statoParole(m) {
  const { t, st } = m;
  if (t.cancelled) return 'Soppresso';
  if (st.cls === 'go') return 'Sta partendo';
  if (t.delay === null) return 'In ritardo';
  if (t.delay > 0) return 'In ritardo di ' + t.delay + ' min';
  if (st.cls === 'gone') return 'Orario superato';
  return t.day === 0 || st.cls === 'ok' ? 'In orario' : '';
}

export function render(ctx) {
  const rows = withDays(ctx, (r) => rowEl(r, ctx), (t) => el('li', { class: 'gf-sep', text: t.split(' / ')[0][0] + t.split(' / ')[0].slice(1).toLowerCase() }));
  if (!rows.length) rows.push(el('li', { class: 'gf-empty', text: ctx.empty }));
  return el('div', { class: 'gf' }, hero(ctx), el('ul', { class: 'gf-list' }, rows));
}

function hero(ctx) {
  const f = frase(ctx);
  return el('section', { class: 'gf-hero t-' + f.tone },
    f.big ? el('div', { class: 'gf-sun', 'aria-hidden': 'true' }, el('strong', { text: f.big.main }), f.big.unit ? el('span', { text: f.big.unit }) : null) : null,
    el('p', { class: 'gf-say' }, f.segments.map((s) => (s.b ? el('b', { text: s.t }) : s.t))));
}

function rowEl(r, ctx) {
  const m = model(r, ctx);
  const { t } = m;
  const stato = statoParole(m);
  const li = el('li', { class: 'gf-row ' + m.cls, 'data-num': t.num },
    el('div', { class: 'gf-stub' }, el('b', { class: 'gf-time strike', text: m.time }), m.prev ? el('small', { text: 'previsto ' + m.prev }) : null),
    el('div', { class: 'gf-body' },
      el('div', { class: 'gf-head' },
        el('span', { class: 'gf-tile swatch', role: 'img', 'aria-label': m.svcName || 'Linea non riconosciuta' }, el('b', { text: m.lineId ? m.lineId.replace(/^L/, '') : '•' })),
        el('h3', { class: 'gf-dest strike', text: m.dest })),
      stato || m.eta !== null ? el('p', { class: 'gf-state' },
        stato ? el('span', { class: 'gf-pill t-' + m.st.cls, text: stato }) : null,
        m.eta !== null && !t.cancelled && m.st.cls !== 'go' ? el('span', { class: 'gf-eta', text: 'tra ' + m.eta + ' min' }) : null) : null,
      el('p', { class: 'gf-meta', text: (m.svcName || 'Linea non riconosciuta') + ', treno ' + t.num + ', ' + (t.cat || 'categoria n.d.') }),
      m.targetText ? el('p', { class: 'gf-arrivo', text: m.match === 'forse' ? 'Probabilmente ferma a ' + m.targetName : 'Ci arrivi' + (m.targetTime ? ' alle ' + m.targetTime : '') + ': ' + m.targetName }) : null,
      m.stopsText ? el('p', { class: 'gf-stops', text: 'Ferma a ' + m.stopsText }) : null),
    el('div', { class: 'gf-plat' + (t.platform ? '' : ' none'), title: t.platform ? 'Binario ' + t.platform : 'Binario da assegnare' },
      el('small', { text: 'binario' }), el('b', { text: t.platform || '–' })));
  if (wire(li, t, ctx)) li.append(el('p', { class: 'gf-full', text: 'Ferma a ' + m.stopsFull }));
  return li;
}
