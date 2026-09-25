# GTFS di EAV: il riassunto

**In una frase**: EAV pubblica gratis gli orari programmati di tutti i treni, e dai dati veri di oggi risulta che combaciano al minuto con quelli del tabellone. Possiamo usarli per migliorare l'app, ma **per ora è tutto parcheggiato**: è pronto solo lo script che li scarica e li prepara.

Dettagli: [`gtfs-scoperte.md`](gtfs-scoperte.md). Piano completo: [`gtfs-piano.md`](gtfs-piano.md).

---

## Cosa abbiamo trovato

1. **Gli orari programmati sono pubblici**, con licenza aperta (IODL 2.0). È un file zip di 6 MB (formato GTFS), aggiornato ogni mese, con 623 treni ferroviari, 127 fermate e il calendario fino al 31/12/2026.
2. **Combacia con il tabellone**: il numero di treno è lo stesso e gli orari coincidono. Nei tabelloni di 12 stazioni, 394 dei 401 treni mostrati sono nel file, tutti attivi oggi, tutti con l'orario identico.
3. **Ci dice la linea esatta di ogni treno** (per numero), anche dove oggi l'app lascia il treno grigio. Distingue anche il servizio "Napoli - Torre Annunziata".
4. **Ci dice tutte le fermate di ogni treno**, anche negli arrivi, dove EAV non dà nessun elenco.
5. **20 stazioni del catalogo non hanno nessun treno** (Cavalli di Bronzo, Poggioreale, Centro Direzionale…). Non sono "non monitorate": nessuno le serve. Una mia interpretazione precedente era sbagliata, ed è corretta nei documenti.
6. **Non c'è nulla in tempo reale**: niente ritardi né soppressioni. Il file dice cosa è *programmato*, non cosa sta succedendo.
7. **I tracciati delle linee non ci sono** per i treni (`shapes.txt` esiste solo per autobus e traghetti).
8. **Sei treni sul tabellone non erano nel GTFS** (per esempio 10821): sono tutti di categoria `FAC EX` (sul tabellone `EXP`), un servizio facoltativo probabilmente turistico. Il GTFS non li contiene: nei confronti vanno esclusi.
9. **Il file contiene anche altre linee EAV** (Piscinola-Aversa, Napoli-Caserta-Piedimonte Matese) che non sono nel nostro catalogo.
10. **Il tipo di convoglio non si può ricavare dal numero di treno**: il file del materiale rotabile elenca 147 unità (FE220, MTS, T21, T21R, ET 100/400R/500…) ma nessun dato le lega ai treni, e non dice l'età né l'aria condizionata. Si può fare qualcosa di statistico o a mano (vedi il piano, "Idee future").
11. **Le varianti `1..` e `8.` sono i servizi "via Centro Direzionale"**, per questo non hanno treni: le stazioni di quel tratto sono le "non servite".

## Cosa potremmo costruire

| Idea | A cosa serve | Impegno |
|---|---|---|
| **Linea e colore esatti** di ogni treno | niente più righe grigie | medio |
| **Fermate esatte** per treno, anche negli arrivi | "Vai a" per gli arrivi; "ferma/salta" certi nel Percorso | medio |
| **Correggere le stazioni non servite** | il Percorso smette di dire cose sbagliate | piccolo |
| **Segnalare i treni "programmati ma non in elenco"** | un indizio di possibile soppressione, senza dirlo per certo | medio (prima serve l'analisi dei dati del monitor) |
| **Orari di domani, primo e ultimo treno** | oggi il tabellone mostra solo 40 treni | medio |
| **Da A a B**: i prossimi treni tra due stazioni | un pianificatore semplice | grande |
| **La stazione più vicina a me** | pulsante con la posizione (che resta sul dispositivo) | piccolo |
| **Analisi offline** dei dati raccolti dal monitor con il GTFS | trovare le anomalie e come EAV scrive una soppressione | medio |

Non si può fare (con questi dati): disegnare i binari veri delle linee, mostrare ritardi o soppressioni in tempo reale.

## Cosa è già pronto

**`scripts/build-orari.mjs`**: scarica il GTFS e produce `orari.json`, il file compatto che l'app leggerebbe.

- Provato sul file vero: **0,55 secondi, 131 KB (30 KB compressi)**, valido, e coerente con i tabelloni dal vivo.
- Si aggiorna con un comando: `--check` dice se EAV ha pubblicato una versione nuova (codice 10 se è cambiata), il comando normale la scarica e la ricostruisce.
- Non scrive mai un file rotto: si ferma se il file scaricato non è uno zip, se il GTFS è scaduto, se i treni cambiano di oltre il 25% o se un treno è malformato.
- **18 test** (mini GTFS costruito nel test, nessuna rete).
- **Non è collegato all'app**: non cambia niente di ciò che vedi.

Cosa ha insegnato la prova: lo zip di EAV usa un formato "zip64" che un lettore semplice rifiuta (ora gestito), il server non comunica la data di aggiornamento (quindi `--check` scarica i 6 MB), e i percorsi con treni sono 11 e non 16.

## Perché è parcheggiato

Le modifiche all'app potrebbero romperla, quindi **il lavoro vive sul branch locale `claude/gtfs-orari` e non viene pushato** finché non lo chiedi. Il piano procede a fasi separate, ognuna annullabile da sola, e tutto dietro un interruttore spento di default. L'app deve funzionare identica anche senza `orari.json`.

## Come riprendere

1. `git switch claude/gtfs-orari`
2. Rigenerare i dati: `node scripts/build-orari.mjs --out data/orari.json` (o senza `--out` per scrivere `docs/orari.json`); controllarli con `node scripts/build-orari.mjs --valida data/orari.json`.
3. Prossimo passo consigliato: la **fase 0** (stazioni non servite), poi la **fase 2** (il modulo che legge `orari.json`) e la **3a** (linea esatta).
4. Prima, rispondere a poche domande (le trovi nel piano, "Decisioni aperte"):
   - i treni con capolinea **Volla** usano lo stile Pomigliano (giallo a strisce) o Baiano?
   - il percorso `5` (Licola, Quarto, Montesanto) è la Circumflegrea (lilla)?
   - le linee `2` e `7` (Aversa, Caserta) restano fuori dall'app?

## Da ricordare

- **Attribuzione**: la licenza chiede di citare la fonte ("Dati del servizio EAV ferro e gomma, EAV srl", IODL 2.0). Va messa nel sito e nel README, e il testo della licenza va letto prima.
- Il file sta su un host di terzi (`wimob.it`): l'app non deve dipenderne, usa la copia compatta nella repo.
- Il GTFS è statico e mensile: variazioni temporanee possono non esserci, e i treni `FAC EX`/`EXP` non ci sono proprio. Mai dichiarare "soppresso" solo da qui.
- Gli altri CSV open data sono aggiornati al 28/11/2024 (più vecchi del GTFS); i loro link hanno un parametro temporaneo, non sono indirizzi fissi.
