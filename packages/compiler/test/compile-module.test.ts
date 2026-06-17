import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { deserializeGraphValue } from '../../serializer/src/index.ts';

const source = `
import { state } from '@arcadejs/core';

export function App() @{
	let count = state(1);
	const menu = state({ open: true, title: 'Menu' });

	<section>
		<input
			value={menu.title}
			onKeyDown={(event) => {
				if (menu.open && event.key === 'Escape') {
					event.preventDefault();
					menu.open = false;
				}
			}}
		/>
		<button onClick={() => count++}>{count}</button>
	</section>
}
`;

const eventWriteSource = `
import { state } from '@arcadejs/core';
import { clamp } from './math';

export function App() @{
	const menu = state({ open: true, title: 'Menu' });
	const profile = state({ name: 'Profile', step: 2, scale: 3, enabled: true });
	let total = state(0);
	let items = state(['first', 'second']);
	const nextItem = state('next');
	const nextItems = state(['third', 'fourth']);
	let settings = state({ title: 'Initial', step: 0 });
	const currentDate = state(new Date('2026-06-16T12:00:00.000Z'));
	const nextTime = state(1800000000000);

	<section>
		<input value={menu.title} onInput={(event) => menu.title = event.currentTarget.value} />
		<input value={menu.title} onInput={(event) => items.push(event.currentTarget.value)} />
		<button onClick={() => menu.title = profile.name}>{profile.name}</button>
		<button onClick={() => menu.open = !menu.open}>{menu.open}</button>
		<button onClick={() => total += profile.step}>{total}</button>
		<button onClick={() => total = total + profile.step}>{total}</button>
		<button onClick={() => total = (total + profile.step) * profile.scale}>{total}</button>
		<button onClick={() => total = menu.open ? profile.step : total}>{total}</button>
		<button onClick={() => total = Math.max(total, profile.step)}>{total}</button>
		<button onClick={() => total = clamp(total, profile.step)}>{total}</button>
		<button onClick={() => items = [nextItem, "fallback"]}>{items.length}</button>
		<button onClick={() => items = [...nextItems, nextItem]}>{items.length}</button>
		<button onClick={() => settings = { title: menu.title, step: profile.step }}>
			{settings.title}
		</button>
		<button onClick={() => settings = { ...settings, title: menu.title }}>
			{settings.title}
		</button>
		<button onClick={() => settings = { [menu.title]: profile.step }}>
			{settings.title}
		</button>
		<button onClick={() => currentDate.setTime(nextTime)}>{nextTime}</button>
		<button onClick={() => menu.open &&= profile.enabled}>{menu.open}</button>
		<button
			onClick={() => {
				menu.open = false;
				delete menu.title;
				items.pop();
				items.push("third");
				items.push(menu.title);
				items.push(...nextItems);
			}}
		>
			{menu.title}
		</button>
	</section>
}
`;

const asyncComputedSource = `
import { state, computed } from '@arcadejs/core';

export function App() @{
	const query = state('Ada');
	const details = computed(async ({ signal }) => {
		const q = query;
		const response = await fetch('/api/details/' + q, { signal });
		return await response.json();
	});

	<section>
		@try {
			<p>{details.title}</p>
		} @pending {
			<p>Loading</p>
		} @catch (error) {
			<p>{error.message}</p>
		}
	</section>
}
`;

