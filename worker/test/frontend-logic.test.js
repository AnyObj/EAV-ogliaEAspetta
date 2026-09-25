// Test della logica pura del frontend (docs/logic.js). Stanno qui per riusare `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as L from '../../docs/logic.js';
import { CFG } from '../../docs/config.js';

const catalogo = JSON.parse(readFileSync(new URL('../../docs/stazioni.json', import.meta.url), 'utf8'));
const idx = L.buildIndex(catalogo);
const id = (name) => { const r = idx.resolve(name); assert.ok(r, 'stazione non trovata: ' + name); return r; };
const tr = (o) => ({ num: '1', cat: 'A', dest: 'SORRENTO', time: '22:00', day: 0, platform: null, delay: 0, cancelled: false, stops: [], ...o });

// ---- nomi ----

test('norm: le varianti di San/Santa/Sant\' e A.TA combaciano col catalogo', () => {
  assert.equal(L.norm('S.PIETRO'), L.norm('SAN PIETRO'));
  assert.equal(L.norm("SANT'AGNELLO"), L.norm('S. Agnello'));
  assert.equal(L.norm('TORRE A.TA - OPLONTI'), L.norm('TORRE ANNUNZIATA - OPLONTI'));
  assert.equal(L.norm('PORTICI VIA LIBERTÀ'), 'PORTICI VIA LIBERTA');
});

test('i nomi delle fermate reali si abbinano al catalogo (alias compresi)', () => {
  for (const n of ['NAPOLI P. GARIBALDI', 'POLLENA TROCCHIA', 'SAN VALENTINO TORIO', 'BOSCOTRECASE',
    'TORRE A.TA - OPLONTI', 'S. Agnello', 'Via S. Antonio', 'S. Maria del Pozzo', 'SAN PIETRO']) id(n);
});

test('titleCase', () => {
  assert.equal(L.titleCase('NAPOLI PIAZZA GARIBALDI'), 'Napoli Piazza Garibaldi');
  assert.equal(L.titleCase('SANTA MARIA DEL POZZO'), 'Santa Maria del Pozzo');
  assert.equal(L.titleCase("SANT'AGNELLO"), "Sant'Agnello");
  assert.equal(L.titleCase('TORRE A.TA - OPLONTI'), 'Torre A.ta - Oplonti');
  assert.equal(L.titleCase('SAN GIOVANNI A TEDUCCIO'), 'San Giovanni a Teduccio');
  assert.equal(L.titleCase('Villa Regina'), 'Villa Regina'); // gia' con minuscole: invariato
});

// ---- ricerca ----

test('ricerca fuzzy', () => {
  const names = (q) => L.searchStations(q, idx).map((s) => s.nome);
  assert.match(names('pompei')[0], /^POMPEI/);
  assert.equal(names('garibaldi')[0], 'NAPOLI PIAZZA GARIBALDI');
  assert.equal(names('sorento')[0], 'SORRENTO');           // una lettera in meno
  assert.equal(names('sorrnto')[0], 'SORRENTO');          // idem
  assert.ok(names('san giorgio').includes('SAN GIORGIO A CREMANO'));
  assert.ok(names('s giorgio cremano').includes('SAN GIORGIO A CREMANO'));
  assert.ok(names('boscotrecase').length > 0);             // via alias/nome lungo
  assert.ok(names('pollena trocchia').length > 0);         // solo via alias
  assert.deepEqual(names('xyzq'), []);
  assert.deepEqual(names(''), []);
});

// ---- linea / servizio ----

test('catalogo: ordine delle stazioni per linea = percorso', () => {
  const sor = idx.lines.get('NAPOLI-SORRENTO');
  assert.equal(sor.stazioni[0], id('NAPOLI PORTA NOLANA'));
  assert.equal(sor.stazioni.at(-1), id('SORRENTO'));
  assert.ok(sor.pos.get(id('TORRE DEL GRECO')) < sor.pos.get(id('POMPEI SCAVI VILLA DEI MISTERI')));
});

