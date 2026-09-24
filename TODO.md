# TODO

Stato al 25/09/2026. Il Worker è pubblicato su Cloudflare; il frontend (`docs/`) è pronto per GitHub Pages.

## 1. Pubblicazione
- [ ] Attivare GitHub Pages (Settings → Pages → *Deploy from branch* → `/docs`). Serve la repo pubblica.
- [ ] Pull Request `claude/eav-attr-work` → `main`, poi far puntare Pages a `main`.
- [ ] Provare il sito online (Pages + Worker) con tutti gli aspetti, su telefono e su un monitor grande.
- [ ] Scrivere a EAV: chiedere l'header `Access-Control-Allow-Origin` (renderebbe inutile il Worker) e avvisarli del carico.

## 2. Glitch grafici
Raccolti durante le prove. Molti sono stati corretti senza poterli vedere, quindi vanno **riverificati dal vivo**.
- [ ] Carta su mobile: l'orario toccava il filetto e la barra di evidenziazione della ricerca (corretto, da verificare).
- [ ] Solari con "Vai a": la barra colorata non copriva l'altezza della riga allungata (corretto, da verificare).
- [ ] Solari su mobile: testo ancora piccolo? (0,76 rem, 43 tessere per riga).
- [ ] Percorso: nodi "fantasma" su Poggiomarino / Torre A.ta (corretto: le stazioni non monitorate ora sono "non note"; da verificare a schermo largo).
- [ ] Classico: scorrimento automatico delle fermate lunghe (corretto con `min-width:0` sulla colonna centrale; da verificare. Se Windows ha gli effetti di animazione disattivati non parte, per scelta).
- [ ] Orologio: mai visto con dati veri (la sera non ci sono treni entro 60 minuti). Provarlo di giorno.
- [ ] Tema chiaro/scuro in tutti gli aspetti, e `prefers-color-scheme` alternato.
- [ ] Schermi molto larghi (4K, TV) e telefoni piccoli (320 px) in tutti gli aspetti.
- [ ] Golfo, Aeroporto e Banchina: mai visti a schermo, controllare proporzioni, perforazione dei biglietti e leggibilità dei caratteri (Bricolage Grotesque, Atkinson Hyperlegible).
- [ ] Contrasto dei colori nuovi (lilla, verde pastello, arancione) nel tema chiaro.
- [ ] Idea: test visivi automatici (screenshot con un browser headless) per non dipendere solo dall'occhio.

## 3. Modalità "tabellone": tutto sullo schermo, senza scorrere
Fatto (da provare dal vivo su schermi veri): `?tabellone=1` oppure il pulsante **Tabellone**.
- [x] Schermo intero con i primi 18 treni (15, 18, 20 o 25 dal menu, oppure `&righe=N`), sempre in ordine di orario, **senza scroll e senza cambio pagina**.
- [x] Il contenuto viene scalato per riempire lo schermo a qualunque dimensione e proporzione (`planFit` in `logic.js`, con test). Gli aspetti a colonne fisse (Solari, Terminale) si scalano interi e si centrano.
- [x] Interfaccia ridotta a intestazione, orologio e righe. Menu ⚙ in basso a destra (quasi invisibile), cursore che sparisce, `Screen Wake Lock`, pulsante schermo intero.
- [x] Aspetti disponibili: Classico, Golfo, Aeroporto, Banchina, Metropolitana, Svizzero, Carta, Solari, Terminale, LED. Gli altri (Per direzione, Percorso, Orologio) ripiegano su Classico.
- [ ] Provarlo su: telefono verticale e orizzontale, tablet, monitor 16:9, TV 4K, formato verticale da insegna. La misura reale dello schermo non è verificabile dai test automatici.
- [ ] Con pochi treni (di sera) le righe restano piccole perché si scala come per 12 righe: decidere se è quello che si vuole.
- [ ] Spostamento leggero del contenuto contro il burn-in delle TV.
- [ ] Decidere se "Vai a" nel tabellone debba far salire in cima i treni che ci arrivano (oggi si evidenziano nei primi N).

## 4. Dati e logica
- [ ] Scoprire come EAV segnala le **soppressioni**: finora nessun caso reale, il riconoscimento cerca "Soppr."/"soppresso"/"cancelled"/"annullato" in tutta la riga. Appena ne capita una, salvare la risposta come fixture.
- [ ] "Vai a" per gli **arrivi** ("Da…"): il significato dell'elenco fermate negli arrivi non è noto, per ora è disattivato.
- [ ] Rifare ogni tanto il giro `node scripts/build-stazioni.mjs --probe` (una richiesta ogni 2 s) in ore diverse: `dati:false` è una fotografia della sera del 24/09/2026.
- [ ] Colore/segno per i treni che restano grigi (Porta Nolana nei tratti in comune tra le linee) o altre regole sui numeri di treno, se l'esperienza le conferma (`NUMERO_LINEA` in `docs/config.js`).
- [ ] Nome ambiguo "Pollena Trocchia" (stazioni 9 e 95): capire se sono la stessa stazione.

## 5. Worker e infrastruttura
- [ ] Cache condivisa tra istanze (Cache API o KV): oggi la cache di 10 s è per singola istanza.
- [ ] Opzionale: `endpoints.json` con più Worker e passaggio al successivo in caso di errore (con scelta "appiccicosa" per stazione). Attenzione: un endpoint altrui potrebbe alterare i dati; il frontend valida già il formato e usa solo `textContent`.
- [ ] Limiti gratuiti Cloudflare: 100.000 richieste al giorno. Tenere d'occhio l'uso; alternativa senza tetti: un piccolo server Node su una VM sempre gratuita.
- [ ] GitHub Actions che esegue `npm test` a ogni push.
- [ ] Font di Google (Barlow, DotGothic16, Bricolage Grotesque, Atkinson Hyperlegible): valutare di ospitarli nella repo (privacy e uso offline).

## 6. Documentazione
- [ ] README: descrizione del progetto, screenshot degli aspetti, come provarlo in locale (`npm run dev` in `worker/`, `npm run serve`), come pubblicare.
- [ ] Legenda dei colori delle linee nella pagina (ora sono nei chip solo quando la linea è presente).
- [ ] Revisione dell'accessibilità con uno screen reader (ora ci sono ruoli e etichette, ma non è stata provata).

## Fatto
- Aspetto **Golfo**: blu mare e limone, la frase in cima ("Il prossimo treno per Sorrento parte tra 3 minuti, dal binario 4"), biglietti perforati.
- Worker su Cloudflare con origine obbligatoria e cache a 10 s; catalogo di 123 stazioni; 60 test automatici.
- Frontend con elenco stazioni, ricerca "Vai a", refresh adattivo, colori di tutte le linee.
- Tredici aspetti grafici selezionabili, senza richieste di rete al cambio.
