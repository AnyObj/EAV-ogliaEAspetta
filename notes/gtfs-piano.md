# Piano: usare il GTFS di EAV nell'app

**Stato: NON implementato.** Questo è un piano. Le scoperte su cui si basa sono in [`gtfs-scoperte.md`](gtfs-scoperte.md).

## Regole di lavoro (decise con il proprietario del progetto)

- **Tutto il lavoro sul GTFS vive sul branch locale `claude/gtfs-orari` e non viene pushato** finché non lo si chiede esplicitamente. Queste modifiche potrebbero rompere l'app.
- Se si chiede di pushare altro (per esempio correzioni o stili), si pusha il branch normale (`claude/eav-attr-work`) **senza** portarsi dietro il lavoro sul GTFS.
- Le modifiche sono **additive**: si aggiungono file e funzioni, non si riscrivono stili o logica esistenti. Ogni fase è un commit separato e si può annullare da sola.
- L'app deve **funzionare identica se `orari.json` manca o è scaduto**: i dati del GTFS migliorano cose che già ci sono, non sono un requisito.
- Tutto dietro un **interruttore** (`USA_ORARI` in `docs/config.js`, con `?orari=1` / `?orari=0` nell'indirizzo). Predefinito: spento, finché non è validato.

## Obiettivi (dal più utile)

1. Linea e servizio **esatti** per ogni treno.
2. **Segnalare anomalie** confrontando programmato e tabellone (mai dichiarare "soppresso" da soli).
3. Elenco fermate completo, **anche negli arrivi** ("Vai a" / "Da…").
4. Orari di domani e dei giorni dopo, primo/ultimo treno, pianificatore da A a B.
5. "La stazione più vicina a me".

## Formato dei dati: `docs/orari.json`

Generato dallo script della fase 1. Compatto, solo la ferrovia.

```json
{
  "v": 1,
  "generato": "2026-09-25T06:30:00Z",
  "fonte": "https://www.eavsrl.it/open-data/",
  "licenza": "IODL 2.0 - Dati del servizio EAV ferro e gomma, EAV srl",
  "gtfsDel": "2026-09-16",
  "valido": ["2026-09-15", "2026-12-31"],
  "linee": { "1": "Napoli - Pompei Scavi - Sorrento", "1.": "Napoli - Torre Annunziata" },
  "servizi": { "0": ["20260915-20260918", "20260921-20260925"] },
  "treni": { "10535": { "l": "1", "s": 0, "c": "Sorrento", "f": [[1, 336], [3, 339], [27, 348]] } },
  "stazioni": { "3": { "lat": 40.851017, "lon": 14.272976, "n": 193 } }
}
```

- `treni[num].f` = fermate in ordine: `[id della stazione nel nostro catalogo (stop_id − 6000), minuti dalla mezzanotte]`.
- `servizi[s]` = giorni di circolazione in intervalli (comprime molto).
- `stazioni[id].n` = quanti treni ci fermano: **0 significa "non servita"**.
- Obiettivo dimensioni: < 250 KB (< 60 KB compresso).

## Fasi

### Fase 0 — Correzione delle stazioni non servite (piccola, indipendente)
**Cosa**: le 20 stazioni senza nessun treno nel GTFS sono "non servite". Nel catalogo `docs/stazioni.json` un campo `servita: false`. Nel Percorso si mostrano come "non servita" (o si omettono), in "Vai a" diventano "no" (non "probabile"). Torna corretto ciò che avevo cambiato per errore.
**File**: `scripts/build-stazioni.mjs` (nuovo campo), `docs/logic.js` (`goesTo`), `docs/views/percorso.js`, test.
**Nota**: senza GTFS a runtime, si può fare subito con una lista fissa; la fase 1 la genera poi da dati.
**Rischio**: basso.

### Fase 1 — Lo script che costruisce `orari.json`
**File nuovo**: `scripts/build-orari.mjs` (nessuna dipendenza esterna).
- Scarica lo zip (URL in una costante) oppure legge `--file percorso.zip` (per provare offline).
- Legge lo zip con un piccolo lettore (directory centrale + `zlib.inflateRawSync`; Node non ha un `unzip` integrato).
- `stop_times.txt` (36 MB) si legge **a righe**, senza caricarlo in memoria; si scartano subito i viaggi non ferroviari.
- Tiene solo `route_type = 2` e agenzia `NA0004`. Converte `stop_id − 6000` in id di catalogo; **avvisa** per le fermate che non trova nel catalogo.
- Comprime il calendario in intervalli, gli orari in minuti.
- **Controlli di sanità** prima di scrivere: numero di treni entro ±25% del file precedente, calendario che copre almeno i prossimi 14 giorni, nessun `route_id` nuovo non mappato (si ferma e lo dice), nessun numero di treno duplicato (se succede, si gestisce come lista).
- `--check`: fa una richiesta `HEAD` e dice se il file è cambiato (data/`ETag`/dimensione), senza scaricarlo. Codice di uscita 0/1 per l'automazione.
- Stampa un riepilogo (treni, fermate, intervallo di validità, dimensione).
**Test**: un mini GTFS di prova in `worker/test/fixtures/gtfs-mini/` (pochi treni, un viaggio con orario dopo le 24:00, un numero duplicato, una stazione ignota).
**Rischio**: basso (non tocca l'app).

### Fase 2 — Il modulo che legge `orari.json`
**File nuovo**: `docs/orari.js`, logica pura testabile, senza DOM.
- `caricaOrari()`: `fetch('orari.json')` **dopo il primo disegno**, con timeout; se fallisce o è scaduto (`oggi` fuori da `valido`) restituisce `null` e non cambia nulla.
- `trenoInfo(num)`, `servizioDi(num)` (route → servizio, tabella in `config.js`), `fermateDi(num)`, `attivoIl(num, data)`, `programmatiDa(stazione, data, daMin, aMin)`, `prossimiTraStazioni(a, b, data, ora)`, `stazioneVicina(lat, lon)`.
**Test**: unitari con il mini GTFS, più un **test di contratto** sul file vero: ogni `route_id` è mappato, ogni stazione dei treni è nel catalogo, coordinate valide.
**Rischio**: basso finché nessuno lo usa.

### Fase 3 — Usarlo nell'app (una funzione alla volta, ognuna con l'interruttore)

**3a. Linea e servizio esatti.** `inferService` (in `docs/logic.js`) riceve, se disponibile, il dato del GTFS: prima si guarda il numero di treno, poi il ripiego attuale (euristica). Mappa `route_id → servizio` in `config.js` (vedi "Decisioni aperte"). Test: sui 364 numeri reali del 25/09 il risultato deve coincidere con quello attuale dove l'euristica dà una risposta.
**3b. Fermate esatte.** Percorso e "Vai a" usano la sequenza di fermate del GTFS (esatta e per ogni treno, anche senza elenco EAV). "Ferma / salta / non servita" diventano certi. **Arrivi**: "Da X" = X è tra le fermate precedenti del treno; si riattiva "Vai a" per gli arrivi.
**3c. Confronto programmato / tabellone (segnalazione, non verdetto).** Per una stazione con dati: treni programmati oggi nella finestra `[adesso − 2 min, adesso + 60 min]` che non compaiono nell'elenco per **due aggiornamenti di fila** → nota discreta "10535 delle 05:36 per Sorrento non è in elenco". Non dice mai "soppresso". Da attivare **solo dopo la fase 4** (i falsi positivi si valutano sui dati del monitor).
**3d. Domani e pianificatore.** "Primo e ultimo treno", elenco di domani quando il tabellone mostra pochi treni; "da A a B": treni in cui A precede B nella sequenza delle fermate, attivi alla data, dal momento attuale; se il treno compare nel tabellone di A si sovrappone il ritardo vivo. Più impegnativa: fase a sé.
**3e. Stazione più vicina.** Bottone nell'elenco stazioni; `navigator.geolocation` (chiede il permesso, la posizione **resta sul dispositivo**, non viene inviata a nessuno); distanza con la formula di Haversine sulle 127 stazioni.
**3f. Mappe.** I treni **non hanno tracciati** nel GTFS (`shapes.txt` è solo di autobus e traghetti). Volendo si uniscono le stazioni con segmenti dritti. Da fare solo se richiesto.

### Fase 4 — Analisi dei dati del monitor con il GTFS (offline, prima della 3c)
**File nuovo**: `scripts/analizza-monitor.mjs`. Legge `data/monitor/<giro>/campioni.jsonl` (e `novita.jsonl`), ricostruisce nel tempo il tabellone di ogni capolinea e lo confronta con il programmato:
- treni programmati che non compaiono mai / che spariscono prima dell'orario;
- treni che compaiono ma non sono programmati (i 7 del 25/09);
- scostamenti d'orario, distribuzione dei ritardi, valori mai visti;
- prodotto: un **report in Markdown** con le anomalie candidate (e, se c'è, la parola con cui EAV scrive una soppressione).
Serve a decidere soglie e regole della 3c e a completare il riconoscimento delle soppressioni.

### Fase 5 — Documentazione e attribuzione
Nota di attribuzione nel sito (piè di pagina) e nel README con la citazione della fonte e della licenza; TODO aggiornato; questa cartella `notes/` aggiornata a ogni fase.

## Aggiornamento periodico (mensile o quindicinale)

EAV aggiorna il GTFS ogni mese (il file attuale è del 16/09/2026). Procedura:

1. `node scripts/build-orari.mjs --check` (una `HEAD`, quasi gratis): dice se è cambiato.
2. Se sì: `node scripts/build-orari.mjs` → nuovo `docs/orari.json` + riepilogo.
3. `npm test` (compreso il test di contratto). Se fallisce per un `route_id` nuovo o stazioni ignote: si aggiorna la mappa in `config.js` e il catalogo, non si pubblica.
4. Guardare il riepilogo (treni, validità), poi commit di `docs/orari.json` e push.

**Automazione (facoltativa)**: una GitHub Action ogni settimana che esegue 1–3 e apre una **Pull Request** (mai un merge automatico). Serve la repo pubblica o minuti di Actions.
**Promemoria**: se `valido[1]` è a meno di 14 giorni da oggi, l'app dovrebbe smettere di usare gli orari programmati (non mostrare dati scaduti).

## Come si attiva e come si annulla

- Sviluppo sul branch `claude/gtfs-orari`, una fase per commit.
- Prima di unire al branch normale: interruttore **spento** di default, prove con `?orari=1` su telefono e computer per qualche giorno.
- Poi: acceso di default, con `?orari=0` come via di fuga.
- Annullare = tornare a `USA_ORARI = false` (nessuna modifica di dati) oppure revert del commit della fase.
- **Test invariante**: tutta la suite deve passare anche con `orari.json` assente.

## Rischi

| Rischio | Mitigazione |
|---|---|
| Il GTFS non riflette variazioni temporanee (7 treni su 371 non erano programmati) | mai dichiarare "soppresso" da solo; segnalazioni soft e solo dopo la fase 4 |
| Nuove varianti di linea (`route_id` nuovi) | lo script si ferma e lo dice; test di contratto |
| Stesso numero di treno su più viaggi/giorni | struttura che ammette liste; per ora non succede |
| L'host `wimob.it` non risponde o cambia indirizzo | l'app non dipende dal download: usa la copia compatta nella repo |
| File scaduto | l'app lo ignora se `oggi` è fuori da `valido` |
| Licenza (attribuzione) | nota nel sito e nel README; leggere il testo IODL 2.0 |
| Peso dei dati | JSON compatto, `orari.json` caricato dopo il primo disegno |
| Doppio nome "Pollena Trocchia" (stazioni 9 e 95) | alias già gestiti; con il GTFS si verifica se sono la stessa fermata |
| Lucrino ha un tabellone pieno ma nessun treno nel GTFS | da capire (stazione chiusa? dati EAV inaffidabili?) |

## Decisioni aperte (da prendere con il proprietario)

1. **Mappa `route_id → colore/servizio`**: `1..` (Napoli - Torre del Greco) e `8.` (Napoli - San Giorgio) a quale stile? `5` (Napoli - Pianura - Quarto - Torregaveta) è la Circumflegrea (lilla)? `9.` e `9..` restano Cumana (verde pastello)?
2. Vogliamo le **segnalazioni "non in elenco"** (3c) o solo l'analisi offline?
3. **Aggiornamento**: a mano o con la Action settimanale?
4. **Pianificatore** (3d) e **stazione più vicina** (3e): quanta priorità?
5. Testo di **attribuzione** e dove metterlo.
6. Cosa fare delle **stazioni non servite** nel Percorso: mostrarle "non servita" o toglierle dal disegno?

## Stima del lavoro

Fase 0: piccola. Fase 1: media (lettore zip, controlli, test). Fase 2: piccola. Fase 3a/3b: media. Fase 3c: media, ma dipende dalla 4. Fase 3d: grande. Fase 3e: piccola. Fase 4: media.
Ordine consigliato: **0 → 1 → 2 → 3a → 4 → 3b → 3c → 5**, il resto a richiesta.
