import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A factory computed has to answer the same value in every read position. The
// one fixed here is a component-body computed() over the instance: SSR evaluates
// that local where it is declared, and the line deriving the factory computed
// used to sit below it, so the local read undefined and its attribute was
// dropped from the served HTML.

async function compile(filename: string, source: string) {
	return compileTsrxModule({
		filename,
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
}

function errors(compiled: Awaited<ReturnType<typeof compile>>) {
	return [...compiled.semanticGraph.diagnostics, ...compiled.stateLowering.diagnostics].filter(
		(diagnostic) => diagnostic.severity === 'error',
	);
}

const FACTORY = `
import { shared, state, computed } from '@markless/core';

export const spike = shared(() => {
	const s = state({ base: 2, step: 3 });
	const total = computed(() => s.base + s.step);

	return { ...s, total, bump() { s.base = s.base + 1; } };
}, { scope: 'widget' });
`;

// All three read positions at once, plus a body seed above them.
const allPositions = `${FACTORY}
export function Box({ step = 3 }) @{
	const s = spike();
	s.step = step;
	const label = computed(() => \`v\${s.total}\`);

	<button
		type="button"
		data-box
		aria-valuenow={s.total}
		data-label={label}
		onKeyDown={() => { s.base = s.total + 1; }}
	>x</button>
}
`;

// The same family read only from an attribute: no body local reads the factory
// computed, so nothing moves.
const attributeOnly = `${FACTORY}
export function Box() @{
	const s = spike();

	<button type="button" data-box aria-valuenow={s.total}>x</button>
}
`;

test('the attribute read still resolves to the factory computed node', async () => {
	const compiled = await compile('src/spike.tsrx', allPositions);
	const template = compiled.renderData.chunks.find((chunk) => chunk.id === 'template:Box');
	const slot = template?.slots.find(
		(candidate) => candidate.kind === 'attribute' && candidate.name === 'aria-valuenow',
	);

	expect(slot && 'residue' in slot ? slot.residue : null).toEqual({
		kind: 'graph-read',
		graphNodeId: 'shared:src/spike.tsrx#spike/computed:total',
		path: [],
	});
	expect(errors(compiled)).toEqual([]);
});

test('the handler reads the factory computed node, not a factory local', async () => {
	const compiled = await compile('src/spike.tsrx', allPositions);
	const handler = compiled.symbolResolver.symbols.find(
		(candidate) => candidate.kind === 'event-handler',
	);
	const module = compiled.symbolModules.modules.find(
		(candidate) => candidate.symbolId === handler?.id,
	);

	expect(module?.source).toContain(
		'context.graph.read("shared:src/spike.tsrx#spike/computed:total")',
	);
});

test('SSR derives the factory computed above the body computed that reads it', async () => {
	const compiled = await compile('src/spike.tsrx', allPositions);
	const source = compiled.publicRenderModule.ssrModuleSource ?? '';
	const render = source.slice(source.indexOf('const marklessSsrPayloadState ='));
	const seed = render.indexOf('const marklessSharedSeed');
	const derive = render.indexOf('"shared:src/spike.tsrx#spike/computed:total",(({read})');
	const local = render.indexOf('const label = (() =>');

	// Seed, then derive, then the local that reads the derived value.
	expect(seed).toBeGreaterThan(-1);
	expect(derive).toBeGreaterThan(seed);
	expect(local).toBeGreaterThan(derive);
});

test('a family with no body computed over the instance emits the derive unmoved', async () => {
	const compiled = await compile('src/spike.tsrx', attributeOnly);
	const source = compiled.publicRenderModule.ssrModuleSource ?? '';
	const render = source.slice(source.indexOf('const marklessSsrPayloadState ='));

	// Still after the render preamble, byte for byte what this family emitted
	// before the hoist existed.
	expect(render.indexOf("marklessSsrRenderStateValues.set('prop:props',props);")).toBeLessThan(
		render.indexOf('"shared:src/spike.tsrx#spike/computed:total",(({read})'),
	);
});

test('the body computed reading the instance depends on the factory computed node', async () => {
	const compiled = await compile('src/spike.tsrx', allPositions);
	const binding = compiled.semanticGraph.graphBindings.find(
		(candidate) => candidate.id === 'computed:label',
	);

	expect(binding?.dependencies).toEqual([
		expect.objectContaining({ graphNodeId: 'shared:src/spike.tsrx#spike/computed:total' }),
	]);
	expect(errors(compiled)).toEqual([]);
});

// Alternate shape: a different family, computed name, part name and attribute,
// with the handler read inside a helper call rather than an arithmetic operand.
test('an alternate-shaped family lowers the same way in every position', async () => {
	const compiled = await compile(
		'src/gate.tsrx',
		`
import { shared, state, computed } from '@markless/core';

export const gate = shared(() => {
	const cell = state({ open: false, count: 0 });
	const badge = computed(() => (cell.open ? 'open' : 'shut'));

	return { ...cell, badge, bump() { cell.count = cell.count + 1; } };
}, { scope: 'widget' });

export function Panel() @{
	const cell = gate();
	const shout = computed(() => \`<\${cell.badge}>\`);

	<section data-gate data-badge={cell.badge} data-shout={shout} onClick={() => { cell.open = cell.badge === 'shut'; }} />
}
`,
	);
	const source = compiled.publicRenderModule.ssrModuleSource ?? '';
	const render = source.slice(source.indexOf('const marklessSsrPayloadState ='));

	expect(render.indexOf('#gate/computed:badge",(({read})')).toBeLessThan(
		render.indexOf('const shout = (() =>'),
	);
	expect(errors(compiled)).toEqual([]);
});
