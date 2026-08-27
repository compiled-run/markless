import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';

// A `shared()` seed used to fold only bare literals, so a single property written
// as a name or a member expression left the whole cell unfolded. The cell then
// carried a `state-initializer` record into the same component's `initialValues`
// beside the root's per-instance seed writes, where one kind per graph node id
// cannot tell the two apart, and the factory seed overwrote the values the root
// wrote from its props. A seed property that denotes a constant now folds like a
// literal, which puts the factory default back on the `constant` record the
// per-instance seeds are merged onto.

function source(seed: string, extra = '') {
	return `
import { shared, state } from '@markless/core';
const MIN = 1;
const MIN_ALIAS = MIN;
${extra}
export const gate = shared(() => {
	const g = state(${seed});
	return { ...g, grow() { g.x = g.x + 1; } };
}, { scope: 'widget' });

export function Root({ label = 'hi' }: { label?: string }) @{
	const g = gate();
	g.label = label;

	<div data-root ui-x={g.x} ui-min={g.minWidth} ui-label={g.label} />
}
`;
}

async function compile(seedSource: string, extra?: string) {
	return compileTsrxModule({
		filename: 'src/seed.tsrx',
		source: source(seedSource, extra),
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
}

function seedBinding(compiled: Awaited<ReturnType<typeof compile>>) {
	return compiled.semanticGraph.graphBindings.find(
		(binding) => binding.kind === 'state' && binding.sharedDefinitionId !== undefined,
	);
}

function errorCodes(compiled: Awaited<ReturnType<typeof compile>>) {
	return [
		...compiled.stateLowering.diagnostics.filter((one) => one.severity === 'error'),
		...compiled.semanticGraph.diagnostics.filter((one) => one.severity === 'error'),
	].map((one) => one.code);
}

const folds = [
	[
		'a member expression on a global',
		'{ minWidth: 1, maxWidth: Number.MAX_SAFE_INTEGER, x: 2, label: "" }',
		{ minWidth: 1, maxWidth: Number.MAX_SAFE_INTEGER, x: 2, label: '' },
	],
	[
		'a module-scope const',
		'{ minWidth: MIN, maxWidth: 9, x: 2, label: "" }',
		{ minWidth: 1, maxWidth: 9, x: 2, label: '' },
	],
	[
		'a module const written out of another',
		'{ minWidth: MIN_ALIAS, maxWidth: 9, x: 2, label: "" }',
		{ minWidth: 1, maxWidth: 9, x: 2, label: '' },
	],
	[
		'a frozen constant on Math',
		'{ minWidth: 1, maxWidth: Math.PI, x: 2, label: "" }',
		{ minWidth: 1, maxWidth: Math.PI, x: 2, label: '' },
	],
] as const;

for (const [label, seed, folded] of folds) {
	test(`a seed property that is ${label} folds like a literal`, async () => {
		const binding = seedBinding(await compile(seed));

		expect(binding?.initialValueKnown).toBe(true);
		expect(binding?.initialValue).toEqual(folded);
		expect(binding?.initializerSource).toBeUndefined();
	});

	test(`a folded ${label} keeps the factory default on a constant record`, async () => {
		const compiled = await compile(seed);
		const root = compiled.publicRenderModule.componentDefinitions?.find(
			(definition) => definition.name === 'Root',
		);
		const kinds = root?.initialValues.map((initial) => initial.value.kind) ?? [];

		// The runtime primes a per-instance seed off the constant record carrying
		// the same graph node id; without it the root's prop writes have no base.
		expect(kinds[0]).toBe('constant');
		expect(kinds).toContain('symbol-function');
	});
}

// A folded value is printed into the render-data module with JSON, which has no
// form for a non-finite number, so the fold has to leave those on the carry.
test('a non-finite constant is not folded', async () => {
	const binding = seedBinding(
		await compile('{ minWidth: 1, maxWidth: Number.POSITIVE_INFINITY, x: 2, label: "" }'),
	);

	expect(binding?.initialValueKnown).toBeUndefined();
	expect(binding?.initializerSource).toContain('Number.POSITIVE_INFINITY');
});

test('a bare Infinity is not folded either', async () => {
	const binding = seedBinding(
		await compile('{ minWidth: 1, maxWidth: Infinity, x: 2, label: "" }'),
	);

	expect(binding?.initialValueKnown).toBeUndefined();
	expect(binding?.initializerSource).toContain('Infinity');
});

// The fold reads the global, so a module that declares its own `Number` has to
// keep the value that module means.
test('a shadowed global is not folded', async () => {
	const binding = seedBinding(
		await compile(
			'{ minWidth: 1, maxWidth: Number.MAX_SAFE_INTEGER, x: 2, label: "" }',
			'const Number = { MAX_SAFE_INTEGER: 3 };',
		),
	);

	expect(binding?.initialValueKnown).toBeUndefined();
	expect(binding?.initializerSource).toContain('Number.MAX_SAFE_INTEGER');
});

// A method is not a constant this build may read for the page.
test('a function-valued global property is not folded', async () => {
	const binding = seedBinding(
		await compile('{ minWidth: 1, maxWidth: Number.parseInt, x: 2, label: "" }'),
	);

	expect(binding?.initialValueKnown).toBeUndefined();
});

test('a let-declared module value is not folded', async () => {
	const binding = seedBinding(
		await compile('{ minWidth: LOOSE, maxWidth: 9, x: 2, label: "" }', 'let LOOSE = 1;'),
	);

	expect(binding?.initialValueKnown).toBeUndefined();
	expect(binding?.initializerSource).toContain('LOOSE');
});

// Cross-module values stay on the carried-expression path: this build cannot
// read another module's binding.
test('an imported const is still carried, not folded', async () => {
	const binding = seedBinding(
		await compile(
			'{ minWidth: 1, maxWidth: LIMIT, x: 2, label: "" }',
			"import { LIMIT } from './limits.ts';",
		),
	);

	expect(binding?.initialValueKnown).toBeUndefined();
	expect(binding?.initializerSource).toContain('LIMIT');
});

test('a seed naming something nothing would bind is still refused at the seed', async () => {
	const compiled = await compile('{ minWidth: 1, maxWidth: nowhere, x: 2, label: "" }');
	const refusal = compiled.semanticGraph.diagnostics.find(
		(one) => one.code === 'MARKLESS_SHARED_SEED_UNRESOLVED_VALUE',
	);

	expect(refusal?.message).toContain('"gate"');
	expect(refusal?.message).toContain('"maxWidth"');
	expect(refusal?.message).toContain('nowhere');
});

test('a folded seed blames no consumer', async () => {
	const codes = errorCodes(
		await compile('{ minWidth: MIN, maxWidth: Number.MAX_SAFE_INTEGER, x: 2, label: "" }'),
	);

	expect(codes).not.toContain('MARKLESS_SHARED_SEED_UNKNOWN_FIELD');
	expect(codes).not.toContain('MARKLESS_SHARED_SEED_UNRESOLVED_VALUE');
});

// A seed mixing foldable properties with one that cannot fold publishes both
// layers: the folded subset as the constant a per-instance write merges onto,
// and the authored expression beside it for the rest.
const carried = '{ minWidth: MIN, maxWidth: Number.POSITIVE_INFINITY, x: 2, label: "" }';

test('a partly foldable seed folds the properties that fold', async () => {
	const binding = seedBinding(await compile(carried));

	expect(binding?.initialValueKnown).toBeUndefined();
	expect(binding?.initialValue).toEqual({
		minWidth: 1,
		maxWidth: undefined,
		x: 2,
		label: '',
	});
	expect(binding?.initializerSource).toContain('Number.POSITIVE_INFINITY');
});

// The field set of the shape is read off these keys, so an unfoldable property
// has to keep its key rather than disappear from the subset.
test('a carried property keeps its key in the folded subset', async () => {
	const binding = seedBinding(await compile(carried));

	expect(Object.keys(binding?.initialValue as Record<string, unknown>)).toEqual([
		'minWidth',
		'maxWidth',
		'x',
		'label',
	]);
});

test('a partly foldable seed publishes the constant and the carry together', async () => {
	const compiled = await compile(carried);
	const records = compiled.renderData.initialValues.filter(
		(initial) => initial.graphNodeId === seedBinding(compiled)?.id,
	);

	expect(records.map((record) => record.value.kind)).toEqual(['constant', 'symbol-function']);
});

// A shape nobody writes per instance needs no merge base, and a constant standing
// in for it would answer for the live value every reader of the shape is owed.
test('a carried seed no root writes publishes no constant record', async () => {
	const compiled = await compileTsrxModule({
		filename: 'src/seed.tsrx',
		source: `
import { shared, state } from '@markless/core';
export const gate = shared(() => {
	const g = state({ minWidth: 1, maxWidth: Number.POSITIVE_INFINITY });
	return { ...g };
}, { scope: 'widget' });

export function Root() @{
	const g = gate();

	<div data-root ui-min={g.minWidth} />
}
`,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
	const kinds = compiled.renderData.initialValues.map((initial) => initial.value.kind);

	expect(kinds).not.toContain('constant');
});

// Two records under one graph node id cannot both be described by one kind per
// id, so those are keyed by symbol id; the reader falls back to the id key.
test('a node carrying a factory default beside its seeds keys kinds by symbol id', async () => {
	const compiled = await compile(carried);
	const root = compiled.publicRenderModule.componentDefinitions?.find(
		(definition) => definition.name === 'Root',
	);
	const kinds = (root?.initialValueKinds ?? {}) as Record<string, string>;

	expect(Object.keys(kinds).every((key) => key.startsWith('symbol:'))).toBe(true);
	expect(Object.values(kinds)).toContain('state-initializer');
	expect(Object.values(kinds)).toContain('shared-seed');
});

// A folded-only seed offers one symbol record per node, so its kinds keep the
// graph node id key they have always had.
test('a folded seed keeps its kinds keyed by graph node id', async () => {
	const compiled = await compile('{ minWidth: MIN, maxWidth: 9, x: 2, label: "" }');
	const root = compiled.publicRenderModule.componentDefinitions?.find(
		(definition) => definition.name === 'Root',
	);
	const kinds = (root?.initialValueKinds ?? {}) as Record<string, string>;

	expect(Object.keys(kinds).some((key) => key.startsWith('symbol:'))).toBe(false);
});

// The carry is a set-if-absent, so a root that writes any property of the shape
// had already set the cell by the time it ran.
test('the carried expression lands before the root per-instance writes', async () => {
	const compiled = await compile(carried);
	const ssr = compiled.publicRenderModule.ssrModuleSource ?? '';
	const carry = ssr.indexOf('Number.POSITIVE_INFINITY');
	const write = ssr.indexOf('const marklessSharedSeed = (label)');

	expect(carry).toBeGreaterThan(-1);
	expect(write).toBeGreaterThan(carry);
});

// The seed pass primes the caller's map from the static values map, which holds
// nothing for a seed that did not fold.
test('the seed pass primes a carried seed from its own expression', async () => {
	const ssr = (await compile(carried)).publicRenderModule.ssrModuleSource ?? '';

	expect(ssr).toMatch(/marklessSsrSeeds\.set\([^;]*Number\.POSITIVE_INFINITY/);
});

// JSON prints a non-finite number as `null`, which reaches the page as a silent
// wrong number. The render-data module is JavaScript, where the name the
// serializer gives that value denotes it exactly.
test('a folded non-finite number reaches the render-data module as a name', async () => {
	const compiled = await compile('{ minWidth: 1, maxWidth: 1e400, x: 2, label: "" }');
	const module = compiled.publicRenderModule.renderDataModuleSource;

	expect(module).toContain('"maxWidth":Infinity');
	expect(module).not.toContain('"maxWidth":null');
});

test('a payload with no non-finite number still prints as JSON', async () => {
	const compiled = await compile('{ minWidth: MIN, maxWidth: 9, x: 2, label: "" }');

	expect(compiled.publicRenderModule.renderDataModuleSource).toBe(
		`export const marklessRenderData = ${JSON.stringify(compiled.renderData)};`,
	);
});