test('compileTsrxModule orchestrates source to payload scripts and resolver module', async () => {
	const result = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source,
		symbols: [
			{
				id: 'symbol:0',
				chunk: '/assets/app.handlers.js',
				exportName: 'onKeyDown_0',
			},
			{
				id: 'symbol:1',
				chunk: '/assets/app.handlers.js',
				exportName: 'onClick_1',
			},
			{
				id: 'symbol:2',
				chunk: '/assets/app.domUpdates.js',
				exportName: 'inputValue_2',
			},
			{
				id: 'symbol:3',
				chunk: '/assets/app.domUpdates.js',
				exportName: 'buttonText_3',
			},
		],
	});

	expect(result.semanticGraph.components).toEqual([{ name: 'App' }]);
	expect(result.stateLowering.diagnostics).toEqual([]);
	expect(result.captureAnalysis.extractedSymbols).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: 'event-handler',
				source: "(event) => {\n\t\t\t\tif (menu.open && event.key === 'Escape') {\n\t\t\t\t\tevent.preventDefault();\n\t\t\t\t\tmenu.open = false;\n\t\t\t\t}\n\t\t\t}",
			}),
			expect.objectContaining({
				kind: 'event-handler',
				source: '() => count++',
			}),
		]),
	);
	expect(result.payloadScripts.stateScript).toMatch(/^<script type="arcade\/state">/);
	expect(result.payloadScripts.viewScript).toMatch(/^<script type="arcade\/view">/);
	expect(result.renderShell).toContain('<script type="arcade/state">');
	expect(result.renderShell).toContain('<script type="arcade/view">');
	expect(result.renderShell.indexOf('<script type="arcade/state">')).toBeLessThan(
		result.renderShell.indexOf('<script type="arcade/view">'),
	);
	expect(result.symbolResolverModule).toContain('return import("/assets/app.handlers.js")');
	expect(result.symbolResolverModule).toContain('return import("/assets/app.domUpdates.js")');

	const countCell = result.protocolState.cells.find((cell) => cell.graphNodeId === 'state:count');
	const menuCell = result.protocolState.cells.find((cell) => cell.graphNodeId === 'state:menu');

	expect(countCell?.valueKind).toBe('scalar');
	expect(deserializeGraphValue(countCell!.value!)).toBe(1);
	expect(menuCell?.valueKind).toBe('object');
	expect(deserializeGraphValue(menuCell!.value!)).toEqual({ open: true, title: 'Menu' });

	expect(result.protocolView.events).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				eventName: 'keydown',
				symbolIds: ['symbol:0'],
				syncPolicy: expect.objectContaining({ actions: ['preventDefault'] }),
			}),
			expect.objectContaining({
				eventName: 'click',
				symbolIds: ['symbol:1'],
			}),
		]),
	);
	expect(result.protocolView.domUpdates).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				source: 'menu.title',
				symbolId: 'symbol:2',
			}),
			expect.objectContaining({
				source: 'count',
				symbolId: 'symbol:3',
			}),
		]),
	);
});

