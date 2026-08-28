import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';

// A state() seed inside a shared() factory whose value the evaluator cannot fold
// to a constant — a module-scope const, `Number.POSITIVE_INFINITY` — used to
// unregister EVERY field of the shape, literal-seeded fields included, because
// the field set was read off the folded value instead of the authored keys. The
// only diagnostic then fired at a CONSUMER of the shape, naming a field the
// factory plainly declares, which is what made it expensive to find.

function source(seed: string, extra = '') {
	return `
import { shared, state } from '@markless/core';
const MIN = 1;
${extra}
export const gate = shared(() => {
	const g = state(${seed});
	return { ...g, grow() { g.x = g.x + 1; } };
}, { scope: 'widget' });

export function Root() @{
	const g = gate();
	g.minWidth = 5;

	<div data-root ui-x={g.x} ui-min={g.minWidth} />
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

function fieldNames(compiled: Awaited<ReturnType<typeof compile>>) {
	const definition = compiled.semanticGraph.sharedDefinitions[0];
	return (definition?.returnProperties ?? []).map((property) => property.name);
}

function errorCodes(compiled: Awaited<ReturnType<typeof compile>>) {
	return [
		...compiled.stateLowering.diagnostics.filter((one) => one.severity === 'error'),
		...compiled.semanticGraph.diagnostics.filter((one) => one.severity === 'error'),
	].map((one) => one.code);
}

const seedShapes = [
	['a bare literal', '{ minWidth: 1, maxWidth: 9, x: 2 }'],
	['a module-scope const', '{ minWidth: MIN, maxWidth: 9, x: 2 }'],
	['a member expression on a global', '{ minWidth: 1, maxWidth: Number.POSITIVE_INFINITY, x: 2 }'],
	['a call on a global', '{ minWidth: Math.trunc(1.5), maxWidth: 9, x: 2 }'],
] as const;

for (const [label, seed] of seedShapes) {
	test(`a factory seeded from ${label} registers every field`, async () => {
		expect(fieldNames(await compile(seed))).toEqual(['minWidth', 'maxWidth', 'x', 'grow']);
	});

	test(`a consumer of a factory seeded from ${label} is not blamed for the seed`, async () => {
		expect(errorCodes(await compile(seed))).not.toContain('MARKLESS_SHARED_SEED_UNKNOWN_FIELD');
	});
}

test('an imported seed value registers its fields and keeps its authored expression', async () => {
	const compiled = await compile(
		'{ minWidth: 1, maxWidth: LIMIT, x: 2 }',
		"import { LIMIT } from './limits.ts';",
	);

	expect(fieldNames(compiled)).toEqual(['minWidth', 'maxWidth', 'x', 'grow']);
	expect(errorCodes(compiled)).not.toContain('MARKLESS_SHARED_SEED_UNKNOWN_FIELD');
	// The value is carried as the reference, never folded: the copy the server
	// renders from carries the import, and `Infinity` has no JSON form to print.
	expect(compiled.publicRenderModule.ssrModuleSource).toContain(
		'{ minWidth: 1, maxWidth: LIMIT, x: 2 }',
	);
});

test('a seed naming something nothing would bind is refused at the seed', async () => {
	const compiled = await compile('{ minWidth: 1, maxWidth: nowhere, x: 2 }');
	const refusal = compiled.semanticGraph.diagnostics.find(
		(one) => one.code === 'MARKLESS_SHARED_SEED_UNRESOLVED_VALUE',
	);

	expect(refusal).toBeDefined();
	// The factory, the field and the offending expression — never the consumer.
	expect(refusal?.message).toContain('"gate"');
	expect(refusal?.message).toContain('"maxWidth"');
	expect(refusal?.message).toContain('nowhere');
});

// A derive module resumes off the payload, not off the SSR render map, so a seed
// that only reached the render map derived NaN on the resumed page.
test('an unfoldable seed writes the served cell, not only the render map', async () => {
	// Imported, so this build cannot read it: a same-module const now folds.
	const compiled = await compile(
		'{ minWidth: 1, maxWidth: LIMIT, x: 2 }',
		"import { LIMIT } from './limits.ts';",
	);
	const cellId = compiled.payloadArena.state.cells[0]?.graphNodeId;

	expect(cellId).toBeDefined();
	expect(compiled.publicRenderModule.ssrModuleSource).toContain(
		`marklessStateValue(marklessSsrRenderStateValues,marklessSsrPayloadState,${JSON.stringify(cellId)},{ minWidth: 1, maxWidth: LIMIT, x: 2 })`,
	);
	// The write runs through the state helper, so the module has to import it.
	expect(compiled.publicRenderModule.ssrModuleSource).toContain('marklessStateValue');
});

test('a literal-seeded factory refuses nothing and folds its value as before', async () => {
	const compiled = await compile('{ minWidth: 1, maxWidth: 9, x: 2 }');

	expect(errorCodes(compiled)).not.toContain('MARKLESS_SHARED_SEED_UNRESOLVED_VALUE');
	expect(compiled.publicRenderModule.ssrModuleSource).toContain(
		'{"minWidth":1,"maxWidth":9,"x":2}',
	);
});