test('inferService: destinazione capolinea', () => {
  const g = id('NAPOLI PIAZZA GARIBALDI');
  assert.equal(L.inferService(tr({ dest: 'SORRENTO', num: '1219' }), g, idx, CFG).service, 'sorrento');
  assert.equal(L.inferService(tr({ dest: 'BAIANO', num: '80001' }), g, idx, CFG).service, 'baiano');
  assert.equal(L.inferService(tr({ dest: 'SARNO', num: '6195' }), g, idx, CFG).service, 'sarno');
});

test('inferService: Torre A.ta e sempre il servizio "torre", anche se a meta\' di due linee', () => {
  const g = id('NAPOLI PIAZZA GARIBALDI');
  assert.equal(L.inferService(tr({ dest: 'TORRE A.TA - OPLONTI', num: '12021' }), g, idx, CFG).service, 'torre');
});

test('inferService: Cumana e Circumflegrea da stazione e destinazione', () => {
  assert.equal(L.inferService(tr({ dest: 'FUORIGROTTA', num: '92200' }), id('MONTESANTO'), idx, CFG).service, 'cumana');
  assert.equal(L.inferService(tr({ dest: 'LICOLA', num: '50502' }), id('SOCCAVO'), idx, CFG).service, 'circumflegrea');
});

test('inferService: verso Napoli in un tratto in comune, il numero (4 cifre) sceglie la linea', () => {
  const s = id('ERCOLANO SCAVI');
  // il colore e' "verso Napoli", ma la linea ricavata resta disponibile
  const a = L.inferService(tr({ dest: 'NAPOLI PORTA NOLANA', num: '1214' }), s, idx, CFG);
  assert.deepEqual([a.service, a.lineService], ['napoli', 'sorrento']);
  const b = L.inferService(tr({ dest: 'NAPOLI PORTA NOLANA', num: '4192' }), s, idx, CFG);
  assert.deepEqual([b.service, b.lineService], ['napoli', 'poggiomarino']);
});

test('inferService: se i dati non bastano la linea resta ignota (non inventata)', () => {
  const s = id('ERCOLANO SCAVI');
  const r = L.inferService(tr({ dest: 'NAPOLI PORTA NOLANA', num: '12144' }), s, idx, CFG);
  assert.equal(r.lineService, null);
  assert.ok(r.lines.length > 1);
  // per una destinazione qualunque senza servizio proprio, service null = riga grigia
  assert.equal(L.inferService(tr({ dest: 'VOLLA', num: '12144' }), id('CASALNUOVO'), idx, CFG).service, null); // Baiano o Pomigliano?
});

test('inferService: Napoli Porta Nolana = servizio "napoli" (arcobaleno) sempre', () => {
  for (const st of ['VICO EQUENSE', 'ERCOLANO SCAVI', 'SARNO', 'BAIANO']) {
    assert.equal(L.inferService(tr({ dest: 'NAPOLI PORTA NOLANA', num: '12144' }), id(st), idx, CFG).service, 'napoli', st);
  }
});

test('inferService: una linea in una sola stazione non ambigua non si sbaglia', () => {
  // Vico Equense e' solo sulla linea di Sorrento
  assert.equal(L.inferService(tr({ dest: 'NAPOLI PORTA NOLANA', num: '12144' }), id('VICO EQUENSE'), idx, CFG).lineService, 'sorrento');
});

// ---- "Vai a" ----

test('goesTo: con l\'elenco delle fermate', () => {
  const g = id('NAPOLI PIAZZA GARIBALDI'), pompei = id('POMPEI SCAVI VILLA DEI MISTERI');
  const t = tr({ dest: 'SORRENTO', stops: [{ name: 'TORRE A.TA - OPLONTI', time: '22:18' }, { name: 'POMPEI SCAVI VILLA DEI MISTERI', time: '22:24' }, { name: 'SORRENTO', time: '23:05' }] });
  assert.equal(L.goesTo(t, g, pompei, idx), 'si');
  assert.equal(L.goesTo(t, g, id('SARNO'), idx), 'no');
  assert.equal(L.goesTo(t, g, id('SORRENTO'), idx), 'si');       // la destinazione
  assert.equal(L.goesTo(t, g, g, idx), 'no');                     // la stazione stessa
});

