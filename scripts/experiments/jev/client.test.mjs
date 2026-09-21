import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJev, choice, requestReserveUSD } from './client.mjs';

const payload = { state: { visible: true }, questions: { result: choice('Pick', { yes: 'visible', no: 'hidden' }) } };
const good = () => new Response(JSON.stringify({ model: 'jev-1.13.0', usage: { input_tokens: 20, output_tokens: 0 }, answers: { result: { type: 'choice', choice: 'yes', confidence: 1, probabilities: { yes: 1, no: 0 } } } }), { status: 200 });
const ledger = () => join(mkdtempSync(join(tmpdir(), 'jev-client-')), 'ledger.jsonl');

test('budget reservation survives failures and process restarts; no implicit retries', async () => {
  const path = ledger();
  let calls = 0;
  const client = createJev({ apiKey: 'offline-secret', ledgerPath: path, capUSD: requestReserveUSD, fetchImpl: async () => { calls++; return new Response('{}', { status: 503 }); } });
  await assert.rejects(client.ask(payload, 'failure'), /503/);
  assert.equal(calls, 1);
  const restarted = createJev({ apiKey: 'offline-secret', ledgerPath: path, capUSD: requestReserveUSD, fetchImpl: async () => { calls++; return good(); } });
  await assert.rejects(restarted.ask(payload, 'second'), /budget/);
  assert.equal(calls, 1);
  assert.ok(!readFileSync(path, 'utf8').includes('offline-secret'));
});

test('rejects malformed successful data before returning a decision', async () => {
  const client = createJev({ apiKey: 'offline-secret', ledgerPath: ledger(), fetchImpl: async () => new Response('{}', { status: 200 }) });
  await assert.rejects(client.ask(payload, 'malformed'), { cause: { type: 'AssertionError' } });
});

test('sends only to official origin without redirects and validates choices', async () => {
  const client = createJev({ apiKey: 'offline-secret', ledgerPath: ledger(), fetchImpl: async (url, options) => {
    assert.equal(new URL(url).origin, 'https://api.typesafe.ai');
    assert.equal(options.redirect, 'error');
    return good();
  } });
  const response = await client.ask(payload, 'valid');
  assert.equal(response.answers.result.choice, 'yes');
});
