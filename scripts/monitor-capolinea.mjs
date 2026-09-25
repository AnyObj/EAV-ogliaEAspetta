// Raccoglie dati dai tabelloni EAV dei capolinea (partenze e arrivi) a intervalli regolari, per cercare
// poi le anomalie (soppressioni, ritardi senza minuti, formati mai visti...). Non interpreta nulla: salva.
//
//   node scripts/monitor-capolinea.mjs                      # fino a 23:59 (ora di Roma), un giro ogni 2 minuti
//   node scripts/monitor-capolinea.mjs --until 18:30 --interval 180
//   node scripts/monitor-capolinea.mjs --once --interval 60  # un solo giro (prova)
//   node scripts/monitor-capolinea.mjs --stazioni 3,4        # aggiunge stazioni oltre ai capolinea
//
// Gentile con EAV: le richieste di un giro sono distribuite sull'intero intervallo (24 richieste in 120 s =
// una ogni 5 s), parlano direttamente con EAV (non passano dal Worker) e dopo errori ripetuti si rallenta.
//
// Cosa scrive, in data/monitor/<data_ora_avvio>/ (cartella ignorata da git):
//   manifest.json         parametri e capolinea scelti
//   campioni.jsonl        una riga per richiesta: esito, durata, hash, se e' cambiato; se cambiato anche i treni letti
//   grezzi/<id>-<P|A>/    la risposta HTML originale (gzip), salvata solo quando cambia rispetto alla precedente
//   novita.jsonl          la prima volta che compare un valore mai visto (ritardo, informazioni, classi CSS, categoria...)
//   segnali.jsonl         righe che contengono parole da soppressione/sospensione/ecc. (vedi PAROLE)

import { readFileSync, mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseBoard, parseStationPage } from '../worker/parse.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASE = 'https://orariotreni.eavsrl.it/teleindicatori/';
const UA = 'Mozilla/5.0 (eav-ogliaeaspetta raccolta dati una tantum)';
const PAROLE = /soppr|cancel|annull|sospes|non effettuat|limitat|interrott|deviat|guasto|sciopero|variaz|ritard|delay/i;

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const INTERVALLO = Math.max(30, +opt('interval', 120)) * 1000;
const UNTIL = opt('until', '23:59');
const ONCE = args.includes('--once');
const EXTRA = String(opt('stazioni', '')).split(',').map((s) => s.trim()).filter(Boolean);

// ---------- ora di Roma ----------
const romeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const romeHMS = (d = new Date()) => romeFmt.format(d);
const romeMin = (d = new Date()) => { const [h, m] = romeHMS(d).split(':').map(Number); return h * 60 + m; };
const [uh, um] = UNTIL.split(':').map(Number);
const UNTIL_MIN = uh * 60 + um;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- capolinea dal catalogo ----------
const cat = JSON.parse(readFileSync(ROOT + 'docs/stazioni.json', 'utf8'));
const byId = new Map(cat.stazioni.map((s) => [s.id, s]));
const capolinea = new Set();
for (const l of cat.linee) { if (l.stazioni.length) { capolinea.add(l.stazioni[0]); capolinea.add(l.stazioni.at(-1)); } }
for (const id of EXTRA) if (byId.has(id)) capolinea.add(id);
const targets = [];
for (const id of [...capolinea].sort((a, b) => +a - +b)) for (const tipo of ['P', 'A']) targets.push({ id, tipo, nome: byId.get(id).nome, key: id + '-' + tipo });

// ---------- cartella di uscita ----------
const stamp = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  .format(new Date()).replace(' ', '_').replace(':', ''); // es. 2026-09-25_0548, ora di Roma
const OUT = ROOT + 'data/monitor/' + stamp + '/';
mkdirSync(OUT + 'grezzi', { recursive: true });
for (const t of targets) mkdirSync(OUT + 'grezzi/' + t.key, { recursive: true });
writeFileSync(OUT + 'manifest.json', JSON.stringify({ avvio: new Date().toISOString(), intervalloSec: INTERVALLO / 1000, until: UNTIL, once: ONCE,
  targets: targets.map((t) => ({ id: t.id, tipo: t.tipo, nome: t.nome })) }, null, 1));
const append = (file, obj) => appendFileSync(OUT + file, JSON.stringify(obj) + '\n');

// ---------- richieste ----------
const params = new Map(); // key -> campi nascosti della pagina della stazione
async function getParams(t) {
  if (params.has(t.key)) return params.get(t.key);
  const res = await fetch(BASE + '?stazione=' + t.id + '&tipo=' + t.tipo, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('pagina stazione: HTTP ' + res.status);
  const p = parseStationPage(await res.text());
  if (!p.codLoc || p.codLoc === '0') throw new Error('campi nascosti mancanti');
  params.set(t.key, p);
  return p;
}
async function fetchBoard(t) {
  const p = await getParams(t);
  const res = await fetch(BASE + p.endpoint, {
    method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: BASE, 'User-Agent': UA },
    body: new URLSearchParams({ device: p.nomeDevice || '', tipoLista: p.tipoLista, codLoc: p.codLoc, touchpoint: p.touchpoint || '', visualizzazione: 'mobile' }),
  });
  const html = await res.text();
  return { status: res.status, html };
}