test('goesTo: senza fermate usa ordine e direzione della linea', () => {
  const td = id('TORRE DEL GRECO'), pompei = id('POMPEI SCAVI VILLA DEI MISTERI'), portici = id('PORTICI BELLAVISTA');
  const verso = tr({ dest: 'SORRENTO' }), napoli = tr({ dest: 'NAPOLI PORTA NOLANA' });
  const lines = ['NAPOLI-SORRENTO'];
  assert.equal(L.goesTo(verso, td, pompei, idx, lines), 'si');   // avanti verso Sorrento
  assert.equal(L.goesTo(verso, td, portici, idx, lines), 'no');  // indietro
  assert.equal(L.goesTo(napoli, td, portici, idx, lines), 'si'); // verso Napoli
  assert.equal(L.goesTo(napoli, td, pompei, idx, lines), 'no');
});

test('goesTo: destinazione oltre il bersaglio ma non raggiunto (treno corto)', () => {
  // Torre A.ta - Oplonti e' prima di Pompei Scavi: un treno che finisce li' non ci arriva
  const g = id('NAPOLI PIAZZA GARIBALDI');
  const t = tr({ dest: 'TORRE A.TA - OPLONTI' });
  assert.equal(L.goesTo(t, g, id('POMPEI SCAVI VILLA DEI MISTERI'), idx, ['NAPOLI-SORRENTO']), 'no');
  assert.equal(L.goesTo(t, g, id('TORRE DEL GRECO'), idx, ['NAPOLI-SORRENTO']), 'si');
});

// ---- stato, tempo, aggiornamento ----

const at = (h, m) => h * 60 + m;

test('statusOf', () => {
  const now = at(22, 30);
  assert.equal(L.statusOf(tr({ time: '22:50' }), now).main, 'In orario');
  assert.equal(L.statusOf(tr({ time: '22:30' }), now).cls, 'go');
  assert.equal(L.statusOf(tr({ time: '22:20', delay: 12 }), now).main, 'Ritardo +12 min'); // previsto 22:32: ancora fuori dalla finestra "in partenza"
});

test('statusOf: ritardo, ritardo senza minuti, soppresso, domani, superato', () => {
  const now = at(22, 30);
  assert.deepEqual(L.statusOf(tr({ time: '23:10', delay: 3 }), now).cls, 'd1');
  assert.deepEqual(L.statusOf(tr({ time: '23:10', delay: 9 }), now).cls, 'd2');
  assert.deepEqual(L.statusOf(tr({ time: '23:10', delay: 20 }), now).cls, 'd3');
  assert.equal(L.statusOf(tr({ time: '23:10', delay: null }), now).main, 'In ritardo');
  assert.equal(L.statusOf(tr({ time: '23:10', cancelled: true }), now).main, 'SOPPRESSO');
  assert.equal(L.statusOf(tr({ time: '05:19', day: 1 }), now).main, '');
  assert.equal(L.statusOf(tr({ time: '05:19', day: 1, delay: null }), now).main, 'In ritardo');
  assert.equal(L.statusOf(tr({ time: '22:10' }), now).cls, 'gone');
});

test('etaMin', () => {
  const now = at(22, 30);
  assert.equal(L.etaMin(tr({ time: '22:41' }), now), 11);
  assert.equal(L.etaMin(tr({ time: '22:41', delay: 4 }), now), 15);
  assert.equal(L.etaMin(tr({ time: '22:20' }), now), 0);
  assert.equal(L.etaMin(tr({ time: '23:45' }), now), null);          // oltre un'ora
  assert.equal(L.etaMin(tr({ time: '05:19', day: 1 }), now), null);
  assert.equal(L.etaMin(tr({ time: '22:41', cancelled: true }), now), null);
});

test('nextRefreshMs: finestra simmetrica attorno a adesso', () => {
  const now = at(22, 30);
  assert.equal(L.nextRefreshMs([tr({ time: '22:33' })], now), 10000);            // tra 3 min
  assert.equal(L.nextRefreshMs([tr({ time: '22:26' })], now), 10000);            // partito da 4 min: puo' essere ancora li'
  assert.equal(L.nextRefreshMs([tr({ time: '22:20', delay: 8 })], now), 10000);  // orario 22:20 ma previsto 22:28
  assert.equal(L.nextRefreshMs([tr({ time: '22:40' })], now), 30000);
  assert.equal(L.nextRefreshMs([tr({ time: '23:30' })], now), 60000);
  assert.equal(L.nextRefreshMs([], now), 60000);
  assert.equal(L.nextRefreshMs([tr({ time: '05:19', day: 1 }), tr({ time: '23:30' })], now), 60000);
});

