// Legge i dati raccolti da monitor-capolinea.mjs e scrive un rapporto Markdown con le anomalie candidate.
// Solo lettura: non contatta EAV, non modifica l'app, non decide nulla ("candidato" = da guardare a mano).
//
//   node scripts/analizza-monitor.mjs                          # ultima cartella in data/monitor/
//   node scripts/analizza-monitor.mjs data/monitor/2026-09-25_0549
//   node scripts/analizza-monitor.mjs <cartella> --orari data/orari.json --soglia 5 --out rapporto.md
//
// Domande a cui risponde (vedi notes/gtfs-piano.md, fase 4):
//   1. EAV ha segnalato soppressioni, e con quale scritta?
//   2. Quali treni sono spariti dal tabellone prima dell'orario (senza essere partiti)?
//   3. Quali treni programmati (GTFS) non si sono mai visti, e quali si sono visti senza essere programmati?
//   4. Come sono fatti i ritardi, e come cambiano destinazioni, fermate e binari di uno stesso treno?
//   5. Ci sono valori mai visti, e i dati sono continui (buchi, errori)?

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { espandiIntervalli } from './build-orari.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PAROLE_SOPPRESSIONE = /soppr|cancel|annull|sospes|non effettuat|limitat|interrott|deviat|guasto|sciopero|variaz/i;
// Quando il GTFS "differisce troppo" dai tabelloni e non va usato per gli orari (regola decisa con il proprietario).
export const SOGLIE_FIDUCIA = { copertura: 0.9, concordanza: 0.95, mancanti: 0.1 };

// Valori gia' visti e capiti: tutto il resto finisce in "da guardare".
const NOTI = {
  ritardo: (v) => /^(\d{1,3}|RIT\.|)$/.test(v),
  info: (v) => v === 'IN RITARDO - DELAYED',
  cat: (v) => ['A', 'A FES', 'D', 'DD', 'EXP'].includes(v),
  rowClass: (v) => v === 'testoGiallo',
  bgcolor: (v) => v === '' || v === '#2F3E51' || v === 'yellow',   // yellow = riga di intestazione della tabella EAV
};

// ============================================================ lettura

