// Parsing dell'HTML dei teleindicatori EAV -> JSON.
// Separato dal Worker per poterlo provare con i test (node --test).

const ENT = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };
const decode = (s) => s.replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/g, (m) => ENT[m] || m);
const text = (h) => decode(h.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

// Le stazioni "moova" scrivono <td class="destinazione">, quelle "pis" (Cumana ecc.)
// <td><div class="destinazione">: si accetta td o div.
function cell(html, cls) {
  const m = new RegExp('<(td|div)[^>]*class="' + cls + '"[^>]*>([\\s\\S]*?)</\\1>', 'i').exec(html);
  return m ? text(m[2]) : '';
}

const toMin = (s) => { const m = /(\d{1,2}):(\d{2})/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; };

// Legge i 4 campi nascosti e l'endpoint dati dalla pagina ?stazione=..&tipo=..
export function parseStationPage(page) {
  const params = {};
  for (const m of page.matchAll(/<input[^>]*\bname="([^"]+)"[^>]*\bvalue="([^"]*)"/gi)) params[m[1]] = m[2];
  const ep = /ws_getData_([a-z0-9_]+)\.php/i.exec(page);
  params.endpoint = ep ? 'ws_getData_' + ep[1] + '.php' : 'ws_getData_moova.php';
  return params;
}

// nowMin = minuti dalla mezzanotte, ora di Roma, al momento della richiesta.
// EAV elenca i treni da "adesso" in avanti e mescola stasera e domattina senza separatore:
// un treno piu' di 2 ore "indietro" rispetto al precedente (o all'ora attuale, per il primo)
// e' il giorno dopo. Senza nowMin il primo treno conta sempre come oggi.
export function parseBoard(html, stazione, tipo, nowMin = null) {
  const stationName = (/<td[^>]*class="nomeLocalita"[^>]*>([\s\S]*?)<\/td>/i.exec(html) || [])[1];
  const infoBox = (/<div[^>]*class="InfoSupplementare"[^>]*>([\s\S]*?)<\/div>/i.exec(html) || [])[1];

  const trains = [];
  let prev = null, day = 0;

  for (const chunk of html.split(/<tr\b/i).slice(1)) {
    if (!/class="numTreno"/i.test(chunk)) continue;

    const attrs = chunk.slice(0, chunk.indexOf('>'));
    const rowClass = (/class="([^"]*)"/i.exec(attrs) || [])[1] || '';

    const rowText = text(chunk.replace(/<marquee[\s\S]*?<\/marquee>/gi, ' '));
    const info = cell(chunk, 'informazioni');
    const ritardoRaw = cell(chunk, 'ritardo');
    const time = cell(chunk, 'orario');
    const platformRaw = cell(chunk, 'binario');

    const stops = [];
    for (const m of info.matchAll(/([^,()]+?)\s*\((\d{1,2}:\d{2})\)/g)) {
      stops.push({ name: m[1].replace(/^Ferma a:\s*/i, '').trim(), time: m[2] });
    }

    // Il ritardo e' in minuti nella colonna "ritardo" (verificato: "9", "2"); vuoto = in orario.
    const mDelay = /-?\d+/.exec(ritardoRaw);
    const mins = toMin(time);
    if (mins !== null) {
      const ref = prev !== null ? prev : nowMin;
      if (ref !== null && mins < ref - 120) day += 1;
      prev = mins;
    }

    // EAV riempie il tabellone con righe vuote fino a 40: si scartano.
    const num = cell(chunk, 'numTreno');
    if (!num && !time) continue;

    trains.push({
      num,
      cat: cell(chunk, 'categoria'),
      dest: cell(chunk, 'destinazione'),
      time,
      day,
      platform: platformRaw && platformRaw !== '.' ? platformRaw : null,
      delay: mDelay ? parseInt(mDelay[0], 10) : (ritardoRaw ? null : 0),
      // Come EAV segnali una soppressione non e' ancora noto (mai vista nei dati): si cerca
      // "Soppr." / "soppresso" / "cancelled" / "annullato" in tutta la riga, non solo in una colonna.
      cancelled: /soppr|cancel|annull/i.test(rowText + ' ' + rowClass),
      stops,
      // campi grezzi, utili per capire come EAV segnala ritardi e soppressioni
      ritardoRaw,
      info,
      rowClass,
    });
  }

  return {
    station: stationName ? text(stationName) : null,
    stazione, tipo,
    updatedAt: new Date().toISOString(),
    notice: infoBox ? text(infoBox) : null,
    trains,
  };
}
