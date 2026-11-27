import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';

async function compile(source: string, filename = 'src/stars.tsrx') {
	return compileTsrxModule({ filename, source, symbols: [] });
}

type Compiled = Awaited<ReturnType<typeof compile>>;

function errors(compiled: Compiled) {
	return collectTsrxModuleDiagnostics(compiled)
		.filter((diagnostic) => diagnostic.severity === 'error')
		.map((diagnostic) => diagnostic.code);
}

function symbolFor(compiled: Compiled, kind: string, source: string) {
	return compiled.symbolResolver.symbols.find(
		(symbol) => symbol.kind === kind && symbol.source === source,
	);
}

function moduleFor(compiled: Compiled, symbolId: string | undefined) {
	return compiled.symbolModules.modules.find((module) => module.symbolId === symbolId)?.source;
}

const DEFAULTED = 'computed:Stars.size';

test('the owner example compiles, and the markup expression reads the defaulted value', async () => {
	const compiled = await compile(`
export function Stars({ size = 3 }: { size?: number }) @{
	<span>{'★'.repeat(size)}</span>
}
`);

	expect(errors(compiled)).toEqual([]);
	const stars = symbolFor(compiled, 'dom-update', "'★'.repeat(size)");
	const derive = compiled.symbolResolver.symbols.find(
		(symbol) =>
			symbol.kind === 'sync-computed-derive' &&
			'graphNodeId' in symbol &&
			symbol.graphNodeId ===
				(stars && 'graphNodeId' in stars ? stars.graphNodeId : undefined),
	);
	expect(moduleFor(compiled, derive?.id)).toContain(
		`'★'.repeat(context.graph.read("${DEFAULTED}"))`,
	);
	expect(compiled.publicRenderModule.ssrModuleSource).toContain(
		'const { size = 3 } = marklessSsrProps ?? {};',
	);
});

test('a defaulted prop is a derived node that applies the default only to undefined', async () => {
	const compiled = await compile(`
export function Stars({ size = 3 }: { size?: number }) @{
	<span>{size}</span>
}
`);

	expect(errors(compiled)).toEqual([]);
	expect(compiled.semanticGraph.graphBindings).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				id: DEFAULTED,
				name: 'size',
				kind: 'computed',
				componentName: 'Stars',
				dependencies: [
					expect.objectContaining({ graphNodeId: 'prop:props', path: ['size'] }),
				],
			}),
		]),
	);
	const derive = compiled.symbolResolver.symbols.find(
		(symbol) =>
			symbol.kind === 'sync-computed-derive' &&
			'graphNodeId' in symbol &&
			symbol.graphNodeId === DEFAULTED,
	);
	expect(moduleFor(compiled, derive?.id)).toContain(
		'return context.graph.read("prop:props", ["size"]) === undefined ? 3 : context.graph.read("prop:props", ["size"]);',
	);
	expect(symbolFor(compiled, 'dom-update', 'size')).toEqual(
		expect.objectContaining({ graphNodeId: DEFAULTED }),
	);
	expect(compiled.publicRenderModule.ssrModuleSource).toContain(
		`if(typeof size!=='undefined')marklessSsrRenderStateValues.set("${DEFAULTED}",size);`,
	);
});

test('attributes, computed(), handlers, @if tests and child props all read the defaulted node', async () => {
	const compiled = await compile(`
import { computed, state } from '@markless/core';

function Child({ n }: { n: number }) @{
	<b>{n}</b>
}

export function Stars({ size = 3 }: { size?: number }) @{
	const picked = state({ value: 0 });
	const label = computed(() => 'size ' + size);
	<div title={size}>
		<i>{label}</i>
		<button onClick={() => { picked.value = size; }}>pick</button>
		@if (size > 2) { <em>big</em> }
		<Child n={size} />
	</div>
}
`);

	expect(errors(compiled)).toEqual([]);
	expect(symbolFor(compiled, 'dom-update', 'size')).toEqual(
		expect.objectContaining({ graphNodeId: DEFAULTED }),
	);
	const label = compiled.symbolResolver.symbols.find(
		(symbol) =>
			symbol.kind === 'sync-computed-derive' &&
			'graphNodeId' in symbol &&
			symbol.graphNodeId === 'computed:label',
	);
	expect(moduleFor(compiled, label?.id)).toContain(
		`'size ' + context.graph.read("${DEFAULTED}")`,
	);
	const handler = symbolFor(compiled, 'event-handler', '() => { picked.value = size; }');
	expect(moduleFor(compiled, handler?.id)).toContain(`value: context.graph.read("${DEFAULTED}")`);
	const test = symbolFor(compiled, 'sync-computed-derive', '() => size > 2');
	expect(moduleFor(compiled, test?.id)).toContain(`context.graph.read("${DEFAULTED}") > 2`);
	expect(compiled.publicRenderModule.ssrModuleSource).toContain(
		`"graphProps":[{"name":"n","graphNodeId":"${DEFAULTED}","path":[]}]`,
	);
});

