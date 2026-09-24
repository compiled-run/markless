#!/usr/bin/env node
// Checks the coverage math on hand-built V8 coverage entries (no browser).
import assert from 'node:assert/strict';
import { classify, countSet, executedMask, orInto, scriptLength, uncalledFunctions } from './lib/ranges.mjs';

// Script of 100 chars: top level runs; f (10..40) never called; g (50..90) called, its inner block 60..70 not taken.
const fns = [
	{ functionName: '', ranges: [{ startOffset: 0, endOffset: 100, count: 1 }] },
	{ functionName: 'f', ranges: [{ startOffset: 10, endOffset: 40, count: 0 }] },
	{ functionName: 'g', ranges: [{ startOffset: 50, endOffset: 90, count: 1 }, { startOffset: 60, endOffset: 70, count: 0 }] },
];
assert.equal(scriptLength(fns), 100);
const boot = executedMask(fns, 100);
assert.equal(countSet(boot), 100 - 30 - 10);
assert.deepEqual(uncalledFunctions(fns, boot).map((f) => f.name), ['f']);

// A later snapshot where only f ran (counters were reset, so the rest reads 0).
const later = executedMask(
	[
		{ functionName: '', ranges: [{ startOffset: 0, endOffset: 100, count: 0 }] },
		{ functionName: 'f', ranges: [{ startOffset: 10, endOffset: 40, count: 1 }] },
	],
	100,
);
assert.equal(countSet(later), 30);
const c = classify({ length: 100, boot, control: later, sizes: { decoded: 1000 } });
assert.equal(c.fractions.boot, 0.6);
assert.equal(c.fractions.control, 0.3);
assert.ok(Math.abs(c.fractions.never - 0.1) < 1e-9);
assert.ok(Math.abs(c.bytes.decoded.never - 100) < 1e-9);
assert.equal(countSet(orInto(new Uint8Array(100), boot)), 60);

// Never-evaluated script (modulepreloaded, never imported): everything is waste.
const idle = classify({ length: 50, boot: executedMask([{ functionName: '', ranges: [{ startOffset: 0, endOffset: 50, count: 0 }] }], 50), control: null, sizes: { wire: 20 } });
assert.equal(idle.bytes.wire.never, 20);
console.log('coverage selftest: ok');
