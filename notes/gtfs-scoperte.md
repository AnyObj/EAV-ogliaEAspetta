# Open data EAV: cosa c'è e cosa abbiamo scoperto

Verificato il **25/09/2026**. Nessuna di queste scoperte è ancora usata dall'app: il piano per usarle è in [`gtfs-piano.md`](gtfs-piano.md).

## 1. La fonte

Pagina: <https://www.eavsrl.it/open-data/>. Licenza dichiarata su tutte le risorse: **Italia Open Data License v2.0** (IODL 2.0). Il testo della licenza va letto prima di usare i dati; in generale richiede di citare la fonte.

| Risorsa | Formato | Note |
|---|---|---|
| **GTFS "Dati del servizio EAV ferro e gomma"** | zip di file TXT/CSV | aggiornato ogni mese; **è quello che ci interessa** |
| Catalogo dati AGID | documento | non guardato |
| Elenco delle linee ferroviarie EAV | file da scaricare | non guardato |
| Elenco del materiale rotabile per bacino | file da scaricare | non guardato |
| Calendario della validità delle corse | file da scaricare | non guardato (il GTFS contiene già il calendario) |
| Elenco delle corse dell'orario generale | file da scaricare | non guardato (il GTFS contiene già le corse) |
| Elenco delle stazioni sulle linee vesuviane e flegree | file da scaricare | non guardato (il GTFS contiene già le fermate) |

**Non esiste nessun dato in tempo reale**: niente GTFS-Realtime, ritardi, soppressioni. Il GTFS dice cosa è *programmato*, non cosa sta succedendo.

## 2. Il GTFS

