import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.js';

const ENV = { ALLOWED_ORIGINS: 'https://anyobj.github.io' };
const call = (qs, headers = {}) => worker.fetch(new Request('https://w.example/' + qs, { headers }), ENV);

test('id fuori catalogo: 404 senza interrogare EAV', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('EAV non doveva essere chiamato'); };
  try {
    const res = await call('?stazione=9999&tipo=P');
    assert.equal(res.status, 404);
    assert.match((await res.json()).error, /sconosciuta/i);
  } finally { globalThis.fetch = real; }
});

test('parametri non validi: 400', async () => {
  assert.equal((await call('?stazione=abc&tipo=P')).status, 400);
  assert.equal((await call('?stazione=3&tipo=X')).status, 400);
});

test('origine non autorizzata: 403; autorizzata: header CORS', async () => {
  assert.equal((await call('?stazione=3', { Origin: 'https://evil.example' })).status, 403);
  const ok = await worker.fetch(new Request('https://w.example/?stazione=9999', { method: 'OPTIONS', headers: { Origin: 'https://anyobj.github.io' } }), ENV);
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), 'https://anyobj.github.io');
});
