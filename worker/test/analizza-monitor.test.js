// Test dello script che analizza i dati del monitor (scripts/analizza-monitor.mjs), con una giornata sintetica:
// 12 treni che si comportano in modi diversi, un buco nei dati e un errore di rete.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { caricaMonitor, analizza, rapportoMarkdown } from '../../scripts/analizza-monitor.mjs';

const T0 = Date.UTC(2026, 8, 25, 4, 0, 0);                        // 06:00 a Roma (CEST)
const pad = (n) => String(n).padStart(2, '0');
const hms = (min) => `${pad(Math.floor(min / 60))}:${pad(Math.floor(min % 60))}:${pad(Math.round((min % 1) * 60))}`;
const hm = (min) => hms(min).slice(0, 5);
const mn = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

// un treno del tabellone: visibile da `da` a `a` (minuti), con valori che possono cambiare nel tempo
const treno = (num, time, da, a, o = {}) => ({ num, time, da: mn(da), a: mn(a), cat: 'A', ...o });
const comeTabellone = (t, m) => ({
  num: t.num, cat: t.cat, dest: t.dest ? t.dest(m) : 'SORRENTO', time: t.time, day: 0, platform: '2',
  delay: t.delay ? t.delay(m) : 0, cancelled: t.cancella ? t.cancella(m) : false,
  stops: (t.stops ? t.stops(m) : ['B', 'C']).map((name) => ({ name, time: '07:00' })),
  ritardoRaw: t.ritardoRaw ? t.ritardoRaw(m) : '', info: t.info ? t.info(m) : '', rowClass: 'testoGiallo',
});

const TRENI = [
  treno('1001', '06:20', '05:50', '06:20'),                                                   // normale: esce all'orario
  treno('1002', '06:40', '05:50', '06:22'),                                                   // sparisce 18 minuti prima
  treno('1003', '06:30', '06:05', '06:34', { delay: (m) => (m < 6 * 60 + 12 ? 0 : 4) }),      // ritardo di 4, esce all'orario previsto
  treno('1004', '06:50', '05:50', '07:00'),                                                   // resta fino alla fine del monitor
  treno('1005', '06:30', '05:50', '06:30', { cancella: (m) => m >= 6 * 60 + 10, ritardoRaw: (m) => (m >= 370 ? 'SOPPR.' : ''), info: (m) => (m >= 370 ? 'SOPPRESSO - CANCELLED' : '') }),
  treno('1006', '06:45', '05:50', '06:45', { dest: (m) => (m < 6 * 60 + 14 ? 'SORRENTO' : 'TORRE A.TA - OPLONTI') }),   // destinazione cambiata
  treno('1007', '06:55', '05:50', '07:00', { stops: (m) => (m < 6 * 60 + 10 ? ['A', 'B', 'C'] : ['A', 'C']) }),          // fermata tolta
  treno('1008', '06:35', '05:50', '06:35', { cat: 'EXP' }),                                   // non nel GTFS (come i FAC EX)
  treno('1010', '06:36', '05:50', '06:36'),                                                   // orario diverso dal GTFS (06:38)
  treno('1011', '06:15', '05:50', '06:15', { delay: () => null, ritardoRaw: () => 'RIT.', info: () => 'IN RITARDO - DELAYED' }),   // ritardo senza minuti
  treno('1012', '06:05', '05:50', '06:17', { delay: (m) => (m < 6 * 60 + 8 ? 12 : 6) }),       // ritardo che cala
];