const minutiRoma = (hms) => { const [h, m, s] = String(hms).split(':').map(Number); return h * 60 + m + (s || 0) / 60; };
const hm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.floor(min % 60)).padStart(2, '0')}`;
const toMin = (s) => { const m = /(\d{1,2}):(\d{2})/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; };
const dataRoma = (iso) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date(iso));

function leggiJsonl(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
export function caricaMonitor(dir) {
  const campioni = leggiJsonl(dir + '/campioni.jsonl');
  if (!campioni.length) throw new Error('nessun campione in ' + dir + '/campioni.jsonl');
  return {
    dir, campioni, novita: leggiJsonl(dir + '/novita.jsonl'), segnali: leggiJsonl(dir + '/segnali.jsonl'),
    manifest: existsSync(dir + '/manifest.json') ? JSON.parse(readFileSync(dir + '/manifest.json', 'utf8')) : null,
  };
}

const percentile = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const dist = (a) => (a.length ? { n: a.length, p5: percentile(a, 5), p50: percentile(a, 50), p95: percentile(a, 95), min: Math.min(...a), max: Math.max(...a) } : { n: 0 });

// ============================================================ analisi

// dati = risultato di caricaMonitor. opts: { orari, oggi ('AAAA-MM-GG'), soglia (minuti) }
export function analizza(dati, opts = {}) {
  const soglia = opts.soglia ?? 5;
  const { campioni } = dati;
  const oggi = opts.oggi || dataRoma(campioni[0].t);
  const gruppi = new Map();
  for (const c of campioni) { const k = c.id + '-' + c.tipo; if (!gruppi.has(k)) gruppi.set(k, []); gruppi.get(k).push(c); }

  const R = {
    meta: { cartella: dati.dir, data: oggi, richieste: campioni.length, errori: campioni.filter((c) => !c.ok).length, tabelloni: gruppi.size, inizio: campioni[0].rome, fine: campioni.at(-1).rome, soglia },
    segnali: [], scomparsi: [], anticipo: null, ingresso: null,
    gtfs: { disponibile: !!opts.orari, mancanti: [], nonProgrammati: [], orariDiversi: [], programmatiControllati: 0, fiducia: null },
    ritardi: { treni: 0, conRitardo: 0, senzaMinuti: 0, soglie: {}, peggiori: [], perOra: {}, cali: [] },
    cambi: { destinazione: [], fermate: [], binari: 0, binariEsempi: [] },
    novita: { perTipo: {}, inattesi: [] }, qualita: { buchi: [], errori: {} },
  };
  const anticipi = [], ingressi = [], ritardoPerOra = {};
  const conteggi = { viste: 0, inGtfs: 0, uguali: 0, perTabellone: {} };
  const giorniAttivi = (s) => (opts.orari ? (opts._g ||= {}) && (opts._g[s] ||= espandiIntervalli(opts.orari.servizi[s] || [])) : null);
  const oggiCompatto = oggi.replace(/-/g, '');

  for (const [key, camp] of gruppi) {
    const [id, tipo] = key.split('-');
    const nome = camp[0].nome;
    const visti = new Map();       // num -> traccia
    let corrente = new Map(), primi = null, nPoll = 0, prevT = null, primoMin = null, ultimoMin = null;
    const polls = [];
    for (const c of camp) {
      if (!c.ok) { R.qualita.errori[key] = (R.qualita.errori[key] || 0) + 1; continue; }
      const min = minutiRoma(c.rome), t = Date.parse(c.t);
      if (prevT !== null && t - prevT > 4 * 60 * 1000) R.qualita.buchi.push({ tabellone: key, nome, da: hm(polls.at(-1)), a: c.rome.slice(0, 5), minuti: Math.round((t - prevT) / 60000) });
      prevT = t; polls.push(min);
      if (c.changed && c.trains) corrente = new Map(c.trains.map((x) => [x.num, x]));
      nPoll++; primoMin ??= min; ultimoMin = min;
      if (!primi) primi = new Set(corrente.keys());
      for (const [num, tr] of corrente) {
        let v = visti.get(num);
        if (!v) { v = { num, cat: tr.cat, dest: new Set(), platforms: [], delays: [], stops: [], prima: { min, poll: nPoll }, ultima: null, orario: tr.time, day: tr.day, cancellato: null, iniziale: primi.has(num) }; visti.set(num, v); }
        v.ultima = { min, poll: nPoll }; v.day = tr.day; v.dest.add(tr.dest); v.orario = tr.time; v.cat = tr.cat;
        // il binario conta solo quando e' assegnato: passare da "non assegnato" ad assegnato non e' un cambio
        if (tr.platform && tr.platform !== v.platforms.at(-1)) v.platforms.push(tr.platform);
        if (!v.delays.length || v.delays.at(-1)[1] !== tr.delay) v.delays.push([min, tr.delay]);
        if (!v.stops.length || v.stops.at(-1).length !== tr.stops.length) v.stops.push(tr.stops.map((s) => s.name));
        const blob = [tr.ritardoRaw, /^Ferma a:/i.test(tr.info) ? '' : tr.info, tr.rowClass].join(' ');
        if (!v.cancellato && (tr.cancelled || PAROLE_SOPPRESSIONE.test(blob))) {
          v.cancellato = { rome: c.rome, ritardoRaw: tr.ritardoRaw, info: /^Ferma a:/i.test(tr.info) ? '' : tr.info, rowClass: tr.rowClass, flag: !!tr.cancelled };
        }
      }
    }
    if (!nPoll) continue;

    for (const v of visti.values()) {
      const dest = [...v.dest];
      if (v.cancellato) R.segnali.push({ tabellone: key, nome, treno: v.num, cat: v.cat, dest: dest.join(' / '), orario: v.orario, ...v.cancellato });
      if (dest.length > 1) R.cambi.destinazione.push({ tabellone: key, nome, treno: v.num, orario: v.orario, destinazioni: dest });
      if (v.stops.length > 1) for (let i = 1; i < v.stops.length; i++) { const tolte = v.stops[i - 1].filter((x) => !v.stops[i].includes(x)); if (tolte.length) { R.cambi.fermate.push({ tabellone: key, nome, treno: v.num, orario: v.orario, tolte }); break; } }
      if (v.platforms.length > 1) { R.cambi.binari++; if (R.cambi.binariEsempi.length < 10) R.cambi.binariEsempi.push({ tabellone: key, treno: v.num, orario: v.orario, binari: v.platforms }); }
      if (v.day !== 0) continue;
      R.ritardi.treni++;
      const ult = v.delays.at(-1)[1], max = Math.max(...v.delays.map((d) => d[1] ?? 0));
      if (v.delays.some((d) => d[1] === null)) R.ritardi.senzaMinuti++;
      if (max > 0) R.ritardi.conRitardo++;
      for (const s of [1, 5, 10, 15]) if (max >= s) R.ritardi.soglie[s] = (R.ritardi.soglie[s] || 0) + 1;
      const ora = String(Math.floor((toMin(v.orario) ?? 0) / 60)).padStart(2, '0');
      (ritardoPerOra[ora] ||= []).push(max);
      R.ritardi.peggiori.push({ tabellone: key, nome, treno: v.num, orario: v.orario, dest: dest[0], max });
      for (let i = 1; i < v.delays.length; i++) { const a = v.delays[i - 1][1], b = v.delays[i][1]; if (a !== null && b !== null && a - b >= 3) R.ritardi.cali.push({ tabellone: key, treno: v.num, orario: v.orario, da: a, a: b }); }
      // ingresso e scomparsa (solo treni di oggi)
      const sched = toMin(v.orario);
      if (sched === null) continue;
      if (!v.iniziale) ingressi.push(sched - v.prima.min);
      const dopo = nPoll - v.ultima.poll;                      // giri riusciti dopo l'ultima volta che c'era
      const exp = sched + (ult ?? 0);
      if (dopo >= 2) {
        // E' uscito tra l'ultima volta che c'era e il giro successivo (se in mezzo c'e' un buco nei dati, anche molto dopo):
        // e' un candidato solo se anche nel caso piu' favorevole (uscito all'ultimo momento) mancava piu' della soglia.
        const prossimo = polls[v.ultima.poll];
        const anticipoMax = exp - v.ultima.min, anticipoMin = exp - prossimo;
        if (anticipoMin > soglia) R.scomparsi.push({ tabellone: key, nome, treno: v.num, cat: v.cat, dest: dest[0], orario: v.orario, ritardo: ult, ultimaVolta: hm(v.ultima.min), anticipo: Math.round(anticipoMax), anticipoMin: Math.round(anticipoMin), cancellato: !!v.cancellato });
        else anticipi.push((anticipoMin + anticipoMax) / 2);
      }
    }

    // confronto con il GTFS
    if (opts.orari) {
      const attesi = new Map();
      for (const [num, t0] of Object.entries(opts.orari.treni)) for (const t of [].concat(t0)) {
        if (!giorniAttivi(t.s).has(oggiCompatto)) continue;
        const i = t.f.findIndex((x) => x[0] === id);
        if (i < 0 || (tipo === 'P' ? i === t.f.length - 1 : i === 0)) continue;
        // il tabellone delle partenze mostra la partenza, quello degli arrivi l'arrivo (se registrato)
        attesi.set(num, { min: tipo === 'A' ? (t.f[i][2] ?? t.f[i][1]) : t.f[i][1], capolinea: t.c, linea: t.l });
      }
      for (const [num, a] of attesi) {
        if (a.min < primoMin || a.min > ultimoMin) continue;
        R.gtfs.programmatiControllati++;
        const v = visti.get(num);
        if (!v) R.gtfs.mancanti.push({ tabellone: key, nome, treno: num, orario: hm(a.min), capolinea: a.capolinea });
        else if (toMin(v.orario) !== a.min) R.gtfs.orariDiversi.push({ tabellone: key, treno: num, tabelloneOrario: v.orario, gtfs: hm(a.min) });
      }
      const pt = (conteggi.perTabellone[key] = { viste: 0, inGtfs: 0, uguali: 0 });
      for (const v of visti.values()) {
        if (v.day !== 0) continue;
        const a = attesi.get(v.num);
        if (!a) R.gtfs.nonProgrammati.push({ tabellone: key, nome, treno: v.num, cat: v.cat, orario: v.orario, dest: [...v.dest][0] });
        if (v.cat === 'EXP') continue;                    // i FAC EX non sono nel GTFS: non contano ne' a favore ne' contro
        pt.viste++; conteggi.viste++;
        if (a) { pt.inGtfs++; conteggi.inGtfs++; if (toMin(v.orario) === a.min) { pt.uguali++; conteggi.uguali++; } }
      }
    }
  }

  R.anticipo = dist(anticipi); R.ingresso = dist(ingressi);
  if (opts.orari) R.gtfs.fiducia = valutaFiducia(conteggi, R.gtfs, opts.soglieFiducia);
  R.ritardi.peggiori = R.ritardi.peggiori.sort((a, b) => b.max - a.max).slice(0, 10);
  R.ritardi.perOra = Object.fromEntries(Object.entries(ritardoPerOra).sort().map(([o, a]) => [o, { treni: a.length, conRitardo: a.filter((x) => x > 0).length, max: Math.max(...a) }]));
  R.scomparsi.sort((a, b) => b.anticipo - a.anticipo);

  // valori mai visti
  for (const n of dati.novita) {
    (R.novita.perTipo[n.kind] ||= new Set()).add(String(n.value));
    if (NOTI[n.kind] && !NOTI[n.kind](String(n.value))) R.novita.inattesi.push({ tipo: n.kind, valore: String(n.value), tabellone: n.id + '-' + n.tipo, quando: n.t });
  }
  R.novita.perTipo = Object.fromEntries(Object.entries(R.novita.perTipo).map(([k, s]) => [k, [...s].sort()]));
  return R;
}

// Quanto ci si puo' fidare del GTFS per gli orari, misurato su cio' che i tabelloni hanno mostrato:
//   copertura   = quota dei treni visti (esclusi i FAC EX/EXP) che il GTFS conosce
//   concordanza = quota di quelli con lo stesso orario (partenza, o arrivo sui tabelloni degli arrivi)
//   mancanti    = quota dei treni programmati (nella finestra osservata) che non si sono mai visti
// Se una soglia non e' rispettata, il verdetto e' "non usare": l'app non deve usare il GTFS per gli orari.
export function valutaFiducia(c, gtfs, soglie = SOGLIE_FIDUCIA) {
  const S = { ...SOGLIE_FIDUCIA, ...soglie };
  const rapporto = (a, b) => (b ? a / b : null);
  const copertura = rapporto(c.inGtfs, c.viste), concordanza = rapporto(c.uguali, c.inGtfs), mancanti = rapporto(gtfs.mancanti.length, gtfs.programmatiControllati);
  const motivi = [];
  if (c.viste < 10) motivi.push(`troppo pochi treni per giudicare (${c.viste})`);
  else {
    if (copertura < S.copertura) motivi.push(`copertura ${pct(copertura)} sotto la soglia ${pct(S.copertura)}`);
    if (concordanza !== null && concordanza < S.concordanza) motivi.push(`concordanza degli orari ${pct(concordanza)} sotto la soglia ${pct(S.concordanza)}`);
    if (mancanti !== null && mancanti > S.mancanti) motivi.push(`treni programmati mai visti ${pct(mancanti)} sopra la soglia ${pct(S.mancanti)}`);
  }
  const perTabellone = Object.entries(c.perTabellone).map(([k, x]) => ({ tabellone: k, ...x, concordanza: rapporto(x.uguali, x.inGtfs) })).filter((x) => x.viste);
  return { verdetto: !motivi.length ? 'affidabile' : c.viste < 10 ? 'non valutabile' : 'non usare', motivi, copertura, concordanza, mancanti, viste: c.viste, inGtfs: c.inGtfs, uguali: c.uguali, soglie: S, perTabellone };
}
const pct = (x) => (x === null ? 'n.d.' : (100 * x).toFixed(1) + '%');

// ============================================================ rapporto

const tabella = (righe, colonne) => {
  if (!righe.length) return '_nessuno_\n';
  return `| ${colonne.map((c) => c[0]).join(' | ')} |\n|${colonne.map(() => '---').join('|')}|\n${righe.map((r) => `| ${colonne.map((c) => String(c[1](r) ?? '').replace(/\|/g, '/')).join(' | ')} |`).join('\n')}\n`;
};
const primi = (a, n = 25) => a.slice(0, n);
const resto = (a, n = 25) => (a.length > n ? `\n_… e altri ${a.length - n}_\n` : '');

export function rapportoMarkdown(R) {
  const m = R.meta, g = R.gtfs;
  const veri = R.segnali.filter((s) => s.flag || /soppr|cancel|annull/i.test(s.ritardoRaw + ' ' + s.info + ' ' + s.rowClass));
  const L = [];
  L.push(`# Rapporto del monitor dei capolinea — ${m.data}\n`);
  L.push(`Dati: \`${m.cartella}\`, dalle ${m.inizio} alle ${m.fine} (ora di Roma). ${m.richieste} richieste su ${m.tabelloni} tabelloni, ${m.errori} errori. Soglia "sparito troppo presto": ${m.soglia} minuti.\n`);
  L.push('## In sintesi\n');
  L.push(`- **Soppressioni segnalate da EAV**: ${veri.length ? '**' + veri.length + '** (vedi sotto)' : 'nessuna'}.`);
  L.push(`- Segnali con parole "sospette" (senza contare i semplici ritardi): ${R.segnali.length}.`);
  L.push(`- **Treni spariti dal tabellone ${m.soglia}+ minuti prima dell'orario**: ${R.scomparsi.length}.`);
  L.push(g.disponibile
    ? `- **Confronto con il GTFS** (${g.programmatiControllati} treni programmati controllati): non visti ${g.mancanti.length}, visti ma non programmati ${g.nonProgrammati.length} (di cui \`EXP\`: ${g.nonProgrammati.filter((x) => x.cat === 'EXP').length}), con orario diverso ${g.orariDiversi.length}.`
    : '- Confronto con il GTFS: non disponibile (manca `--orari`).');
  if (g.fiducia) L.push(`- **Affidabilità del GTFS per gli orari**: **${g.fiducia.verdetto}** — copertura ${pct(g.fiducia.copertura)}, concordanza degli orari ${pct(g.fiducia.concordanza)}, programmati mai visti ${pct(g.fiducia.mancanti)}${g.fiducia.motivi.length ? ' (' + g.fiducia.motivi.join('; ') + ')' : ''}.`);
  L.push(`- Ritardi: ${R.ritardi.conRitardo} treni su ${R.ritardi.treni} hanno avuto almeno 1 minuto; ${R.ritardi.senzaMinuti} sono stati "in ritardo" senza minuti.`);
  L.push(`- Cambi di destinazione: ${R.cambi.destinazione.length}; fermate tolte: ${R.cambi.fermate.length}; cambi di binario: ${R.cambi.binari}.`);
  L.push(`- Valori mai visti fuori dal noto: ${R.novita.inattesi.length}. Buchi nei dati (> 4 minuti): ${R.qualita.buchi.length}.\n`);

  L.push('## 1. Soppressioni e altri segnali\n');
  L.push('Righe con `cancelled` acceso o con parole come soppresso, sospeso, limitato, guasto, sciopero (i semplici ritardi sono esclusi). Ogni riga riporta la scritta esatta di EAV.\n');
  L.push(tabella(primi(R.segnali), [['Tabellone', (r) => `${r.nome} (${r.tabellone.split('-')[1]})`], ['Treno', (r) => r.treno], ['Cat.', (r) => r.cat], ['Destinazione', (r) => r.dest], ['Orario', (r) => r.orario], ['Visto alle', (r) => r.rome], ['Colonna ritardo', (r) => '`' + r.ritardoRaw + '`'], ['Informazione', (r) => '`' + r.info + '`'], ['Classe', (r) => '`' + r.rowClass + '`'], ['Flag', (r) => (r.flag ? 'sì' : 'no')]]) + resto(R.segnali));

  L.push('## 2. Treni spariti prima dell\'orario\n');
  L.push(`Treni di oggi che sono usciti dal tabellone con più di ${m.soglia} minuti di anticipo rispetto alla partenza prevista (orario più ritardo), confermato da almeno 2 giri successivi. **Non sono soppressioni certe**: possono essere partiti in anticipo, o cambiati di numero. Un treno che esce mentre il monitor non risponde (buco nei dati) non viene contato, perché non si può sapere quando è uscito; l'anticipo è un intervallo (dall'ultimo giro in cui c'era a quello successivo).\n`);
  L.push(`Come escono di norma i treni (minuti mancanti alla partenza all'ultima volta che si vedono): ${JSON.stringify(R.anticipo)}. Da quanto tempo prima compaiono: ${JSON.stringify(R.ingresso)}.\n`);
  L.push(tabella(primi(R.scomparsi), [['Tabellone', (r) => `${r.nome} (${r.tabellone.split('-')[1]})`], ['Treno', (r) => r.treno], ['Cat.', (r) => r.cat], ['Destinazione', (r) => r.dest], ['Orario', (r) => r.orario], ['Ritardo', (r) => r.ritardo ?? 'rit.'], ['Ultima volta', (r) => r.ultimaVolta], ['Anticipo (min)', (r) => (r.anticipoMin === r.anticipo ? r.anticipo : `${r.anticipoMin}–${r.anticipo}`)], ['Segnato soppresso', (r) => (r.cancellato ? 'sì' : 'no')]]) + resto(R.scomparsi));

  L.push('## 3. Confronto con l\'orario programmato (GTFS)\n');
  if (!g.disponibile) L.push('_Non disponibile: passare `--orari data/orari.json`._\n');
  else {
    const f = g.fiducia;
    L.push(`**Affidabilità del GTFS per gli orari: ${f.verdetto}.** Regola: se il GTFS differisce troppo dai tabelloni, non si usa per gli orari. Soglie: copertura ≥ ${pct(f.soglie.copertura)}, concordanza ≥ ${pct(f.soglie.concordanza)}, programmati mai visti ≤ ${pct(f.soglie.mancanti)}. Misurato su ${f.viste} treni visti (esclusi gli \`EXP\`): ${f.inGtfs} nel GTFS, ${f.uguali} con lo stesso orario.\n`);
    if (f.motivi.length) L.push(`Motivi: ${f.motivi.join('; ')}.\n`);
    const peggiori = f.perTabellone.filter((x) => x.concordanza !== null && x.concordanza < 1).sort((a, b) => a.concordanza - b.concordanza).slice(0, 8);
    if (peggiori.length) L.push('Tabelloni con orari diversi dal GTFS: ' + peggiori.map((x) => `${x.tabellone} (${pct(x.concordanza)} su ${x.inGtfs})`).join(', ') + '.\n');
    L.push('**Programmati e mai visti** (nella finestra in cui il monitor girava). Candidati a "non in elenco":\n');
    L.push(tabella(primi(g.mancanti), [['Tabellone', (r) => `${r.nome} (${r.tabellone.split('-')[1]})`], ['Treno', (r) => r.treno], ['Orario', (r) => r.orario], ['Capolinea', (r) => r.capolinea]]) + resto(g.mancanti));
    const raggr = {};
    for (const x of g.nonProgrammati) raggr[x.cat] = (raggr[x.cat] || 0) + 1;
    L.push(`**Visti ma non programmati**, per categoria: ${JSON.stringify(raggr)} (i \`EXP\` sono i \`FAC EX\` che il GTFS non contiene).\n`);
    L.push(tabella(primi(g.nonProgrammati.filter((x) => x.cat !== 'EXP')), [['Tabellone', (r) => `${r.nome} (${r.tabellone.split('-')[1]})`], ['Treno', (r) => r.treno], ['Cat.', (r) => r.cat], ['Orario', (r) => r.orario], ['Destinazione', (r) => r.dest]]) + resto(g.nonProgrammati.filter((x) => x.cat !== 'EXP')));
    L.push('**Orario diverso da quello del GTFS**:\n');
    L.push(tabella(primi(g.orariDiversi), [['Tabellone', (r) => r.tabellone], ['Treno', (r) => r.treno], ['Tabellone', (r) => r.tabelloneOrario], ['GTFS', (r) => r.gtfs]]) + resto(g.orariDiversi));
  }

  L.push('## 4. Ritardi\n');
  L.push(`Treni con almeno N minuti di ritardo: ${JSON.stringify(R.ritardi.soglie)}. Per ora di partenza: ${JSON.stringify(R.ritardi.perOra)}.\n`);
  L.push(tabella(R.ritardi.peggiori, [['Tabellone', (r) => `${r.nome} (${r.tabellone.split('-')[1]})`], ['Treno', (r) => r.treno], ['Orario', (r) => r.orario], ['Destinazione', (r) => r.dest], ['Ritardo massimo', (r) => r.max]]));
  L.push('**Ritardi che diminuiscono di 3+ minuti** (recuperi o correzioni):\n');
  L.push(tabella(primi(R.ritardi.cali, 15), [['Tabellone', (r) => r.tabellone], ['Treno', (r) => r.treno], ['Orario', (r) => r.orario], ['Da', (r) => r.da], ['A', (r) => r.a]]) + resto(R.ritardi.cali, 15));

  L.push('## 5. Cambiamenti sullo stesso treno\n');
  L.push('**Destinazione cambiata** (possibile limitazione del percorso):\n');
  L.push(tabella(primi(R.cambi.destinazione), [['Tabellone', (r) => r.tabellone], ['Treno', (r) => r.treno], ['Orario', (r) => r.orario], ['Destinazioni viste', (r) => r.destinazioni.join(' → ')]]) + resto(R.cambi.destinazione));
  L.push('**Fermate tolte dall\'elenco "Ferma a"**:\n');
  L.push(tabella(primi(R.cambi.fermate), [['Tabellone', (r) => r.tabellone], ['Treno', (r) => r.treno], ['Orario', (r) => r.orario], ['Tolte', (r) => r.tolte.join(', ')]]) + resto(R.cambi.fermate));
  L.push(`**Cambi di binario**: ${R.cambi.binari}. Esempi: ${JSON.stringify(R.cambi.binariEsempi.slice(0, 5))}.\n`);

  L.push('## 6. Valori mai visti e qualità dei dati\n');
  L.push('**Fuori dal noto** (da guardare):\n');
  L.push(tabella(primi(R.novita.inattesi, 30), [['Tipo', (r) => r.tipo], ['Valore', (r) => '`' + r.valore + '`'], ['Tabellone', (r) => r.tabellone], ['Quando', (r) => r.quando]]) + resto(R.novita.inattesi, 30));
  L.push('**Tutti i valori distinti visti** (per tipo):\n');
  for (const [k, v] of Object.entries(R.novita.perTipo)) L.push(`- ${k}: ${v.map((x) => '`' + x + '`').join(', ')}`);
  L.push('\n**Buchi nei dati** (più di 4 minuti senza una risposta valida):\n');
  L.push(tabella(primi(R.qualita.buchi, 15), [['Tabellone', (r) => `${r.nome} (${r.tabellone.split('-')[1]})`], ['Da', (r) => r.da], ['A', (r) => r.a], ['Minuti', (r) => r.minuti]]) + resto(R.qualita.buchi, 15));
  L.push(`Errori per tabellone: ${JSON.stringify(R.qualita.errori)}.\n`);
  L.push('---\nGenerato da `scripts/analizza-monitor.mjs`. Tutte le voci sono **candidati** da guardare: lo script non stabilisce mai da solo che un treno è stato soppresso.\n');
  return L.join('\n');
}

// ============================================================ riga di comando

function main() {
  const args = process.argv.slice(2);
  const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
  // primo argomento che non e' un'opzione ne' il valore di un'opzione
  let dir = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
  if (!dir) {
    const base = ROOT + 'data/monitor';
    const cartelle = existsSync(base) ? readdirSync(base).filter((d) => existsSync(`${base}/${d}/campioni.jsonl`)).sort() : [];
    if (!cartelle.length) { console.error('Nessuna cartella di dati in data/monitor/'); process.exit(1); }
    dir = `${base}/${cartelle.at(-1)}`;
  }
  const orariPath = opt('orari', ['data/orari.json', 'docs/orari.json'].map((p) => ROOT + p).find(existsSync));
  const orari = orariPath && existsSync(orariPath) ? JSON.parse(readFileSync(orariPath, 'utf8')) : null;
  const R = analizza(caricaMonitor(dir), { orari, soglia: +opt('soglia', 5), oggi: opt('oggi') });
  const md = rapportoMarkdown(R);
  const out = opt('out', dir + '/rapporto.md');
  writeFileSync(out, md);
  console.log('Rapporto scritto in', out);
  console.log(md.split('## 1.')[0]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
