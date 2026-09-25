// Test di docs/orari.js (orari programmati dentro l'app) e dei punti in cui logic.js li usa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as L from '../../docs/logic.js';
import * as O from '../../docs/orari.js';
import { CFG, FIDUCIA } from '../../docs/config.js';

const catalogo = JSON.parse(readFileSync(new URL('../../docs/stazioni.json', import.meta.url), 'utf8'));
const tr = (o) => ({ num: '1', cat: 'A', dest: 'SORRENTO', time: '22:00', day: 0, platform: null, delay: 0, cancelled: false, stops: [], ...o });
const nuovoIdx = () => L.buildIndex(catalogo);

// Mini orari: servizio "0" sempre attivo oggi, "9" mai.
const OGGI = '2026-09-25';
const dati = (extra = {}) => ({
  v: 1, valido: ['2026-09-01', '2026-12-31'],
  servizi: { 0: ['20260901-20261231'], 1: ['20260101-20260131'] },
  stazioni: {}, nonServite: ['56'],
  treni: {
    100: { l: '1', s: '0', c: 'Sorrento', f: [['1', 600], ['3', 605, 604], ['41', 610, 609], ['62', 640]] },
    200: { l: '8', s: '0', c: 'Volla', f: [['1', 700], ['70', 730]] },
    300: { l: '5', s: '0', c: 'Torregaveta', f: [['1', 800], ['3', 810]] },
    400: { l: '1', s: '1', c: 'Sorrento', f: [['1', 900], ['62', 950]] },
    500: [{ l: '1', s: '1', c: 'Sorrento', f: [['1', 1000], ['62', 1050]] }, { l: '1.', s: '0', c: 'Torre', f: [['1', 1010], ['53', 1040]] }],
  },
  ...extra,
});

test('creaOrari: rifiuta formato ignoto, non ancora validi o scaduti', () => {
  assert.equal(O.creaOrari(null), null);
  assert.equal(O.creaOrari({ v: 2 }), null);
  assert.equal(O.creaOrari(dati(), { oggi: '2027-01-01' }), null);
  assert.equal(O.creaOrari(dati(), { oggi: '2026-08-31' }), null);
  assert.ok(O.creaOrari(dati(), { oggi: OGGI }));
});

test('treno(): solo il viaggio attivo oggi; un numero con piu\' viaggi sceglie quello di oggi', () => {
  const o = O.creaOrari(dati(), { oggi: OGGI });
  assert.equal(o.treno('100').c, 'Sorrento');
  assert.equal(o.treno('400'), null);          // servizio non attivo oggi
  assert.equal(o.treno('500').l, '1.');        // dei due viaggi vale quello attivo
  assert.equal(o.treno('999'), null);
});

test('servizioDi(): mappa i percorsi; Volla e\' Pomigliano; circumflegrea; percorsi ignoti nessuno', () => {
  const o = O.creaOrari(dati(), { oggi: OGGI });
  assert.equal(o.servizioDi(o.treno('100')), 'sorrento');
  assert.equal(o.servizioDi(o.treno('200')), 'pomigliano');
  assert.equal(o.servizioDi(o.treno('300')), 'circumflegrea');
  assert.equal(o.servizioDi(o.treno('500')), 'torre');
  assert.equal(o.servizioDi({ l: '2', f: [['1', 1]] }), null);
});

test('fermateDa(): dopo la stazione per le partenze, prima per gli arrivi; null se non ci passa o e\' il capolinea sbagliato', () => {
  const o = O.creaOrari(dati(), { oggi: OGGI }), t = o.treno('100');
  assert.deepEqual(o.fermateDa(t, '3', 'P'), ['41', '62']);
  assert.deepEqual(o.fermateDa(t, '3', 'A'), ['1']);
  assert.equal(o.fermateDa(t, '62', 'P'), null);   // ultima fermata: non parte
  assert.equal(o.fermateDa(t, '1', 'A'), null);    // prima: non arriva
  assert.equal(o.fermateDa(t, '99', 'P'), null);
});

test('orarioA(): partenza sui tabelloni delle partenze, arrivo su quelli degli arrivi', () => {
  const o = O.creaOrari(dati(), { oggi: OGGI }), t = o.treno('100');
  assert.equal(o.orarioA(t, '3', 'P'), 605);
  assert.equal(o.orarioA(t, '3', 'A'), 604);
  assert.equal(o.orarioA(t, '1', 'A'), 600);       // senza arrivo esplicito = partenza
});

