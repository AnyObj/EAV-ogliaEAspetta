// Test dello script che costruisce orari.json (scripts/build-orari.mjs). Nessuna rete: si usa un mini GTFS
// costruito qui dentro (con uno scrittore di zip minimale, per non tenere file binari nella repo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync, crc32 } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';
import { leggiZip, parseCsvLine, tabella, minutiDa, comprimiDate, espandiIntervalli, buildOrari, validaOrari, serializza } from '../../scripts/build-orari.mjs';

// ---------- scrittore di zip minimale ----------
function scriviZip(files, { data = [2026, 9, 16], zip64 = false } = {}) {
  const locali = [], centrali = [];
  let off = 0;
  const dosD = ((data[0] - 1980) << 9) | (data[1] << 5) | data[2];
  for (const [nome, { testo, stored }] of Object.entries(files)) {
    const nm = Buffer.from(nome), raw = Buffer.from(testo, 'utf8');
    const met = stored ? 0 : 8, comp = stored ? raw : deflateRawSync(raw), crc = crc32(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(met, 8);
    lh.writeUInt16LE(dosD, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(met, 10);
    ch.writeUInt16LE(dosD, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    let extra = Buffer.alloc(0);
    if (zip64) {   // come il file di EAV: 0xFFFFFFFF nei campi e le misure vere nel campo aggiuntivo zip64 (20 byte)
      ch.writeUInt32LE(0xffffffff, 20); ch.writeUInt32LE(0xffffffff, 24);
      extra = Buffer.alloc(20); extra.writeUInt16LE(1, 0); extra.writeUInt16LE(16, 2); extra.writeBigUInt64LE(BigInt(raw.length), 4); extra.writeBigUInt64LE(BigInt(comp.length), 12);
      ch.writeUInt16LE(extra.length, 30);
    }
    locali.push(lh, nm, comp); centrali.push(ch, nm, extra);
    off += 30 + nm.length + comp.length;
  }
  const cd = Buffer.concat(centrali);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(Object.keys(files).length, 8); eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16);
  return Buffer.concat([...locali, cd, eocd]);
}

// ---------- mini GTFS ----------
// 6001 Porta Nolana, 6003 Garibaldi, 6062 Sorrento, 6041 Torre A.ta; 6028 non e' servita da nessun treno.
const CATALOGO = { stazioni: ['1 NAPOLI PORTA NOLANA', '3 NAPOLI PIAZZA GARIBALDI', '41 TORRE ANNUNZIATA - OPLONTI', '62 SORRENTO', '28 CAVALLI DI BRONZO',
  '4 VIA GIANTURCO', '5 SAN GIOVANNI A TEDUCCIO', '6 BARRA', '7 A', '8 B', '9 C', '10 D'].map((s) => { const [id, ...n] = s.split(' '); return { id, nome: n.join(' '), alias: id === '3' ? ['NAPOLI P. GARIBALDI'] : [] }; }) };
const GTFS = {
  'routes.txt': { testo: '﻿route_id,agency_id,route_short_name,route_long_name,route_type\r\n1,NA0004,1,"Napoli - Pompei Scavi, Sorrento",2\r\n1.,NA0004,1.,Napoli - Torre Annunziata,2\r\n001,EAVO,001,Scafati - Napoli,3\r\n' },
  'trips.txt': { testo: [
    'route_id,service_id,trip_id,trip_headsign,trip_short_name,direction_id,block_id,shape_id',
    '1,SV-A,10535_SV-A,Sorrento,10535,,,',
    '1,SV-A,10550_SV-A,Napoli Porta Nolana,10550,,,',
    '1.,SV-B,10557_SV-B,Torre Annunziata - Oplonti,10557,,,',
    '1,SV-B,12299_SV-B,Sorrento,12299,,,',       // il giorno dopo: orari oltre le 24:00
    '1,SV-A,DUP1,Sorrento,20000,,,',             // stesso numero di treno su due viaggi
    '1,SV-B,DUP2,Sorrento,20000,,,',
    '001,SV-A,BUS1,Scafati,BUS1,,BUS1,SHAPE1',   // autobus: da ignorare
  ].join('\n') },
  'stop_times.txt': { testo: [
    'trip_id,arrival_time,departure_time,stop_id,stop_sequence',
    '10535_SV-A,05:36:00,05:36:00,6001,1', '10535_SV-A,05:38:00,05:39:00,6003,2', '10535_SV-A,06:06:00,06:06:00,6041,3', '10535_SV-A,07:05:00,07:05:00,6062,4',
    '10550_SV-A,06:10:00,06:10:00,6062,2', '10550_SV-A,05:50:00,05:50:00,6041,1', '10550_SV-A,07:00:00,07:00:00,6003,3',                       // sequenze fuori ordine nel file
    '10557_SV-B,06:30:00,06:30:00,6001,1', '10557_SV-B,06:33:00,06:33:00,6003,2', '10557_SV-B,06:59:00,06:59:00,6041,3',
    '12299_SV-B,23:50:00,23:50:00,6001,1', '12299_SV-B,24:10:00,24:10:00,6003,2', '12299_SV-B,25:05:30,25:05:30,6062,3',                        // oltre le 24:00 e secondi
    'DUP1,08:00:00,08:00:00,6001,1', 'DUP1,08:30:00,08:30:00,6062,2', 'DUP2,09:00:00,09:00:00,6001,1', 'DUP2,09:30:00,09:30:00,6062,2',
    'BUS1,08:00:00,08:00:00,9999,1', 'BUS1,08:10:00,08:10:00,9998,2',
  ].join('\n') },
  'stops.txt': { testo: [
    'stop_id,stop_code,stop_name,stop_lat,stop_lon',
    '6001,,Napoli Porta Nolana,40.849,14.269', '6003,,Napoli P. Garibaldi,40.851,14.273', '6041,,Torre A.ta - Oplonti,40.75,14.48', '6062,,Sorrento,40.62,14.37',
    '9999,,Fermata autobus,40.1,14.1', '9998,,Altra fermata bus,40.2,14.2',
  ].join('\n') },
  'calendar_dates.txt': { testo: [
    'service_id,date,exception_type',
    'SV-A,20260915,1', 'SV-A,20260916,1', 'SV-A,20260917,1', 'SV-A,20260919,1', 'SV-A,20260920,1', 'SV-A,20260918,1', 'SV-A,20260918,2',   // il 18 viene tolto
    'SV-B,20260915,1', 'SV-B,20261231,1',
  ].join('\n') },
};
const OPZ = { catalogo: CATALOGO, oggi: '2026-09-25', ora: '2026-09-25T06:00:00.000Z', minTreni: 1, minStazioni: 1 };
const costruisci = (over = {}) => buildOrari(leggiZip(scriviZip({ ...GTFS, ...over })), OPZ);

// ---------- zip ----------
test('zip: legge voci compresse e non compresse e la data dei file', () => {
  const z = leggiZip(scriviZip({ 'a.txt': { testo: 'ciao a' }, 'b.txt': { testo: 'ciao b', stored: true } }));
  assert.deepEqual(z.nomi(), ['a.txt', 'b.txt']);
  assert.equal(z.leggi('a.txt').toString(), 'ciao a');
  assert.equal(z.leggi('b.txt').toString(), 'ciao b');
  assert.equal(z.data('a.txt'), '2026-09-16');
  assert.throws(() => z.leggi('c.txt'), /manca c\.txt/);
});
test('zip: legge le misure dal campo zip64 (come il file vero di EAV)', () => {
  const files = { 'a.txt': { testo: 'ciao a '.repeat(50) }, 'b.txt': { testo: 'dati b', stored: true } };
  const z = leggiZip(scriviZip(files, { zip64: true }));
  assert.equal(z.leggi('a.txt').toString(), 'ciao a '.repeat(50));
  assert.equal(z.leggi('b.txt').toString(), 'dati b');
  assert.equal(z.data('a.txt'), '2026-09-16');
  // lo stesso GTFS di prova, costruito con voci zip64, da' lo stesso risultato
  const normale = buildOrari(leggiZip(scriviZip(GTFS)), OPZ), z64 = buildOrari(leggiZip(scriviZip(GTFS, { zip64: true })), OPZ);
  assert.deepEqual(serializza(z64.orari), serializza(normale.orari));
});
test('zip: un file che non e\' uno zip da\' un errore chiaro', () => {
  assert.throws(() => leggiZip(Buffer.from('<html>Non trovato</html> '.repeat(5))), /non e' un file zip/);
  assert.throws(() => leggiZip(Buffer.alloc(3)), /troppo corto/);
});

// ---------- csv e utilita' ----------
test('csv: virgolette, virgolette doppie, BOM e a capo di Windows', () => {
  assert.deepEqual(parseCsvLine('1,"Napoli - Pompei, Sorrento",2'), ['1', 'Napoli - Pompei, Sorrento', '2']);
  assert.deepEqual(parseCsvLine('a,"dice ""ciao""",c'), ['a', 'dice "ciao"', 'c']);
  assert.deepEqual(parseCsvLine('a,,c'), ['a', '', 'c']);
  const t = tabella(Buffer.from('﻿x,y\r\n1,2\r\n\r\n3,4\r\n'));
  assert.deepEqual(t.col, { x: 0, y: 1 });
  assert.deepEqual([...t.righe], [['1', '2'], ['3', '4']]);
});
test('orari in minuti, anche oltre le 24:00', () => {
  assert.deepEqual(minutiDa('05:36:00'), { min: 336, sec: 0 });
  assert.deepEqual(minutiDa('25:05:30'), { min: 1505, sec: 30 });
  assert.equal(minutiDa('non un orario'), null);
  assert.equal(minutiDa(''), null);
});
test('date: si comprimono in intervalli e si riespandono senza perdere giorni', () => {
  const d = ['20260915', '20260916', '20260917', '20260919', '20260920', '20261231', '20260930', '20260930'];
  assert.deepEqual(comprimiDate(d), ['20260915-20260917', '20260919-20260920', '20260930', '20261231']);
  assert.deepEqual([...espandiIntervalli(comprimiDate(d))].sort(), [...new Set(d)].sort());
  assert.deepEqual(comprimiDate(['20261231', '20270101']), ['20261231-20270101']);   // a cavallo dell'anno
  assert.deepEqual(comprimiDate(['20260228', '20260301']), ['20260228-20260301']);   // a cavallo del mese
});

// ---------- costruzione ----------
test('costruzione: solo la ferrovia, treni per numero, stazioni con il nostro id', () => {
  const { orari: o, errori } = costruisci();
  assert.deepEqual(errori, []);
  assert.deepEqual(Object.keys(o.linee), ['1', '1.']);                                 // niente autobus
  assert.equal(o.linee['1'], 'Napoli - Pompei Scavi, Sorrento');                     // virgola dentro le virgolette
  assert.ok(!('BUS1' in o.treni));
  assert.deepEqual(o.treni['10535'], { l: '1', s: '0', c: 'Sorrento', f: [['1', 336], ['3', 339, 338], ['41', 366], ['62', 425]] });   // a Garibaldi arriva alle 05:38 e parte alle 05:39
  assert.deepEqual(Object.keys(o.stazioni), ['1', '3', '41', '62']);                 // 6001 -> 1, 6003 -> 3, ...
  assert.equal(o.stazioni['3'].n, 4);                                                 // treni che ci fermano
  assert.deepEqual(o.stazioni['62'], { lat: 40.62, lon: 14.37, n: 5 });   // 10535, 10550, 12299 e i due viaggi del 20000
});
test('costruzione: le fermate si ordinano per stop_sequence anche se nel file sono sparse', () => {
  const { orari: o } = costruisci();
  assert.deepEqual(o.treni['10550'].f, [['41', 350], ['62', 370], ['3', 420]]);
});
test('costruzione: orari oltre le 24:00 restano crescenti e i secondi si arrotondano per difetto', () => {
  const { orari: o, avvisi } = costruisci();
  assert.deepEqual(o.treni['12299'].f, [['1', 1430], ['3', 1450], ['62', 1505]]);
  assert.ok(avvisi.some((a) => /secondi diversi da zero/.test(a)));
  assert.ok(o.treni['12299'].f.every((x, i, a) => !i || x[1] >= a[i - 1][1]));
});
test('costruzione: calendario compresso, con le eccezioni "tolto" applicate', () => {
  const { orari: o } = costruisci();
  assert.deepEqual(o.servizi['0'], ['20260915-20260917', '20260919-20260920']);   // il 18 e' stato tolto
  assert.deepEqual(o.servizi['1'], ['20260915', '20261231']);
  assert.deepEqual(o.serviziGtfs, { 0: 'SV-A', 1: 'SV-B' });
  assert.deepEqual(o.valido, ['2026-09-15', '2026-12-31']);
  assert.equal(o.gtfsDel, '2026-09-16');
});
test('costruzione: numero di treno su piu\' viaggi -> lista e avviso', () => {
  const { orari: o, avvisi } = costruisci();
  assert.ok(Array.isArray(o.treni['20000']) && o.treni['20000'].length === 2);
  assert.deepEqual(o.treni['20000'].map((t) => t.s), ['0', '1']);
  assert.ok(avvisi.some((a) => /piu' viaggi/.test(a)));
});
test('costruzione: stazioni non servite = quelle del catalogo senza nessun treno', () => {
  const { orari: o } = costruisci();
  assert.deepEqual(o.nonServite, ['4', '5', '6', '7', '8', '9', '10', '28']);
  assert.ok(o.nonServite.includes('28'));
});
test('costruzione: nome diverso dal catalogo e fermate ignote finiscono negli avvisi, non negli errori', () => {
  const { avvisi, errori } = costruisci({ 'stops.txt': { testo: GTFS['stops.txt'].testo.replace('Sorrento,40.62', 'Sorrente,40.62').replace('6003,,Napoli P. Garibaldi', '6003,,Napoli P. Garibaldi') } });
  assert.deepEqual(errori, []);
  assert.ok(avvisi.some((a) => /nome diverso dal catalogo.*62 "Sorrente"/.test(a)), avvisi.join(' | '));
  const nuova = costruisci({ 'stop_times.txt': { testo: GTFS['stop_times.txt'].testo + '\n10535_SV-A,08:00:00,08:00:00,7777,5' } });
  assert.ok(nuova.avvisi.some((a) => /non riconosciute nel catalogo.*7777/.test(a)));
});
test('costruzione: il risultato e\' deterministico e il JSON scritto si rilegge identico', () => {
  const a = serializza(costruisci().orari), b = serializza(costruisci().orari);
  assert.equal(a, b);
  const rilett = JSON.parse(a);
  assert.deepEqual(rilett, JSON.parse(JSON.stringify(costruisci().orari)));
  assert.match(a, /\n"10535":\{"l":"1"/, 'un treno per riga (diff leggibili)');
  assert.deepEqual(validaOrari(rilett, { oggi: '2026-09-25', catalogo: CATALOGO, minTreni: 1, minStazioni: 1 }).errori, []);
});

// ---------- errori di sanita': lo script non deve mai scrivere un file rotto ----------
test('sanita\': zip senza file obbligatori o senza percorsi ferroviari -> errore, niente output', () => {
  const senza = { ...GTFS }; delete senza['stop_times.txt'];
  assert.match(buildOrari(leggiZip(scriviZip(senza)), OPZ).errori.join(), /manca stop_times\.txt/);
  const soloBus = { ...GTFS, 'routes.txt': { testo: 'route_id,agency_id,route_short_name,route_long_name,route_type\n001,EAVO,001,Bus,3\n' } };
  const r = buildOrari(leggiZip(scriviZip(soloBus)), OPZ);
  assert.match(r.errori.join(), /nessun percorso ferroviario/);
  assert.equal(r.orari, undefined);
  const senzaColonna = { ...GTFS, 'trips.txt': { testo: 'route_id,service_id,trip_id\n1,SV-A,X\n' } };
  assert.throws(() => buildOrari(leggiZip(scriviZip(senzaColonna)), OPZ), /trips\.txt: manca la colonna trip_short_name/);
});
test('sanita\': GTFS scaduto, troppo pochi treni, formato guasto', () => {
  const scaduto = buildOrari(leggiZip(scriviZip(GTFS)), { ...OPZ, oggi: '2027-02-01' });
  assert.ok(scaduto.errori.some((e) => /scaduto/.test(e)));
  assert.ok(buildOrari(leggiZip(scriviZip(GTFS)), { ...OPZ, minTreni: 100 }).errori.some((e) => /troppo pochi treni/.test(e)));
  assert.ok(buildOrari(leggiZip(scriviZip(GTFS)), { ...OPZ, minStazioni: 50 }).errori.some((e) => /troppo poche stazioni servite/.test(e)));
  const { orari: ok } = costruisci();
  const guasto = JSON.parse(JSON.stringify(ok));
  guasto.treni['10535'].f[0][1] = 'ieri';
  guasto.treni['10550'].l = 'linea-inesistente';
  guasto.servizi['0'] = ['2026-09-15'];
  const v = validaOrari(guasto, { oggi: '2026-09-25', minTreni: 1, minStazioni: 1 });
  assert.ok(v.errori.some((e) => /treno 10535 malformato/.test(e)));
  assert.ok(v.errori.some((e) => /treno 10550 malformato/.test(e)));
  assert.ok(v.errori.some((e) => /intervallo non valido/.test(e)));
  assert.match(validaOrari({ v: 2 }).errori.join(), /versione/);
  assert.match(validaOrari(null).errori.join(), /non e' un oggetto/);
});
test('sanita\': un calendario che finisce fra pochi giorni e\' un avviso', () => {
  const { avvisi } = buildOrari(leggiZip(scriviZip(GTFS)), { ...OPZ, oggi: '2026-12-25' });
  assert.ok(avvisi.some((a) => /copre solo altri 6 giorni/.test(a)), avvisi.join(' | '));
});

// ---------- file vero (solo se e' stato gia' generato: non serve la rete) ----------
const VERO = new URL('../../data/orari.json', import.meta.url);
test('file vero (se presente): valido e coerente con il catalogo', { skip: !existsSync(VERO) }, () => {
  const o = JSON.parse(readFileSync(VERO, 'utf8'));
  const catalogo = JSON.parse(readFileSync(new URL('../../docs/stazioni.json', import.meta.url), 'utf8'));
  const v = validaOrari(o, { oggi: o.valido[0], catalogo });
  assert.deepEqual(v.errori, []);
});

test('costruzione: l\'orario di arrivo si salva solo quando e\' diverso dalla partenza, e il validatore accetta entrambe le forme', () => {
  const { orari: o, errori } = costruisci();
  assert.deepEqual(errori, []);
  const conArrivo = o.treni['10535'].f.filter((x) => x.length === 3);
  assert.deepEqual(conArrivo, [['3', 339, 338]]);
  assert.ok(o.treni['10535'].f.every((x) => x.length === 2 || x.length === 3));
  const guasto = JSON.parse(JSON.stringify(o)); guasto.treni['10535'].f[1] = ['3', 339, 'ieri'];
  assert.ok(validaOrari(guasto, { oggi: '2026-09-25', minTreni: 1, minStazioni: 1 }).errori.some((e) => /treno 10535 malformato/.test(e)));
  const quattro = JSON.parse(JSON.stringify(o)); quattro.treni['10535'].f[1] = ['3', 339, 338, 5];
  assert.ok(validaOrari(quattro, { oggi: '2026-09-25', minTreni: 1, minStazioni: 1 }).errori.some((e) => /malformato/.test(e)));
});