function giornata({ senzaSoppressione = false, senzaBuco = false, tipo = 'P', binari = null } = {}) {
  const treni = senzaSoppressione ? TRENI.filter((t) => t.num !== '1005') : TRENI;
  const campioni = [];
  let prev = null;
  for (let k = 0; k <= 30; k++) {
    const m = 360 + k * 2;
    const t = new Date(T0 + k * 120000).toISOString();
    if (!senzaBuco && m > 6 * 60 + 30 && m < 6 * 60 + 40) continue;             // buco: nessuna risposta tra le 06:32 e le 06:38
    if (k === 20) { campioni.push({ t, rome: hms(m), id: '3', tipo, nome: 'NAPOLI PIAZZA GARIBALDI', ok: false, error: 'HTTP 503' }); continue; }
    const board = treni.filter((x) => m >= x.da && m <= x.a).map((x) => ({ ...comeTabellone(x, m), platform: binari ? binari(x.num, m) : '2' })).sort((a, b) => a.time.localeCompare(b.time));
    const hash = JSON.stringify(board);
    const c = { t, rome: hms(m), id: '3', tipo, nome: 'NAPOLI PIAZZA GARIBALDI', ok: true, hash: String(hash.length) + hash.slice(0, 40), changed: hash !== prev };
    if (c.changed) { c.trains = board; c.nTrains = board.length; }
    prev = hash;
    campioni.push(c);
  }
  return campioni;
}
const ORARI = {
  servizi: { 0: ['20260925'] },
  treni: Object.fromEntries([['1001', '06:20'], ['1002', '06:40'], ['1003', '06:30'], ['1004', '06:50'], ['1005', '06:30'], ['1006', '06:45'], ['1007', '06:55'], ['1009', '06:25'], ['1010', '06:38'], ['1011', '06:15'], ['1012', '06:05']]
    .map(([n, h]) => [n, { l: '1', s: '0', c: 'Sorrento', f: [['1', mn(h) - 3], ['3', mn(h)], ['62', mn(h) + 30]] }])),
};
// GTFS di prova costruito dalla stessa lista di orari, con eventuali correzioni { numero: 'HH:MM' } e uno sfasamento in minuti
const orariDa = (correzioni = {}, sfasa = 0) => ({
  servizi: ORARI.servizi,
  treni: Object.fromEntries(Object.entries(ORARI.treni).map(([n, t]) => {
    const dep = t.f[1][1];
    const h = (correzioni[n] ? mn(correzioni[n]) : dep) + sfasa;
    return [n, { ...t, f: [['1', h - 3], ['3', h], ['62', h + 30]] }];
  })),
});
const NOVITA = [
  { t: '2026-09-25T04:00:00Z', id: '3', tipo: 'P', kind: 'ritardo', value: '4' },
  { t: '2026-09-25T04:00:00Z', id: '3', tipo: 'P', kind: 'cat', value: 'EXP' },
  { t: '2026-09-25T04:10:00Z', id: '3', tipo: 'P', kind: 'info', value: 'SOPPRESSO - CANCELLED' },
  { t: '2026-09-25T04:10:00Z', id: '3', tipo: 'P', kind: 'ritardo', value: 'CANC' },
];
const analisi = (over = {}, opts = {}) => analizza({ dir: 'prova', campioni: giornata(over), novita: NOVITA, segnali: [] }, { orari: ORARI, ...opts });

test('monitor: conteggi generali, errori e buchi nei dati', () => {
  const R = analisi();
  assert.equal(R.meta.tabelloni, 1);
  assert.equal(R.meta.data, '2026-09-25');
  assert.equal(R.meta.errori, 1);
  assert.equal(R.qualita.errori['3-P'], 1);
  assert.equal(R.qualita.buchi.length >= 1, true);
  assert.ok(R.qualita.buchi.some((b) => b.minuti >= 8), JSON.stringify(R.qualita.buchi));
  assert.equal(analisi({ senzaBuco: true }).qualita.buchi.length, 0, 'un solo giro fallito (4 minuti) non e\' un buco: la soglia e\' "piu\' di 4"');
});

test('monitor: la soppressione segnalata da EAV viene trovata, con la scritta esatta', () => {
  const R = analisi();
  assert.equal(R.segnali.length, 1);
  const s = R.segnali[0];
  assert.equal(s.treno, '1005');
  assert.equal(s.flag, true);
  assert.equal(s.ritardoRaw === 'SOPPR.' || s.ritardoRaw === '', true);
  assert.match(rapportoMarkdown(R), /Soppressioni segnalate da EAV\*\*: \*\*1\*\*/);
});

