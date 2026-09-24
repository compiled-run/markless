import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../website/package.json', import.meta.url));
const { evaluatePreloadIntegrity } = await import(require.resolve('@markless/analyzer'));
const [baselinePath, packedPath, outputPath, comparison = 'combined'] = process.argv.slice(2);
if (!baselinePath || !packedPath || !outputPath || !['combined', 'packing-only'].includes(comparison)) throw Error('Usage: report.mjs baseline.json packed.json report.md [combined|packing-only]');
const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
const packed = JSON.parse(await readFile(packedPath, 'utf8'));
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2 : null;
};
const stats = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const mid = median(sorted);
  return { count: sorted.length, median: mid, p95: sorted[Math.ceil(sorted.length * .95) - 1] ?? null, mad: mid === null ? null : median(sorted.map(x => Math.abs(x - mid))) };
};
function summarize(data) {
  const groups = new Map();
  for (const row of data.records) {
    const key = `${row.test}/${row.condition}`;
    const rows = groups.get(key) ?? [];
    rows.push(row); groups.set(key, rows);
  }
  return [...groups].map(([key, rows]) => {
    const first = rows.map(row => row.actions[0]);
    const failures = rows.filter(row => row.failure || row.actions.some(action => action.observationFailed)).length;
    const integrity = rows.map(row => {
      const click = row.actions[0]?.click?.epochMs;
      const end = row.actions[0]?.result?.epochMs ?? Infinity;
      return evaluatePreloadIntegrity({
        baseUrl: row.requests.find(request => request.type === 'Document').url,
        actionKind: 'interaction', declaredPreloads: [],
        observedRequests: row.requests.filter(request => request.startEpochMs <= end).map(request => ({
          url: request.url, resourceType: request.type.toLowerCase(),
          phase: request.startEpochMs > click ? 'action' : 'bootstrap', actionId: row.test,
        })),
      });
    });
    return { key, visits: rows.length, failures, first: stats(first.map(action => action?.latencyMs)),
      repeated: stats(rows.flatMap(row => row.actions.slice(1).map(action => action.latencyMs))),
      scripts: stats(rows.map(row => row.scriptRequests)),
      frameworkScripts: stats(rows.map(row => row.requests.filter(request => request.type === 'Script' && new URL(request.url).pathname.startsWith('/markless/build/')).length)),
      scriptTransferBytes: stats(rows.map(row => row.requests.filter(request => request.type === 'Script').reduce((sum, request) => sum + (request.encodedDataLength ?? 0), 0))),
      pendingScriptsAtFirstInput: stats(first.map(action => action?.scriptRequestsInFlightAtClick?.length)),
      httpCacheHits: rows.flatMap(row => row.requests.filter(request => /^https?:/.test(request.url) && (request.fromDiskCache || request.fromServiceWorker || request.servedFromCache))).length,
      pageErrors: rows.flatMap(row => row.errors), integrity,
    };
  });
}
const before = summarize(baseline), after = summarize(packed);
const fmt = value => value === null ? '—' : value.toFixed(1);
const context = comparison === 'packing-only'
  ? 'Both builds use current early event capture and destination intent preloading. The controlled option is experimentalNativePacking, including its compiler import emission and native bundle grouping.'
  : 'The baseline predates early event capture; the comparison covers the combined packing, intent-preload and capture changes.';
let markdown = `# ${comparison === 'packing-only' ? 'Packing-only' : 'Cold'} docs comparison\n\nGenerated from actual Nitro builds in Chrome. Fresh context per first interaction; HTTP cache disabled; service workers blocked. HTTP/2 over local TLS, Brotli quality 5 for JS and HTML. Constrained: 150 ms RTT, 5 Mbps down, 1 Mbps up, 4× CPU. Ten visits per route/condition; three actions per successful visit.\n\nFirst-response timing is captured trusted click to expected DOM mutation, not compositor presentation. p95 uses nearest rank; with ten samples it is the largest observation. ${context}\n\n| Route / condition | Failed visits before → after | Framework JS requests before → after | First median ms before → after | First p95 ms before → after | Median JS transfer KiB before → after |\n|---|---:|---:|---:|---:|---:|\n`;
for (const next of after) {
  const prior = before.find(row => row.key === next.key);
  markdown += `| ${next.key} | ${prior.failures}/${prior.visits} → ${next.failures}/${next.visits} | ${fmt(prior.frameworkScripts.median)} → ${fmt(next.frameworkScripts.median)} | ${fmt(prior.first.median)} → ${fmt(next.first.median)} | ${fmt(prior.first.p95)} → ${fmt(next.first.p95)} | ${fmt(prior.scriptTransferBytes.median / 1024)} → ${fmt(next.scriptTransferBytes.median / 1024)} |\n`;
  next.meaningfulThresholdMs = Math.max(10, (prior.first.median ?? 0) * .1, 2 * Math.max(prior.first.mad ?? 0, next.first.mad ?? 0));
  next.firstMedianChangeMs = prior.first.median === null || next.first.median === null ? null : next.first.median - prior.first.median;
}
markdown += `\nThe site also requests three small scripts outside the framework packs. HTTP cache hits: baseline ${before.reduce((sum,row)=>sum+row.httpCacheHits,0)}, packed ${after.reduce((sum,row)=>sum+row.httpCacheHits,0)}.\n\nRaw baseline: ${baselinePath}\n\nRaw packed: ${packedPath}\n\nThe companion JSON retains MAD, repeat timings, pending script counts, page errors and analyzer preload-integrity evaluations. Those evaluations check action-window fetches; they do not prove that an in-flight preload had finished before input. This comparison does not establish earliest-exposure, failed-delivery, offline or navigation acceptance.\n`;
await writeFile(outputPath, markdown);
await writeFile(outputPath.replace(/\.md$/, '.json'), JSON.stringify({ comparison, baseline: { metadata: baseline.metadata, groups: before }, packed: { metadata: packed.metadata, groups: after } }, null, 2));
console.log(markdown);
