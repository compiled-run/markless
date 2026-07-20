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
