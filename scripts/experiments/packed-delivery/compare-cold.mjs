import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const [beforeFile, afterFile, destination] = process.argv.slice(2);
assert.ok(beforeFile && afterFile && destination, 'Usage: compare-cold.mjs before.json after.json comparison.json');
const files = { before: beforeFile, after: afterFile };
const data = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([label, path]) => [label, JSON.parse(await readFile(path, 'utf8'))])));
const median = values => {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  assert.ok(sorted.length);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const summarize = samples => {
  const value = median(samples);
  const sorted = [...samples].sort((a, b) => a - b);
  return { median: value, p95: sorted[Math.ceil(sorted.length * 0.95) - 1], mad: median(samples.map(sample => Math.abs(sample - value))), samples };
};
assert.deepEqual(data.before.metadata.options, data.after.metadata.options);
assert.deepEqual(data.before.metadata.cases, data.after.metadata.cases);
assert.equal(data.before.metadata.browserVersion, data.after.metadata.browserVersion);
const network = {};
for (const [label, result] of Object.entries(data)) {
  const summary = { visits: result.records.length, actions: 0, httpCacheHits: 0, failures: [], frameworkRequests: [], frameworkEncodedBytes: [], clicksWithPendingScripts: 0, actionStartedScripts: 0 };
  for (const record of result.records) {
    assert.equal(record.failure, undefined);
    assert.deepEqual(record.errors, []);
    assert.equal(record.serviceWorkerController, false);
    assert.equal(record.actions.length, 3);
    const requests = record.requests.filter(request => /^https?:/.test(request.url));
    summary.httpCacheHits += requests.filter(r => r.servedFromCache || r.fromDiskCache || r.fromServiceWorker).length;
    summary.failures.push(...requests.filter(r => r.failure || r.status >= 400));
    const framework = requests.filter(r => r.type === 'Script' && r.url.includes('/markless/build/'));
    summary.frameworkRequests.push(framework.length);
    summary.frameworkEncodedBytes.push(framework.reduce((total, r) => total + r.encodedDataLength, 0));
    for (const action of record.actions) {
      assert.equal(action.observationFailed, false);
      assert.ok(Number.isFinite(action.latencyMs) && action.latencyMs >= 0);
      summary.actions++;
      summary.clicksWithPendingScripts += Number(action.scriptRequestsInFlightAtClick.length > 0);
      summary.actionStartedScripts += action.scriptRequestsStartedAfterClick.length;
    }
  }
  assert.equal(summary.httpCacheHits, 0);
  assert.deepEqual(summary.failures, []);
  assert.deepEqual([...new Set(summary.frameworkRequests)], [5]);
  network[label] = summary;
}
const rows = [];
for (const test of data.before.metadata.cases) for (const condition of data.before.metadata.options.conditions) for (let action = 0; action < 3; action++) {
  const sides = {};
  for (const [label, result] of Object.entries(data)) {
    const records = result.records.filter(r => r.test === test && r.condition === condition);
    assert.equal(records.length, result.metadata.options.samples);
    sides[label] = summarize(records.map(r => r.actions[action].latencyMs));
  }
  const threshold = Math.max(10, sides.before.median * 0.1, 2 * Math.max(sides.before.mad, sides.after.mad));
  const improvement = sides.before.median - sides.after.median;
  rows.push({ test, condition, action: action + 1, ...sides, threshold, improvement, meaningful: Math.abs(improvement) > threshold });
}
await writeFile(destination, JSON.stringify({ files, protocol: 'median comparison; meaningful when absolute delta exceeds max(10ms,10% before median,2*larger MAD); click-to-mutation, not paint', metadata: { before: data.before.metadata, after: data.after.metadata }, network, rows }, null, 2) + '\n');
for (const row of rows) console.log(JSON.stringify({ test: row.test, condition: row.condition, action: row.action, before: row.before.median, after: row.after.median, threshold: row.threshold, meaningful: row.meaningful }));
