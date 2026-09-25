// Orari programmati (GTFS di EAV) dentro l'app: logica pura, senza DOM. I dati vengono da docs/orari.json, costruito da
// scripts/build-orari.mjs (vedi notes/gtfs-piano.md). Il GTFS dice cosa e' PROGRAMMATO: mai ritardi o soppressioni.
//
// Principio: se qualcosa non torna (file mancante, scaduto, treno che non coincide con il tabellone, dati che
// differiscono troppo) si ignora il GTFS e l'app fa quello che faceva senza.

import { ROTTA_SERVIZIO, STAZIONE_VOLLA, FIDUCIA } from './config.js';

const toMin = (s) => { const m = /(\d{1,2}):(\d{2})/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; };
export const hm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.floor(min % 60)).padStart(2, '0')}`;

// Data di oggi a Roma come "AAAA-MM-GG".
export const dataRoma = (d = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(d);

const inIntervalli = (intervalli, d) => intervalli.some((r) => { const [a, b] = r.split('-'); return d >= a && d <= (b || a); });

// Quanto ci si puo' fidare del GTFS, misurato su cio' che il tabellone mostra (stessa regola di analizza-monitor.mjs).
//   copertura   = quota dei treni visti (esclusi EXP/FAC EX, che il GTFS non contiene) che il GTFS conosce
//   concordanza = quota di quelli con lo stesso orario
//   mancanti    = quota dei treni programmati (nella finestra osservata) che non compaiono
// c = { viste, inGtfs, uguali, mancanti, controllati, perTabellone? }. Verdetto: affidabile | non usare | non valutabile.
export function valutaFiducia(c, soglie = FIDUCIA) {
  const S = { ...FIDUCIA, ...soglie };
  const rapp = (a, b) => (b ? a / b : null);
  const copertura = rapp(c.inGtfs, c.viste), concordanza = rapp(c.uguali, c.inGtfs), mancanti = rapp(c.mancanti, c.controllati);
  const pct = (x) => (x === null ? 'n.d.' : (100 * x).toFixed(1) + '%');
  const motivi = [];
  if (c.viste < S.minTreni) motivi.push(`troppo pochi treni per giudicare (${c.viste})`);
  else {
    if (copertura < S.copertura) motivi.push(`copertura ${pct(copertura)} sotto la soglia ${pct(S.copertura)}`);
    if (concordanza !== null && concordanza < S.concordanza) motivi.push(`concordanza degli orari ${pct(concordanza)} sotto la soglia ${pct(S.concordanza)}`);
    if (mancanti !== null && mancanti > S.mancanti) motivi.push(`treni programmati mai visti ${pct(mancanti)} sopra la soglia ${pct(S.mancanti)}`);
  }
  return {
    verdetto: !motivi.length ? 'affidabile' : c.viste < S.minTreni ? 'non valutabile' : 'non usare',
    motivi, copertura, concordanza, mancanti, viste: c.viste, inGtfs: c.inGtfs, uguali: c.uguali, soglie: S,
    perTabellone: (c.perTabellone || []).map((x) => ({ ...x })),
  };
}

// Crea l'oggetto per interrogare gli orari. Ritorna null se i dati non sono utilizzabili oggi (formato inatteso,
// non ancora validi o scaduti): in quel caso l'app non li usa.
export function creaOrari(dati, { oggi = dataRoma() } = {}) {
  if (!dati || dati.v !== 1 || !dati.treni || !dati.servizi || !dati.stazioni || !Array.isArray(dati.valido)) return null;
  if (oggi < dati.valido[0] || oggi > dati.valido[1]) return null;
  const d = oggi.replace(/-/g, '');
  const attivi = {};
  const attivo = (s) => (s in attivi ? attivi[s] : (attivi[s] = !!dati.servizi[s] && inIntervalli(dati.servizi[s], d)));
  const nonServite = new Set(dati.nonServite || []);

  const O = {
    dati, oggi, nonServite,
    // il viaggio con quel numero che circola oggi (un numero puo' avere piu' viaggi), o null
    treno(num) { const t = [].concat(dati.treni[num] || []).find((x) => attivo(x.s)); return t || null; },
    // servizio (stile) del treno: dal percorso GTFS; Volla e' Pomigliano; percorso ignoto -> null
    servizioDi(t) {
      const s = ROTTA_SERVIZIO[t.l];
      if (!s) return null;
      if (t.l === '8' && (t.f[0][0] === STAZIONE_VOLLA || t.f.at(-1)[0] === STAZIONE_VOLLA)) return 'pomigliano';
      return s;
    },
    // fermate DOPO la stazione (partenze) o PRIMA (arrivi), o null se il treno non parte/arriva da qui
    fermateDa(t, stazione, tipo) {
      const i = t.f.findIndex((x) => x[0] === stazione);
      if (i < 0) return null;
      if (tipo === 'P') return i === t.f.length - 1 ? null : t.f.slice(i + 1).map((x) => x[0]);
      return i === 0 ? null : t.f.slice(0, i).map((x) => x[0]);
    },
    // orario del passaggio in minuti: la partenza sui tabelloni delle partenze, l'arrivo su quelli degli arrivi
    orarioA(t, stazione, tipo) {
      const x = t.f.find((y) => y[0] === stazione);
      return x ? (tipo === 'A' ? (x[2] ?? x[1]) : x[1]) : null;
    },
    servita: (id) => !nonServite.has(id),
    // treni programmati oggi che passano da qui, con l'orario in [daMin, aMin]
    programmati(stazione, tipo, daMin, aMin) {
      const out = [];
      for (const [num, t0] of Object.entries(dati.treni)) for (const t of [].concat(t0)) {
        if (!attivo(t.s) || !O.fermateDa(t, stazione, tipo)) continue;
        const min = O.orarioA(t, stazione, tipo);
        if (min >= daMin && min <= aMin) out.push({ num, min, capolinea: t.c, linea: t.l, g: t });
      }
      return out.sort((a, b) => a.min - b.min);
    },
    // Confronto tra il tabellone di adesso e gli orari programmati -> { conteggi, fiducia }
    valuta(treniLive, stazione, tipo, nowMin, soglie) {
      const oggiLive = treniLive.filter((t) => t.day === 0);
      const viste = oggiLive.filter((t) => t.cat !== 'EXP');
      let inGtfs = 0, uguali = 0;
      for (const t of viste) {
        const g = O.treno(t.num);
        if (!g || !O.fermateDa(g, stazione, tipo)) continue;
        inGtfs++;
        if (O.orarioA(g, stazione, tipo) === toMin(t.time)) uguali++;
      }
      const ultimo = Math.max(-1, ...oggiLive.map((t) => toMin(t.time) ?? -1));
      const attesi = ultimo >= nowMin ? O.programmati(stazione, tipo, Math.ceil(nowMin), ultimo) : [];
      const presenti = new Set(oggiLive.map((t) => t.num));
      const mancanti = attesi.filter((a) => !presenti.has(a.num));
      const conteggi = { viste: viste.length, inGtfs, uguali, mancanti: mancanti.length, controllati: attesi.length };
      return { conteggi, fiducia: valutaFiducia(conteggi, soglie), mancanti };
    },
  };
  return O;
}

// Il GTFS per UN treno del tabellone, con le stesse cautele: il viaggio esiste ed e' attivo oggi, passa da questa
// stazione nel verso giusto e il suo capolinea coincide con la destinazione del tabellone (altrimenti descrive un altro
// treno). Ritorna { service, lineService, fermate, gtfs } oppure null (l'app usa allora l'euristica).
export function inferGtfs(orari, t, stazione, tipo, idx, cfg) {
  const g = orari.treno(t.num);
  if (!g) return null;
  const fermate = orari.fermateDa(g, stazione, tipo);
  if (!fermate) return null;
  const capo = tipo === 'P' ? g.f.at(-1)[0] : g.f[0][0];
  const destId = idx.resolve(t.dest);
  if (destId !== capo && !idx.sameStation(t.dest, capo)) return null;
  const lineService = orari.servizioDi(g);
  if (!lineService) return { service: null, lineService: null, fermate, gtfs: g };
  // Sulle partenze il capolinea puo' fare da servizio (Torre A.ta, Napoli). Sugli arrivi no: a Napoli arrivano tutti i treni
  // e colorarli tutti "Napoli" non direbbe nulla, meglio il colore della linea da cui vengono.
  return { service: (tipo === 'P' && cfg.DESTINAZIONE_SERVIZIO[g.f.at(-1)[0]]) || lineService, lineService, fermate, gtfs: g };
}

// Treni programmati nella finestra che il tabellone dovrebbe mostrare ma non mostra (candidati "non in elenco").
// Non dice nulla sul motivo: puo' non essere ancora entrato, non essere piu' nel GTFS, o essere un errore del tabellone.
export function trovaAssenti(orari, treniLive, stazione, tipo, nowMin, finestraMin = 60) {
  const oggiLive = treniLive.filter((t) => t.day === 0);
  const ultimo = Math.max(-1, ...oggiLive.map((t) => toMin(t.time) ?? -1));
  if (ultimo < nowMin) return [];
  const presenti = new Set(oggiLive.map((t) => t.num));
  return orari.programmati(stazione, tipo, Math.ceil(nowMin) + 1, Math.min(ultimo, nowMin + finestraMin)).filter((a) => !presenti.has(a.num));
}