test('a default may name an earlier prop and a module constant', async () => {
	const compiled = await compile(`
const FALLBACK = 'none';

export function Tag({ value, label = value ?? FALLBACK }: { value?: string; label?: string }) @{
	<span>{label}</span>
}
`);

	expect(errors(compiled)).toEqual([]);
	const derive = compiled.symbolResolver.symbols.find(
		(symbol) =>
			symbol.kind === 'sync-computed-derive' &&
			'graphNodeId' in symbol &&
			symbol.graphNodeId === 'computed:Tag.label',
	);
	const source = moduleFor(compiled, derive?.id);
	expect(source).toContain("const FALLBACK = 'none';");
	expect(source).toContain(
		'context.graph.read("prop:props", ["label"]) === undefined ? context.graph.read("prop:props", ["value"]) ?? FALLBACK : context.graph.read("prop:props", ["label"])',
	);
	expect(compiled.semanticGraph.graphBindings).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				id: 'computed:Tag.label',
				dependencies: [
					expect.objectContaining({ graphNodeId: 'prop:props', path: ['label'] }),
					expect.objectContaining({ graphNodeId: 'prop:props', path: ['value'] }),
				],
			}),
		]),
	);
});

test('two components in one module each default a same-named prop without sharing a node', async () => {
	const compiled = await compile(`
function Inner({ size = 1 }: { size?: number }) @{
	<b>{size}</b>
}

export function Stars({ size = 3 }: { size?: number }) @{
	<span>{size}<Inner /></span>
}
`);

	expect(errors(compiled)).toEqual([]);
	const ids = compiled.semanticGraph.graphBindings.map((binding) => binding.id);
	expect(ids).toContain('computed:Inner.size');
	expect(ids).toContain(DEFAULTED);
});

test('a nested prop pattern default read in markup still fails closed', async () => {
	const compiled = await compile(`
export function Stars({ options: { size = 3 } }: { options: { size?: number } }) @{
	<span>{size}</span>
}
`);

	expect(errors(compiled)).toContain('MARKLESS_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED');
});

test('a function default on a callback prop called from a handler still fails closed', async () => {
	const compiled = await compile(`
export function Pick({ onPick = () => {} }: { onPick?: () => void }) @{
	<button onClick={() => onPick()}>pick</button>
}
`);

	expect(errors(compiled)).toEqual(['MARKLESS_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED']);
});

test('a default only ever seeded from in the body adds no derived node', async () => {
	const compiled = await compile(`
import { shared, state } from '@markless/core';

export const toggle = shared(() => {
	const cell = state({ on: true });
	return { ...cell };
}, { scope: 'subtree' });

export function Root({ on = false, children }) @{
	const t = toggle();
	t.on = on;
	<div ui-on={t.on}>{children}</div>
}
`);

	expect(errors(compiled)).toEqual([]);
	expect(compiled.semanticGraph.graphBindings.map((binding) => binding.id)).not.toContain(
		'computed:Root.on',
	);
});

test('an array default read in markup still fails closed', async () => {
	const compiled = await compile(`
export function List({ items = [] }: { items?: string[] }) @{
	<span>{items.length}</span>
}
`);

	expect(errors(compiled)).toContain('MARKLESS_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED');
});

test('a default read only by a state() initializer adds no derived node', async () => {
	const compiled = await compile(`
import { state } from '@markless/core';

export function Counter({ start = 4 }: { start?: number }) @{
	const count = state({ n: start });
	<button onClick={() => count.n++}>{count.n}</button>
}
`);

	expect(errors(compiled)).toEqual([]);
	expect(compiled.semanticGraph.graphBindings.map((binding) => binding.id)).not.toContain(
		'computed:Counter.start',
	);
});
