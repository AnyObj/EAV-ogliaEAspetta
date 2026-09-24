import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBoard, parseStationPage } from '../parse.js';

const fx = (name) => readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8');

test('pagina stazione moova: campi nascosti ed endpoint', () => {
  const p = parseStationPage(fx('page-station3.html'));
  assert.equal(p.codLoc, 'TNPNTS00000000000040');
  assert.equal(p.touchpoint, 'TPOINT00000000000080');
  assert.equal(p.nomeDevice, 'M01T3M');
  assert.equal(p.tipoLista, 'P');
  assert.equal(p.endpoint, 'ws_getData_moova.php');
});

test('pagina stazione pis (Cumana): endpoint diverso, codLoc numerico', () => {
  const p = parseStationPage(fx('page-station801.html'));
  assert.equal(p.codLoc, '801');
  assert.equal(p.nomeDevice, 'M01T801M');
  assert.equal(p.endpoint, 'ws_getData_pis.php');
});

test('tabellone moova: Napoli P. Garibaldi', () => {
  const b = parseBoard(fx('garibaldi-moova.html'), '3', 'P');
  assert.equal(b.station, 'NAPOLI P. GARIBALDI');
  assert.equal(b.notice, 'SISTEMA IN FASE DI TEST');
  assert.equal(b.trains.length, 40);

  const first = b.trains[0];
  assert.equal(first.num, '12108');
  assert.equal(first.cat, 'A');
  assert.equal(first.dest, 'NAPOLI PORTA NOLANA');
  assert.equal(first.time, '21:45');
  assert.equal(first.platform, '4');
  assert.equal(first.delay, 9);
  assert.equal(first.day, 0);

  const sorrento = b.trains.find((t) => t.num === '1219');
  assert.equal(sorrento.dest, 'SORRENTO');
  assert.equal(sorrento.delay, 0);
  assert.equal(sorrento.stops.length, 12);
  assert.deepEqual(sorrento.stops[0], { name: 'TORRE A.TA - OPLONTI', time: '22:18' });
  assert.deepEqual(sorrento.stops.at(-1), { name: 'SORRENTO', time: '23:05' });
});

test('tabellone moova: i treni del mattino dopo hanno day=1', () => {
  const b = parseBoard(fx('garibaldi-moova.html'), '3', 'P');
  const days = b.trains.map((t) => t.day);
  assert.equal(days[0], 0);
  assert.equal(days.at(-1), 1);
  // day non torna mai indietro
  for (let i = 1; i < days.length; i++) assert.ok(days[i] >= days[i - 1]);
  assert.equal(b.trains.find((t) => t.time === '05:39').day, 1);
});

test('tabellone pis (Cumana): la destinazione dentro <div> viene letta', () => {
  const b = parseBoard(fx('montesanto-pis.html'), '801', 'P');
  assert.equal(b.station, 'MONTESANTO');
  // la pagina ha solo 3 treni veri: il resto sono righe vuote di riempimento
  assert.ok(b.trains.length > 0 && b.trains.length < 40, 'righe vuote non scartate: ' + b.trains.length);
  for (const t of b.trains) {
    assert.notEqual(t.dest, '', 'destinazione vuota per il treno ' + t.num);
    assert.match(t.time, /^\d\d:\d\d$/);
  }
  assert.equal(b.trains[0].num, '92200');
  assert.equal(b.trains[0].dest, 'FUORIGROTTA');
  assert.equal(b.trains[0].platform, '2');
});

test('nessun treno soppresso nei dati reali salvati', () => {
  // Quando troveremo il segnale reale di EAV per le soppressioni, aggiungere una fixture qui.
  const b = parseBoard(fx('garibaldi-moova.html'), '3', 'P');
  assert.equal(b.trains.filter((t) => t.cancelled).length, 0);
});

// ---- giorno relativo all'ora attuale, ritardo senza minuti ----

const row = (num, time, ritardo = '', info = '') =>
  `<tr class="testoGiallo"><td class="numTreno">&nbsp;${num}</td><td class="categoria">A</td>` +
  `<td class="destinazione">TORREGAVETA</td><td class="informazioni">${info}</td><td class="binario">2</td>` +
  `<td class="orario">${time}</td><td class="ritardo">${ritardo}</td><td class="blink"></td></tr>`;
const board = (...rows) => '<td class="nomeLocalita"><strong>LUCRINO</strong></td><table>' + rows.join('') + '</table>';

test('day: lista che parte dal mattino dopo (ora attuale 22:30) -> tutti day=1', () => {
  const b = parseBoard(board(row(1, '05:19'), row(2, '05:47'), row(3, '06:17')), '816', 'P', 22 * 60 + 30);
  assert.deepEqual(b.trains.map((t) => t.day), [1, 1, 1]);
});

test('day: sera + mattino, ora attuale 22:30', () => {
  const b = parseBoard(board(row(1, '22:40'), row(2, '23:10'), row(3, '05:19')), '816', 'P', 22 * 60 + 30);
  assert.deepEqual(b.trains.map((t) => t.day), [0, 0, 1]);
});

test('day: treno appena partito o in ritardo (poco prima di adesso) resta oggi', () => {
  const b = parseBoard(board(row(1, '22:20'), row(2, '22:50')), '816', 'P', 22 * 60 + 30);
  assert.deepEqual(b.trains.map((t) => t.day), [0, 0]);
});

test('day: senza ora attuale il primo treno conta come oggi (comportamento precedente)', () => {
  const b = parseBoard(board(row(1, '05:19'), row(2, '05:47')), '816', 'P');
  assert.deepEqual(b.trains.map((t) => t.day), [0, 0]);
});

test('ritardo "RIT." senza minuti -> delay null, non 0', () => {
  const b = parseBoard(board(row(1, '05:19', 'RIT.', 'IN RITARDO - DELAYED'), row(2, '05:47', '3'), row(3, '06:17')), '816', 'P');
  assert.equal(b.trains[0].delay, null);
  assert.equal(b.trains[0].ritardoRaw, 'RIT.');
  assert.equal(b.trains[1].delay, 3);
  assert.equal(b.trains[2].delay, 0);
});

test('soppressione: riconosciuta in colonne diverse ("Soppr.", "SOPPRESSO", "Cancelled")', () => {
  const b = parseBoard(board(
    row(1, '22:40', 'SOPPR.'),
    row(2, '22:50', '', 'TRENO SOPPRESSO'),
    row(3, '23:00', '', 'Cancelled'),
    row(4, '23:10', '2'),
    row(5, '23:20', '', 'Ferma a: TORRE A.TA - OPLONTI (23:30), SORRENTO (23:59)'),
  ), '3', 'P', 22 * 60 + 30);
  assert.deepEqual(b.trains.map((t) => t.cancelled), [true, true, true, false, false]);
});
