// Scarica il GTFS di EAV e ne ricava `orari.json`: solo la ferrovia, in forma compatta.
// Non dipende da nessuna libreria. Il GTFS statico dice cosa e' PROGRAMMATO: non contiene ritardi ne' soppressioni.
//
//   node scripts/build-orari.mjs                       # scarica e scrive docs/orari.json
//   node scripts/build-orari.mjs --file gtfs.zip       # usa uno zip gia' scaricato (nessuna rete)
//   node scripts/build-orari.mjs --out data/orari.json # altro percorso di uscita
//   node scripts/build-orari.mjs --check               # dice se il GTFS e' cambiato (codice 10 = cambiato)
//   node scripts/build-orari.mjs --valida orari.json   # controlla un file gia' costruito
//   opzioni: --force (scrive anche con errori di sanita'), --oggi AAAA-MM-GG (per le prove)
//
// Codici di uscita: 0 ok / invariato, 1 errore d'uso o di rete, 2 dati non validi (nulla scritto), 10 cambiato (--check).
//
// Come sono fatti i dati (vedi notes/gtfs-scoperte.md): trip_short_name = numero di treno del tabellone,
// stop_id = 6000 + id del nostro catalogo, route_id = linea e variante di servizio.
// Fermate di un treno: f = [[stazione, partenza], ...] in minuti; se all'arrivo e alla partenza l'orario e' diverso
// (sosta in stazione) c'e' un terzo numero, l'arrivo: [stazione, partenza, arrivo].

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname } from 'node:path';
import { norm } from '../docs/logic.js';

export const URL_GTFS = 'https://www.wimob.it/cfile/download.php?file=google-transit.zip';
export const FONTE = 'https://www.eavsrl.it/open-data/';
export const LICENZA = 'IODL 2.0 - Dati del servizio EAV ferro e gomma, EAV srl';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const UA = 'Mozilla/5.0 (eav-ogliaeaspetta sincronizzazione orari)';

// ============================================================ zip (senza librerie)

const dosData = (d) => `${(d >> 9) + 1980}-${String((d >> 5) & 15).padStart(2, '0')}-${String(d & 31).padStart(2, '0')}`;

export function leggiZip(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new Error('non e\' un file zip (troppo corto)');
  const min = Math.max(0, buf.length - 22 - 65535);
  let i = buf.length - 22;
  for (; i >= min; i--) if (buf.readUInt32LE(i) === 0x06054b50) break;
  if (i < min) throw new Error('non e\' un file zip (fine della directory centrale non trovata)');
  const n = buf.readUInt16LE(i + 10), cdOff = buf.readUInt32LE(i + 16);
  if (n === 0xffff || cdOff === 0xffffffff) throw new Error('zip64 non supportato');
  const voci = new Map();
  let p = cdOff;
  for (let k = 0; k < n; k++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error('directory centrale danneggiata');
    const nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
    let csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24), lho = buf.readUInt32LE(p + 42);
    // Molti programmi (quelli che scrivono lo zip "a flusso", come quello di EAV) mettono 0xFFFFFFFF nei campi e
    // le misure vere in un campo aggiuntivo "zip64" (id 0x0001): si leggono da li', nell'ordine dimensione originale,
    // compressa, posizione.
    if (usize === 0xffffffff || csize === 0xffffffff || lho === 0xffffffff) {
      for (let o = p + 46 + nl, fine = o + el; o + 4 <= fine; o += 4 + buf.readUInt16LE(o + 2)) {
        if (buf.readUInt16LE(o) !== 1) continue;
        let q = o + 4;
        if (usize === 0xffffffff) { usize = Number(buf.readBigUInt64LE(q)); q += 8; }
        if (csize === 0xffffffff) { csize = Number(buf.readBigUInt64LE(q)); q += 8; }
        if (lho === 0xffffffff) lho = Number(buf.readBigUInt64LE(q));
      }
    }
    voci.set(buf.toString('utf8', p + 46, p + 46 + nl), { metodo: buf.readUInt16LE(p + 10), data: dosData(buf.readUInt16LE(p + 14)), csize, usize, lho });
    p += 46 + nl + el + cl;
  }
  return {
    nomi: () => [...voci.keys()],
    ha: (nome) => voci.has(nome),
    data: (nome) => voci.get(nome)?.data ?? null,
    leggi(nome) {
      const v = voci.get(nome);
      if (!v) throw new Error('nel file zip manca ' + nome);
      if (buf.readUInt32LE(v.lho) !== 0x04034b50) throw new Error('intestazione locale danneggiata: ' + nome);
      const start = v.lho + 30 + buf.readUInt16LE(v.lho + 26) + buf.readUInt16LE(v.lho + 28);
      const raw = buf.subarray(start, start + v.csize);
      const out = v.metodo === 0 ? raw : v.metodo === 8 ? inflateRawSync(raw) : null;
      if (!out) throw new Error('metodo di compressione non supportato (' + v.metodo + '): ' + nome);
      if (out.length !== v.usize) throw new Error('dimensione inattesa per ' + nome);
      return out;
    },
  };
}

