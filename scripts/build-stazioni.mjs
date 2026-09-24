// Genera docs/stazioni.json a partire dalla home di EAV (1 sola richiesta).
//
//   node scripts/build-stazioni.mjs            # solo catalogo
//   node scripts/build-stazioni.mjs --probe    # in piu' interroga OGNI stazione una volta
//                                              # (1 richiesta ogni 2 s, si ferma dopo 3 errori di fila)
//                                              # per sapere quali hanno dati e come EAV scrive il loro nome
//
// La home contiene <script id="data-localita" type="application/json"> con un record per ogni
// coppia stazione+linea: le stazioni di interscambio compaiono piu' volte con lo stesso id.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseBoard } from '../worker/parse.js';

const HOME = 'https://orariotreni.eavsrl.it/';
const BASE = HOME + 'teleindicatori/';
const OUT = fileURLToPath(new URL('../docs/stazioni.json', import.meta.url));
const PAUSE_MS = 2000;
const UA = 'Mozilla/5.0 (eav-ogliaeaspetta catalog builder)';
const probe = process.argv.includes('--probe');

const res = await fetch(HOME, { headers: { 'User-Agent': UA } });
if (!res.ok) throw new Error('Home EAV: HTTP ' + res.status);
const m = /<script id="data-localita" type="application\/json">([\s\S]*?)<\/script>/.exec(await res.text());
if (!m) throw new Error('Elenco stazioni non trovato nella home di EAV');
const records = JSON.parse(m[1]);

const isVisible = (r) => String(r.visualizzato).toLowerCase() === 'true';
const linee = new Map(); // nome linea -> {id, nome}
const byId = new Map();
for (const r of records) {
  if (!isVisible(r) || !r.descrizione) continue;
  if (!linee.has(r.linea)) linee.set(r.linea, { id: r.idLinea, nome: r.linea });
  const s = byId.get(r.id) || { id: r.id, nome: r.descrizione, linee: [], moova: false, loc: null, tp: null };
  if (!s.linee.includes(r.linea)) s.linee.push(r.linea);
  if (String(r.isMoova).toLowerCase() === 'true') s.moova = true;
  if (r.idLocMoova) { s.loc = r.idLocMoova; s.tp = r.touchpoint; }
  byId.set(r.id, s);
}

// Con --probe si conservano i dati del giro precedente se non lo si rifa'.
const old = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
const oldById = new Map((old ? old.stazioni : []).map((s) => [s.id, s]));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let errors = 0;
const stazioni = [];
for (const s of byId.values()) {
  const prev = oldById.get(s.id) || {};
  let dati = prev.dati ?? null;       // true/false = la stazione ha (o no) treni nel tabellone EAV
  let nomeEav = prev.nomeEav ?? null; // come EAV scrive il nome nel tabellone (spesso diverso)

  if (probe && errors < 3) {
    const useMoova = s.moova && s.loc;
    try {
      const r = await fetch(BASE + (useMoova ? 'ws_getData_moova.php' : 'ws_getData_pis.php'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: BASE, 'User-Agent': UA },
        body: new URLSearchParams({
          device: 'M01T' + s.id + 'M', tipoLista: 'P',
          codLoc: useMoova ? s.loc : s.id, touchpoint: useMoova ? s.tp : '', visualizzazione: 'mobile',
        }),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const board = parseBoard(await r.text(), s.id, 'P');
      dati = board.trains.length > 0;
      nomeEav = board.station || null;
      errors = 0;
    } catch (e) {
      errors++;
      console.error(s.id, s.nome, 'ERRORE', e.message);
    }
    console.log(s.id, s.nome, '->', dati ? 'dati' : 'vuota', nomeEav ? '(' + nomeEav + ')' : '');
    await sleep(PAUSE_MS);
  }
  stazioni.push({ id: s.id, nome: s.nome, linee: s.linee, moova: s.moova, dati, nomeEav });
}
if (errors >= 3) console.error('Giro interrotto dopo 3 errori di fila: i dati delle stazioni non sondate restano quelli vecchi.');

// Alias: nomi con cui EAV scrive la stessa stazione nei tabelloni (fermate/destinazioni).
// Un alias conteso da piu' stazioni va a quella con id piu' basso.
const norm = (s) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/A\.TA\b/g, 'ANNUNZIATA').replace(/\bSANT['’]\s*/g, 'S ')
  .replace(/\b(SANTA|SANTO|SAN|SANT|S)\b\.?/g, 'S ').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const claimed = new Map();
for (const s of [...stazioni].sort((a, b) => +a.id - +b.id)) {
  s.alias = [];
  if (s.nomeEav && norm(s.nomeEav) !== norm(s.nome) && !claimed.has(norm(s.nomeEav))) {
    s.alias.push(s.nomeEav);
    claimed.set(norm(s.nomeEav), s.id);
  }
}

// `dati` e' una fotografia al momento del sondaggio (`sondato`): una stazione vuota di sera puo' avere
// treni il mattino dopo. La pagina non deve mai escluderla, solo avvisare dopo aver interrogato.
const out = { generato: new Date().toISOString(), fonte: HOME, sondato: probe ? new Date().toISOString() : (old && old.sondato) || null, linee: [...linee.values()], stazioni };
writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log('scritto', OUT, '-', stazioni.length, 'stazioni,', out.linee.length, 'linee');