- Indirizzo: `https://www.wimob.it/cfile/download.php?file=google-transit.zip` (è il link ufficiale della pagina, ma l'host è di terzi, WiMob). Zip da 6,2 MB, dentro i file datati 16/09/2026.
- Contiene: `agency`, `routes`, `trips`, `stop_times` (36 MB), `stops`, `calendar_dates`, `shapes` (8 MB). **Non ci sono** `calendar.txt`, `feed_info.txt` né i colori delle linee.
- Due gestori: `NA0004` (Ferrovia) ed `EAVO` (Autolinea). Le linee ferroviarie hanno `route_type = 2`, gli autobus e i traghetti `3`.
- Numeri: 13.030 viaggi in tutto, di cui **623 ferroviari**; 4.223 fermate, di cui **127 usate dai treni** (103 nel nostro catalogo, 24 no); 122 percorsi, di cui 16 ferroviari (**11 con treni**).
- Calendario: solo `calendar_dates` con `exception_type = 1` (giorni in cui il servizio c'è). Copre **dal 15/09 al 31/12/2026** (108 giorni). Treni ferroviari attivi per giorno: **623** (lun, mar, ven), **527** (sabato), **507** (domenica e festivi, per esempio il 25/12).
- Nessun orario oltre le 24:00 nei treni ferroviari.

### Le chiavi che rendono il GTFS utile per noi

| Cosa | Dove | Esempio |
|---|---|---|
| **Numero di treno** (quello del tabellone) | `trips.txt`: `trip_short_name` | `10535` |
| Linea *e variante di servizio* | `trips.txt`: `route_id` | `1`, `1.`, `1..` |
| Capolinea del viaggio | `trips.txt`: `trip_headsign` | "Sorrento" |
| **Stazione = nostro id + 6000** | `stops.txt`: `stop_id` | `6003` = Garibaldi = catalogo `3` |
| Percorso e orari del treno | `stop_times.txt` | Porta Nolana 05:36, Garibaldi 05:39, … |
| Giorni di circolazione | `trips.txt`: `service_id` → `calendar_dates.txt` | 12 servizi ferroviari |
| Coordinate | `stops.txt`: `stop_lat`, `stop_lon` | 40.851017, 14.272976 |

`trip_id` è `<numero>_<service_id>` (per esempio `10535_opttp2026-2030-1`). Nessun numero di treno compare in più di un viaggio ferroviario (per ora).

### I percorsi ferroviari (`route_id`): 16 nel file, **11 con treni**

Contati sul file costruito dallo script (623 treni). Gli altri 5 percorsi (`1..` Napoli - Torre del Greco, `3` Napoli - Benevento, `8.` Napoli - San Giorgio, `8..` Napoli - Pomigliano - Acerra, `9..` Torregaveta - Gerolomini) sono definiti in `routes.txt` ma **non hanno nessun viaggio**.

| route_id | Nome nel GTFS | Treni | Capolinea dei viaggi | Stile dell'app (proposta) |
|---|---|---:|---|---|
| `1` | Napoli - Pompei Scavi - Sorrento | 58 | Sorrento, Porta Nolana | Sorrento |
| `1.` | Napoli - Torre Annunziata | 54 | Torre Annunziata - Oplonti, Porta Nolana | Torre A.ta |
| `4` | Napoli - Scafati - Poggiomarino | 38 | Poggiomarino, Porta Nolana | Poggiomarino |
| `6` | Napoli - Ottaviano - Sarno | 44 | Sarno, Poggiomarino, Porta Nolana | Sarno |
| `8` | Napoli - Nola - Baiano | 28 | Baiano, **Casoria Arpino - Volla** | Baiano (e i treni per Volla?) |
| `5` | Napoli - Pianura - Quarto - Torregaveta | 86 | Licola, Montesanto, Quarto | Circumflegrea |
| `5.` | Soccavo - Monte Sant'Angelo | 62 | Monte Sant'Angelo, Soccavo | Linea 7 |
| `9` | Napoli - Bagnoli - Pozzuoli - Torregaveta | 85 | Torregaveta, Montesanto, Fuorigrotta | Cumana |
| `9.` | Montesanto - Bagnoli | 50 | Bagnoli, Montesanto | Cumana |
| `2` | Piscinola - Giugliano - Aversa | 98 | Piscinola Scampia, Aversa | **fuori dall'app** |
| `7` | Napoli - Caserta - Piedimonte Matese | 20 | Cancello RFI, Piedimonte Matese, Napoli Centrale RFI | **fuori dall'app** |

Conseguenze:
- Nessun treno del GTFS ha capolinea "Pomigliano": i treni di quella zona compaiono con capolinea **Volla** ("Casoria Arpino - Volla") sul percorso `8`. Lo stile "Pomigliano" (giallo a strisce) oggi non uscirebbe mai dal GTFS: bisogna decidere se i treni per Volla lo usano.
- Le linee `2` e `7` sono altre linee EAV (Piscinola-Aversa, Napoli-Caserta-Piedimonte Matese): le loro fermate (Aversa, Giugliano, Mugnano, Piscinola Scampia, Piedimonte Matese, Alife, Dragoni…) **non sono nel nostro catalogo**, che elenca solo le linee vesuviane e flegree. Sono 24 fermate su 127.

## 3. Cosa ho verificato sui dati veri (25/09/2026, ore 06:00-06:15)

Confronto tra il GTFS e i tabelloni dal vivo di 11 stazioni (Garibaldi, Porta Nolana, Sorrento, Poggiomarino, Sarno, Baiano, Montesanto, Licola, Torre Annunziata, Torre del Greco, Pomigliano).

1. **Il numero di treno coincide**: 364 dei 371 treni dal vivo (98%) sono nel GTFS.
2. **Gli orari coincidono**: 364 confronti su 364, nessuna differenza tra l'orario del tabellone e quello del GTFS.
3. **La linea che ricava l'app dai dati concorda con il GTFS**: 0 disaccordi. Il GTFS conosce però anche i treni che l'app lascia grigi (Porta Nolana nei tratti in comune) e distingue le varianti (Torre A.ta = `1.`).
4. **Treni programmati ma assenti dal tabellone**: 0, nella finestra tra "adesso" e l'ultimo treno mostrato.
5. **Treni sul tabellone ma non programmati oggi**: 7 su 371. Sono `10821` (08:26 a Garibaldi, 08:22 a Porta Nolana), `11121` (11:22) e la serie `11018`, `11318`, `11618`, `11918` a Sorrento alle :20. Corse extra oppure buchi del GTFS: è un punto da capire.
6. **Le fermate**: l'elenco "Ferma a:" di EAV non contiene mai fermate che il GTFS non ha. Le differenze sono la destinazione finale (a volte assente dall'elenco EAV) e il nome doppio di "Pollena Trocchia" (stazioni 9 e 95).

### Scoperta: le 19 stazioni "non monitorate" non sono servite da nessun treno

Nel catalogo 19 stazioni hanno `dati: false` (tabellone sempre vuoto): Cavalli di Bronzo, Via dei Monaci, Via Viuli, Moregine, Via Nocera, Castellammare Terme, Pozzano, Scrajo, Centro Direzionale, Poggioreale, Botteghelle, Bivio Botteghelle, Bivio Madonnelle, Madonnelle, Argine-Palasport, Villa Visconti, Vesuvio De Meis (SGV), Bartolo Longo, Parco Piemonte.

**Nel GTFS nessuno dei 623 treni ferma in nessuna di queste stazioni.** In tutto 20 stazioni su 123 non hanno treni: le 19 di sopra più **Lucrino** (che invece ha un tabellone pieno, con quasi tutti i treni "in ritardo": probabilmente dati inaffidabili o stazione chiusa, da capire).

> **Correzione a un mio errore (1).** Avevo interpretato quelle stazioni come "EAV non le mostra ma il treno ci ferma comunque" e per questo, nella vista Percorso, le avevo segnate "non note" invece di "salta", e in "Vai a" davano "probabile". La premessa era sbagliata: **sono stazioni che nessun treno serve**. "Salta" era già corretto; meglio ancora "non servita".

### Scoperta: `shapes.txt` non riguarda i treni

`shapes.txt` contiene i tracciati geografici (sequenze di punti latitudine/longitudine, 180.859 righe, 535 tracciati). **Tutti e 12.407 i viaggi di autobus e traghetti hanno un `shape_id`; nessuno dei 623 treni.** Quindi dal GTFS non si possono ricavare i binari delle linee ferroviarie. Per disegnare una linea si potrebbero congiungere le coordinate delle stazioni con segmenti dritti (approssimativo).

(Cos'è `shapes.txt`: per ogni viaggio, la "traccia sulla carta" del percorso, cioè una lunga fila di punti GPS che, uniti, disegnano la curva reale della strada o del binario. Serve per disegnare una linea su una mappa senza limitarsi ai puntini delle fermate.)

### Note tecniche sul file

- Lo zip è creato "a flusso": ogni voce ha `0xFFFFFFFF` nei campi delle dimensioni e le misure vere in un campo aggiuntivo **zip64**. Un lettore di zip ingenuo lo rifiuta (è successo al primo tentativo dello script). Ora è gestito e c'è un test.
- Il server **non manda** `Content-Length`, `Last-Modified` né `ETag`, neanche a una richiesta `HEAD`: per capire se il file è cambiato bisogna scaricarlo (6 MB, circa 1 s) e confrontare l'impronta.
- Circa il 45% dei passaggi (3.498 su 7.763) ha i secondi diversi da zero: si arrotondano per difetto al minuto, che è come li mostra il tabellone (confermato: 394 confronti su 394 identici).
- Nessun orario dopo le 24:00, ma lo script li gestisce (per esempio `25:05` = 1505 minuti).

## 4. Cosa ci permette di fare

Dal più utile al meno:

1. **Linea e servizio esatti di ogni treno** (per numero), anche dove oggi il treno resta grigio.
2. **Rilevare soppressioni o anomalie per confronto**: un treno programmato che non compare sul tabellone. Funziona anche senza conoscere la parola con cui EAV scrive "soppresso".
3. **Elenco completo delle fermate di ogni treno**, anche negli **arrivi** (dove EAV non dà nessun elenco): rende possibile "Vai a" per gli arrivi, e rende esatto "ferma / salta" nel Percorso.
4. **Orari di domani e dei giorni successivi** (fino al 31/12), primo e ultimo treno, un pianificatore "da A a B".
5. **Coordinate delle stazioni**: "la stazione più vicina a me".
6. **Nomi ufficiali delle stazioni**, per ridurre gli alias.

## 5. Esito della prova dello script (25/09/2026)

`node scripts/build-orari.mjs --file <zip> --out data/orari.json`: **0,55 s**, **131 KB (30 KB compressi)**, 623 treni, 127 stazioni servite, 20 non servite, valido 16/09 → 31/12/2026, codice di uscita 0 e `--valida` dice "valido".
Provato come lo userebbe l'app, contro i tabelloni dal vivo di 12 stazioni: 394 treni su 401 sono nel file, tutti e 394 attivi oggi secondo il calendario, tutti e 394 con l'orario identico. Le fermate del DD 10535 (18 fermate) coincidono con quelle dell'analisi indipendente fatta a mano.

## 6. Limiti

- **Statico**: non sa nulla di ritardi e soppressioni di oggi.
- **Aggiornamento mensile**: le variazioni temporanee possono non esserci (vedi i 7 treni).
- **Host di terzi** (`wimob.it`): meglio non collegarsi al file dal vivo, ma elaborarlo e tenere una copia compatta nella repo.
- **Attribuzione** richiesta dalla licenza: una nota nel sito e nel README.
- I dati ferroviari compattati pesano ~234 KB in JSON non ottimizzato (~50 KB compressi).

## 7. Come ripetere le verifiche

Sono state fatte con script temporanei, non salvati nella repo. La procedura:

1. Scaricare lo zip dal link sopra e leggere i file con un lettore CSV.
2. Tenere solo i percorsi con `route_type = 2` (`routes.txt`) e i viaggi che li usano (`trips.txt`).
3. Costruire, per ogni `trip_short_name`, la lista `(stop_id, orario di partenza)` da `stop_times.txt` ordinata per `stop_sequence`.
4. Confrontare con il Worker: `GET <worker>/?stazione=<id>&tipo=P` (serve l'header `Origin`), incrociando `num` con `trip_short_name` e `stop_id = 6000 + id`.
5. Per i giorni di circolazione: `service_id` del viaggio dentro `calendar_dates.txt` alla data voluta.

Lo script definitivo esiste: `scripts/build-orari.mjs` (fase 1 del piano). Con `--valida` controlla un file già costruito.

## 8. Gli altri documenti open data e il materiale rotabile

Scaricati il 25/09/2026 dalla stessa pagina (sono CSV pubblici, tutti aggiornati al **28/11/2024**, quindi più vecchi del GTFS). Il link vero si trova nella pagina di ogni documento (`data-downloadurl`, con un parametro temporaneo `refresh`): non è un indirizzo fisso.

| Documento | Righe | Cosa contiene |
|---|---:|---|
| Elenco delle stazioni | 176 | codice unificato (= il nostro id), coordinate, bacino, capolinea, chilometrica, `Dismessa`, `Disabilitata_Temporaneamente`, `StazioneSiNo` (stazione o fermata), codice ISTAT |
| Elenco delle linee | 16 | codice della linea, nome, bacino |
| Elenco delle corse | 2.185 | numero di treno, linea, categoria, tipologia, partenza e arrivo, destinazione |
| Materiale rotabile | 147 | matricola, tipo, bacino (una riga per unità) |

### Le varianti di linea, spiegate (file delle linee)
`1` Napoli - Sorrento · `1.` Napoli - Torre Annunziata · **`1..` Napoli - Torre del Greco via Centro Direzionale** · `8` Napoli - Nola - Baiano · **`8.` Napoli - San Giorgio via Centro Direzionale** · `8..` Napoli - Acerra · `8...` San Giorgio - Volla · `4`, `6`, `2`, `3`, `7`, `5`, `9`.
Bacini: 1 = linee vesuviane, 2 = flegree, 3 = suburbane, 4 = metropolitane.

**Questo spiega i percorsi senza treni** (`1..` e `8.`): sono i servizi "via Centro Direzionale", e le stazioni di quel tratto (Centro Direzionale, Poggioreale, Botteghelle, Madonnelle, Argine-Palasport, Villa Visconti, Bartolo Longo, Parco Piemonte, Vesuvio De Meis SGV…) sono proprio tra le 20 "non servite". Nell'orario attuale non circola nessun treno su quel percorso.

### Le stazioni "non servite" e i loro indicatori
Il file delle stazioni ha 19 stazioni `Dismessa = 1` e 1 `Disabilitata_Temporaneamente = 1`. Delle 20 non servite dal GTFS, solo 4 sono segnate così (Castellammare Terme, Bivio Botteghelle e Bivio Madonnelle dismesse, Scrajo temporaneamente disabilitata). Le altre non hanno nessun indicatore: non sono chiuse per il file, semplicemente **nessun treno dell'orario attuale ci ferma** (i servizi via Centro Direzionale, e alcune fermate della linea di Sorrento come Cavalli di Bronzo, Via dei Monaci, Via Viuli, Moregine, Pozzano). Il termine giusto è "non servita" (non "chiusa").

### I 7 treni "extra" del 25/09: sono `FAC EX`
I sei treni sul tabellone ma non nel GTFS (10821, 11121, 11018, 11318, 11618, 11918) sono nel file delle corse con categoria **`FAC EX`**, Napoli Porta Nolana - Sorrento (e ritorno). Sul tabellone dal vivo hanno categoria `EXP`. È un servizio facoltativo (probabilmente il "Campania Express" turistico: la pagina di EAV ha un download "Orari e tariffe Campania Express") che **il GTFS non contiene**. Quindi i "programmati ma assenti" e "presenti ma non programmati" vanno letti tenendo conto che il GTFS **non copre** i `FAC EX`.

### File delle corse
1.084 numeri di treno, contro i 623 del GTFS ferroviario: 476 in comune. Contiene anche altri bacini e giorni particolari. Categorie: `A` (1.373), `DD` (246), `D` (199), `A fer` (162), `STR` (64), `INO` (52), `FAC EX` (32), `A FES` (23), `IMA` (22) e poche altre; tipologia `ORD`, `FES`, `FER`, `STR`, `PER`. Il significato esatto delle sigle non è documentato nei file (`A`, `D`, `DD`, `EXP` sono le stesse sigle del tabellone). La colonna `Validita` è un numero codificato, non decifrato.

### Materiale rotabile e numero di treno: non c'è il collegamento
Il file elenca **147 unità**, non i treni:
- Linee vesuviane (90): **FE220** (32), **MTS** (25), **T21** (11), **T21R** (22).
- Linee flegree (28): **ET 100** (2), **ET 400R** (12), **ET 500** (14).
- Linee suburbane (29): ATR 803, Ale, Aln 663/668, ETR 243.
- Non ci sono l'anno di costruzione né l'aria condizionata.
- **Nessun file lega un numero di treno a un'unità o a un tipo di materiale.** Nel GTFS `block_id` (che concatenerebbe le corse dello stesso convoglio) è vuoto per tutti i 623 treni, e `wheelchair_accessible` e `bikes_allowed` valgono tutti `0` (= nessuna informazione).
- Quello che si può dire è statistico (per esempio, quota di ogni tipo tra le unità di una linea), oppure legato alla categoria (`FAC EX`/`EXP`).
