import { nonFiniteName } from '@markless/serializer';
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';

// A folded seed is printed as JavaScript, not JSON, so the serializer's name for
// a non-finite number denotes it exactly. The fold used to refuse these outright
// and hand the whole seed to the carried-expression path instead.

const CELL_ID = 'shared:src/seed.tsrx#gate/state:g';

function sharedSource(cap: string) {
	return `
import { shared, state } from '@markless/core';
export const gate = shared(() => {
	const g = state({ minWidth: 1, caps: ${cap}, x: 2, label: '' });
	return { ...g, grow() { g.x = g.x + 1; } };
}, { scope: 'widget' });

export function Root(props) @{
	const g = gate();
	g.label = props.label;

	<div data-root ui-max={g.caps} ui-x={g.x}>{g.label}</div>
}
`;
}

async function compileShared(cap: string) {
	return await compileTsrxModule({
		filename: 'src/seed.tsrx',
		source: sharedSource(cap),
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
}

function evaluate(printed: string | undefined) {
	return new Function(`return (${String(printed)});`)() as Record<string, unknown>;
}

function ssrStateValue(source: string | null | undefined) {
	return /\[".*?#gate\/state:g", (\{.*?\})\]/.exec(source ?? '')?.[1];
}

const CAPS = [
	['Number.POSITIVE_INFINITY', Number.POSITIVE_INFINITY],
	['Number.NEGATIVE_INFINITY', Number.NEGATIVE_INFINITY],
	['Infinity', Number.POSITIVE_INFINITY],
	['-Infinity', Number.NEGATIVE_INFINITY],
	['NaN', Number.NaN],
	['Number.NaN', Number.NaN],
] as const;

for (const [cap, expected] of CAPS) {
	test(`a seed property of ${cap} folds into the constant`, async () => {
		const compiled = await compileShared(cap);
		const records = compiled.renderData.initialValues.filter(
			(initial) => initial.graphNodeId === CELL_ID,
		);

		expect(records.map((record) => record.value.kind)).toEqual(['constant']);
		expect(records[0]?.value).toEqual({
			kind: 'constant',
			value: { minWidth: 1, caps: expected, x: 2, label: '' },
		});
	});

	test(`the render-data module prints ${cap} as the name that denotes it`, async () => {
		const compiled = await compileShared(cap);
		const printed = /"value":\{"kind":"constant","value":(\{.*?\})\}/.exec(
			compiled.publicRenderModule.renderDataModuleSource ?? '',
		)?.[1];

		expect(printed).toBe(`{"minWidth":1,"caps":${nonFiniteName(expected)},"x":2,"label":""}`);
		expect(printed).not.toContain('null');
		expect(evaluate(printed)).toEqual({ minWidth: 1, caps: expected, x: 2, label: '' });
	});

	test(`the SSR static values map prints ${cap} through the same printer`, async () => {
		const compiled = await compileShared(cap);
		const printed = ssrStateValue(compiled.publicRenderModule.ssrModuleSource);

		expect(printed).toBe(`{"minWidth":1,"caps":${nonFiniteName(expected)},"x":2,"label":""}`);
		expect(evaluate(printed)).toEqual({ minWidth: 1, caps: expected, x: 2, label: '' });
	});
}

test('a folded non-finite seed carries no authored expression beside it', async () => {
	const compiled = await compileShared('Number.POSITIVE_INFINITY');
	const ssr = compiled.publicRenderModule.ssrModuleSource ?? '';

	expect(ssr).not.toContain('Number.POSITIVE_INFINITY');
	expect(compiled.renderData.initialValues.map((initial) => initial.value.kind)).not.toContain(
		'symbol-function',
	);
});

test('a finite seed keeps the bytes JSON already printed for it', async () => {
	const compiled = await compileShared('9');
	const expected = JSON.stringify({ minWidth: 1, caps: 9, x: 2, label: '' });

	expect(ssrStateValue(compiled.publicRenderModule.ssrModuleSource)).toBe(expected);
	expect(compiled.publicRenderModule.renderDataModuleSource).toContain(expected);
});

// The direct-DOM CSR path prints its own cell map. It used to drop a whole
// module off that path when any cell held a non-finite number.
async function compileDirect(cap: string) {
	return await compileTsrxModule({
		filename: 'src/Scoreboard.tsrx',
		source: `
import { state } from '@markless/core';

export function Scoreboard() @{
	let score = state({ total: 1, caps: ${cap} });

	<section>
		<button onClick={() => score.total++}>{score.total}</button>
		<p>{score.caps}</p>
	</section>
}
`,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
}

test('the direct-DOM CSR entries keep a non-finite cell on the direct path', async () => {
	const compiled = await compileDirect('Number.POSITIVE_INFINITY');
	const moduleSource = compiled.publicRenderModule.moduleSource ?? '';

	expect(moduleSource).toContain('createMarklessDirectChunkRenderer');
	expect(moduleSource).toContain(
		`const cells = new Map([["state:score", {"total":1,"caps":${nonFiniteName(
			Number.POSITIVE_INFINITY,
		)}}]]);`,
	);
});

test('the direct-DOM CSR entries keep the bytes JSON already printed for a finite cell', async () => {
	const moduleSource = (await compileDirect('9')).publicRenderModule.moduleSource ?? '';

	expect(moduleSource).toContain(
		`const cells = new Map([["state:score", ${JSON.stringify({ total: 1, caps: 9 })}]]);`,
	);
});

// A behavior input still refuses a non-finite literal, and unlike a seed that
// refusal is load-bearing: the view payload is a real JSON script the runtime
// `JSON.parse`s, and it hands `inputValues` to the behavior undecoded, so an
// accepted `1e400` reaches the page as `null`. Lifting this one needs a tagged
// input plus a decoder on both read paths.
test('a behavior input literal that overflows to Infinity records no input value', async () => {
	const compiled = await compileTsrxModule({
		filename: 'src/BehaviorElement.tsrx',
		source: `import { element, state } from '@markless/core'; const install = (cap) => (host) => { host.dataset.cap = String(cap); }; export function App() @{ const label = state('ready'); const box = element(); <section el={box} attach={install(1e400)}>{label}</section> }`,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
	const behavior = compiled.payloadArena.view.behaviors[0];

	expect(behavior?.inputValues).toBeUndefined();
	expect(compiled.payloadScripts.viewScript).not.toContain('"inputValues":[null]');
});

// A folded non-finite seed does reach the page, because the state payload tags
// its cell values before JSON ever sees them.
test('a folded non-finite cell reaches the state payload script as a tagged number', async () => {
	const compiled = await compileDirect('Number.POSITIVE_INFINITY');

	expect(compiled.payloadScripts.stateScript).toContain(
		`["caps",{"$type":"number","value":"${nonFiniteName(Number.POSITIVE_INFINITY)}"}]`,
	);
	expect(compiled.payloadScripts.stateScript).not.toContain('["caps",null]');
});