test('monitor: senza soppressioni il rapporto dice "nessuna" e non inventa nulla', () => {
  const R = analisi({ senzaSoppressione: true });
  assert.equal(R.segnali.length, 0);
  assert.match(rapportoMarkdown(R), /Soppressioni segnalate da EAV\*\*: nessuna/);
});

test('monitor: un treno sparito 18 minuti prima e\' un candidato; quelli che escono all\'orario no', () => {
  const R = analisi();
  const nums = R.scomparsi.map((x) => x.treno);
  assert.deepEqual(nums, ['1002']);
  assert.ok(Math.abs(R.scomparsi[0].anticipo - 18) <= 2, 'anticipo ' + R.scomparsi[0].anticipo);
  assert.ok(R.scomparsi[0].anticipoMin >= 14 && R.scomparsi[0].anticipoMin <= R.scomparsi[0].anticipo, 'intervallo dell\'anticipo');
  for (const n of ['1001', '1003', '1004', '1012']) assert.ok(!nums.includes(n), n + ' non doveva essere un candidato');
  assert.ok(analisi({}, { soglia: 30 }).scomparsi.length === 0, 'con una soglia alta non ce ne sono');
  // i treni che escono di norma: il mediano e' vicino a zero
  assert.ok(Math.abs(R.anticipo.p50) <= 3, JSON.stringify(R.anticipo));
  assert.ok(R.ingresso.n >= 1 && R.ingresso.p50 > 0);
});

test('monitor: confronto col GTFS: mancanti, non programmati (EXP a parte), orari diversi', () => {
  const R = analisi();
  assert.deepEqual(R.gtfs.mancanti.map((x) => x.treno), ['1009']);
  assert.equal(R.gtfs.mancanti[0].orario, '06:25');
  assert.deepEqual(R.gtfs.nonProgrammati.map((x) => x.treno), ['1008']);
  assert.equal(R.gtfs.nonProgrammati[0].cat, 'EXP');
  assert.deepEqual(R.gtfs.orariDiversi.map((x) => [x.treno, x.tabelloneOrario, x.gtfs]), [['1010', '06:36', '06:38']]);
  assert.ok(R.gtfs.programmatiControllati >= 10);
  const md = rapportoMarkdown(R);
  assert.match(md, /non visti 1, visti ma non programmati 1 \(di cui `EXP`: 1\)/);
});

test('monitor: senza GTFS il confronto e\' "non disponibile"', () => {
  const R = analizza({ dir: 'prova', campioni: giornata(), novita: [], segnali: [] }, {});
  assert.equal(R.gtfs.disponibile, false);
  assert.match(rapportoMarkdown(R), /non disponibile/i);
});

test('monitor: un GTFS con un servizio non attivo oggi non fa risultare "mancanti" i suoi treni', () => {
  const altro = { ...ORARI, servizi: { 0: ['20260101'] } };
  const R = analisi({}, { orari: altro });
  assert.deepEqual(R.gtfs.mancanti, []);
  assert.equal(R.gtfs.programmatiControllati, 0);
});

test('monitor: cambi di destinazione e fermate tolte sullo stesso treno', () => {
  const R = analisi();
  assert.deepEqual(R.cambi.destinazione.map((x) => x.treno), ['1006']);
  assert.deepEqual(R.cambi.destinazione[0].destinazioni, ['SORRENTO', 'TORRE A.TA - OPLONTI']);
  assert.deepEqual(R.cambi.fermate.map((x) => [x.treno, x.tolte]), [['1007', ['B']]]);
});

test('monitor: ritardi, ritardo senza minuti e ritardi che calano', () => {
  const R = analisi();
  assert.equal(R.ritardi.senzaMinuti, 1);
  assert.equal(R.ritardi.soglie[10], 1);                            // solo 1012 ha toccato 12
  assert.equal(R.ritardi.soglie[1] >= 2, true);
  assert.deepEqual(R.ritardi.cali.map((x) => [x.treno, x.da, x.a]), [['1012', 12, 6]]);
  assert.equal(R.ritardi.peggiori[0].treno, '1012');
});