test('romeNow', () => {
  const r = L.romeNow(new Date('2026-09-24T20:30:15Z')); // 22:30:15 a Roma (CEST)
  assert.deepEqual([r.h, r.m, r.s], [22, 30, 15]);
  assert.ok(Math.abs(r.min - (22 * 60 + 30 + 15 / 60)) < 1e-9);
  assert.equal(L.romeNow(new Date('2026-01-15T20:30:15Z')).h, 21); // ora solare
});

// ---- validazione ----

test('sanitizeBoard scarta il formato sbagliato e ripulisce i dati', () => {
  assert.equal(L.sanitizeBoard(null), null);
  assert.equal(L.sanitizeBoard({ error: 'x' }), null);
  assert.equal(L.sanitizeBoard({ trains: 'no' }), null);
  const b = L.sanitizeBoard({
    station: '<img src=x onerror=alert(1)>', notice: 'x'.repeat(1000), stale: 'yes',
    trains: [
      { num: '1219', cat: 'DD', dest: 'SORRENTO', time: '22:00', day: 0, platform: '1', delay: 4, cancelled: false,
        stops: [{ name: 'A', time: '22:10' }, 5, null] },
      { num: '2', dest: 'X', time: 'non un orario' },   // scartato
      { num: '3', dest: '', time: '22:00' },            // scartato: senza destinazione
      { num: '4', dest: 'Y', time: '23:00', day: 99, delay: -5, cancelled: 'true', platform: '' },
      null, 'str', 42,
    ],
  });
  assert.equal(b.station, '<img src=x onerror=alert(1)>'); // resta testo: e' textContent a renderlo innocuo
  assert.equal(b.notice.length, 300);
  assert.equal(b.stale, false);
  assert.equal(b.trains.length, 2);
  assert.equal(b.trains[0].stops.length, 1);
  assert.deepEqual([b.trains[1].day, b.trains[1].delay, b.trains[1].cancelled, b.trains[1].platform], [0, 0, false, null]);
});

test('sanitizeBoard conserva delay null (ritardo senza minuti) e limita il numero di treni', () => {
  const t = (n) => ({ num: String(n), dest: 'A', time: '22:00', delay: null });
  const b = L.sanitizeBoard({ trains: Array.from({ length: 500 }, (_, i) => t(i)) });
  assert.equal(b.trains.length, 100);
  assert.equal(b.trains[0].delay, null);
});

test('goesTo: un diretto (DD/EXP) senza elenco fermate non e mai "si" per una stazione intermedia', () => {
  const td = id('TORRE DEL GRECO'), pompei = id('POMPEI SCAVI VILLA DEI MISTERI');
  const lines = ['NAPOLI-SORRENTO'];
  assert.equal(L.goesTo(tr({ cat: 'A', dest: 'SORRENTO' }), td, pompei, idx, lines), 'si');      // accelerato: ferma ovunque
  assert.equal(L.goesTo(tr({ cat: 'DD', dest: 'SORRENTO' }), td, pompei, idx, lines), 'forse');  // diretto: puo' saltarla
  assert.equal(L.goesTo(tr({ cat: 'EXP', dest: 'SORRENTO' }), td, pompei, idx, lines), 'forse');
  assert.equal(L.goesTo(tr({ cat: 'DD', dest: 'SORRENTO' }), td, id('SORRENTO'), idx, lines), 'si'); // la destinazione e' certa
  assert.equal(L.goesTo(tr({ cat: 'DD', dest: 'SORRENTO' }), td, id('PORTICI BELLAVISTA'), idx, lines), 'no'); // dietro
});