// ============================================================ csv

export function parseCsvLine(line) {
  if (!line.includes('"')) return line.split(',');
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}

function* righe(text) {
  let s = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (s < text.length) {
    let e = text.indexOf('\n', s);
    if (e < 0) e = text.length;
    let l = text.slice(s, e);
    if (l.endsWith('\r')) l = l.slice(0, -1);
    s = e + 1;
    if (l !== '') yield l;
  }
}

// { col: {nome: indice}, righe: generatore di array }. Non si assumono campi con "a capo" dentro le virgolette.
export function tabella(buf) {
  const it = righe(buf.toString('utf8'));
  const h = it.next();
  if (h.done) return { col: {}, righe: [][Symbol.iterator]() };
  const col = {};
  parseCsvLine(h.value).forEach((n, i) => { col[n.trim()] = i; });
  return { col, righe: (function* () { for (const l of it) yield parseCsvLine(l); })() };
}
const richiedi = (col, nomi, file) => { for (const n of nomi) if (!(n in col)) throw new Error(`${file}: manca la colonna ${n}`); };

// ============================================================ utilita'

export function minutiDa(hhmmss) {
  const m = /^\s*(\d{1,3}):(\d{2})(?::(\d{2}))?\s*$/.exec(hhmmss || '');
  return m ? { min: +m[1] * 60 + +m[2], sec: +(m[3] || 0) } : null;
}

