// Logica pura del tabellone (nessun DOM): testabile con `npm test` in worker/.

// ---------- nomi ----------

// Forma confrontabile di un nome di stazione: senza accenti, maiuscolo, SAN/SANTA/SANT'/S. -> "S",
// "A.TA" -> "ANNUNZIATA". Serve per abbinare i nomi delle fermate a quelli del catalogo.
export function norm(s) {
  return String(s || '')
    .toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/’/g, "'")
    .replace(/\bA\.TA\b/g, 'ANNUNZIATA')
    .replace(/\bSANT'\s*/g, 'S ')
    .replace(/\b(SANTA|SANTO|SAN|SANT|S)\b\.?/g, 'S ')
    .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

const MINORI = new Set(['di', 'del', 'della', 'dei', 'delle', 'degli', 'a', 'al', 'alla', 'e', 'in', 'da', 'de', 'sul', 'la', 'il', 'lo', 'le']);

// "NAPOLI PIAZZA GARIBALDI" -> "Napoli Piazza Garibaldi". Se il nome ha gia' le minuscole non si tocca.
export function titleCase(s) {
  s = String(s || '');
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase()
    .replace(/(^|[\s\-(/'’])([a-zà-ù])/g, (m, p, c) => p + c.toUpperCase())
    .replace(/\.([a-zà-ù])/g, (m, c) => '.' + c.toUpperCase())
    .replace(/\bA\.Ta\b/g, 'A.ta')
    .replace(/(\s)(\S+)/g, (m, sp, w) => sp + (MINORI.has(w.toLowerCase()) ? w.toLowerCase() : w));
}

// ---------- catalogo ----------

// catalogo = contenuto di docs/stazioni.json
export function buildIndex(catalogo) {
  const byId = new Map(), byName = new Map(), lines = new Map();
  for (const l of catalogo.linee) {
    lines.set(l.nome, { ...l, pos: new Map(l.stazioni.map((id, i) => [id, i])) });
  }
  for (const s of catalogo.stazioni) {
    byId.set(s.id, s);
    for (const n of [s.nome, ...(s.alias || [])]) if (!byName.has(norm(n))) byName.set(norm(n), s.id);
  }
  // Tutti i nomi (normalizzati) con cui una stazione compare: catalogo, intestazione del tabellone, alias.
  // EAV a volte da' lo stesso nome a due stazioni (es. "Pollena Trocchia" per la 9 e la 95): vanno abbinate entrambe.
  const names = new Map(catalogo.stazioni.map((s) => [s.id, new Set([s.nome, s.nomeEav, ...(s.alias || [])].filter(Boolean).map(norm))]));
  const nonServite = new Set(); // stazioni che nessun treno serve (dagli orari programmati); vuoto se gli orari non ci sono
  const idx = {
    catalogo, byId, byName, lines,
    resolve: (name) => byName.get(norm(name)) ?? null,
    sameStation: (name, id) => !!names.get(id) && names.get(id).has(norm(name)),
    // stazioni che EAV non mostra nei tabelloni: non compaiono nemmeno negli elenchi "Ferma a:"
    unmonitored: (id) => !!byId.get(id) && byId.get(id).dati === false,
    // stazioni che nessun treno serve: lo dicono solo gli orari programmati (EAV non mostra treni neanche per le
    // stazioni "non monitorate", ma da sola questa non e' una prova). Vedi orari.js.
    nonServita: (id) => nonServite.has(id),
    setNonServite: (ids) => { nonServite.clear(); for (const id of ids || []) nonServite.add(String(id)); },
    linesOf: (id) => new Set([...lines.values()].filter((l) => l.pos.has(id)).map((l) => l.nome)),
    isTerminus: (line, id) => {
      const l = lines.get(line);
      return !!l && (l.stazioni[0] === id || l.stazioni[l.stazioni.length - 1] === id);
    },
  };
  return idx;
}

// ---------- ricerca ----------

function within1(a, b) { // distanza di modifica <= 1
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

// Punteggio di un nome (gia' normalizzato) per una ricerca (gia' normalizzata): -1 se non combacia.
export function fuzzyScore(q, name) {
  const qs = q.split(' ').filter(Boolean), ns = name.split(' ');
  if (!qs.length) return 0;
  let total = 0;
  for (const t of qs) {
    let best = 0;
    for (const n of ns) {
      let sc = 0;
      if (n === t) sc = 4;
      else if (n.startsWith(t)) sc = 3;
      else if (t.length >= 3 && n.includes(t)) sc = 2;
      else if (t.length >= 4 && (within1(t, n) || within1(t, n.slice(0, t.length)))) sc = 1;
      if (sc > best) best = sc;
    }
    if (!best) return -1;
    total += best;
  }
  if (name.startsWith(q)) total += 2;
  return total - name.length / 1000; // a parita', il nome piu' corto viene prima
}

export function searchStations(query, idx, limit = 8) {
  const q = norm(query);
  if (!q) return [];
  const out = [];
  for (const s of idx.catalogo.stazioni) {
    let best = -1;
    for (const n of [s.nome, ...(s.alias || [])]) best = Math.max(best, fuzzyScore(q, norm(n)));
    if (best >= 0) out.push({ s, score: best });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.s);
}

// ---------- linea / servizio di un treno ----------

const narrow = (set, other) => {
  const i = new Set([...set].filter((x) => other.has(x)));
  return i.size ? i : set; // un vincolo che svuota tutto viene ignorato (nome non abbinato, dati incoerenti)
};

// Ricava la linea di un treno da: stazione del tabellone, destinazione, fermate, numero, capolinea.
// cfg: { LINEA_SERVIZIO, DESTINAZIONE_SERVIZIO, NUMERO_LINEA } (vedi config.js).
// Ritorna { service, lineService, lines }: service = come colorare la riga (chiave o null = grigio),
// lineService = servizio della sola linea (null se ambigua), lines = nomi linea possibili.
export function inferService(train, stationId, idx, cfg) {
  const destId = idx.resolve(train.dest);
  let c = idx.linesOf(stationId);
  if (destId) c = narrow(c, idx.linesOf(destId));
  for (const st of train.stops || []) {
    const id = idx.resolve(st.name);
    if (id) c = narrow(c, idx.linesOf(id));
  }
  if (c.size > 1) {
    const hint = cfg.NUMERO_LINEA.find(([re]) => re.test(train.num));
    if (hint && c.has(hint[1])) c = new Set([hint[1]]);
  }
  if (c.size > 1 && destId) {
    const t = [...c].filter((l) => idx.isTerminus(l, destId));
    if (t.length === 1) c = new Set(t);
  }
  const lines = [...c];
  const lineService = lines.length === 1 ? cfg.LINEA_SERVIZIO[lines[0]] || null : null;
  // Alcune destinazioni fanno da sole il "servizio" (Torre A.ta, Napoli Porta Nolana): il colore segue la
  // destinazione, ma `lines` e `lineService` restano quelli ricavati dai dati.
  const service = (destId && cfg.DESTINAZIONE_SERVIZIO[destId]) || lineService;
  return { service, lineService, lines };
}

// Il treno tocca la stazione `target`? 'si' | 'no' | 'forse'.
// Con le fermate esatte dagli orari programmati (`fermate`: id nel verso del treno, dopo la stazione per le partenze e
// prima per gli arrivi) si risponde con certezza. Con l'elenco "Ferma a:" si usa quello (e' esatto); altrimenti
// l'ordine delle stazioni sulla linea e la destinazione, che dicono solo dove il treno passa.
export function goesTo(train, stationId, target, idx, candidateLines, fermate) {
  if (!target || target === stationId) return 'no';
  if (idx.nonServita(target)) return 'no'; // nessun treno la serve
  if (Array.isArray(fermate)) return fermate.includes(target) ? 'si' : 'no';
  const destId = idx.resolve(train.dest);
  if (destId === target || idx.sameStation(train.dest, target)) return 'si';
  if (train.stops && train.stops.length) {
    if (train.stops.some((st) => idx.sameStation(st.name, target))) return 'si';
    // una stazione che EAV non monitora manca dall'elenco anche se il treno ci ferma: non si puo' dire "no"
    return idx.unmonitored(target) ? 'forse' : 'no';
  }
  const lines = candidateLines && candidateLines.length ? candidateLines : [...idx.linesOf(stationId)];
  let yes = false;
  for (const name of lines) {
    const pos = idx.lines.get(name)?.pos;
    if (!pos) continue;
    const i = pos.get(stationId), k = pos.get(target), j = destId ? pos.get(destId) : undefined;
    if (i === undefined || k === undefined) continue;
    if (j === undefined) return 'forse';
    const dir = Math.sign(j - i);
    if ((dir > 0 && k > i && k <= j) || (dir < 0 && k < i && k >= j)) yes = true;
  }
  if (!yes) return 'no';
  // Senza elenco fermate si sa dove passa ma non dove ferma: solo un accelerato ("A") ferma ovunque.
  // DD/D/EXP saltano stazioni (es. da Garibaldi vanno dritti a San Giorgio): lo si dice "forse".
  const ferma_ovunque = /^A(\s|$)/i.test(train.cat || '');
  return ferma_ovunque && lines.length === 1 ? 'si' : 'forse';
}

// ---------- tempo, stato, aggiornamento ----------

const romeFmt = typeof Intl !== 'undefined'
  ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  : null;

// Ora attuale a Roma: min = minuti dalla mezzanotte (con i secondi come frazione).
export function romeNow(date = new Date()) {
  const [h, m, s] = romeFmt.format(date).split(':').map(Number);
  return { min: h * 60 + m + s / 60, h, m, s };
}

export const toMin = (s) => { const m = /(\d{1,2}):(\d{2})/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; };
export const pad2 = (n) => String(n).padStart(2, '0');
export const fmtHM = (min) => pad2(Math.floor((min % 1440) / 60)) + ':' + pad2(Math.floor(min % 60));

// Minuti dalla mezzanotte di oggi: orario programmato e previsto (ritardo sconosciuto = 0).
export const schedMin = (t) => (toMin(t.time) ?? 0) + t.day * 1440;
export const expMin = (t) => schedMin(t) + (t.delay || 0);

// Testo dello stato di un treno "programmato ma non in elenco" (mai "soppresso": lo dice solo EAV).
export const TESTO_FANTASMA = 'Previsto, non in elenco';

export function statusOf(t, nowMin) {
  if (t.fantasma) return { cls: 'ghost', main: TESTO_FANTASMA, sub: 'Not listed' };
  if (t.cancelled) return { cls: 'cancel', main: 'SOPPRESSO', sub: 'Cancelled' };
  const diff = expMin(t) - nowMin;
  // "oggi" per il servizio: un treno delle 00:10 visto alle 23:50 e' di "domani" sul calendario ma parte tra 20 minuti
  const near = t.day === 0 || diff <= 180;
  if (near && diff <= 1 && diff >= -5) return { cls: 'go', main: 'In partenza', sub: 'Departing' };
  if (t.delay === null) return { cls: 'd2', main: 'In ritardo', sub: 'Delayed' };
  if (t.delay > 0) {
    const cls = t.delay > 15 ? 'd3' : t.delay > 5 ? 'd2' : 'd1';
    return { cls, main: 'Ritardo +' + t.delay + ' min', sub: 'Delayed' };
  }
  if (near && diff < -5) return { cls: 'gone', main: 'Orario superato', sub: 'Time passed' };
  if (near) return { cls: 'ok', main: 'In orario', sub: 'On time' };
  return { cls: 'none', main: '', sub: '' };
}

// Minuti alla partenza (non soppresso, entro un'ora, anche a cavallo della mezzanotte); altrimenti null.
export function etaMin(t, nowMin) {
  if (t.cancelled || t.fantasma) return null;
  const diff = expMin(t) - nowMin;
  return diff <= 60 ? Math.max(0, Math.ceil(diff)) : null;
}

export const dayLabel = (day) => day === 1 ? 'DOMANI / Tomorrow' : 'DOPODOMANI / Day after tomorrow';

// Ogni quanto ricaricare. Non si sa quando parte davvero un treno (il ritardo puo' cambiare, un treno
// puo' restare in lista dopo l'orario): finestra simmetrica attorno a "adesso".
//   qualche treno entro +-5 min  -> 10 s     entro +-15 min -> 30 s     altrimenti -> 60 s
export function nextRefreshMs(trains, nowMin) {
  let dist = Infinity;
  for (const t of trains) dist = Math.min(dist, Math.abs(expMin(t) - nowMin));
  return dist <= 5 ? 10000 : dist <= 15 ? 30000 : 60000;
}

// ---------- validazione dei dati del Worker ----------

const str = (v, max = 120) => (typeof v === 'string' ? v.slice(0, max) : '');

// Il JSON viene da un servizio esterno: si copia solo cio' che serve, con tipi e lunghezze controllati.
// Ritorna null se il formato non e' quello atteso.
export function sanitizeBoard(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.trains)) return null;
  const trains = raw.trains.slice(0, 100).filter((t) => t && typeof t === 'object').map((t) => ({
    num: str(t.num, 12), cat: str(t.cat, 8), dest: str(t.dest), time: str(t.time, 5),
    day: Number.isInteger(t.day) && t.day >= 0 && t.day <= 3 ? t.day : 0,
    platform: t.platform == null ? null : str(t.platform, 4) || null,
    delay: Number.isFinite(t.delay) ? Math.max(0, Math.min(999, Math.round(t.delay))) : (t.delay === null ? null : 0),
    cancelled: t.cancelled === true,
    stops: Array.isArray(t.stops)
      ? t.stops.slice(0, 80).filter((s) => s && typeof s === 'object').map((s) => ({ name: str(s.name), time: str(s.time, 5) }))
      : [],
  })).filter((t) => /^\d{1,2}:\d{2}$/.test(t.time) && t.dest);
  return {
    station: str(raw.station) || null,
    notice: str(raw.notice, 300) || null,
    updatedAt: str(raw.updatedAt, 40) || null,
    stale: raw.stale === true,
    trains,
  };
}