test('goesTo: con elenco fermate un DD che salta Barra dice no', () => {
  const g = id('NAPOLI PIAZZA GARIBALDI');
  const dd = tr({ cat: 'DD', dest: 'SORRENTO', stops: [{ name: 'S. GIORGIO A CREMANO', time: '22:05' }, { name: 'SORRENTO', time: '23:05' }] });
  assert.equal(L.goesTo(dd, g, id('BARRA'), idx), 'no');
  assert.equal(L.goesTo(dd, g, id('SAN GIORGIO A CREMANO'), idx), 'si');
});

// ---- vista "Percorso" ----
import { routeOf } from '../../docs/views/percorso.js';

const routeFor = (t, station, vai = null) => {
  const r = { t, inf: L.inferService(t, station, idx, CFG), match: null };
  return routeOf(r, { idx, station, vai });
};

test('percorso: un DD con elenco fermate mostra le stazioni saltate', () => {
  const g = id('NAPOLI PIAZZA GARIBALDI');
  const dd = tr({ cat: 'DD', dest: 'SORRENTO', stops: [{ name: 'S. GIORGIO A CREMANO', time: '22:05' }, { name: 'TORRE A.TA - OPLONTI', time: '22:18' }, { name: 'SORRENTO', time: '23:05' }] });
  const ro = routeFor(dd, g, id('BARRA'));
  const byName = Object.fromEntries(ro.nodes.map((n) => [n.name, n]));
  assert.equal(byName['BARRA'].kind, 'skip');
  assert.equal(byName['BARRA'].target, true);
  assert.equal(byName['SAN GIORGIO A CREMANO'].kind, 'stop');
  assert.equal(byName['SAN GIORGIO A CREMANO'].time, '22:05');
  assert.equal(ro.nodes.at(-1).name, 'SORRENTO');
  assert.equal(ro.nodes.at(-1).dest, true);
  assert.equal(ro.nodes.at(-1).kind, 'stop');
  assert.equal(ro.nodes[0].name, 'VIA GIANTURCO');                 // la stazione del tabellone non c'e'
  assert.ok(!ro.nodes.some((n) => n.id === g));
});

test('percorso: accelerato senza elenco ferma ovunque, diretto senza elenco = non noto', () => {
  const td = id('TORRE DEL GRECO');
  const a = routeFor(tr({ cat: 'A', dest: 'SORRENTO', num: '1201' }), td);
  assert.ok(a.nodes.length > 5 && a.nodes.every((n) => n.kind === 'stop'));
  const dd = routeFor(tr({ cat: 'DD', dest: 'SORRENTO', num: '1201' }), td);
  assert.ok(dd.nodes.slice(0, -1).every((n) => n.kind === 'unknown'));
  assert.equal(dd.nodes.at(-1).kind, 'stop'); // la destinazione e' certa
});

test('percorso: verso Napoli va all\'indietro sulla linea', () => {
  const ro = routeFor(tr({ cat: 'A', dest: 'NAPOLI PORTA NOLANA', num: '1214' }), id('ERCOLANO SCAVI'));
  assert.equal(ro.nodes.at(-1).name, 'NAPOLI PORTA NOLANA');
  assert.ok(ro.nodes.some((n) => n.name === 'PORTICI BELLAVISTA'));
  assert.ok(!ro.nodes.some((n) => n.name === 'TORRE DEL GRECO'));   // e' nella direzione opposta
});

test('percorso: destinazione non riconosciuta -> solo le fermate note, senza inventare', () => {
  const ro = routeFor(tr({ cat: 'A', dest: 'DESTINAZIONE MAI VISTA', stops: [{ name: 'BARRA', time: '22:10' }] }), id('NAPOLI PIAZZA GARIBALDI'));
  assert.equal(ro.approx, true);
  assert.deepEqual(ro.nodes.map((n) => n.name), ['BARRA']);
});

// ---- stazioni non monitorate da EAV: mancano dall'elenco "Ferma a:" anche se il treno ci ferma ----

