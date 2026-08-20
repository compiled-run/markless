import { expect, test } from 'vitest';
import { buildSemanticGraph } from '../src/index.ts';

const CODE = 'MARKLESS_EVENT_SPREAD_SHADOWED';

const shadowedSource = `
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

// Alternate shape: different component, tag, rest name, and event, so the guard
// cannot be reading fixture particulars.
const alternateShadowedSource = `
export function Field({ label, ...forwarded }) @{
	<input {...forwarded} onInput={(event) => { track(event); }} />
}
`;

const alternateComposedSource = `
export function Field({ label, onInput, ...forwarded }) @{
	<input {...forwarded} onInput={(event) => { track(event); onInput?.(event); }} />
}
`;

async function codes(filename: string, source: string) {
	const graph = await buildSemanticGraph({ filename, source });
	return graph.diagnostics.filter((item) => item.code === CODE);
}

test('an element spreading props and writing its own handler for the same event fails the build', async () => {
	const found = await codes('src/Trigger.tsrx', shadowedSource);

	expect(found).toHaveLength(1);
	expect(found[0]).toEqual(
		expect.objectContaining({
			code: CODE,
			severity: 'error',
			phase: 'semantic-graph',
			title: 'A spread event prop would be shadowed',
			primarySpan: expect.objectContaining({
				start: shadowedSource.indexOf('onClick={'),
			}),
		}),
	);
	// The message names what could be dropped and where it came from.
	expect(found[0]?.message).toContain('onClick');
	expect(found[0]?.message).toContain('rest');
	expect(found[0]?.message).toContain('Trigger');
	// The fix is spelled out as a destructure plus a call.
	expect(found[0]?.suggestions[0]?.message).toContain('onClick, ...rest');
	expect(found[0]?.suggestions[0]?.message).toContain('onClick?.(event)');
});

test('destructuring the event prop out of the spread clears the guard', async () => {
	expect(await codes('src/Trigger.tsrx', composedSource)).toEqual([]);
});

test('a spread with no handler of its own, and a handler with no spread, both stay clear', async () => {
	expect(await codes('src/Panel.tsrx', spreadOnlySource)).toEqual([]);
	expect(await codes('src/Panel.tsrx', handlerOnlySource)).toEqual([]);
});

test('a spread of the author own object carries no consumer props and is not flagged', async () => {
	expect(await codes('src/Panel.tsrx', localObjectSpreadSource)).toEqual([]);
});

test('the guard reads structure, not names: a different part, tag, rest and event behave the same', async () => {
	const found = await codes('src/Field.tsrx', alternateShadowedSource);

	expect(found).toHaveLength(1);
	expect(found[0]?.message).toContain('onInput');
	expect(found[0]?.message).toContain('forwarded');
	expect(await codes('src/Field.tsrx', alternateComposedSource)).toEqual([]);
});