// ---------- novita' ----------
const visti = { ritardo: new Set(), info: new Set(), rowClass: new Set(), cat: new Set(), classiCss: new Set(), bgcolor: new Set() };
function novita(t, kind, value) {
  const set = visti[kind];
  if (set.has(value)) return;
  set.add(value);
  append('novita.jsonl', { t: new Date().toISOString(), id: t.id, tipo: t.tipo, kind, value });
}
function cercaNovita(t, html, board) {
  for (const m of html.matchAll(/class="([^"]+)"/g)) novita(t, 'classiCss', m[1]);
  for (const m of html.matchAll(/bgcolor="([^"]*)"/g)) novita(t, 'bgcolor', m[1]);
  for (const tr of board.trains) {
    novita(t, 'ritardo', tr.ritardoRaw);
    if (tr.info && !/^Ferma a:/i.test(tr.info)) novita(t, 'info', tr.info);
    novita(t, 'rowClass', tr.rowClass);
    novita(t, 'cat', tr.cat);
  }
}

// ---------- ciclo ----------
const ultimo = new Map(); // key -> hash
let consecutiviErrori = 0, n = { richieste: 0, errori: 0, cambiati: 0, segnali: 0 };

async function campiona(t) {
  const t0 = Date.now();
  const rec = { t: new Date().toISOString(), rome: romeHMS(), id: t.id, tipo: t.tipo, nome: t.nome };
  try {
    const { status, html } = await fetchBoard(t);
    rec.http = status; rec.ms = Date.now() - t0; rec.bytes = html.length;
    if (status !== 200) throw new Error('HTTP ' + status);
    const hash = createHash('sha1').update(html).digest('hex').slice(0, 12);
    rec.ok = true; rec.hash = hash; rec.changed = ultimo.get(t.key) !== hash;
    if (rec.changed) {
      ultimo.set(t.key, hash);
      const board = parseBoard(html, t.id, t.tipo, romeMin());
      rec.station = board.station; rec.notice = board.notice; rec.nTrains = board.trains.length; rec.trains = board.trains;
      writeFileSync(OUT + 'grezzi/' + t.key + '/' + rec.rome.replace(/:/g, '') + '.html.gz', gzipSync(html));
      cercaNovita(t, html, board);
      for (const tr of board.trains) {
        if (PAROLE.test(tr.ritardoRaw + ' ' + tr.info.replace(/^Ferma a:.*/i, '') + ' ' + tr.rowClass)) {
          n.segnali++; append('segnali.jsonl', { t: rec.t, id: t.id, tipo: t.tipo, treno: tr });
        }
      }
      n.cambiati++;
    }
    consecutiviErrori = 0;
  } catch (e) {
    rec.ok = false; rec.error = String(e && e.message || e); rec.ms = Date.now() - t0;
    n.errori++; consecutiviErrori++;
  }
  n.richieste++;
  append('campioni.jsonl', rec);
  return rec;
}

let fermo = false;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { fermo = true; console.log('\nInterruzione richiesta: finisco il giro e mi fermo.'); });

console.log('Capolinea (' + new Set(targets.map((t) => t.id)).size + '):', [...new Set(targets.map((t) => t.id + ' ' + t.nome))].join(' | '));
console.log('Richieste per giro:', targets.length, '| intervallo:', INTERVALLO / 1000, 's | una richiesta ogni', (INTERVALLO / targets.length / 1000).toFixed(1), 's');
console.log('Uscita:', OUT, '| fino alle', ONCE ? '(un solo giro)' : UNTIL + ' ora di Roma');

let giro = 0;
while (!fermo) {
  giro++;
  const inizio = Date.now();
  const slot = INTERVALLO / targets.length;
  let cambiati = 0, errori = 0;
  for (let i = 0; i < targets.length && !fermo; i++) {
    const attesa = inizio + i * slot - Date.now();
    if (attesa > 0) await sleep(attesa);
    const r = await campiona(targets[i]);
    if (r.changed) cambiati++;
    if (!r.ok) errori++;
    if (consecutiviErrori >= 3) { console.log('  3 errori di fila: pausa di 5 minuti per non pesare su EAV'); await sleep(300000); consecutiviErrori = 0; }
    if (n.errori > 60 && n.errori > n.richieste / 2) { console.log('Troppi errori: mi fermo.'); fermo = true; }
  }
  console.log(`giro ${String(giro).padStart(3)} ${romeHMS()} | richieste ${targets.length} | cambiate ${cambiati} | errori ${errori} | totale ${n.richieste} richieste, ${n.segnali} segnali`);
  if (ONCE) break;
  if (romeMin() >= UNTIL_MIN) { console.log('Ora limite raggiunta.'); break; }
  const resto = inizio + INTERVALLO - Date.now();
  if (resto > 0 && !fermo) await sleep(resto);
}
writeFileSync(OUT + 'fine.json', JSON.stringify({ fine: new Date().toISOString(), giri: giro, ...n }, null, 1));
console.log('Finito.', JSON.stringify(n));