test('monitor: le novita\' fuori dal noto finiscono in "da guardare"', () => {
  const R = analisi();
  assert.deepEqual(R.novita.inattesi.map((x) => x.valore).sort(), ['CANC', 'SOPPRESSO - CANCELLED']);
  assert.deepEqual(R.novita.perTipo.cat, ['EXP']);
});

test('monitor: legge i file dalla cartella e ignora le righe rovinate', () => {
  const dir = mkdtempSync(tmpdir() + '/monitor-');
  writeFileSync(dir + '/campioni.jsonl', giornata().map((c) => JSON.stringify(c)).join('\n') + '\n{riga rotta\n');
  writeFileSync(dir + '/novita.jsonl', NOVITA.map((n) => JSON.stringify(n)).join('\n') + '\n');
  const d = caricaMonitor(dir);
  assert.equal(d.campioni.length, giornata().length);
  assert.equal(d.novita.length, 4);
  assert.deepEqual(d.segnali, []);                                   // file assente: nessun errore
  const md = rapportoMarkdown(analizza(d, { orari: ORARI }));
  assert.match(md, /^# Rapporto del monitor dei capolinea/);
  assert.match(md, /## 6\. Valori mai visti/);
  const vuota = mkdtempSync(tmpdir() + '/monitor-');
  writeFileSync(vuota + '/campioni.jsonl', '');
  assert.throws(() => caricaMonitor(vuota), /nessun campione/);
});

test('monitor: tabelloni vuoti (nessun treno) non fanno rompere l\'analisi', () => {
  const vuoti = giornata().map((c) => (c.ok ? { ...c, trains: [], nTrains: 0 } : c));
  const R = analizza({ dir: 'v', campioni: vuoti, novita: [], segnali: [] }, { orari: ORARI });
  assert.equal(R.segnali.length, 0);
  assert.equal(R.scomparsi.length, 0);
  assert.ok(rapportoMarkdown(R).length > 200);
});

test('monitor: un treno uscito durante un buco nei dati NON e\' un candidato (non si sa quando e\' uscito)', () => {
  // 1010 parte alle 06:36 e il monitor non risponde tra le 06:32 e le 06:38: l'ultima volta visto e' 06:30 (6 minuti prima)
  const R = analisi();
  assert.ok(!R.scomparsi.some((x) => x.treno === '1010'));
  // senza il buco lo stesso treno esce all'orario e nemmeno allora e' un candidato
  assert.ok(!analisi({ senzaBuco: true }).scomparsi.some((x) => x.treno === '1010'));
});

test('monitor: sui tabelloni degli arrivi si confronta l\'orario di arrivo, non quello di partenza', () => {
  // GTFS: a Garibaldi il treno 1001 arriva alle 06:18 e riparte alle 06:20; il tabellone degli arrivi mostra 06:20 per 1001 (uguale alla partenza)
  const orari = { servizi: ORARI.servizi, treni: { 1001: { l: '1', s: '0', c: 'S', f: [['1', 1], ['3', mn('06:20'), mn('06:18')], ['62', 999]] } } };
  const soloUno = giornata({ tipo: 'A' }).map((c) => (c.ok && c.trains ? { ...c, trains: c.trains.filter((x) => x.num === '1001').map((x) => ({ ...x, time: '06:18' })) } : c));
  const R = analizza({ dir: 'a', campioni: soloUno, novita: [], segnali: [] }, { orari });
  assert.deepEqual(R.gtfs.orariDiversi, [], 'arrivo 06:18 = arrivo del GTFS: nessuna differenza');
  const sbagliato = soloUno.map((c) => (c.ok && c.trains ? { ...c, trains: c.trains.map((x) => ({ ...x, time: '06:20' })) } : c));
  const R2 = analizza({ dir: 'a', campioni: sbagliato, novita: [], segnali: [] }, { orari });
  assert.deepEqual(R2.gtfs.orariDiversi.map((x) => [x.tabelloneOrario, x.gtfs]), [['06:20', '06:18']], 'sul tabellone degli arrivi 06:20 non e\' l\'arrivo');
});

test('monitor: il binario conta come cambiato solo se riassegnato, non quando viene assegnato la prima volta', () => {
  const assegnato = giornata({ binari: (n, m) => (m < 6 * 60 + 10 ? null : '2') });        // prima nessun binario, poi il 2
  assert.equal(analizza({ dir: 'b', campioni: assegnato, novita: [], segnali: [] }, {}).cambi.binari, 0);
  const cambiato = giornata({ binari: (n, m) => (n === '1004' && m > 6 * 60 + 20 ? '5' : '2') });   // il 1004 passa dal 2 al 5
  const R = analizza({ dir: 'b', campioni: cambiato, novita: [], segnali: [] }, {});
  assert.equal(R.cambi.binari, 1);
  assert.deepEqual(R.cambi.binariEsempi[0].binari, ['2', '5']);
});

test('monitor: la riga di intestazione della tabella (bgcolor yellow) non e\' una novita\'', () => {
  const R = analizza({ dir: 'n', campioni: giornata(), novita: [{ t: 'x', id: '1', tipo: 'P', kind: 'bgcolor', value: 'yellow' }], segnali: [] }, {});
  assert.deepEqual(R.novita.inattesi, []);
});

// ---- affidabilita' del GTFS: se differisce troppo, non si usa per gli orari ----

test('affidabilita\': un GTFS con un orario diverso su 10 (90%) non supera la soglia di concordanza del 95%', () => {
  const f = analisi().gtfs.fiducia;
  assert.equal(f.viste, 10, 'i treni EXP non contano');
  assert.equal(f.inGtfs, 10);
  assert.equal(f.uguali, 9);
  assert.equal(f.copertura, 1);
  assert.ok(Math.abs(f.concordanza - 0.9) < 1e-9);
  assert.equal(f.verdetto, 'non usare');
  assert.match(f.motivi.join(), /concordanza degli orari 90\.0% sotto la soglia 95\.0%/);
  assert.match(rapportoMarkdown(analisi()), /Affidabilità del GTFS per gli orari\*\*: \*\*non usare\*\*/);
});

test('affidabilita\': un GTFS preciso e\' "affidabile" (anche con un treno programmato non visto, sotto il 10%)', () => {
  const f = analisi({}, { orari: orariDa({ 1010: '06:36' }) }).gtfs.fiducia;
  assert.equal(f.concordanza, 1);
  assert.ok(f.mancanti > 0 && f.mancanti <= 0.1, 'un solo mancante (1009) su 11: ' + f.mancanti);
  assert.equal(f.verdetto, 'affidabile');
  assert.deepEqual(f.motivi, []);
});

test('affidabilita\': un GTFS sfasato di 7 minuti differisce troppo e non va usato', () => {
  const f = analisi({}, { orari: orariDa({ 1010: '06:36' }, 7) }).gtfs.fiducia;
  assert.equal(f.uguali, 0);
  assert.equal(f.verdetto, 'non usare');
});

test('affidabilita\': le soglie si possono cambiare, e con pochi treni il giudizio e\' "non valutabile"', () => {
  assert.equal(analisi({}, { soglieFiducia: { concordanza: 0.8 } }).gtfs.fiducia.verdetto, 'affidabile');
  assert.equal(analisi({}, { soglieFiducia: { mancanti: 0.01, concordanza: 0.8 } }).gtfs.fiducia.verdetto, 'non usare');
  const pochi = giornata().map((c) => (c.ok && c.trains ? { ...c, trains: c.trains.filter((x) => ['1001', '1002', '1003'].includes(x.num)) } : c));
  const f = analizza({ dir: 'p', campioni: pochi, novita: [], segnali: [] }, { orari: ORARI }).gtfs.fiducia;
  assert.equal(f.verdetto, 'non valutabile');
  assert.match(f.motivi.join(), /troppo pochi treni per giudicare/);
});

test('affidabilita\': senza GTFS non c\'e\' nessun giudizio', () => {
  assert.equal(analizza({ dir: 'p', campioni: giornata(), novita: [], segnali: [] }, {}).gtfs.fiducia, null);
});
