import { expect, test } from 'vitest';
import { createRuntimeGraph } from '@arcade/runtime';
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

test('resume runtime records element behaviors without loading app code during startup', async () => {
	const canvas = element('CANVAS');
	const root = element('SECTION', [canvas]);
	const loadedSymbols: string[] = [];
	const installedOn: string[] = [];
	const cleanups: string[] = [];
	const resume = createResumeRuntime({
		root,
		graph: createRuntimeGraph({ cells: [] }),
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'canvas' },
			],
			events: [],
			domUpdates: [],
			behaviors: [
				{
					hostNodeId: 'h1',
					source: 'chart(config)',
					functionSource: 'chart',
					inputSources: ['config'],
					symbolId: 'symbol:chart',
				},
				{
					hostNodeId: 'h1',
					source: 'resizeCanvas',
					functionSource: 'resizeCanvas',
					inputSources: [],
					symbolId: 'symbol:resize',
				},
			],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return ({ element: host }) => {
				const label = symbolId.replace('symbol:', '');
				installedOn.push(`${label}:${host.tagName}`);
				return () => cleanups.push(label);
			};
		},
	});

	await resume.start();

	expect(loadedSymbols).toEqual([]);
	expect(installedOn).toEqual([]);
	expect(cleanups).toEqual([]);

	resume.disposeHost('h1');

	expect(cleanups).toEqual([]);

	resume.disposeHost('h1');

	expect(cleanups).toEqual([]);
});

test('resume runtime activates behavior symbols with serialized inputs and cleanup reruns', async () => {
	const canvas = element('CANVAS');
	const root = element('SECTION', [canvas]);
	const loadedSymbols: string[] = [];
	const installed: string[] = [];
	const cleanups: string[] = [];
	const resume = createResumeRuntime({
		root,
		graph: createRuntimeGraph({ cells: [] }),
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'canvas' },
			],
			events: [],
			domUpdates: [],
			behaviors: [
				{
					hostNodeId: 'h1',
					source: 'chart(config)',
					functionSource: 'chart',
					inputSources: ['config'],
					inputValues: [{ color: 'red' }],
					symbolId: 'symbol:chart',
				},
				{
					hostNodeId: 'h1',
					source: 'resizeCanvas',
					functionSource: 'resizeCanvas',
					inputSources: [],
					symbolId: 'symbol:resize',
				},
			],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return ({ element: host, behaviorInputs }) => {
				const label = symbolId.replace('symbol:', '');
				installed.push(`${label}:${host.tagName}:${JSON.stringify(behaviorInputs ?? [])}`);
				return () => cleanups.push(label);
			};
		},
	});

	await resume.start();

	expect(loadedSymbols).toEqual([]);

	await resume.activateBehaviors('h1');

	expect(loadedSymbols).toEqual(['symbol:chart', 'symbol:resize']);
	expect(installed).toEqual(['chart:CANVAS:[{"color":"red"}]', 'resize:CANVAS:[]']);
	expect(cleanups).toEqual([]);

	await resume.activateBehaviors('h1');

	expect(loadedSymbols).toEqual([
		'symbol:chart',
		'symbol:resize',
		'symbol:chart',
		'symbol:resize',
	]);
	expect(cleanups).toEqual(['resize', 'chart']);

	resume.disposeHost('h1');

	expect(cleanups).toEqual(['resize', 'chart', 'resize', 'chart']);
});

test('resume runtime does not activate behavior symbols for detached hosts', async () => {
	const canvas = element('CANVAS');
	const root = element('SECTION', [canvas]);
	const loadedSymbols: string[] = [];
	const resume = createResumeRuntime({
		root,
		graph: createRuntimeGraph({ cells: [] }),
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'canvas' },
			],
			events: [],
			domUpdates: [],
			behaviors: [
				{
					hostNodeId: 'h1',
					source: 'chart(config)',
					functionSource: 'chart',
					inputSources: ['config'],
					inputValues: [{ color: 'red' }],
					symbolId: 'symbol:chart',
				},
			],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return () => undefined;
		},
	});

	await resume.start();
	(root.childNodes as FakeElement[]).splice(root.childNodes.indexOf(canvas), 1);
	await resume.activateBehaviors('h1');

	expect(loadedSymbols).toEqual([]);
});

test('resume runtime reruns active behaviors when graph-backed inputs change', async () => {
	const canvas = element('CANVAS');
	const root = element('SECTION', [canvas]);
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:config', value: { color: 'red' } }],
	});
	const loadedSymbols: string[] = [];
	const installed: string[] = [];
	const cleanups: string[] = [];
	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'canvas' },
			],
			events: [],
			domUpdates: [],
			behaviors: [
				{
					hostNodeId: 'h1',
					source: 'chart(config.color)',
					functionSource: 'chart',
					inputSources: ['config.color'],
					inputValues: ['red'],
					inputGraphReads: [
						{
							inputIndex: 0,
							source: 'config.color',
							graphNodeId: 'state:config',
							path: ['color'],
						},
					],
					symbolId: 'symbol:chart',
				},
			],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return ({ behaviorInputs }) => {
				installed.push(JSON.stringify(behaviorInputs ?? []));
				return () => cleanups.push('chart');
			};
		},
	});

	await resume.start();

	graph.write({ graphNodeId: 'state:config', path: ['color'], value: 'blue' });
	await graph.flush();

	expect(loadedSymbols).toEqual([]);
	expect(installed).toEqual([]);

	await resume.activateBehaviors('h1');

	expect(installed).toEqual(['["blue"]']);
	expect(cleanups).toEqual([]);

	graph.write({ graphNodeId: 'state:config', path: ['color'], value: 'green' });
	await graph.flush();

	expect(loadedSymbols).toEqual(['symbol:chart', 'symbol:chart']);
	expect(installed).toEqual(['["blue"]', '["green"]']);
	expect(cleanups).toEqual(['chart']);
});