const ymd = (s) => s.replace(/-/g, '');
const giorno = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) / 86400000;
const daGiorno = (n) => { const d = new Date(n * 86400000); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`; };
const trattini = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

// Insieme di date "AAAAMMGG" -> intervalli "AAAAMMGG-AAAAMMGG" (o "AAAAMMGG" da sola), in ordine.
export function comprimiDate(date) {
  const g = [...new Set(date)].sort().map(giorno);
  const out = [];
  for (let i = 0; i < g.length;) {
    let j = i;
    while (j + 1 < g.length && g[j + 1] === g[j] + 1) j++;
    out.push(i === j ? daGiorno(g[i]) : daGiorno(g[i]) + '-' + daGiorno(g[j]));
    i = j + 1;
  }
  return out;
}
export function espandiIntervalli(intervalli) {
  const out = new Set();
  for (const r of intervalli) { const [a, b] = r.split('-'); for (let g = giorno(a); g <= giorno(b || a); g++) out.add(daGiorno(g)); }
  return out;
}

// ============================================================ costruzione

// zip = risultato di leggiZip. opts: { catalogo, oggi ('AAAA-MM-GG'), ora (ISO), zipInfo, minTreni, minStazioni }
export function buildOrari(zip, opts = {}) {
  const errori = [], avvisi = [];
  const catalogo = opts.catalogo || null;
  for (const f of ['routes.txt', 'trips.txt', 'stop_times.txt', 'stops.txt']) if (!zip.ha(f)) errori.push('nel file zip manca ' + f);
  if (!zip.ha('calendar_dates.txt') && !zip.ha('calendar.txt')) errori.push('nel file zip manca il calendario (calendar_dates.txt / calendar.txt)');
  if (errori.length) return { errori, avvisi };

  // --- percorsi ferroviari
  const linee = new Map();
  { const t = tabella(zip.leggi('routes.txt')); richiedi(t.col, ['route_id', 'route_type', 'route_long_name'], 'routes.txt');
    for (const r of t.righe) if (r[t.col.route_type] === '2') linee.set(r[t.col.route_id], r[t.col.route_long_name]); }
  if (!linee.size) return { errori: ['nessun percorso ferroviario (route_type = 2) in routes.txt'], avvisi };

  // --- viaggi
  const viaggi = new Map(); // trip_id -> { num, l, c, sid, stops: [] }
  { const t = tabella(zip.leggi('trips.txt')); richiedi(t.col, ['route_id', 'service_id', 'trip_id', 'trip_short_name'], 'trips.txt');
    for (const r of t.righe) {
      const rid = r[t.col.route_id];
      if (!linee.has(rid)) continue;
      const num = (r[t.col.trip_short_name] || '').trim();
      if (!num) { avvisi.push('viaggio senza trip_short_name: ' + r[t.col.trip_id]); continue; }
      viaggi.set(r[t.col.trip_id], { num, l: rid, c: (r[t.col.trip_headsign] || '').trim(), sid: r[t.col.service_id], stops: [] });
    } }

  // --- passaggi alle fermate (il file grande: si tengono solo i viaggi ferroviari)
  let secondiNonZero = 0, nonLeggibili = 0;
  { const t = tabella(zip.leggi('stop_times.txt')); richiedi(t.col, ['trip_id', 'stop_id', 'stop_sequence'], 'stop_times.txt');
    const iD = t.col.departure_time, iA = t.col.arrival_time;
    for (const r of t.righe) {
      const v = viaggi.get(r[t.col.trip_id]);
      if (!v) continue;
      const dep = minutiDa((iD !== undefined && r[iD]) || ''), arr = minutiDa((iA !== undefined && r[iA]) || '');
      if (!dep && !arr) { nonLeggibili++; continue; }
      if ((dep && dep.sec) || (arr && arr.sec)) secondiNonZero++;
      const d = (dep || arr).min, a = (arr || dep).min;
      v.stops.push([+r[t.col.stop_sequence], r[t.col.stop_id], d, a]);
    } }
  if (nonLeggibili) avvisi.push(`${nonLeggibili} orari non leggibili in stop_times.txt (passaggi ignorati)`);
  if (secondiNonZero) avvisi.push(`${secondiNonZero} orari con secondi diversi da zero (arrotondati per difetto al minuto)`);

  // --- fermate usate
  const idCatalogo = (stopId) => (/^6\d{3}$/.test(stopId) ? String(+stopId - 6000) : null);
  const nomiCatalogo = new Map();
  if (catalogo) for (const s of catalogo.stazioni) nomiCatalogo.set(s.id, new Set([s.nome, s.nomeEav, ...(s.alias || [])].filter(Boolean).map(norm)));
  const fermate = new Map(); // stop_id -> { nome, lat, lon }
  { const t = tabella(zip.leggi('stops.txt')); richiedi(t.col, ['stop_id', 'stop_name'], 'stops.txt');
    for (const r of t.righe) fermate.set(r[t.col.stop_id], { nome: (r[t.col.stop_name] || '').trim(), lat: parseFloat(r[t.col.stop_lat]), lon: parseFloat(r[t.col.stop_lon]) }); }

  // --- calendario dei soli servizi usati
  const servizi = new Set([...viaggi.values()].map((v) => v.sid));
  const date = new Map([...servizi].map((s) => [s, new Set()]));
  if (zip.ha('calendar.txt')) {
    const t = tabella(zip.leggi('calendar.txt'));
    const giorni = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    if (t.col.service_id !== undefined) for (const r of t.righe) {
      const set = date.get(r[t.col.service_id]);
      if (!set) continue;
      for (let g = giorno(r[t.col.start_date]); g <= giorno(r[t.col.end_date]); g++) if (r[t.col[giorni[new Date(g * 86400000).getUTCDay()]]] === '1') set.add(daGiorno(g));
    }
  }
  if (zip.ha('calendar_dates.txt')) {
    const t = tabella(zip.leggi('calendar_dates.txt')); richiedi(t.col, ['service_id', 'date', 'exception_type'], 'calendar_dates.txt');
    for (const r of t.righe) {
      const set = date.get(r[t.col.service_id]);
      if (!set) continue;
      if (r[t.col.exception_type] === '1') set.add(r[t.col.date]); else if (r[t.col.exception_type] === '2') set.delete(r[t.col.date]);
    }
  }
  for (const [s, set] of date) if (!set.size) avvisi.push('servizio senza nessun giorno di circolazione: ' + s);
  const ordineServizi = [...servizi].sort();
  const idxServizio = new Map(ordineServizi.map((s, i) => [s, String(i)]));

  // --- treni
  const treni = {}, contaStazioni = new Map(), numeri = new Map();
  let nonCrescenti = 0;
  const sconosciute = new Map(), nomeDiverso = [];
  for (const v of [...viaggi.values()].sort((a, b) => a.num.localeCompare(b.num, 'en', { numeric: true }))) {
    v.stops.sort((a, b) => a[0] - b[0]);
    if (v.stops.length < 2) { avvisi.push(`treno ${v.num} con meno di 2 fermate: ignorato`); continue; }
    if (v.stops.some((s, i) => i && s[2] < v.stops[i - 1][2])) nonCrescenti++;
    const f = v.stops.map(([, stopId, min, arr]) => {
      const id = idCatalogo(stopId) ?? ('?' + stopId);
      const fer = fermate.get(stopId);
      if (!fer) sconosciute.set(stopId, '(assente da stops.txt)');
      else if (catalogo) {
        const nomi = nomiCatalogo.get(id);
        if (!nomi) sconosciute.set(stopId, fer.nome);
        else if (!nomi.has(norm(fer.nome)) && !nomeDiverso.some((x) => x.id === id)) nomeDiverso.push({ id, gtfs: fer.nome });
      }
      return arr !== min ? [id, min, arr] : [id, min];   // [stazione, partenza] oppure [stazione, partenza, arrivo] se la sosta e' registrata
    });
    for (const id of new Set(f.map((x) => x[0]))) contaStazioni.set(id, (contaStazioni.get(id) || 0) + 1);
    const treno = { l: v.l, s: idxServizio.get(v.sid), c: v.c, f };
    numeri.set(v.num, (numeri.get(v.num) || 0) + 1);
    if (v.num in treni) treni[v.num] = [].concat(treni[v.num], [treno]); else treni[v.num] = treno;
  }
  const duplicati = [...numeri].filter(([, n]) => n > 1).map(([n]) => n);
  if (duplicati.length) avvisi.push(`numeri di treno con piu' viaggi (${duplicati.length}, salvati come lista): ${duplicati.slice(0, 8).join(', ')}`);
  if (nonCrescenti) avvisi.push(`${nonCrescenti} treni con orari che tornano indietro lungo il percorso`);
  if (sconosciute.size) avvisi.push(`fermate non riconosciute nel catalogo (${sconosciute.size}): ` + [...sconosciute].slice(0, 8).map(([k, n]) => k + ' ' + n).join('; '));
  if (nomeDiverso.length) avvisi.push(`fermate con nome diverso dal catalogo (${nomeDiverso.length}): ` + nomeDiverso.slice(0, 8).map((x) => x.id + ' "' + x.gtfs + '"').join('; '));

  // --- stazioni servite e non servite
  const stazioni = {};
  for (const [stopId, fer] of fermate) {
    const id = idCatalogo(stopId);
    if (!id || !contaStazioni.has(id)) continue;
    stazioni[id] = { lat: Number.isFinite(fer.lat) ? fer.lat : null, lon: Number.isFinite(fer.lon) ? fer.lon : null, n: contaStazioni.get(id) };
  }
  for (const [id, n] of contaStazioni) if (!(id in stazioni)) stazioni[id] = { lat: null, lon: null, n };
  const nonServite = catalogo ? catalogo.stazioni.map((s) => s.id).filter((id) => !(id in stazioni)).sort((a, b) => a - b) : [];

  // --- riepilogo
  const tutte = [...date.values()].flatMap((s) => [...s]).sort();
  const usate = new Set(Object.values(treni).flat().map((t) => t.l));
  const orari = {
    v: 1,
    generato: opts.ora || new Date().toISOString(),
    fonte: FONTE, licenza: LICENZA,
    gtfsDel: [...zip.nomi()].map((n) => zip.data(n)).sort().at(-1),
    valido: tutte.length ? [trattini(tutte[0]), trattini(tutte.at(-1))] : null,
    zip: opts.zipInfo || null,
    linee: Object.fromEntries([...linee].filter(([id]) => usate.has(id)).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))),
    servizi: Object.fromEntries(ordineServizi.map((s) => [idxServizio.get(s), comprimiDate(date.get(s))])),
    serviziGtfs: Object.fromEntries(ordineServizi.map((s) => [idxServizio.get(s), s])),
    treni,
    stazioni: Object.fromEntries(Object.entries(stazioni).sort(([a], [b]) => a - b)),
    nonServite,
    avvisi: [...avvisi],
  };
  const v = validaOrari(orari, { oggi: opts.oggi, catalogo, minTreni: opts.minTreni, minStazioni: opts.minStazioni });
  errori.push(...v.errori); avvisi.push(...v.avvisi.filter((a) => !avvisi.includes(a)));
  orari.avvisi = [...avvisi];
  return { orari, errori, avvisi };
}

