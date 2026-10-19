import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndex } from '../../docs/logic.js';

const catalogo = JSON.parse(readFileSync(new URL('../../docs/stazioni.json', import.meta.url), 'utf8'));

test('"NAPOLI P.N." (abbreviazione dei tabelloni) e "NAPOLI PORTA NOLANA" sono la stessa stazione', () => {
  const idx = buildIndex(catalogo);
  assert.equal(idx.resolve('NAPOLI P.N.'), '1');
  assert.equal(idx.resolve('NAPOLI PORTA NOLANA'), '1');
});
