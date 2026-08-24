import { expect, test } from 'vitest';
import { buildSemanticGraph } from '../src/index.ts';

// This file used to pin `MARKLESS_EVENT_SPREAD_SHADOWED`: a part that spread its
// props AND wrote its own handler for the same event failed the build, because
// the consumer's handler arriving inside the spread would be silently dropped.
//
// Owner ruling 2026-08-23 (multi-binding): it is no longer dropped. A
// spread-carried handler MERGES with the part's own - the platform's semantics
// for two listeners on one element, and Qwik's - so the shape that used to be an
// error is now the shape that works, and no diagnostic stands in its way. The
// merge itself is witnessed on the payload in protocol-view-spread.test.ts and
// in the browser in multi-binding.test.ts; what is asserted here is that the
// authoring form compiles clean, in every arrangement the old guard refused.
const SHADOW_CODE = 'MARKLESS_EVENT_SPREAD_SHADOWED';

const mergedSource = `
export function Trigger({ children, ...rest }) @{
	<button {...rest} onClick={(event) => { own(event); }}>{children}</button>
}
`;

const composedSource = `
export function Trigger({ children, onClick, ...rest }) @{
	<button {...rest} onClick={(event) => { own(event); onClick?.(event); }}>{children}</button>
}
`;

const spreadOnlySource = `
export function Panel({ children, ...rest }) @{
	<div {...rest}>{children}</div>
}
`;

const handlerOnlySource = `
export function Panel({ children }) @{
	<div onClick={(event) => { own(event); }}>{children}</div>
}
`;

const localObjectSpreadSource = `
export function Panel({ children }) @{
	const attrs = { title: 'x' };
	<div {...attrs} onClick={(event) => { own(event); }}>{children}</div>
}
`;

// Alternate shape: different component, tag, rest name, and event, so nothing
// here can be reading fixture particulars.
const alternateMergedSource = `
export function Field({ label, ...forwarded }) @{
	<input {...forwarded} onInput={(event) => { track(event); }} />
}
`;

async function diagnostics(filename: string, source: string) {
	const graph = await buildSemanticGraph({ filename, source });
	return graph.diagnostics;
}

test('a part that spreads its props and writes its own handler for the same event compiles', async () => {
	const found = await diagnostics('src/Trigger.tsrx', mergedSource);

	expect(found.filter((item) => item.code === SHADOW_CODE)).toEqual([]);
	expect(found.filter((item) => item.severity === 'error')).toEqual([]);
});

test('the refusal is gone entirely: no diagnostic carries the retired code', async () => {
	const graph = await buildSemanticGraph({ filename: 'src/Trigger.tsrx', source: mergedSource });

	expect(graph.diagnostics.map((item) => item.code)).not.toContain(SHADOW_CODE);
	// The part's own handler is still exactly one record; merging is a payload
	// join with the consumer's edge, not something the part's own graph carries.
	expect(graph.events.map((event) => event.eventName)).toEqual(['click']);
});

test('destructuring the event prop out of the spread stays legal and unchanged', async () => {
	expect(
		(await diagnostics('src/Trigger.tsrx', composedSource)).filter(
			(item) => item.severity === 'error',
		),
	).toEqual([]);
});

test('a spread with no handler of its own, and a handler with no spread, both stay clear', async () => {
	expect(
		(await diagnostics('src/Panel.tsrx', spreadOnlySource)).filter(
			(item) => item.severity === 'error',
		),
	).toEqual([]);
	expect(
		(await diagnostics('src/Panel.tsrx', handlerOnlySource)).filter(
			(item) => item.severity === 'error',
		),
	).toEqual([]);
});

test('a spread of the author own object carries no consumer props and is still fine', async () => {
	expect(
		(await diagnostics('src/Panel.tsrx', localObjectSpreadSource)).filter(
			(item) => item.severity === 'error',
		),
	).toEqual([]);
});

test('structure, not names: a different part, tag, rest and event behave the same', async () => {
	const found = await diagnostics('src/Field.tsrx', alternateMergedSource);

	expect(found.filter((item) => item.code === SHADOW_CODE)).toEqual([]);
	expect(found.filter((item) => item.severity === 'error')).toEqual([]);
});