test('goesTo/percorso: una stazione non monitorata assente dall\'elenco e "forse"/"non noto", non "no"/"salta"', () => {
  const g = id('NAPOLI PIAZZA GARIBALDI'), cavalli = id('CAVALLI DI BRONZO');
  assert.equal(idx.unmonitored(cavalli), true);
  const t = tr({ cat: 'A', dest: 'SORRENTO', stops: [{ name: 'PORTICI BELLAVISTA', time: '22:20' }, { name: 'SORRENTO', time: '23:10' }] });
  assert.equal(L.goesTo(t, g, cavalli, idx), 'forse');
  assert.equal(L.goesTo(t, g, id('BARRA'), idx), 'no');           // monitorata e assente: salta davvero
  const ro = routeFor(t, g);
  assert.equal(ro.nodes.find((n) => n.id === cavalli).kind, 'unknown');
  assert.equal(ro.nodes.find((n) => n.id === id('BARRA')).kind, 'skip');
});

test('nome dato a due stazioni (Pollena Trocchia = 9 e 95): entrambe risultano nell\'elenco', () => {
  assert.equal(idx.sameStation('POLLENA TROCCHIA', '9'), true);
  assert.equal(idx.sameStation('POLLENA TROCCHIA', '95'), true);
  assert.equal(idx.sameStation('POLLENA TROCCHIA', '3'), false);
});

test('a cavallo della mezzanotte: un treno "di domani" tra 20 minuti ha minuti e stato', () => {
  const now = 23 * 60 + 50;
  const t = tr({ time: '00:10', day: 1 });
  assert.equal(L.etaMin(t, now), 20);
  assert.equal(L.statusOf(t, now).main, 'In orario');
  assert.equal(L.statusOf(tr({ time: '00:10', day: 1, delay: 4 }), now).cls, 'd1');
  assert.equal(L.etaMin(tr({ time: '05:19', day: 1 }), now), null);          // domattina: no
  assert.equal(L.statusOf(tr({ time: '05:19', day: 1 }), now).main, '');
});

// ---- colori dei servizi: ogni servizio deve avere colore e classe in tutti i fogli di stile ----
import { SERVIZI, LINEA_SERVIZIO } from '../../docs/config.js';
import { readdirSync } from 'node:fs';

