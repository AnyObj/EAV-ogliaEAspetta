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

## 3. Tabelloni a schermo intero (stili dedicati)
Fatto come **stili aggiuntivi**, senza toccare quelli esistenti: `Tabellone classico`, `aeroporto`, `LED`, `metro` (gruppo "Tabelloni a schermo intero" del menu). Ognuno copre da solo lo schermo, mostra sempre 15/18/20/25 righe uguali (predefinite 18, si cambiano dal ⚙ in basso a destra), solo i primi treni in ordine di orario, **senza pagine e senza scorrere**. Le dimensioni le decide solo il CSS (unità del contenitore), nessuna misura o scala da JavaScript. File: `docs/views/_tab.*` (base) e `tab-*.js/.css`.
- [ ] **Provarli dal vivo** su: telefono verticale e orizzontale, tablet, monitor 16:9, TV 4K, formato verticale da insegna. Verificati solo nel DOM (jsdom): il layout vero non è controllabile senza un browser.
- [ ] Richiedono un browser recente (unità `cqh/cqw`, `:has()`): Chrome 105+, Safari 16+, Firefox 121+.
- [ ] Su schermi stretti (< 700 px) nascondono la colonna del binario: decidere se va bene.
- [ ] Altri tabelloni possibili (Solari, Terminale, Banchina, Golfo) sullo stesso schema: basta un file `tab-*.js` con le colonne e le celle, più il suo CSS.
- [ ] Facoltativo: schermo che non si spegne (`Screen Wake Lock`) e spostamento leggero del contenuto contro il burn-in delle TV.
- [ ] Facoltativo: mostrare "Aggiornato alle…" in modo più evidente se i dati diventano vecchi.

## 4. Dati e logica
- [ ] Scoprire come EAV segnala le **soppressioni**: finora nessun caso reale, il riconoscimento cerca "Soppr."/"soppresso"/"cancelled"/"annullato" in tutta la riga. Appena ne capita una, salvare la risposta come fixture.
- [x] "Da…" negli arrivi: fatto con gli orari programmati (fermate esatte per numero di treno); senza orari resta disattivato.
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
- Worker su Cloudflare con origine obbligatoria e cache a 10 s; catalogo di 123 stazioni; 58 test automatici.
- Frontend con elenco stazioni, ricerca "Vai a", refresh adattivo, colori di tutte le linee.
- Tredici aspetti grafici selezionabili, senza richieste di rete al cambio.

## 7. Orari programmati (GTFS)
Integrati e attivi di default; `?orari=0` li spegne. Note: `notes/gtfs-*.md`.
- [ ] **Riverificare dal vivo**: righe grigie "Previsto, non in elenco", "Da…" negli arrivi, colori Pomigliano (Volla) e Circumflegrea, stazioni non servite nel Percorso.
- [ ] Aggiornare `docs/orari.json` ogni mese (`node scripts/build-orari.mjs --check` dice se EAV ha pubblicato una versione nuova; scade il 31/12/2026). Idea: GitHub Action mensile.
- [ ] Rieseguire `npm run analizza:monitor` sui dati raccolti dal monitor: come scrive EAV una soppressione? Poi decidere se il rosso può usare altri segnali.
- [ ] Non fatto: orari di domani / primo e ultimo treno, "da A a B", stazione più vicina.
- [ ] Le viste a schermo intero (tab-*), LED, Radiale, Carte, Banchina e Golfo non mostrano i treni "non in elenco" (scelta prudente): valutarlo.