test('compileTsrxModule emits generated event modules for supported graph write forms', async () => {
	const result = await compileTsrxModule({
		filename: 'src/EventWrites.tsrx',
		source: eventWriteSource,
		symbols: [],
	});

	const eventModuleSource = (sourceSnippet: string): string => {
		const symbol = result.symbolResolver.symbols.find(
			(symbol) => symbol.kind === 'event-handler' && symbol.source.includes(sourceSnippet),
		);
		expect(symbol, sourceSnippet).toBeDefined();
		const module = result.symbolModules.modules.find(
			(module) => module.symbolId === symbol?.id,
		);
		expect(module, sourceSnippet).toBeDefined();
		return module?.source ?? '';
	};

	const clickModule = eventModuleSource('items.pop');
	const inputModule = eventModuleSource('event.currentTarget.value');
	const inputCollectionModule = eventModuleSource('items.push(event.currentTarget.value)');
	const dateModule = eventModuleSource('currentDate.setTime(nextTime)');

	expect(result.stateLowering.diagnostics).toEqual([]);
	expect(clickModule).toContain('context.graph.write({');
	expect(clickModule).toContain('graphNodeId: "state:menu"');
	expect(clickModule).toContain('path: ["open"]');
	expect(clickModule).toContain('value: false');
	expect(clickModule).toContain('context.graph.delete({');
	expect(clickModule).toContain('path: ["title"]');
	expect(clickModule).toContain('context.graph.call({');
	expect(clickModule).toContain('graphNodeId: "state:items"');
	expect(clickModule).toContain('method: "pop"');
	expect(clickModule).toContain('method: "push"');
	expect(clickModule).toContain('args: ["third"]');
	expect(clickModule).toContain('args: [context.graph.read("state:menu", ["title"])]');
	expect(clickModule).toContain('args: [...context.graph.read("state:nextItems", [])]');
	expect(inputModule).toContain('graphNodeId: "state:menu"');
	expect(inputModule).toContain('path: ["title"]');
	expect(inputModule).toContain('value: context.event?.currentTarget?.value');
	expect(inputCollectionModule).toContain('graphNodeId: "state:items"');
	expect(inputCollectionModule).toContain('args: [context.event?.currentTarget?.value]');
	expect(inputCollectionModule).not.toContain('args: ["third"]');
	expect(dateModule).toContain('context.graph.call({');
	expect(dateModule).toContain('graphNodeId: "state:currentDate"');
	expect(dateModule).toContain('path: []');
	expect(dateModule).toContain('method: "setTime"');
	expect(dateModule).toContain('args: [context.graph.read("state:nextTime", [])]');

	const copyModule = eventModuleSource('menu.title = profile.name');

	expect(copyModule).toContain('graphNodeId: "state:menu"');
	expect(copyModule).toContain('path: ["title"]');
	expect(copyModule).toContain('value: context.graph.read("state:profile", ["name"])');

	const toggleModule = eventModuleSource('menu.open = !menu.open');

	expect(toggleModule).toContain('context.graph.write({');
	expect(toggleModule).toContain('graphNodeId: "state:menu"');
	expect(toggleModule).toContain('path: ["open"]');
	expect(toggleModule).toContain('value: !context.graph.read("state:menu", ["open"])');

	const addModule = eventModuleSource('total += profile.step');

	expect(addModule).toContain('context.graph.update({');
	expect(addModule).toContain('graphNodeId: "state:total"');
	expect(addModule).toContain('path: []');
	expect(addModule).toContain('return value + context.graph.read("state:profile", ["step"]);');

	const binaryAddModule = eventModuleSource('total = total + profile.step');

	expect(binaryAddModule).toContain('context.graph.write({');
	expect(binaryAddModule).toContain('graphNodeId: "state:total"');
	expect(binaryAddModule).toContain('path: []');
	expect(binaryAddModule).toContain(
		'value: context.graph.read("state:total", []) + context.graph.read("state:profile", ["step"])',
	);

	const nestedAddModule = eventModuleSource('total = (total + profile.step) * profile.scale');

	expect(nestedAddModule).toContain('context.graph.write({');
	expect(nestedAddModule).toContain('graphNodeId: "state:total"');
	expect(nestedAddModule).toContain('path: []');
	expect(nestedAddModule).toContain(
		'value: (context.graph.read("state:total", []) + context.graph.read("state:profile", ["step"])) * context.graph.read("state:profile", ["scale"])',
	);

	const conditionalModule = eventModuleSource('total = menu.open ? profile.step : total');

	expect(conditionalModule).toContain('context.graph.write({');
	expect(conditionalModule).toContain('graphNodeId: "state:total"');
	expect(conditionalModule).toContain('path: []');
	expect(conditionalModule).toContain(
		'value: context.graph.read("state:menu", ["open"]) ? context.graph.read("state:profile", ["step"]) : context.graph.read("state:total", [])',
	);

	const callValueModule = eventModuleSource('total = Math.max(total, profile.step)');

	expect(callValueModule).toContain('context.graph.write({');
	expect(callValueModule).toContain('graphNodeId: "state:total"');
	expect(callValueModule).toContain('path: []');
	expect(callValueModule).toContain(
		'value: Math.max(context.graph.read("state:total", []), context.graph.read("state:profile", ["step"]))',
	);

	const importedCallValueModule = eventModuleSource('total = clamp(total, profile.step)');

	expect(importedCallValueModule).toContain('import { clamp } from "./math";');
	expect(importedCallValueModule).toContain('context.graph.write({');
	expect(importedCallValueModule).toContain('graphNodeId: "state:total"');
	expect(importedCallValueModule).toContain('path: []');
	expect(importedCallValueModule).toContain(
		'value: clamp(context.graph.read("state:total", []), context.graph.read("state:profile", ["step"]))',
	);

	const arrayLiteralModule = eventModuleSource('items = [nextItem');

	expect(arrayLiteralModule).toContain('context.graph.write({');
	expect(arrayLiteralModule).toContain('graphNodeId: "state:items"');
	expect(arrayLiteralModule).toContain('path: []');
	expect(arrayLiteralModule).toContain(
		'value: [context.graph.read("state:nextItem", []), "fallback"]',
	);

	const arraySpreadModule = eventModuleSource('items = [...nextItems');

	expect(arraySpreadModule).toContain('context.graph.write({');
	expect(arraySpreadModule).toContain('graphNodeId: "state:items"');
	expect(arraySpreadModule).toContain('path: []');
	expect(arraySpreadModule).toContain(
		'value: [...context.graph.read("state:nextItems", []), context.graph.read("state:nextItem", [])]',
	);

	const objectLiteralModule = eventModuleSource('settings = { title: menu.title');

	expect(objectLiteralModule).toContain('context.graph.write({');
	expect(objectLiteralModule).toContain('graphNodeId: "state:settings"');
	expect(objectLiteralModule).toContain('path: []');
	expect(objectLiteralModule).toContain(
		'value: { title: context.graph.read("state:menu", ["title"]), step: context.graph.read("state:profile", ["step"]) }',
	);

	const objectSpreadModule = eventModuleSource('settings = { ...settings, title: menu.title');

	expect(objectSpreadModule).toContain('context.graph.write({');
	expect(objectSpreadModule).toContain('graphNodeId: "state:settings"');
	expect(objectSpreadModule).toContain('path: []');
	expect(objectSpreadModule).toContain(
		'value: { ...context.graph.read("state:settings", []), title: context.graph.read("state:menu", ["title"]) }',
	);

	const computedKeyModule = eventModuleSource('settings = { [menu.title]: profile.step');

	expect(computedKeyModule).toContain('context.graph.write({');
	expect(computedKeyModule).toContain('graphNodeId: "state:settings"');
	expect(computedKeyModule).toContain('path: []');
	expect(computedKeyModule).toContain(
		'value: { [context.graph.read("state:menu", ["title"])]: context.graph.read("state:profile", ["step"]) }',
	);

	const logicalModule = eventModuleSource('menu.open &&= profile.enabled');

	expect(logicalModule).toContain('context.graph.update({');
	expect(logicalModule).toContain('graphNodeId: "state:menu"');
	expect(logicalModule).toContain('path: ["open"]');
	expect(logicalModule).toContain(
		'return value && context.graph.read("state:profile", ["enabled"]);',
	);
});

test('compileTsrxModule emits async computed runner modules without serializing runner source', async () => {
	const result = await compileTsrxModule({
		filename: 'src/AsyncComputed.tsrx',
		source: asyncComputedSource,
		symbols: [],
	});

	const runnerModule = result.symbolModules.modules.find(
		(module) => module.kind === 'async-computed-runner',
	);

	expect(result.protocolState.computed).toEqual([
		{
			graphNodeId: 'computed:details',
			name: 'details',
			async: true,
			dependencies: [{ graphNodeId: 'state:query', path: [] }],
		},
	]);
	expect(JSON.stringify(result.protocolState)).not.toContain('functionSource');
	expect(runnerModule).toMatchObject({
		kind: 'async-computed-runner',
		symbolId: 'symbol:1',
	});
	expect(runnerModule?.source).toContain('const query = read("state:query", []);');
	expect(runnerModule?.source).toContain(
		"const response = await fetch('/api/details/' + q, { signal });",
	);
	expect(result.protocolView.asyncBoundaries[0]?.asyncReads[0]?.runnerSymbolId).toBe('symbol:1');
});