// ============================================================ validazione (riusabile: anche dai test dell'app)

export function validaOrari(o, { oggi, catalogo, minTreni = 100, minStazioni = 50 } = {}) {
  const errori = [], avvisi = [];
  if (!o || typeof o !== 'object') return { errori: ['il file non e\' un oggetto JSON'], avvisi };
  if (o.v !== 1) errori.push('versione del formato inattesa: ' + o.v);
  for (const k of ['linee', 'servizi', 'treni', 'stazioni']) if (!o[k] || typeof o[k] !== 'object') errori.push('manca il campo ' + k);
  if (errori.length) return { errori, avvisi };

  const nTreni = Object.keys(o.treni).length;
  if (nTreni < minTreni) errori.push(`troppo pochi treni: ${nTreni} (minimo ${minTreni})`);
  if (Object.keys(o.stazioni).length < minStazioni) errori.push(`troppo poche stazioni servite: ${Object.keys(o.stazioni).length} (minimo ${minStazioni})`);
  const rangeOk = /^\d{8}(-\d{8})?$/;
  for (const [s, r] of Object.entries(o.servizi)) {
    if (!Array.isArray(r) || !r.length) { avvisi.push('servizio senza giorni: ' + s); continue; }
    for (const x of r) { if (!rangeOk.test(x)) errori.push(`servizio ${s}: intervallo non valido "${x}"`); else { const [a, b] = x.split('-'); if (b && a > b) errori.push(`servizio ${s}: intervallo al contrario "${x}"`); } }
  }
  if (o.valido && !(o.valido[0] <= o.valido[1])) errori.push('valido: date al contrario');
  if (oggi && o.valido && o.valido[1] < oggi) errori.push(`il GTFS e' scaduto: valido fino al ${o.valido[1]}, oggi ${oggi}`);
  else if (oggi && o.valido) {
    const fra = giorno(ymd(o.valido[1])) - giorno(ymd(oggi));
    if (fra < 14) avvisi.push(`il calendario copre solo altri ${fra} giorni`);
    if (o.valido[0] > oggi) avvisi.push('il GTFS inizia dopo oggi: ' + o.valido[0]);
  }

  let cattivi = 0, indietro = 0;
  for (const [num, t0] of Object.entries(o.treni)) for (const t of [].concat(t0)) {
    const ok = t && o.linee[t.l] !== undefined && o.servizi[t.s] !== undefined && Array.isArray(t.f) && t.f.length >= 2
      && t.f.every((x) => Array.isArray(x) && typeof x[0] === 'string' && Number.isInteger(x[1]) && x[1] >= 0 && x[1] < 2880
        && (x.length === 2 || (x.length === 3 && Number.isInteger(x[2]) && x[2] >= 0 && x[2] < 2880)));
    if (!ok) { cattivi++; if (cattivi <= 3) errori.push(`treno ${num} malformato`); continue; }
    if (t.f.some((x, i) => i && x[1] < t.f[i - 1][1])) indietro++;
    for (const [id] of t.f) if (!(id in o.stazioni)) errori.push(`treno ${num}: la stazione ${id} non e' in "stazioni"`);
  }
  if (cattivi > 3) errori.push(`altri ${cattivi - 3} treni malformati`);
  if (catalogo) {
    const ids = new Set(catalogo.stazioni.map((s) => s.id));
    const fuori = Object.keys(o.stazioni).filter((id) => !ids.has(id));
    if (fuori.length) avvisi.push(`stazioni fuori dal catalogo (${fuori.length}): ${fuori.slice(0, 6).join(', ')}`);
    for (const id of o.nonServite || []) if (!ids.has(id)) errori.push('nonServite: id non nel catalogo ' + id);
  }
  return { errori: [...new Set(errori)], avvisi };
}