test('valutaFiducia: soglie e verdetti', () => {
  assert.equal(O.valutaFiducia({ viste: 40, inGtfs: 40, uguali: 40, mancanti: 0, controllati: 20 }).verdetto, 'affidabile');
  assert.equal(O.valutaFiducia({ viste: 40, inGtfs: 30, uguali: 30, mancanti: 0, controllati: 20 }).verdetto, 'non usare');   // copertura 75%
  assert.equal(O.valutaFiducia({ viste: 40, inGtfs: 40, uguali: 30, mancanti: 0, controllati: 20 }).verdetto, 'non usare');   // concordanza 75%
  assert.equal(O.valutaFiducia({ viste: 40, inGtfs: 40, uguali: 40, mancanti: 5, controllati: 20 }).verdetto, 'non usare');   // mancanti 25%
  const poco = O.valutaFiducia({ viste: 5, inGtfs: 5, uguali: 5, mancanti: 0, controllati: 3 });
  assert.equal(poco.verdetto, 'non valutabile');
  assert.ok(poco.motivi.length);
  assert.equal(FIDUCIA.minTreni, 10);
});

// tabellone finto con N treni tutti coincidenti col mini GTFS di sotto
function tabelloneSintetico(n, sfasa = 0) {
  const treni = {}, live = [];
  for (let i = 0; i < n; i++) {
    treni[String(1000 + i)] = { l: '1', s: '0', c: 'Sorrento', f: [['1', 600 + i * 10], ['62', 650 + i * 10]] };
    const min = 600 + i * 10 + (i < sfasa ? 1 : 0);
    live.push(tr({ num: String(1000 + i), time: `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}` }));
  }
  return { o: O.creaOrari(dati({ treni }), { oggi: OGGI }), live };
}

test('valuta(): tabellone che coincide -> affidabile; orari sfasati -> non usare', () => {
  let { o, live } = tabelloneSintetico(12);
  assert.equal(o.valuta(live, '1', 'P', 590).fiducia.verdetto, 'affidabile');
  ({ o, live } = tabelloneSintetico(12, 6));
  assert.equal(o.valuta(live, '1', 'P', 590).fiducia.verdetto, 'non usare');
});

test('valuta(): EXP e treni di domani non contano; treni programmati mancanti si vedono', () => {
  const { o, live } = tabelloneSintetico(12);
  const exp = tr({ num: '77777', cat: 'EXP', time: '10:05' }), dom = tr({ num: '88888', day: 1, time: '05:00' });
  assert.equal(o.valuta([...live, exp, dom], '1', 'P', 590).conteggi.viste, 12);
  const senza = live.filter((t) => t.num !== '1003');
  const v = o.valuta(senza, '1', 'P', 590);
  assert.equal(v.mancanti.length, 1);
  assert.equal(v.mancanti[0].num, '1003');
});

test('trovaAssenti: solo entro la finestra e prima dell\'ultimo treno in elenco', () => {
  const { o, live } = tabelloneSintetico(12); // 10:00 ... 11:50
  const senza = live.filter((t) => t.num !== '1003' && t.num !== '1011'); // 1003 = 10:30, 1011 = 11:50 (ultimo)
  const a = O.trovaAssenti(o, senza, '1', 'P', 600, 60);
  assert.deepEqual(a.map((x) => x.num), ['1003']);          // 1011 e' dopo l'ultimo in elenco (11:40) ed e' fuori finestra
  assert.deepEqual(O.trovaAssenti(o, senza, '1', 'P', 600, 20).map((x) => x.num), []);   // 10:30 fuori da 20 min
  assert.deepEqual(O.trovaAssenti(o, [], '1', 'P', 600, 60), []);                           // tabellone vuoto: niente da dire
});

