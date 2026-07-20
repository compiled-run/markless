import { transformSync } from 'rolldown/experimental';
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/compile-module.ts';

const compile = (source: string) =>
	compileTsrxModule({
		filename: 'frameless-callback-emission.tsrx',
		source,
		buildId: 'frameless-callback-emission',
		resolverId: 'virtual:frameless-callback-emission-resolver',
		symbols: [],
	});

test('lazy event emission expands graph reads in object shorthand property position', async () => {
	const result = await compile(`import { state } from '@markless/core';

	export function PayloadButton({ onTrace }) @{
		let total = state(0);
		<button onClick={() => onTrace('changed', { total })}>send</button>
	}`);
	const symbol = result.symbolModules.modules.find(
		(module) => module.kind === 'event-handler' && module.source.includes('onTrace'),
	);

	expect(symbol?.source).toContain(
		`context.graph.read("prop:props", ["onTrace"])('changed', { total: context.graph.read("state:total") })`,
	);
	expect(transformSync(symbol?.symbolId ?? 'missing', symbol?.source ?? '').errors ?? []).toEqual(
		[],
	);
});

test('lazy event emission preserves non-computed object keys that collide with graph reads', async () => {
	const result = await compile(`import { state } from '@markless/core';

	export function PayloadButton({ onTrace }) @{
		let total = state(0);
		<button onClick={() => onTrace({ total: 1, value: total })}>send</button>
	}`);
	const symbol = result.symbolModules.modules.find(
		(module) => module.kind === 'event-handler' && module.source.includes('onTrace'),
	);

	expect(symbol?.source).toContain(
		`{ total: 1, value: context.graph.read("state:total") }`,
	);
	expect(transformSync(symbol?.symbolId ?? 'missing', symbol?.source ?? '').errors ?? []).toEqual(
		[],
	);
});

test('lazy event emission rewrites graph reads in computed object keys', async () => {
	const result = await compile(`import { state } from '@markless/core';

	export function PayloadButton({ onTrace }) @{
		let total = state(0);
		<button onClick={() => onTrace({ [total]: 1 })}>send</button>
	}`);
	const symbol = result.symbolModules.modules.find(
		(module) => module.kind === 'event-handler' && module.source.includes('onTrace'),
	);

	expect(symbol?.source).toContain(`{ [context.graph.read("state:total")]: 1 }`);
	expect(transformSync(symbol?.symbolId ?? 'missing', symbol?.source ?? '').errors ?? []).toEqual(
		[],
	);
});

test('callback props support zero or one parameter and reject multiple parameters', async () => {
	const supported = await compile(`import { state } from '@markless/core';

	function Child({ onReady, onValue, onObject }) @{
		<button onClick={() => { onReady(); onValue(2); onObject({ value: 3 }); }}>send</button>
	}

	export function Parent() @{
		let message = state('none');
		<Child
			onReady={() => message = 'ready'}
			onValue={(value) => message = value}
			onObject={({ value }) => message = value}
		/>
	}`);
	const callbackModules = supported.symbolModules.modules.filter(
		(module) => module.kind === 'callback-prop',
	);

	expect(supported.semanticGraph.diagnostics).toEqual([]);
	expect(callbackModules).toHaveLength(3);
	expect(callbackModules.some((module) => module.source.includes('const value = context.event;'))).toBe(
		true,
	);
	expect(
		callbackModules.some((module) => module.source.includes('const { value } = context.event;')),
	).toBe(true);

	const rejected = await compile(`import { state } from '@markless/core';

	function Child({ onTrace }) @{
		<button onClick={() => onTrace('changed', 2)}>send</button>
	}

	export function Parent() @{
		let message = state('none');
		<Child onTrace={(kind, payload) => message = payload} />
	}`);
	const diagnostic = rejected.semanticGraph.diagnostics.find(
		(item) => item.code === 'MARKLESS_CALLBACK_PROP_ARITY_UNSUPPORTED',
	);

	expect(diagnostic).toMatchObject({
		severity: 'error',
		phase: 'semantic-graph',
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		title: 'Callback props accept at most one parameter',
	});
	expect(diagnostic?.message).toContain('onTrace');
	expect(diagnostic?.why).toContain('one callback value');
	expect(diagnostic?.suggestions[0]?.message).toContain('single object');
	expect(diagnostic?.docsUrl).toBe(
		'https://markless.dev/errors/MARKLESS_CALLBACK_PROP_ARITY_UNSUPPORTED',
	);
	expect(
		rejected.symbolResolver.symbols.some((symbol) => symbol.kind === 'callback-prop'),
	).toBe(false);
});

test('callback parameter patterns shadow same-named graph state in emitted symbols', async () => {
	const result = await compile(`import { state } from '@markless/core';

	function Child({ onObject, onRenamed, onArray }) @{
		<button onClick={() => {
			onObject({ count: 1, source: 'cedar' });
			onRenamed({ count: 2, source: 'birch' });
			onArray([3, 'ash']);
		}}>send</button>
	}

	export function Parent() @{
		let count = state(99);
		let graphResult = state('');
		<Child
			onObject={({ count, source }) => graphResult = source + ':' + count}
			onRenamed={({ count: nextCount, source: nextSource }) => graphResult = nextSource + ':' + nextCount}
			onArray={([count, source]) => graphResult = source + ':' + count}
		/>
	}`);
	const callbackSource = (propName: string) => {
		const symbol = result.symbolResolver.symbols.find(
			(candidate) => candidate.kind === 'callback-prop' && candidate.propName === propName,
		);
		return result.symbolModules.modules.find((module) => module.symbolId === symbol?.id)?.source;
	};

	const objectCallback = callbackSource('onObject');
	const renamedCallback = callbackSource('onRenamed');
	const arrayCallback = callbackSource('onArray');

	expect(objectCallback).toContain('const { count, source } = context.args?.[0];');
	expect(objectCallback).not.toContain('context.graph.read("state:count")');
	expect(renamedCallback).toContain(
		'const { count: nextCount, source: nextSource } = context.args?.[0];',
	);
	expect(renamedCallback).not.toContain('context.graph.read("state:count")');
	expect(arrayCallback).toContain('const [count, source] = context.args?.[0];');
	expect(arrayCallback).not.toContain('context.graph.read("state:count")');
});

test.each([
	['default', '(payload = 1)'],
	['rest', '(...payload)'],
])('callback props reject a single %s parameter', async (_shape, parameters) => {
	const result = await compile(`import { state } from '@markless/core';

	function Child({ onValue }) @{
		<button onClick={() => onValue(2)}>send</button>
	}

	export function Parent() @{
		let message = state('none');
		<Child onValue={${parameters} => message = payload} />
	}`);
	const diagnostic = result.semanticGraph.diagnostics.find(
		(item) => item.code === 'MARKLESS_CALLBACK_PROP_ARITY_UNSUPPORTED',
	);

	expect(diagnostic).toMatchObject({
		severity: 'error',
		phase: 'semantic-graph',
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
	});
	expect(diagnostic?.message).toContain('onValue');
	expect(diagnostic?.suggestions[0]?.message).toContain('single');
	expect(result.symbolResolver.symbols.some((symbol) => symbol.kind === 'callback-prop')).toBe(
		false,
	);
});
