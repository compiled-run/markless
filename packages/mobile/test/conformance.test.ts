import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileNativeComponent, createNativeRuntime, nativeConformance } from '../src/index.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const committed = (name: string) =>
	JSON.parse(readFileSync(new URL(`../conformance/${name}`, import.meta.url), 'utf8')) as unknown;

describe('native conformance vectors', () => {
	it('the committed counter vectors are what the compiler and the reference runtime produce today', async () => {
		const { payload, diagnostics } = await compileNativeComponent({
			filename: 'src/Counter.tsrx',
			source: fixture('Counter.tsrx'),
		});
		expect(diagnostics).toEqual([]);
		const vectors = nativeConformance(payload!, [
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h2' },
		]);
		expect(vectors.initial).toEqual([
			['h1:text0', 'Counter'],
			['h2:text0', 'Count 0'],
		]);
		expect(vectors.steps.map((step) => step.journal)).toEqual([
			[{ op: 'text', node: 'h2:text0', value: 'Count 1' }],
			[{ op: 'text', node: 'h2:text0', value: 'Count 2' }],
		]);
		expect(committed('counter.json')).toEqual(vectors);
	});

	it('journals only the text nodes whose string changed, in document order', () => {
		const runtime = createNativeRuntime({
			version: 'markless.native-view/0',
			component: 'Pair',
			cells: [
				{ id: 'state:a', name: 'a', initial: 1 },
				{ id: 'state:b', name: 'b', initial: 'fixed' },
			],
			nodes: [
				{ kind: 'element', id: 'h0', element: 'div', parent: null },
				{ kind: 'text', id: 'h0:text0', parent: 'h0', parts: [{ cell: 'state:b' }] },
				{ kind: 'text', id: 'h0:text1', parent: 'h0', parts: [{ text: 'a=' }, { cell: 'state:a' }] },
			],
			events: [{ host: 'h0', event: 'activate', handler: 'handler:x' }],
			handlers: [
				{
					id: 'handler:x',
					ops: [
						{ op: 'add', cell: 'state:a', value: -1 },
						{ op: 'add', cell: 'state:a', value: -1 },
					],
				},
			],
		});
		expect(runtime.dispatch({ event: 'activate', host: 'h0' })).toEqual([
			{ op: 'text', node: 'h0:text1', value: 'a=-1' },
		]);
	});
});