// ============================================================ scrittura (una riga per treno/stazione: diff leggibili)

export function serializza(o) {
  const J = JSON.stringify;
  const blocco = (nome, obj) => `${J(nome)}:{\n${Object.entries(obj).map(([k, v]) => J(k) + ':' + J(v)).join(',\n')}\n}`;
  const semplici = Object.fromEntries(['v', 'generato', 'fonte', 'licenza', 'gtfsDel', 'valido', 'zip', 'linee', 'servizi', 'serviziGtfs'].map((k) => [k, o[k]]));
  const testa = Object.entries(semplici).map(([k, v]) => J(k) + ':' + J(v)).join(',\n');
  return `{\n${testa},\n${blocco('treni', o.treni)},\n${blocco('stazioni', o.stazioni)},\n${J('nonServite')}:${J(o.nonServite)},\n${J('avvisi')}:${J(o.avvisi)}\n}\n`;
}

// ============================================================ riga di comando

async function scarica(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error('scaricamento: HTTP ' + res.status);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
  const has = (n) => args.includes('--' + n);
  const out = opt('out', ROOT + 'docs/orari.json');
  const catalogoPath = ROOT + 'docs/stazioni.json';
  const catalogo = existsSync(catalogoPath) ? JSON.parse(readFileSync(catalogoPath, 'utf8')) : null;
  const oggi = opt('oggi', new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date()));

  if (has('valida')) {
    const r = validaOrari(JSON.parse(readFileSync(opt('valida'), 'utf8')), { oggi, catalogo });
    r.errori.forEach((e) => console.log('ERRORE ', e)); r.avvisi.forEach((a) => console.log('avviso ', a));
    console.log(r.errori.length ? `NON VALIDO (${r.errori.length} errori)` : 'valido');
    process.exit(r.errori.length ? 2 : 0);
  }

  const buf = opt('file') ? readFileSync(opt('file')) : await scarica(opt('url', URL_GTFS));
  const sha1 = createHash('sha1').update(buf).digest('hex');
  const zip = leggiZip(buf);
  const prev = existsSync(out) ? (() => { try { return JSON.parse(readFileSync(out, 'utf8')); } catch { return null; } })() : null;

  if (has('check')) {
    const uguale = prev && prev.zip && prev.zip.sha1 === sha1;
    console.log(uguale ? `invariato (impronta ${sha1.slice(0, 12)}, GTFS del ${prev.gtfsDel})` : `CAMBIATO (impronta ${sha1.slice(0, 12)}, GTFS del ${zip.data('routes.txt')}${prev ? '; prima ' + (prev.zip?.sha1 || '?').slice(0, 12) : '; nessun file precedente'})`);
    process.exit(uguale ? 0 : 10);
  }

  const r = buildOrari(zip, { catalogo, oggi, zipInfo: { sha1, byte: buf.length }, minTreni: 100 });
  if (r.orari && prev && prev.treni) {
    const a = Object.keys(prev.treni).length, b = Object.keys(r.orari.treni).length;
    if (a && Math.abs(b - a) / a > 0.25) r.errori.push(`il numero di treni e' cambiato troppo: ${a} -> ${b} (oltre il 25%)`);
  }
  r.errori.forEach((e) => console.log('ERRORE ', e)); r.avvisi.forEach((a) => console.log('avviso ', a));
  if (r.errori.length && !has('force')) { console.log('Nulla scritto (usa --force per scrivere comunque).'); process.exit(2); }
  const testo = serializza(r.orari);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, testo);
  const o = r.orari;
  console.log(`scritto ${out}: ${(testo.length / 1024).toFixed(0)} KB | ${Object.keys(o.treni).length} treni | ${Object.keys(o.stazioni).length} stazioni servite | ${o.nonServite.length} non servite | valido ${o.valido?.join(' → ')} | GTFS del ${o.gtfsDel}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('Errore:', e.message); process.exit(1); });
}
