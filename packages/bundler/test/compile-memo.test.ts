import { compileTsrxModule } from '@markless/compiler';
import { expect, test } from 'vitest';

// A dev server asks for the same module twice - the plain import and the
// `?markless-symbols` request - and every module that re-exports through a
// package barrel is compiled again just to read its interface. One compile has
// to serve all of them, and only for the exact input it was asked for.

const filename = '/virtual/compile-memo/Counter.tsrx';
const source = `import { state } from '@markless/core';
export function Counter() @{
	let count = state(0);
	<button onClick={() => count++}>{count}</button>
}`;

function input(overrides: Record<string, unknown> = {}) {
	return { filename, source, buildId: 'memo-test', symbols: [], ...overrides };
}

test('one compile serves every request for the same module input', async () => {
	const first = await compileTsrxModule(input());
	const second = await compileTsrxModule(input());
	expect(second).toBe(first);
});

test('a request the memo has not seen compiles on its own', async () => {
	const compiled = await compileTsrxModule(input());
	const edited = await compileTsrxModule(input({ source: `${source}\n// edited` }));
	expect(edited).not.toBe(compiled);
	// Every non-source field of the input is part of the key too: serving one
	// posture's output to the other would ship the wrong module.
	const withoutAuthoredSource = await compileTsrxModule(input({ omitAuthoredSource: true }));
	expect(withoutAuthoredSource).not.toBe(compiled);
	const otherBuild = await compileTsrxModule(input({ buildId: 'memo-test-2' }));
	expect(otherBuild).not.toBe(compiled);
});

test('two requests that race collapse onto one compile', async () => {
	const [left, right] = await Promise.all([
		compileTsrxModule(input({ buildId: 'memo-test-race' })),
		compileTsrxModule(input({ buildId: 'memo-test-race' })),
	]);
	expect(right).toBe(left);
});
