# TODO

Stato al 25/09/2026 (sera). Il Worker è pubblicato su Cloudflare; il lavoro è in `main` (PR #2 "Quasi stabile", unita come squash) e le Pages vanno puntate a `main`.

## 1. Pubblicazione
- [ ] Pages: Settings → Pages → *Deploy from branch* → `main` → `/docs`. Serve la repo pubblica (o un piano adatto). Fatto: PR `claude/eav-attr-work` → `main` (#2, squash).
- [ ] **Storia divisa dopo lo squash**: `main` ha `548a5e8` (un commit) mentre il vecchio branch ha i 31 originali, stesso contenuto. Una nuova PR dal vecchio branch darebbe conflitti. Scegliere: (a) riconciliare con `git merge -s ours origin/main` sul branch, oppure (b) lavorare da un branch nuovo creato da `main` e cancellare `claude/eav-attr-work`. Meglio (b). Nelle PR usare *Create a merge commit* se GitHub lo permette (con lo squash si ripete il problema).
- [ ] Cache di GitHub Pages: 10 minuti (`max-age=600`). Dopo un push HTML e CSS possono arrivare da versioni diverse (successo il 25/09: due icone e tasto fuori posto, era il CSS vecchio). Aspettare 10 min o chiudere del tutto la PWA prima di giudicare un layout. Se dà fastidio: `style.css?v=...` nel link.
- [ ] Provare il sito online (Pages + Worker) con tutti gli aspetti, su telefono e su un monitor grande.
- [ ] Installabile (PWA): manifest, icone (trenino, in `docs/icons/`) e meta in `index.html` fatti il 25/09, senza service worker. Nome dell'app: "EAV Orari" (solo `manifest` e meta iOS; il `<title>` della pagina resta "EAV ogliaEAspettà"). Reinstallare l'app per vedere un nome nuovo. Da provare online quando Pages e' attivo ("Installa" su Chrome, "Aggiungi a Home" su iOS). Se Chrome non propone l'installazione, aggiungere un service worker vuoto (deciso di non metterlo: un tabellone senza rete non serve).
- [ ] Tasto tema sole/luna (in alto a destra, mostra l'icona del tema a cui si passa): verificare posizione su home e tabellone, e che il menu dell'aspetto e l'orologio non si sovrappongano. Ci sono anche l'avviso di non affiliazione (README e footer).
- [ ] GitHub Action `Aggiorna orari` (`.github/workflows/orari.yml`, in `main`): attivare in Settings → Actions → General "Allow GitHub Actions to create and approve pull requests", poi primo lancio a mano (Actions → Aggiorna orari → Run workflow): con GTFS invariato deve finire verde. Il cron del lunedi' funziona solo dal branch predefinito. La parte che apre la PR non e' mai stata provata.
- [ ] Scrivere a EAV: chiedere l'header `Access-Control-Allow-Origin` (renderebbe inutile il Worker) e avvisarli del carico.

## 2. Glitch grafici
Raccolti durante le prove. Molti sono stati corretti senza poterli vedere, quindi vanno **riverificati dal vivo**.
- [ ] Carta su mobile: l'orario toccava il filetto e la barra di evidenziazione della ricerca (corretto, da verificare).
- [ ] Solari con "Vai a": la barra colorata non copriva l'altezza della riga allungata (corretto, da verificare).
- [ ] Solari su mobile: testo ancora piccolo? (0,76 rem, 43 tessere per riga).
- [ ] Metropolitana su mobile: la riga non si vede bene (segnalato il 25/09; sospetto: cerchio di linea + minuti da 3 rem + quadratino del binario, tutti a larghezza fissa, non stanno in una riga stretta). Da sistemare in `docs/views/metro.css`; controllare anche `tab-metro`.
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
- [x] Soppressioni: viste il 25/09 (Circumflegrea, ~14:37-15:47). EAV scrive `SOPPRESSO` nella colonna ritardo e `SOPPRESSO -`/`SOPPRESSO` in informazioni, riga gialla (`testoGiallo`), senza binario. Parser OK, fixture e test in `worker/test/` (`soppressi.test.js`).
- [ ] Altri segnali rari mai visti (treni sostituiti da bus, corse limitate, scioperi): un giorno di monitor non li trova. Idea: mostrare cosi' com'e' ogni testo di "informazioni" che il parser non riconosce.
- [ ] Il testo "Ferma a:" live di EAV c'e' solo sulle PARTENZE Circumvesuviana (~25% delle righe), mai su arrivi ne' Cumana/Circumflegrea, ed e' una funzione recente. Non e' la fonte principale: decidono gli orari GTFS, poi (ripiego, `?orari=0`) destinazione, lista live, catalogo `stazioni.json`. Senza GTFS gli arrivi non vengono evidenziati. Idea: confrontare la lista live col GTFS treno per treno per validarlo.
- [x] "Da…" negli arrivi: fatto con gli orari programmati (fermate esatte per numero di treno); senza orari resta disattivato.
- [ ] Rifare ogni tanto il giro `node scripts/build-stazioni.mjs --probe` (una richiesta ogni 2 s) in ore diverse: `dati:false` è una fotografia della sera del 24/09/2026.
- [ ] Colore/segno per i treni che restano grigi (Porta Nolana nei tratti in comune tra le linee) o altre regole sui numeri di treno, se l'esperienza le conferma (`NUMERO_LINEA` in `docs/config.js`).
- [ ] Nome ambiguo "Pollena Trocchia" (stazioni 9 e 95): capire se sono la stessa stazione.

## 5. Worker e infrastruttura
- [ ] Cache condivisa tra istanze (Cache API o KV): oggi la cache di 10 s è per singola istanza.
- [ ] Opzionale: `endpoints.json` con più Worker e passaggio al successivo in caso di errore (con scelta "appiccicosa" per stazione). Attenzione: un endpoint altrui potrebbe alterare i dati; il frontend valida già il formato e usa solo `textContent`.
- [ ] Limiti gratuiti Cloudflare: 100.000 richieste al giorno. Tenere d'occhio l'uso; alternativa senza tetti: un piccolo server Node su una VM sempre gratuita.
- [ ] GitHub Actions che esegue `npm test` a ogni push/PR (l'Action degli orari lancia i test solo quando l'aggiorna).
- [ ] Font di Google (Barlow, DotGothic16, Bricolage Grotesque, Atkinson Hyperlegible): valutare di ospitarli nella repo (privacy e uso offline).

## 6. Documentazione
- [ ] README: descrizione del progetto, screenshot degli aspetti, come provarlo in locale (`npm run dev` in `worker/`, `npm run serve`), come pubblicare.
- [ ] Legenda dei colori delle linee nella pagina (ora sono nei chip solo quando la linea è presente).
- [ ] Revisione dell'accessibilità con uno screen reader (ora ci sono ruoli e etichette, ma non è stata provata).

## Fatto
- Aspetto **Golfo**: blu mare e limone, la frase in cima ("Il prossimo treno per Sorrento parte tra 3 minuti, dal binario 4"), biglietti perforati.
- Worker su Cloudflare con origine obbligatoria e cache a 10 s; catalogo di 123 stazioni; 58 test automatici.
- Frontend con elenco stazioni, ricerca "Vai a", refresh adattivo, colori di tutte le linee.
- App installabile (manifest, icone trenino, meta iOS), avviso di non affiliazione con EAV, tasto tema sole/luna, soppressioni riconosciute e testate, Action per gli orari, 116 test.
- Tredici aspetti grafici selezionabili, senza richieste di rete al cambio.

## 7. Orari programmati (GTFS)
Integrati e attivi di default; `?orari=0` li spegne. Note: `notes/gtfs-*.md`.
- [ ] **Riverificare dal vivo**: righe grigie "Previsto, non in elenco", "Da…" negli arrivi, colori Pomigliano (Volla) e Circumflegrea, stazioni non servite nel Percorso.
- [ ] Aggiornare `docs/orari.json` ogni mese (`node scripts/build-orari.mjs --check` dice se EAV ha pubblicato una versione nuova; scade il 31/12/2026). Fatto con l'Action `Aggiorna orari` (settimanale + a mano, apre una PR), da provare.
- [ ] Monitor del 25/09 (`data/monitor/2026-09-25_0549/`, fino alle 23:59, poi non rilanciarlo): rigenerare `npm run analizza:monitor` a fine giornata (il `rapporto.md` era fermo alle 07:22) e guardare treni usciti in anticipo e confronto GTFS del pomeriggio.
- [ ] Non fatto: orari di domani / primo e ultimo treno, "da A a B", stazione più vicina.
- [ ] Le viste a schermo intero (tab-*), LED, Radiale, Carte, Banchina e Golfo non mostrano i treni "non in elenco" (scelta prudente): valutarlo.
