// Configurazione del tabellone. I colori veri stanno in style.css (variabili --r-*).

// Indirizzo del Worker Cloudflare (pubblicato con `wrangler deploy` in worker/).
// In locale si usa `npm run dev` in worker/ (porta 8787).
const isLocal = typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname);
export const API = isLocal ? 'http://localhost:8787' : 'https://eav-ogliaeaspetta.eav-ogliaeaspetta-worker.workers.dev';

// Servizi: nome mostrato e come si disegna. `css` e' il suffisso della variabile --r-<css> in style.css;
// `strisce` = riga a strisce (per non dipendere solo dal colore). I colori veri (variabili --r-<css>) stanno in style.css.
export const SERVIZI = {
  sorrento:      { nome: 'Sorrento',             css: 'sor' },
  torre:         { nome: 'Torre A.ta - Oplonti', css: 'tor', strisce: true },
  poggiomarino:  { nome: 'Poggiomarino',         css: 'pog' },
  sarno:         { nome: 'Sarno',                css: 'sar' },
  baiano:        { nome: 'Baiano',               css: 'bai' },
  pomigliano:    { nome: 'Pomigliano',           css: 'pom', strisce: true }, // giallo a strisce diagonali
  cumana:        { nome: 'Cumana',               css: 'pas' }, // verde pastello
  circumflegrea: { nome: 'Circumflegrea',        css: 'lil' }, // lilla
  l7:            { nome: 'Linea 7',              css: 'ora' }, // arancione
  // Treni diretti a Napoli Porta Nolana: capolinea di tutte le linee, quindi barra "arcobaleno".
  napoli:        { nome: 'Verso Napoli',        css: 'nap', arcobaleno: true },
};

// Linea del catalogo EAV (campo `linea`) -> servizio.
export const LINEA_SERVIZIO = {
  'NAPOLI-SORRENTO': 'sorrento',
  'NAPOLI-S.GIORGIO-TORRE': 'torre',
  'NAPOLI-SCAFATI-POGGIOMARINO': 'poggiomarino',
  'NAPOLI-OTTAVIANO-SARNO': 'sarno',
  'NAPOLI-NOLA-BAIANO': 'baiano',
  'NAPOLI-POMIGLIANO': 'pomigliano',
  'CUMANA': 'cumana',
  'CIRCUMFLEGREA': 'circumflegrea',
  'SOCCAVO-MONTE S.ANGELO': 'l7',
};

// Treni diretti a queste stazioni (id del catalogo) sono sempre quel servizio.
// 41 = Torre Annunziata - Oplonti: sta a meta' di Sorrento e Poggiomarino, ma il servizio "Torre A.ta" e' a se'.
// 1  = Napoli Porta Nolana: capolinea di tutte le linee Circumvesuviana.
export const DESTINAZIONE_SERVIZIO = { '41': 'torre', '1': 'napoli' };

// Aiuto per i treni la cui linea non e' determinabile dalla stazione (tratti in comune).
// Regole verificate sui tabelloni reali del 24/09/2026 (293 numeri su 319 con linea univoca):
// 4 cifre: 1xxx Sorrento, 4xxx Poggiomarino, 5xxx Circumflegrea, 6xxx Sarno, 9xxx Cumana; 5 cifre: 60xxx Sarno,
// 80xxx/81xxx Baiano, 90xxx-92xxx Cumana. Servono solo a scegliere tra linee gia' possibili, mai a inventarne.
export const NUMERO_LINEA = [
  [/^1\d{3}$/, 'NAPOLI-SORRENTO'],
  [/^4\d{3}$/, 'NAPOLI-SCAFATI-POGGIOMARINO'],
  [/^5\d{3}$/, 'CIRCUMFLEGREA'],
  [/^6\d{3}$/, 'NAPOLI-OTTAVIANO-SARNO'],
  [/^9\d{3}$/, 'CUMANA'],
  [/^60\d{3}$/, 'NAPOLI-OTTAVIANO-SARNO'],
  [/^8[01]\d{3}$/, 'NAPOLI-NOLA-BAIANO'],
  [/^9[012]\d{3}$/, 'CUMANA'],
];

export const CFG = { LINEA_SERVIZIO, DESTINAZIONE_SERVIZIO, NUMERO_LINEA };

export const RIGHE_INIZIALI = 12;     // righe mostrate prima di "Mostra altri"
export const INATTIVITA_MS = 5 * 60 * 1000; // dopo tanto senza interazione l'aggiornamento si ferma (tranne ?kiosk=1)

// Aspetti grafici selezionabili: `id` e' anche il nome del modulo in views/<id>.js (e del suo .css, tranne "classico").
// `gruppo` serve solo a raggrupparli nel menu.
export const UI_LISTA = [
  { id: 'classico',  gruppo: 'Tabellone',  nome: 'Classico',        desc: 'Tabellone da stazione', tabellone: true },
  { id: 'golfo',     gruppo: 'Tabellone',  nome: 'Golfo',           desc: 'Il tabellone che parla: una frase semplice, il disco giallo con i minuti, biglietti perforati', tabellone: true },
  { id: 'aeroporto', gruppo: 'Tabellone',  nome: 'Aeroporto',       desc: 'Blu notte e giallo, come i tabelloni degli aeroporti', tabellone: true },
  { id: 'banchina',  gruppo: 'Tabellone',  nome: 'Banchina',        desc: 'Insegna da banchina: il prossimo treno in grande, poi l\'elenco', tabellone: true },
  { id: 'metro',     gruppo: 'Tabellone',  nome: 'Metropolitana',   desc: 'Segnaletica da metro: cerchi di linea, minuti in grande', tabellone: true },
  { id: 'svizzero',  gruppo: 'Tabellone',  nome: 'Svizzero',        desc: 'Tipografia da manifesto: orari enormi, filetti, poco colore', tabellone: true },
  { id: 'carta',     gruppo: 'Tabellone',  nome: 'Carta',           desc: 'L\'orario ferroviario stampato, con i puntini di riempimento', tabellone: true },
  { id: 'solari',    gruppo: 'Tabellone',  nome: 'Solari',          desc: 'Palette meccaniche, come nelle vecchie stazioni', tabellone: true },
  { id: 'carte',     gruppo: 'Altri formati', nome: 'Per direzione', desc: 'Una scheda per destinazione con il conto alla rovescia' },
  { id: 'percorso',  gruppo: 'Altri formati', nome: 'Percorso',      desc: 'Ogni treno con la linea e le stazioni dove ferma o salta' },
  { id: 'radiale',   gruppo: 'Altri formati', nome: 'Orologio',      desc: 'Quadrante di 60 minuti: i treni si avvicinano al centro' },
  { id: 'terminale', gruppo: 'Altri formati', nome: 'Terminale',     desc: 'Monitor a fosfori verdi, solo testo', tabellone: true },
  { id: 'led',       gruppo: 'Altri formati', nome: 'LED',           desc: 'Insegna a matrice di punti con i treni che scorrono', tabellone: true },
];

// Modalita' tabellone (?tabellone=1): schermo intero, i primi N treni, tutto scalato per stare nello schermo, senza scorrere
// e senza cambio pagina automatico. `minime` = con meno righe si scala come se ce ne fossero tante.
export const TAB_RIGHE = { predefinite: 18, opzioni: [15, 18, 20, 25], minime: 12 };
