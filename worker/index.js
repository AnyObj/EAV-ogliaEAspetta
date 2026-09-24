// Cloudflare Worker: proxy JSON per i teleindicatori EAV.
//
// Uso:  https://<tuo-worker>.workers.dev/?stazione=3&tipo=P
//   stazione = numero usato nell'URL del sito EAV
//   tipo     = P (partenze) oppure A (arrivi)
//
// Cosa fa:
//  1. scarica la pagina ?stazione=..&tipo=.. e ne legge i 4 campi nascosti e l'endpoint dati
//     (ws_getData_moova.php oppure ws_getData_pis.php, a seconda della stazione)
//  2. fa la POST all'endpoint, come fa il JavaScript del sito
//  3. trasforma la tabella HTML in JSON e risponde con CORS limitato ai siti autorizzati
//  4. tiene in memoria il risultato per 10 secondi, cosi' EAV non viene martellato
//
// Siti autorizzati: variabile ALLOWED_ORIGINS (origini separate da virgola, senza percorso).
// REQUIRE_ORIGIN=1 respinge anche le richieste senza header Origin (curl, script).
// In produzione stanno in wrangler.toml, in locale in .dev.vars.

import { parseBoard, parseStationPage } from './parse.js';
import catalogo from '../docs/stazioni.json' with { type: 'json' };

const KNOWN_IDS = new Set(catalogo.stazioni.map((s) => s.id));

const romeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function romeMinutes() {
  const [h, m] = romeFmt.format(new Date()).split(':').map(Number);
  return h * 60 + m;
}

const BASE = 'https://orariotreni.eavsrl.it/teleindicatori/';
const DATA_TTL_MS = 10 * 1000;       // durata cache dei treni
const PARAMS_TTL_MS = 60 * 60 * 1000; // durata cache dei parametri stazione

const dataMemo = new Map();   // "stazione|tipo" -> {t, body}
const paramsMemo = new Map(); // "stazione|tipo" -> {t, params}

const originsOf = (env) => String((env && env.ALLOWED_ORIGINS) || '').split(',').map((s) => s.trim()).filter(Boolean);

function corsFor(origin, allowed) {
  const h = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
  if (origin && allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

export default {
  async fetch(request, env) {
    // Un browser che parte da un altro sito viene rifiutato. Chi apre l'indirizzo
    // direttamente (o usa curl) non manda l'header Origin e passa: serve per provare.
    const allowed = originsOf(env);
    const origin = request.headers.get('Origin');
    if (origin && !allowed.includes(origin)) {
      return new Response('Origine non autorizzata', { status: 403 });
    }
    // In produzione (REQUIRE_ORIGIN=1) serve un'origine autorizzata: i browser la mandano sempre nelle richieste
    // da un altro sito, curl e gli script no. Non e' una sicurezza vera (l'header si falsifica) ma evita che chi
    // passa di qui consumi la quota gratuita con richieste anonime.
    if (!origin && String((env && env.REQUIRE_ORIGIN) || '') === '1') {
      return new Response('Origine mancante', { status: 403 });
    }
    const cors = corsFor(origin, allowed);
    const json = (body, status, cacheState) => jsonResponse(body, status, cacheState, cors);

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(request.url);
    const stazione = url.searchParams.get('stazione') || '3';
    const tipo = (url.searchParams.get('tipo') || 'P').toUpperCase();
    if (!/^\d{1,4}$/.test(stazione) || !/^[PA]$/.test(tipo)) {
      return json({ error: 'Parametri non validi: stazione=numero, tipo=P|A' }, 400);
    }

    // EAV risponde 200 con una tabella vuota per qualunque id: si rifiutano quelli fuori catalogo
    // senza nemmeno interrogarla.
    if (!KNOWN_IDS.has(stazione)) return json({ error: 'Stazione sconosciuta: ' + stazione }, 404);

    const key = stazione + '|' + tipo;
    const cached = dataMemo.get(key);
    if (cached && Date.now() - cached.t < DATA_TTL_MS) return json(cached.body, 200, 'HIT');

    try {
      const params = await getParams(key, stazione, tipo);
      const html = await fetchBoard(params);
      const body = parseBoard(html, stazione, tipo, romeMinutes());
      dataMemo.set(key, { t: Date.now(), body });
      return json(body, 200, 'MISS');
    } catch (err) {
      // se EAV non risponde, meglio dati vecchi che niente
      if (cached) return json({ ...cached.body, stale: true }, 200, 'STALE');
      return json({ error: String(err && err.message || err) }, 502);
    }
  },
};

function jsonResponse(body, status = 200, cacheState, cors = {}) {
  const headers = { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (cacheState) headers['X-Cache'] = cacheState;
  return new Response(JSON.stringify(body), { status, headers });
}

async function getParams(key, stazione, tipo) {
  const hit = paramsMemo.get(key);
  if (hit && Date.now() - hit.t < PARAMS_TTL_MS) return hit.params;

  const res = await fetch(BASE + '?stazione=' + stazione + '&tipo=' + tipo, {
    headers: { 'User-Agent': 'Mozilla/5.0 (eav-board-proxy)' },
  });
  if (!res.ok) throw new Error('Pagina EAV: HTTP ' + res.status);
  const params = parseStationPage(await res.text());
  // codLoc "0" e' quello che EAV mette quando la stazione non esiste
  if (!params.codLoc || params.codLoc === '0' || !params.tipoLista) throw new Error('Stazione non trovata (campi nascosti mancanti)');

  paramsMemo.set(key, { t: Date.now(), params });
  return params;
}

async function fetchBoard(p) {
  const body = new URLSearchParams({
    device: p.nomeDevice || '',
    tipoLista: p.tipoLista,
    codLoc: p.codLoc,
    touchpoint: p.touchpoint || '',
    visualizzazione: 'mobile',
  });
  const res = await fetch(BASE + p.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': BASE,
      'User-Agent': 'Mozilla/5.0 (eav-board-proxy)',
    },
    body,
  });
  if (!res.ok) throw new Error(p.endpoint + ': HTTP ' + res.status);
  return res.text();
}
