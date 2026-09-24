import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [input, destination] = process.argv.slice(2);
assert.ok(input && destination, 'Usage: scalar-payload-counts.mjs coverage.json counts.json');
const coverage = JSON.parse(await readFile(input, 'utf8'));
const sources = new Map(), records = [];
let recognized = 0;
for (const record of coverage.records) {
  assert.equal(record.passed, true);
  const phases = [];
  for (const phase of record.phases) {
    const readers = [];
    for (const script of phase.scripts) {
      if (!sources.has(script.url)) {
        const source = await readFile(coverage.metadata.output + '/public' + script.url.replace('/markless/', '/'), 'utf8');
        assert.equal(createHash('sha256').update(source).digest('hex'), script.sha256);
        sources.set(script.url, source);
      }
      const source = sources.get(script.url);
      for (const fn of script.functions) {
        const range = fn.ranges[0], body = source.slice(range.startOffset, range.endOffset);
        if (!body.startsWith('function ') || body.length >= 250 || !body.includes('querySelector(`script[type="${') || !body.includes('textContent;return ') || !body.includes('JSON.parse')) continue;
        recognized++;
        readers.push({ url: script.url, sha256: script.sha256, start: range.startOffset, end: range.endOffset, body, calls: range.count });
      }
    }
    phases.push({ name: phase.name, readerCalls: readers.reduce((n, r) => n + r.calls, 0), readers });
  }
  records.push({ test: record.test, sample: record.sample, phases });
}
assert.ok(recognized > 0, 'No emitted scalar payload reader recognized');
await writeFile(destination, JSON.stringify({ input, limitation: 'Entry counts of the source-identified scalar payload reader, not full-resume JSON parses or CPU time.', records }, null, 2) + '\n');
for (const record of records.filter(r => r.sample === 0)) console.log(JSON.stringify({ test: record.test, phases: record.phases.map(({ name, readerCalls }) => ({ name, readerCalls })) }));
