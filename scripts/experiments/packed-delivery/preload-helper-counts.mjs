import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [input, destination] = process.argv.slice(2);
assert.ok(input && destination, 'Usage: preload-helper-counts.mjs coverage.json counts.json');
const coverage = JSON.parse(await readFile(input, 'utf8'));
const sources = new Map(), records = [];
let recognized = 0;
for (const record of coverage.records) {
  assert.equal(record.passed, true);
  const phases = [];
  for (const phase of record.phases) {
    const helpers = [];
    for (const script of phase.scripts) {
      if (!sources.has(script.url)) {
        const source = await readFile(coverage.metadata.output + '/public' + script.url.replace('/markless/', '/'), 'utf8');
        assert.equal(createHash('sha256').update(source).digest('hex'), script.sha256);
        sources.set(script.url, source);
      }
      const source = sources.get(script.url);
      for (const fn of script.functions) {
        const range = fn.ranges[0], body = source.slice(range.startOffset, range.endOffset);
        if (!body.startsWith('function(') || body.length >= 3000 || !body.includes('meta[property=csp-nonce]') || !body.includes('vite:preloadError')) continue;
        recognized++;
        helpers.push({ url: script.url, sha256: script.sha256, start: range.startOffset, end: range.endOffset, calls: range.count });
      }
    }
    phases.push({ name: phase.name, helperCalls: helpers.reduce((n, h) => n + h.calls, 0), helpers });
  }
  records.push({ test: record.test, sample: record.sample, phases });
}
assert.ok(recognized > 0, 'No emitted Vite preload helper recognized');
await writeFile(destination, JSON.stringify({ input, limitation: 'Invocation counts of the recognized emitted Vite CSS preload helper, not network requests or CPU time.', records }, null, 2) + '\n');
for (const record of records.filter(r => r.sample === 0)) console.log(JSON.stringify({ test: record.test, phases: record.phases.map(({ name, helperCalls }) => ({ name, helperCalls })) }));
