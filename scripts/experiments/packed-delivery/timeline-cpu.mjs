import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [input, destination] = process.argv.slice(2);
assert.ok(input && destination, 'Usage: timeline-cpu.mjs results.json summary.json');
const result = JSON.parse(await readFile(input, 'utf8'));
const sources = new Map();
async function describe(frame) {
  const url = frame.url ? new URL(frame.url).pathname : '';
  if (!url.startsWith('/markless/build/')) return { ...frame, url };
  if (!sources.has(url)) {
    const source = await readFile(result.metadata.output + '/public' + url.replace('/markless/', '/'), 'utf8');
    sources.set(url, { lines: source.split('\n'), sha256: createHash('sha256').update(source).digest('hex') });
  }
  const { lines, sha256 } = sources.get(url);
  if (frame.lineNumber === undefined || frame.columnNumber === undefined)
    return { ...frame, url, sourceSha256: sha256, sourceUnavailable: 'trace omits line or column' };
  const line = lines[frame.lineNumber];
  assert.ok(Number.isInteger(frame.lineNumber) && Number.isInteger(frame.columnNumber) && frame.lineNumber >= 0 && frame.columnNumber >= 0 && line !== undefined && frame.columnNumber <= line.length, 'Source position outside emitted file');
  return { ...frame, url, sourceSha256: sha256, source: line.slice(Math.max(0, frame.columnNumber - 40), frame.columnNumber + 480) };
}

function union(intervals) {
  let total = 0, end = -Infinity;
  for (const [start, stop] of intervals.sort((a, b) => a[0] - b[0])) {
    total += Math.max(0, stop - Math.max(start, end));
    end = Math.max(end, stop);
  }
  return total / 1000;
}

const records = [];
for (const record of result.records) {
  assert.equal(record.passed, true);
  for (const phase of record.phases.filter(p => p.name !== 'before-input')) {
    const { traceEvents: events } = JSON.parse(await readFile(phase.traceFile, 'utf8'));
    const mark = name => {
      const matches = events.filter(e => e.name === 'markless-probe-' + name);
      assert.ok(matches.length <= 1, 'Duplicate input boundary: ' + name);
      return matches[0];
    };
    const click = mark('click'), mutation = mark('mutation'), pointer = mark('pointerover') ?? mark('pointerdown');
    assert.ok(click && mutation && pointer && click.ts < mutation.ts && pointer.ts <= click.ts);
    const profiles = events.filter(e => e.name === 'Profile' && e.pid === click.pid && e.tid === click.tid);
    assert.equal(profiles.length, 1);
    const profile = profiles[0], nodes = new Map(), samples = [];
    let timestamp = profile.args.data.startTime;
    for (const chunk of events.filter(e => e.name === 'ProfileChunk' && e.pid === profile.pid && e.id === profile.id)) {
      const data = chunk.args.data;
      for (const node of data.cpuProfile?.nodes ?? []) nodes.set(node.id, node);
      const ids = data.cpuProfile?.samples ?? [];
      assert.equal(ids.length, data.timeDeltas?.length ?? 0);
      for (let i = 0; i < ids.length; i++) {
        assert.ok(Number.isFinite(data.timeDeltas[i]));
        timestamp += data.timeDeltas[i];
        samples.push({ node: ids[i], start: timestamp });
      }
    }
    assert.ok(samples.length > 0);
    samples.sort((a, b) => a.start - b.start);
    for (let index = 0; index < samples.length - 1; index++) samples[index].end = samples[index + 1].start;
    samples.at(-1).end = samples.at(-1).start;
    assert.ok(samples[0].start < pointer.ts && samples.at(-1).end > mutation.ts);
    for (const [name, start, end] of [['pre-click', pointer.ts, click.ts], ['click-to-mutation', click.ts, mutation.ts]]) {
      const totals = new Map(), inclusive = new Map(), frames = new Map();
      const keyOf = frame => JSON.stringify([frame.url ? new URL(frame.url).pathname : '', frame.functionName, frame.lineNumber, frame.columnNumber]);
      let sampleCount = 0, sampledDuration = 0;
      for (const sample of samples) {
        const duration = Math.max(0, Math.min(sample.end, end) - Math.max(sample.start, start));
        if (!duration) continue;
        sampleCount++;
        sampledDuration += duration;
        const node = nodes.get(sample.node);
        assert.ok(node);
        const key = keyOf(node.callFrame);
        totals.set(key, (totals.get(key) ?? 0) + duration);
        const visited = new Set();
        for (let parent = node; parent; parent = nodes.get(parent.parent)) {
          const id = keyOf(parent.callFrame);
          frames.set(id, parent.callFrame);
          if (!visited.has(id)) inclusive.set(id, (inclusive.get(id) ?? 0) + duration);
          visited.add(id);
        }
      }
      assert.equal(sampledDuration, end - start, 'Sample intervals must partition the input window');
      const top = async map => Promise.all([...map].sort((a, b) => b[1] - a[1]).slice(0, 35).map(async ([key, time]) => ({ sampledMs: time / 1000, ...await describe(frames.get(key)) })));
      const intervals = new Map();
      for (const event of events) {
        if (event.ph !== 'X' || event.pid !== click.pid || event.tid !== click.tid || event.ts >= end || event.ts + event.dur <= start) continue;
        const ranges = intervals.get(event.name) ?? [];
        ranges.push([Math.max(start, event.ts), Math.min(end, event.ts + event.dur)]);
        intervals.set(event.name, ranges);
      }
      records.push({ test: record.test, sample: record.sample, phase: phase.name, window: name, durationMs: (end - start) / 1000, sampleCount, self: await top(totals), inclusive: await top(inclusive), timeline: [...intervals].map(([name, ranges]) => ({ name, unionMs: union(ranges) })).sort((a, b) => b.unionMs - a.unionMs) });
    }
  }
}
await writeFile(destination, JSON.stringify({ input, metadata: result.metadata, limitation: 'Sample intervals approximate time attribution; nested inclusive times overlap. Timeline union is per event name, not additive across names. Profiles perturb execution and are not latency comparisons.', records }, null, 2) + '\n');
for (const record of records.filter(r => r.window === 'click-to-mutation')) console.log(JSON.stringify({ sample: record.sample, phase: record.phase, windowMs: record.durationMs, top: record.self.slice(0, 8).map(({ functionName, sampledMs, source }) => ({ functionName, sampledMs, source })), timeline: record.timeline.slice(0, 5) }));
