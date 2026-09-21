import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdirSync, readFileSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';

export const provider = Object.freeze({ endpoint: 'https://api.typesafe.ai/v1/systemone', model: 'jev-1.13.0', inputUSDPerToken: 0.042 / 1_000_000, maximumInputTokens: 65_536 });
export const requestReserveUSD = provider.maximumInputTokens * provider.inputUSDPerToken;
export const choice = (instructions, criteria) => ({ type: 'choice', instructions, criteria });

export function createJev({ apiKey, ledgerPath = '/tmp/jev-experiments/api.jsonl', capUSD = 1, fetchImpl = fetch } = {}) {
  const key = apiKey ?? process.env.TYPESAFE_API_KEY ?? readFileSync('/Users/jacksm5pro/.config/typesafe/api-key', 'utf8').trim();
  assert.ok(key && !/\s/.test(key), 'A valid key is required');
  assert.ok(capUSD > 0 && capUSD <= 1, 'Cap must be positive and no more than $1');
  mkdirSync(dirname(ledgerPath), { recursive: true });
  const records = () => existsSync(ledgerPath) ? readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
  const log = value => appendFileSync(ledgerPath, JSON.stringify(value) + '\n', { mode: 0o600 });
  return {
    async ask({ state, questions }, tag) {
      assert.ok(!JSON.stringify({ state, questions }).includes(key), 'Credential must not be part of model input');
      const lockPath = `${ledgerPath}.lock`;
      const lock = openSync(lockPath, 'wx', 0o600);
      let id;
      try {
        const attempted = records().filter(r => r.kind === 'start').length;
        assert.ok((attempted + 1) * requestReserveUSD <= capUSD, 'Conservative API budget exhausted');
        id = attempted + 1;
        log({ kind: 'start', id, tag, at: new Date().toISOString(), reserveUSD: requestReserveUSD, request: { model: provider.model, state, questions } });
      } finally {
        closeSync(lock);
        unlinkSync(lockPath);
      }
      const start = performance.now();
      let status;
      try {
        const wire = await fetchImpl(provider.endpoint, { method: 'POST', redirect: 'error', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: provider.model, state, questions }), signal: AbortSignal.timeout(15_000) });
        status = wire.status;
        assert.ok(wire.ok, `Jev HTTP ${status}`);
        const response = await wire.json();
        assert.equal(response.model, provider.model, 'Unexpected response model');
        assert.ok(Number.isSafeInteger(response.usage?.input_tokens) && response.usage.input_tokens >= 0 && response.usage.input_tokens <= provider.maximumInputTokens, 'Invalid response usage');
        for (const [name, question] of Object.entries(questions)) {
          const answer = response.answers?.[name];
          assert.equal(answer?.type, question.type, 'Invalid response answer type');
          if (question.type === 'choice') {
            assert.ok(Object.hasOwn(question.criteria, answer.choice), 'Invalid response choice');
            assert.deepEqual(Object.keys(answer.probabilities).sort(), Object.keys(question.criteria).sort());
            const probabilities = Object.values(answer.probabilities);
            assert.ok(probabilities.every(p => Number.isFinite(p) && p >= 0 && p <= 1));
            assert.ok(Math.abs(probabilities.reduce((a, b) => a + b, 0) - 1) <= 0.02);
          }
        }
        log({ kind: 'result', id, tag, status, milliseconds: performance.now() - start, costUSD: response.usage.input_tokens * provider.inputUSDPerToken, response });
        return response;
      } catch (error) {
        log({ kind: 'error', id, tag, status, milliseconds: performance.now() - start, errorType: error.constructor.name });
        throw new Error(`Jev request ${id} failed (${status ?? 'transport/validation'}); reservation retained`, { cause: { type: error.constructor.name } });
      }
    },
    usage() {
      const rows = records();
      return { attempts: rows.filter(r => r.kind === 'start').length, successes: rows.filter(r => r.kind === 'result').length, reservedUSD: rows.filter(r => r.kind === 'start').length * requestReserveUSD, reportedUSD: rows.filter(r => r.kind === 'result').reduce((sum, r) => sum + r.costUSD, 0) };
    },
  };
}
