# EAV-ogliaEAspettà
Piccolo frontend dedicato per i treni eav. Per ora focalizzato sulla circumvesuviana in quanto colori delle linee e alcuni dettagli li conosco a memoria.

Al momento si appoggia ad un worker cloudflare per bypassare le CORS del browser, quindi le richieste sono limitate a 100.000 al giorno, con un picco di 1000 al minuto. 

Una ogni *10 secondi, 6 al minuto* , se usato con parsimonia può essere usato da migliaia di utenti al giorno, quasi 200 alla volta.

Se qualcuno creasse un endpoint migliore, se arrivassero due spicci per aumentare il throughput, o se eav autorizzasse le github pages, non sarebbe male. 

Si ringrazia Claudio de' Codici per aver permesso la rapida prototipazione.

## Orari programmati
Oltre al tabellone dal vivo, l'app usa gli orari programmati pubblicati da EAV (formato GTFS, aggiornati ogni mese) per riconoscere la linea esatta di ogni treno, sapere in quali stazioni ferma, segnalare i treni "previsti ma non in elenco" e abilitare "Da…" negli arrivi. Il file compatto `docs/orari.json` si rigenera con `npm run build:orari`; se manca, è scaduto o differisce troppo dal tabellone (soglie in `docs/config.js`) l'app lo ignora e funziona come prima. `?orari=0` lo spegne. I dettagli sono in `notes/`.

Dati: «Dati del servizio EAV ferro e gomma», EAV srl, rielaborati, licenza [IODL 2.0](https://www.dati.gov.it/iodl/2.0/).
