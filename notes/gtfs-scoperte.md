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
- Numeri: 13.030 viaggi in tutto, di cui **623 ferroviari**; 4.223 fermate, di cui **127 usate dai treni**; 122 percorsi, di cui **16 ferroviari**.
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

### Le 16 varianti ferroviarie (`route_id`)

| route_id | Nome nel GTFS | Treni visti dal vivo il 25/09 | Servizio dell'app (proposta) |
|---|---|---|---|
| `1` | Napoli - Pompei Scavi - Sorrento | 72 | Sorrento |
| `1.` | Napoli - Torre Annunziata | 43 | Torre A.ta |
| `1..` | Napoli - Torre del Greco | 0 | da decidere |
| `4` | Napoli - Scafati - Poggiomarino | 62 | Poggiomarino |
| `6` | Napoli - Ottaviano - Sarno | 65 | Sarno |
| `8` | Napoli - Nola - Baiano | 42 | Baiano |
| `8.` | Napoli - San Giorgio | 0 | da decidere |
| `8..` | Napoli - Pomigliano - Acerra | 0 | Pomigliano |
| `5` | Napoli - Pianura - Quarto - Torregaveta | 55 | Circumflegrea (da verificare) |
| `5.` | Soccavo - Monte Sant'Angelo | 0 | Linea 7 |
| `9` | Napoli - Bagnoli - Pozzuoli - Torregaveta | 13 | Cumana |
| `9.` | Montesanto - Bagnoli | 12 | Cumana |
| `9..` | Torregaveta - Gerolomini | 0 | Cumana |
| `2` | Piscinola - Giugliano - Aversa | 0 | non nel catalogo delle stazioni dell'app (da capire) |
| `3` | Napoli - Benevento | 0 | non nel catalogo delle stazioni dell'app (da capire) |
| `7` | Napoli - Caserta - Piedimonte Matese | 0 | non nel catalogo delle stazioni dell'app (da capire) |

(Le varianti con 0 treni non erano nelle stazioni che ho interrogato: non vuol dire che non circolino.)

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

> **Correzione a un mio errore.** Avevo interpretato quelle stazioni come "EAV non le mostra ma il treno ci ferma comunque" e per questo, nella vista Percorso, le avevo segnate "non note" invece di "salta", e in "Vai a" davano "probabile". La premessa era sbagliata: **sono stazioni che nessun treno serve**. "Salta" era già corretto; meglio ancora "non servita".

### Scoperta: `shapes.txt` non riguarda i treni

`shapes.txt` contiene i tracciati geografici (sequenze di punti latitudine/longitudine, 180.859 righe, 535 tracciati). **Tutti e 12.407 i viaggi di autobus e traghetti hanno un `shape_id`; nessuno dei 623 treni.** Quindi dal GTFS non si possono ricavare i binari delle linee ferroviarie. Per disegnare una linea si potrebbero congiungere le coordinate delle stazioni con segmenti dritti (approssimativo).

(Cos'è `shapes.txt`: per ogni viaggio, la "traccia sulla carta" del percorso, cioè una lunga fila di punti GPS che, uniti, disegnano la curva reale della strada o del binario. Serve per disegnare una linea su una mappa senza limitarsi ai puntini delle fermate.)

## 4. Cosa ci permette di fare

Dal più utile al meno:

1. **Linea e servizio esatti di ogni treno** (per numero), anche dove oggi il treno resta grigio.
2. **Rilevare soppressioni o anomalie per confronto**: un treno programmato che non compare sul tabellone. Funziona anche senza conoscere la parola con cui EAV scrive "soppresso".
3. **Elenco completo delle fermate di ogni treno**, anche negli **arrivi** (dove EAV non dà nessun elenco): rende possibile "Vai a" per gli arrivi, e rende esatto "ferma / salta" nel Percorso.
4. **Orari di domani e dei giorni successivi** (fino al 31/12), primo e ultimo treno, un pianificatore "da A a B".
5. **Coordinate delle stazioni**: "la stazione più vicina a me".
6. **Nomi ufficiali delle stazioni**, per ridurre gli alias.

## 5. Limiti

- **Statico**: non sa nulla di ritardi e soppressioni di oggi.
- **Aggiornamento mensile**: le variazioni temporanee possono non esserci (vedi i 7 treni).
- **Host di terzi** (`wimob.it`): meglio non collegarsi al file dal vivo, ma elaborarlo e tenere una copia compatta nella repo.
- **Attribuzione** richiesta dalla licenza: una nota nel sito e nel README.
- I dati ferroviari compattati pesano ~234 KB in JSON non ottimizzato (~50 KB compressi).

## 6. Come ripetere le verifiche

Sono state fatte con script temporanei, non salvati nella repo. La procedura:

1. Scaricare lo zip dal link sopra e leggere i file con un lettore CSV.
2. Tenere solo i percorsi con `route_type = 2` (`routes.txt`) e i viaggi che li usano (`trips.txt`).
3. Costruire, per ogni `trip_short_name`, la lista `(stop_id, orario di partenza)` da `stop_times.txt` ordinata per `stop_sequence`.
4. Confrontare con il Worker: `GET <worker>/?stazione=<id>&tipo=P` (serve l'header `Origin`), incrociando `num` con `trip_short_name` e `stop_id = 6000 + id`.
5. Per i giorni di circolazione: `service_id` del viaggio dentro `calendar_dates.txt` alla data voluta.

Lo script definitivo è nella fase 1 del piano.
