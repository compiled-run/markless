import { expect, test } from 'vitest';
import { createRuntimeGraph } from '@markless/runtime';
import { createDomUpdateEntry } from '../src/dom-update.ts';
import { createResumeRuntime } from '../src/index.ts';

type FakeElement = {
	readonly nodeType: 1;
	readonly tagName: string;
	readonly childNodes: FakeElement[];
};

function element(tagName: string, childNodes: FakeElement[] = []): FakeElement {
	return {
		nodeType: 1,
		tagName,
		childNodes,
	};
}

test('resume runtime registers async view DOM updates as graph subscriptions', async () => {
	const button = element('BUTTON');
	const root = element('SECTION', [button]);
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:count', value: 0 }],
	});
	const loadedSymbols: string[] = [];

	createResumeRuntime({
		root,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
			],
			events: [],
			domUpdates: [
				{
					hostNodeId: 'h1',
					source: 'count',
					graphNodeId: 'state:count',
					path: [],
					symbolId: 'symbol:domUpdate',
				},
			],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return ({ graph: runtimeGraph }) => ({
				type: 'setText',
				locator: 'button:text',
				value: runtimeGraph.read('state:count'),
			});
		},
	}).start();

	graph.write({ graphNodeId: 'state:count', value: 1 });
	await graph.flush();

	expect(loadedSymbols).toEqual(['symbol:domUpdate']);
	expect(graph.takeJournal()).toEqual([{ type: 'setText', locator: 'button:text', value: 1 }]);
});

test('resume runtime applies DOM journal entries after scheduled graph flushes', async () => {
	const button = element('BUTTON');
	const root = element('SECTION', [button]);
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:count', value: 0 }],
	});
	const appliedEntries: unknown[] = [];

	await createResumeRuntime({
		root,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
			],
			events: [],
			domUpdates: [
				{
					hostNodeId: 'h1',
					source: 'count',
					graphNodeId: 'state:count',
					path: [],
					symbolId: 'symbol:domUpdate',
				},
			],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol() {
			return ({ graph: runtimeGraph }) => ({
				type: 'setText',
				locator: 'button:text',
				value: runtimeGraph.read('state:count'),
			});
		},
		applyDomJournal(entries) {
			appliedEntries.push(...entries);
		},
	}).start();

	graph.write({ graphNodeId: 'state:count', value: 1 });
	await drainMicrotasks();

	expect(appliedEntries).toEqual([{ type: 'setText', locator: 'button:text', value: 1 }]);
	expect(graph.takeJournal()).toEqual([]);
});

test('resume runtime passes DOM update value and target metadata to lazy DOM update symbols', async () => {
	const input = element('INPUT');
	const root = element('SECTION', [input]);
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:query', value: '' }],
	});
	const appliedEntries: unknown[] = [];
	const domUpdateContexts: unknown[] = [];

	await createResumeRuntime({
		root,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'input' },
			],
			events: [],
			domUpdates: [
				{
					hostNodeId: 'h1',
					source: 'query',
					graphNodeId: 'state:query',
					path: [],
					target: { kind: 'property', name: 'value' },
					symbolId: 'symbol:domUpdate',
				},
			],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol() {
			return (context) => {
				domUpdateContexts.push({
					value: context.value,
					domUpdate: context.domUpdate,
					elementTagName: context.element.tagName,
				});

				return createDomUpdateEntry({
					locator: 'input:value',
					target: context.domUpdate!.target!,
					value: context.value,
				});
			};
		},
		applyDomJournal(entries) {
			appliedEntries.push(...entries);
		},
	}).start();

	graph.write({ graphNodeId: 'state:query', value: 'Search' });
	await graph.flush();

	expect(domUpdateContexts).toEqual([
		{
			value: 'Search',
			domUpdate: {
				hostNodeId: 'h1',
				source: 'query',
				graphNodeId: 'state:query',
				path: [],
				target: { kind: 'property', name: 'value' },
				symbolId: 'symbol:domUpdate',
			},
			elementTagName: 'INPUT',
		},
	]);
	expect(appliedEntries).toEqual([
		{ type: 'setProp', locator: 'input:value', name: 'value', value: 'Search' },
	]);
	expect(graph.takeJournal()).toEqual([]);
});

test('createDomUpdateEntry maps conditional text targets from graph truthiness', () => {
	expect(
		createDomUpdateEntry({
			locator: 'button:icon',
			target: { kind: 'text', trueValue: 'Pause', falseValue: 'Play' },
			value: true,
		}),
	).toEqual({ type: 'setText', locator: 'button:icon', value: 'Pause' });
	expect(
		createDomUpdateEntry({
			locator: 'button:icon',
			target: { kind: 'text', trueValue: 'Pause', falseValue: 'Play' },
			value: false,
		}),
	).toEqual({ type: 'setText', locator: 'button:icon', value: 'Play' });
});

async function drainMicrotasks(): Promise<void> {
	for (let index = 0; index < 4; index++) {
		await Promise.resolve();
	}
}
