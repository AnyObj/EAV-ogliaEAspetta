# Piano: usare il GTFS di EAV nell'app

**Stato: solo la fase 1 è fatta** (lo script che costruisce `orari.json`, con test, provato sul file vero). Nulla è collegato all'app. Le scoperte su cui si basa il piano sono in [`gtfs-scoperte.md`](gtfs-scoperte.md); il riassunto per chi ha fretta è in [`gtfs-riassunto.md`](gtfs-riassunto.md).

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
  "generato": "2026-09-25T04:32:28.920Z",
  "fonte": "https://www.eavsrl.it/open-data/",
  "licenza": "IODL 2.0 - Dati del servizio EAV ferro e gomma, EAV srl",
  "gtfsDel": "2026-09-16",
  "valido": ["2026-09-16", "2026-12-31"],
  "zip": { "sha1": "0dc0ab75...", "byte": 6209039 },
  "linee": { "1": "Napoli - Pompei Scavi - Sorrento", "1.": "Napoli - Torre Annunziata" },
  "servizi": { "0": ["20260916-20261231"] },
  "serviziGtfs": { "0": "opttp2026-2030-1" },
  "treni": { "10535": { "l": "1", "s": "0", "c": "Sorrento", "f": [["1", 336], ["3", 339], ["27", 348]] } },
  "stazioni": { "3": { "lat": 40.851017, "lon": 14.272976, "n": 193 } },
  "nonServite": ["28", "36", "39"],
  "avvisi": ["..."]
}
```

- `treni[num].f` = fermate in ordine: `[id della stazione nel nostro catalogo (stop_id − 6000), minuti dalla mezzanotte]`. Se lo stesso numero di treno compare in più viaggi, `treni[num]` è una **lista** (oggi non succede, c'è un avviso).
- `zip.sha1` serve a capire se il GTFS è cambiato; `avvisi` riporta ciò che lo script ha notato (fermate fuori catalogo, nomi diversi, ecc.).
- Le stazioni fuori dal nostro catalogo (Aversa, Piedimonte Matese…) restano in `stazioni` con il loro id (6112 → `112`): l'app le ignora.
- `servizi[s]` = giorni di circolazione in intervalli (comprime molto).
- `stazioni[id].n` = quanti treni ci fermano: **0 significa "non servita"**.
- Dimensioni reali: **131 KB (30 KB compressi)**, un treno per riga.

## Fasi

### Fase 0 — Correzione delle stazioni non servite (piccola, indipendente)
**Cosa**: le 20 stazioni senza nessun treno nel GTFS sono "non servite". Nel catalogo `docs/stazioni.json` un campo `servita: false`. Nel Percorso si mostrano come "non servita" (o si omettono), in "Vai a" diventano "no" (non "probabile"). Torna corretto ciò che avevo cambiato per errore.
**File**: `scripts/build-stazioni.mjs` (nuovo campo), `docs/logic.js` (`goesTo`), `docs/views/percorso.js`, test.
**Nota**: senza GTFS a runtime, si può fare subito con una lista fissa; la fase 1 la genera poi da dati.
**Rischio**: basso.

### Fase 1 — Lo script che costruisce `orari.json` — **FATTA**
**File**: `scripts/build-orari.mjs` (nessuna dipendenza) e `worker/test/orari-build.test.js` (18 test nuovi).
- Scarica lo zip oppure legge `--file percorso.zip` (nessuna rete). Scrive `docs/orari.json`, o `--out`.
- Legge lo zip con un lettore minimo (directory centrale, `zlib.inflateRawSync`), **compresi i campi zip64** che usa il file di EAV (il primo tentativo li rifiutava: ora c'è un test).
- Tiene solo `route_type = 2`, converte `stop_id − 6000` in id di catalogo, ordina le fermate per `stop_sequence`, comprime il calendario in intervalli (applica anche le eccezioni "tolto"), gestisce orari oltre le 24:00 e secondi, numeri di treno duplicati, fermate non riconosciute.
- **Controlli di sanità** (mai scrivere un file rotto): errore e nessuna scrittura se manca un file obbligatorio, se non ci sono percorsi ferroviari, se ci sono meno di 100 treni o di 50 stazioni servite, se il GTFS è scaduto, se un treno è malformato, se il numero di treni cambia oltre il 25% rispetto al file precedente. Avvisi (si scrive lo stesso) per fermate fuori catalogo, nomi diversi, calendario che copre meno di 14 giorni, orari con secondi.
- `--valida <file>` controlla un file già costruito; `--force` scrive anche con errori; `--oggi AAAA-MM-GG` per le prove.
- `--check`: **il server non dà `Content-Length`/`Last-Modified`/`ETag` neanche a una `HEAD`**, quindi scarica i 6 MB (circa 1 s) e confronta l'impronta con quella salvata nel file. Codici di uscita: 0 invariato, **10 cambiato**, 1 errore di rete o di formato, 2 dati non validi.
- Esito sul file vero (25/09/2026): 0,55 s, 131 KB, 623 treni, 127 stazioni servite, 20 non servite, tutto valido; confronto con i tabelloni dal vivo: 394 su 394 orari identici.
**Rischio**: nullo per l'app (non è collegato a niente).

### Fase 2 — Il modulo che legge `orari.json`
**File nuovo**: `docs/orari.js`, logica pura testabile, senza DOM.
- `caricaOrari()`: `fetch('orari.json')` **dopo il primo disegno**, con timeout; se fallisce o è scaduto (`oggi` fuori da `valido`) restituisce `null` e non cambia nulla.
- `trenoInfo(num)`, `servizioDi(num)` (route → servizio, tabella in `config.js`), `fermateDi(num)`, `attivoIl(num, data)`, `programmatiDa(stazione, data, daMin, aMin)`, `prossimiTraStazioni(a, b, data, ora)`, `stazioneVicina(lat, lon)`.
**Test**: unitari con il mini GTFS, più un **test di contratto** sul file vero: ogni `route_id` è mappato, ogni stazione dei treni è nel catalogo, coordinate valide.
**Rischio**: basso finché nessuno lo usa.

### Fase 3 — Usarlo nell'app (una funzione alla volta, ognuna con l'interruttore)

**3a. Linea e servizio esatti.** `inferService` (in `docs/logic.js`) riceve, se disponibile, il dato del GTFS: prima si guarda il numero di treno, poi il ripiego attuale (euristica). Mappa `route_id → servizio` in `config.js` (vedi "Decisioni aperte"; i percorsi con treni sono 11). Test: sui 364 numeri reali del 25/09 il risultato deve coincidere con quello attuale dove l'euristica dà una risposta.
**3b. Fermate esatte.** Percorso e "Vai a" usano la sequenza di fermate del GTFS (esatta e per ogni treno, anche senza elenco EAV). "Ferma / salta / non servita" diventano certi. **Arrivi**: "Da X" = X è tra le fermate precedenti del treno; si riattiva "Vai a" per gli arrivi.
**3c. Confronto programmato / tabellone (segnalazione, non verdetto).** **Si escludono i treni di categoria `EXP`** (nel GTFS non ci sono) e, per lo stesso motivo, non si segnalano come "non programmati". Per una stazione con dati: treni programmati oggi nella finestra `[adesso − 2 min, adesso + 60 min]` che non compaiono nell'elenco per **due aggiornamenti di fila** → nota discreta "10535 delle 05:36 per Sorrento non è in elenco". Non dice mai "soppresso". Da attivare **solo dopo la fase 4** (i falsi positivi si valutano sui dati del monitor).
**3d. Domani e pianificatore.** "Primo e ultimo treno", elenco di domani quando il tabellone mostra pochi treni; "da A a B": treni in cui A precede B nella sequenza delle fermate, attivi alla data, dal momento attuale; se il treno compare nel tabellone di A si sovrappone il ritardo vivo. Più impegnativa: fase a sé.
**3e. Stazione più vicina.** Bottone nell'elenco stazioni; `navigator.geolocation` (chiede il permesso, la posizione **resta sul dispositivo**, non viene inviata a nessuno); distanza con la formula di Haversine sulle 127 stazioni.
**3f. Mappe.** I treni **non hanno tracciati** nel GTFS (`shapes.txt` è solo di autobus e traghetti). Volendo si uniscono le stazioni con segmenti dritti. Da fare solo se richiesto.

### Idee future (non pianificate) — materiale rotabile e categorie
- **Etichetta per la categoria**: `EXP` = "Campania Express" (da verificare), eventualmente le altre sigle in chiaro (A, D, DD) se si trova una fonte ufficiale del loro significato (oggi non documentato nei file).
- **Tipo di treno / aria condizionata**: i dati pubblici non collegano treni e convogli. Strade possibili: tabella a mano (`docs/materiale.json`, numero → tipo con una nota sulla fonte), segnalazioni degli utenti, oppure una fonte esterna affidabile che colleghi le serie alle linee (da cercare e da citare). Le caratteristiche dei tipi (FE220, MTS, T21, ET 500…) vanno verificate su una fonte: non sono nei file EAV.
- **Stazioni**: il file delle stazioni di EAV (`Dismessa`, `Disabilitata_Temporaneamente`, chilometrica, capolinea) può arricchire il catalogo, per esempio "dismessa" invece di "non servita".

### Fase 4 — Analisi dei dati del monitor con il GTFS (offline, prima della 3c)
**File nuovo**: `scripts/analizza-monitor.mjs` (i treni `EXP` si trattano a parte: non sono nel GTFS ma sono nel file delle corse come `FAC EX`; per il confronto si può usare anche quel file, scaricabile dalla pagina open data). Legge `data/monitor/<giro>/campioni.jsonl` (e `novita.jsonl`), ricostruisce nel tempo il tabellone di ogni capolinea e lo confronta con il programmato:
- treni programmati che non compaiono mai / che spariscono prima dell'orario;
- treni che compaiono ma non sono programmati (i 7 del 25/09);
- scostamenti d'orario, distribuzione dei ritardi, valori mai visti;
- prodotto: un **report in Markdown** con le anomalie candidate (e, se c'è, la parola con cui EAV scrive una soppressione).
Serve a decidere soglie e regole della 3c e a completare il riconoscimento delle soppressioni.

### Fase 5 — Documentazione e attribuzione
Nota di attribuzione nel sito (piè di pagina) e nel README con la citazione della fonte e della licenza; TODO aggiornato; questa cartella `notes/` aggiornata a ogni fase.

## Aggiornamento periodico (mensile o quindicinale)

EAV aggiorna il GTFS ogni mese (il file attuale è del 16/09/2026). Procedura:

1. `node scripts/build-orari.mjs --check` (scarica 6 MB e confronta l'impronta): dice se è cambiato (codice 10).
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
| Il GTFS non riflette variazioni temporanee e **non contiene i treni `FAC EX`/`EXP`** (i 6 treni "extra" del 25/09 erano tutti di quella categoria) | nei confronti programmato/tabellone escludere `EXP`; mai dichiarare "soppresso" da solo; segnalazioni soft e solo dopo la fase 4 |
| Nuove varianti di linea (`route_id` nuovi) | lo script si ferma e lo dice; test di contratto |
| Stesso numero di treno su più viaggi/giorni | struttura che ammette liste; per ora non succede |
| L'host `wimob.it` non risponde o cambia indirizzo | l'app non dipende dal download: usa la copia compatta nella repo |
| File scaduto | l'app lo ignora se `oggi` è fuori da `valido` |
| Licenza (attribuzione) | nota nel sito e nel README; leggere il testo IODL 2.0 |
| Peso dei dati | JSON compatto, `orari.json` caricato dopo il primo disegno |
| Doppio nome "Pollena Trocchia" (stazioni 9 e 95) | alias già gestiti; con il GTFS si verifica se sono la stessa fermata |
| Lucrino ha un tabellone pieno ma nessun treno nel GTFS | da capire (stazione chiusa? dati EAV inaffidabili?) |

## Decisioni aperte (da prendere con il proprietario)

I colori delle linee **ci sono già**: il GTFS serve solo a dire a quale di essi appartiene ogni treno. Le voci ovvie (Sorrento, Torre A.ta, Poggiomarino, Sarno, Baiano, Cumana, Linea 7) sono già mappate. Restano da decidere:

1. **I treni con capolinea Volla** ("Casoria Arpino - Volla", percorso `8`): stile Pomigliano (giallo a strisce) o Baiano (giallo)? Nessun treno del GTFS ha capolinea Pomigliano, quindi senza questa scelta lo stile Pomigliano non uscirebbe mai.
2. **Il percorso `5`** (capolinea Licola, Quarto, Montesanto): è la Circumflegrea (lilla)? Io penso di sì.
3. **Le linee `2` e `7`** (Piscinola-Aversa e Napoli-Caserta-Piedimonte Matese, 118 treni): ignorarle, come oggi (non sono nel catalogo), o aggiungere le loro stazioni?
4. Vogliamo le **segnalazioni "non in elenco"** (3c) o solo l'analisi offline (fase 4)?
5. **Aggiornamento**: a mano o con la Action settimanale?
6. **Pianificatore** (3d) e **stazione più vicina** (3e): quanta priorità?
7. Testo di **attribuzione** e dove metterlo.
8. Cosa fare delle **stazioni non servite** nel Percorso: mostrarle "non servita" o toglierle dal disegno?
9. **Categoria `EXP`**: mostrarla come "Campania Express"? (L'ipotesi viene dal nome e dal percorso Porta Nolana-Sorrento, non è scritta nei dati: da verificare.)
10. **Materiale rotabile** (aria condizionata, età): nessun dato collega numeri di treno e tipo di convoglio. Vogliamo una **tabella compilata a mano** (numero → tipo, per cominciare poche righe) o le **segnalazioni degli utenti** (serve un archivio sul Worker, moderazione e privacy)? Vedi `gtfs-scoperte.md` §8.

## Stima del lavoro

Fase 0: piccola. Fase 1: fatta. Fase 2: piccola. Fase 3a/3b: media. Fase 3c: media, ma dipende dalla 4. Fase 3d: grande. Fase 3e: piccola. Fase 4: media.
Ordine consigliato per il resto: **0 → 2 → 3a → 4 → 3b → 3c → 5**, il resto a richiesta.
