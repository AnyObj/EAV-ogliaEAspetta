// Soppressioni VERE, registrate dal monitor il 25/09/2026 (Soccavo, partenze, Circumflegrea): EAV le scrive
// con "SOPPRESSO" nella colonna del ritardo e "SOPPRESSO -" in "informazioni", riga gialla, senza binario.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBoard } from '../parse.js';

const html = readFileSync(new URL('./fixtures/montesanto-circumflegrea-soppressi.html', import.meta.url), 'utf8');
const b = parseBoard(html, '821', 'P');
const byNum = (n) => b.trains.find((t) => t.num === n);

test('soppressioni reali: i tre treni con SOPPRESSO risultano cancelled', () => {
  for (const n of ['5143', '5148', '5147']) {
    const t = byNum(n);
    assert.ok(t, 'treno ' + n + ' presente');
    assert.equal(t.cancelled, true, n + ' soppresso');
    assert.equal(t.delay, null, n + ' senza ritardo');
    assert.equal(t.platform, null, n + ' senza binario');
  }
});

test('soppressioni reali: gli altri treni non sono toccati', () => {
  const altri = b.trains.filter((t) => !['5143', '5148', '5147'].includes(t.num));
  assert.equal(altri.length, b.trains.length - 3);
  assert.ok(altri.every((t) => t.cancelled === false));
  assert.equal(byNum('5152').platform, '2');
});