test('ogni linea del catalogo ha un servizio, e ogni servizio un colore in tutti i CSS', () => {
  for (const l of catalogo.linee) assert.ok(LINEA_SERVIZIO[l.nome], 'linea senza servizio: ' + l.nome);
  for (const svc of Object.values(LINEA_SERVIZIO)) assert.ok(SERVIZI[svc], 'servizio inesistente: ' + svc);

  const css = (f) => readFileSync(new URL('../../docs/' + f, import.meta.url), 'utf8');
  const keys = [...new Set(Object.values(SERVIZI).map((v) => v.css))].filter((k) => !['neu', 'nap'].includes(k));
  assert.deepEqual(keys.sort(), ['bai', 'lil', 'ora', 'pas', 'pog', 'pom', 'sar', 'sor', 'tor']);
  for (const k of keys) {
    assert.match(css('style.css'), new RegExp('\\.s-' + k + '\\{'), 'style.css: manca .s-' + k);
    if (k !== 'pom') assert.match(css('style.css'), new RegExp('--r-' + k + ':'), 'style.css: manca --r-' + k);
  }
  // ogni foglio delle viste che mappa i colori delle linee deve mapparli tutti
  for (const f of readdirSync(new URL('../../docs/views/', import.meta.url)).filter((x) => x.endsWith('.css'))) {
    const text = css('views/' + f);
    if (!/\.s-sor\{/.test(text)) continue;
    for (const k of keys) assert.match(text, new RegExp('\\.s-' + k + '\\{'), f + ': manca .s-' + k);
  }
  // le tavolozze proprie (skin che ridefiniscono --r-sor) devono ridefinire anche i colori nuovi
  for (const f of readdirSync(new URL('../../docs/views/', import.meta.url)).filter((x) => x.endsWith('.css'))) {
    const text = css('views/' + f);
    if (!/--r-sor:/.test(text)) continue;
    for (const k of ['lil', 'pas', 'ora']) assert.match(text, new RegExp('--r-' + k + ':'), f + ': manca --r-' + k);
  }
  assert.equal(SERVIZI.pomigliano.strisce, true);
  assert.equal(SERVIZI.torre.strisce, true);
});

// ---- aspetto "Golfo": la frase in cima ----
import { frase, statoParole } from '../../docs/views/golfo.js';

const gCtx = (trains, vai = null, nowMin = 22 * 60) => {
  const st0 = id('NAPOLI PIAZZA GARIBALDI');
  const rows = trains.map((t) => { const inf = L.inferService(t, st0, idx, CFG); return { t, inf, match: vai ? L.goesTo(t, st0, vai, idx, inf.lines) : null }; });
  return { rows, all: rows, now: { min: nowMin, h: 22, m: 0, s: 0 }, idx, station: st0, tipo: 'P', vai, open: new Set(), empty: 'Nessun treno in elenco.' };
};
const testo = (f) => f.segments.map((s) => s.t).join('');

test('golfo: prossimo treno tra N minuti, con binario', () => {
  const f = frase(gCtx([tr({ dest: 'SORRENTO', time: '22:03', platform: '4' })]));
  assert.equal(testo(f), 'Il prossimo treno per Sorrento parte tra 3 minuti, dal binario 4.');
  assert.deepEqual(f.big, { main: '3', unit: 'min' });
  assert.equal(f.tone, 'ok');
});

test('golfo: singolare, binario da assegnare, in partenza', () => {
  assert.match(testo(frase(gCtx([tr({ time: '22:01', platform: null })]))), /Il treno per Sorrento sta partendo\./);
  assert.match(testo(frase(gCtx([tr({ time: '22:02', platform: null })]))), /tra 2 minuti\. Il binario non è ancora stato assegnato\./);
  const uno = frase(gCtx([tr({ time: '22:00', platform: '2' })], null, 22 * 60 - 0.2));
  assert.match(testo(uno), /sta partendo, dal binario 2/);
  assert.equal(uno.big.main, 'Ora');
});

test('golfo: ritardo con minuti, senza minuti, soppresso', () => {
  const late = frase(gCtx([tr({ time: '22:10', delay: 1, platform: '3' })]));
  assert.match(testo(late), /parte tra 11 minuti, dal binario 3\. È in ritardo di 1 minuto\./);
  assert.equal(late.tone, 'late');
  assert.match(testo(frase(gCtx([tr({ time: '22:10', delay: null })]))), /È in ritardo, ma EAV non dice di quanto\./);
  const c = frase(gCtx([tr({ time: '22:10', cancelled: true, dest: 'SORRENTO' }), tr({ time: '22:40', dest: 'SORRENTO' })]));
  assert.equal(testo(c), 'Il treno delle 22:10 per Sorrento è soppresso. Il successivo parte alle 22:40 per Sorrento.');
  assert.equal(c.tone, 'cancel');
});

test('golfo: treno lontano e treno di domani', () => {
  const far = frase(gCtx([tr({ time: '23:40', platform: '1' })]));
  assert.match(testo(far), /parte alle 23:40, dal binario 1\./);
  assert.deepEqual(far.big, { main: '23:40', unit: 'più tardi' });
  const dom = frase(gCtx([tr({ time: '05:19', day: 1 })]));
  assert.match(testo(dom), /Per ora non ci sono altri treni: il prossimo è domani alle 05:19 per Sorrento\./);
  assert.equal(dom.big.unit, 'domani');
});

test('golfo: "Vai a" dice stazione e orario di arrivo, senza ripetizioni', () => {
  const pompei = id('POMPEI SCAVI VILLA DEI MISTERI');
  const f = frase(gCtx([
    tr({ time: '22:10', dest: 'NAPOLI PORTA NOLANA', num: '1214' }),
    tr({ time: '22:20', dest: 'SORRENTO', platform: '2', stops: [{ name: 'POMPEI SCAVI VILLA DEI MISTERI', time: '22:44' }, { name: 'SORRENTO', time: '23:20' }] }),
    tr({ time: '22:50', dest: 'SORRENTO', stops: [{ name: 'POMPEI SCAVI VILLA DEI MISTERI', time: '23:14' }] })], pompei));
  assert.equal(testo(f), 'Per Pompei Scavi Villa dei Misteri il prossimo treno parte alle 22:20 e ci arrivi alle 22:44, dal binario 2.');
  const nessuno = frase(gCtx([tr({ time: '22:10', dest: 'NAPOLI PORTA NOLANA' })], pompei));
  assert.match(testo(nessuno), /^Nessuno dei prossimi treni arriva a Pompei Scavi Villa dei Misteri\.$/);
  assert.equal(frase(gCtx([])).tone, 'none');
});

test('golfo: stato in parole', () => {
  const m = (o, now = 22 * 60) => { const r = { t: tr(o), inf: L.inferService(tr(o), id('NAPOLI PIAZZA GARIBALDI'), idx, CFG), match: null };
    return { t: r.t, st: L.statusOf(r.t, now) }; };
  assert.equal(statoParole(m({ time: '22:30' })), 'In orario');
  assert.equal(statoParole(m({ time: '22:30', delay: 7 })), 'In ritardo di 7 min');
  assert.equal(statoParole(m({ time: '22:30', delay: null })), 'In ritardo');
  assert.equal(statoParole(m({ time: '22:30', cancelled: true })), 'Soppresso');
  assert.equal(statoParole(m({ time: '22:00' })), 'Sta partendo');
});

// ---- ogni aspetto dell'elenco ha il suo modulo e il suo CSS, e nessuna vista e' rimasta fuori ----
import { UI_LISTA } from '../../docs/config.js';

test('UI_LISTA: ogni aspetto ha modulo e CSS coerenti, nessuna vista non elencata', async () => {
  const ids = UI_LISTA.map((u) => u.id);
  assert.equal(new Set(ids).size, ids.length, 'id duplicati');
  for (const u of UI_LISTA) {
    const mod = await import('../../docs/views/' + u.id + '.js');
    assert.equal(mod.meta.id, u.id);
    assert.equal(typeof mod.render, 'function');
    if (u.id !== 'classico') readFileSync(new URL('../../docs/views/' + u.id + '.css', import.meta.url), 'utf8');
  }
  const stray = readdirSync(new URL('../../docs/views/', import.meta.url)).filter((f) => f.endsWith('.js') && !f.startsWith('_') && !ids.includes(f.slice(0, -3)));
  assert.deepEqual(stray, [], 'viste non elencate in UI_LISTA');
});

// ---- tabelloni a schermo intero (stili aggiuntivi): parti pure ----
import { slots, statoBreve, righe, OPZIONI, PREDEFINITE } from '../../docs/views/_tab.js';

test('tabelloni: slots restituisce sempre esattamente N voci (i primi treni, poi righe vuote)', () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({ i }));
  assert.equal(slots(rows, 18).length, 18);
  assert.deepEqual(slots(rows, 18).map((r) => r.i), Array.from({ length: 18 }, (_, i) => i));   // solo i primi, nessuna pagina
  const poche = slots(rows.slice(0, 5), 18);
  assert.equal(poche.length, 18);
  assert.equal(poche.filter(Boolean).length, 5);
  assert.deepEqual(poche.slice(5), Array(13).fill(null));
  assert.deepEqual(slots([], 15), Array(15).fill(null));
});

test('tabelloni: righe 15/18/20/25, predefinite 18, senza memoria del browser', () => {
  assert.deepEqual(OPZIONI, [15, 18, 20, 25]);
  assert.equal(PREDEFINITE, 18);
  assert.equal(righe(), 18);                                   // in Node non c'e' localStorage: valore predefinito
  assert.ok(PREDEFINITE >= 15 && PREDEFINITE <= 20);
});

test('tabelloni: statoBreve', () => {
  const m = (o, now = 22 * 60) => { const t = tr(o); return { t, st: L.statusOf(t, now) }; };
  assert.equal(statoBreve(m({ time: '22:40' })), 'IN ORARIO');
  assert.equal(statoBreve(m({ time: '22:40', delay: 7 })), 'RIT +7 MIN');
  assert.equal(statoBreve(m({ time: '22:40', delay: null })), 'IN RITARDO');
  assert.equal(statoBreve(m({ time: '22:40', cancelled: true })), 'SOPPRESSO');
  assert.equal(statoBreve(m({ time: '22:00' })), 'IN PARTENZA');
  assert.equal(statoBreve(m({ time: '05:19', day: 1 })), '');
});