test('inferGtfs: servizio esatto dal numero, con le guardie', () => {
  const idx = nuovoIdx(), o = O.creaOrari(dati(), { oggi: OGGI });
  const id = (n) => idx.resolve(n);
  const napoli = '1', dest = catalogo.stazioni.find((s) => s.id === '62').nome;
  const g = O.inferGtfs(o, tr({ num: '100', dest, time: '10:00' }), napoli, 'P', idx, CFG);
  assert.equal(g.service, 'sorrento');
  assert.deepEqual(g.fermate, ['3', '41', '62']);
  // destinazione diversa dal capolinea GTFS: e' un altro treno, non si usa
  assert.equal(O.inferGtfs(o, tr({ num: '100', dest: catalogo.stazioni.find((s) => s.id === '53').nome }), napoli, 'P', idx, CFG), null);
  // numero non attivo oggi / sconosciuto / stazione non sul percorso
  assert.equal(O.inferGtfs(o, tr({ num: '400', dest }), napoli, 'P', idx, CFG), null);
  assert.equal(O.inferGtfs(o, tr({ num: '424242', dest }), napoli, 'P', idx, CFG), null);
  assert.equal(O.inferGtfs(o, tr({ num: '100', dest }), '99', 'P', idx, CFG), null);
  assert.ok(id);
});

test('inferGtfs: la destinazione fa da servizio (Torre A.ta, Napoli) come prima', () => {
  const idx = nuovoIdx();
  const o = O.creaOrari(dati({ treni: { 5: { l: '1', s: '0', c: 'Torre Annunziata', f: [['1', 600], ['41', 640]] } } }), { oggi: OGGI });
  const g = O.inferGtfs(o, tr({ num: '5', dest: catalogo.stazioni.find((s) => s.id === '41').nome }), '1', 'P', idx, CFG);
  assert.equal(g.service, 'torre');
  assert.equal(g.lineService, 'sorrento');
});

test('goesTo con fermate esatte e con stazioni non servite', () => {
  const idx = nuovoIdx();
  const t = tr({ num: '100' });
  assert.equal(L.goesTo(t, '1', '41', idx, [], ['3', '41', '62']), 'si');
  assert.equal(L.goesTo(t, '1', '44', idx, [], ['3', '41', '62']), 'no');   // salta: certo, non "forse"
  // senza orari una stazione non monitorata resta "forse"; con gli orari e' "non servita" -> 'no'
  const cavalli = catalogo.stazioni.find((s) => s.dati === false).id;
  const senzaElenco = tr({ cat: 'A', dest: 'SORRENTO', stops: [{ name: 'PORTICI BELLAVISTA', time: '22:20' }, { name: 'SORRENTO', time: '23:10' }] });
  assert.equal(L.goesTo(senzaElenco, '1', cavalli, idx), 'forse');
  idx.setNonServite(['56', cavalli]);
  assert.equal(idx.nonServita(cavalli), true);
  assert.equal(L.goesTo(senzaElenco, '1', cavalli, idx), 'no');
  idx.setNonServite([]);
  assert.equal(idx.nonServita(cavalli), false);
});

test('statusOf: treno "previsto, non in elenco" e\' grigio, mai "soppresso"', () => {
  const g = tr({ fantasma: true, time: '10:30' });
  const st = L.statusOf(g, 600);
  assert.equal(st.cls, 'ghost');
  assert.equal(st.main, 'Previsto, non in elenco');
  assert.doesNotMatch(st.main, /soppress|cancell/i);
  assert.equal(L.etaMin(g, 600), null);
  assert.equal(L.statusOf(tr({ cancelled: true }), 600).cls, 'cancel');   // il rosso resta per quelli che EAV segna soppressi
});

test('orari.json reale: valido, e coerente con la mappa dei percorsi', () => {
  const dr = JSON.parse(readFileSync(new URL('../../docs/orari.json', import.meta.url), 'utf8'));
  const o = O.creaOrari(dr, { oggi: dr.valido[0] });
  assert.ok(o, 'orari.json deve essere utilizzabile nel suo periodo di validita\'');
  assert.ok(Object.keys(dr.treni).length > 500);
  assert.ok(o.nonServite.has('816') || o.nonServite.size >= 19);
  // ogni percorso che ha treni e' mappato; 2 e 7 (Aversa, Caserta) sono fuori dal catalogo per scelta
  const senza = new Set();
  for (const t0 of Object.values(dr.treni)) for (const t of [].concat(t0)) if (!o.servizioDi(t)) senza.add(t.l);
  assert.deepEqual([...senza].sort(), ['2', '7'], 'percorsi con treni ma senza servizio: ' + [...senza]);
});
