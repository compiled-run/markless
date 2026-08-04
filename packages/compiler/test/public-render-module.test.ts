import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/compile-module.ts';
import {
	domNodePathExpression,
	graphReadExpression,
	itemPathReadSource,
} from '../src/passes/public-render/source-expressions.ts';
import { createPublicProtocolView } from '../src/passes/public-render/view-filter.ts';
import { isDirectPublicLiteralValue } from '../src/passes/public-render/state-entries.ts';

test('public render module source helpers keep generated path expressions readable', () => {
	expect(itemPathReadSource('item', ['code'])).toBe('item.code');
	expect(itemPathReadSource('item', ['copy', 'name'])).toBe(
		'readMarklessPublicPath(item, ["copy","name"])',
	);
	expect(graphReadExpression('state:chosen', [])).toBe('graph.read("state:chosen")');
	expect(graphReadExpression('state:score', ['total'])).toBe(
		'graph.read("state:score", ["total"])',
	);
	expect(domNodePathExpression('root', [2, 1])).toBe('root.childNodes?.[2]?.childNodes?.[1]');
});

test('public render module protocol view helper keeps only direct public records', () => {
	const protocolView = {
		locators: [
			{ hostNodeId: 'host:root', index: 7 },
			{ hostNodeId: 'host:repeat-row', index: 8 },
		],
		events: [
			{ hostNodeId: 'host:root', eventName: 'click' },
			{ hostNodeId: 'host:repeat-row', eventName: 'click' },
		],
		domUpdates: [
			{
				hostNodeId: 'host:root',
				graphNodeId: 'state:score',
				path: ['total'],
				source: 'score.total',
				target: { kind: 'text' },
			},
			{
				hostNodeId: 'host:root',
				graphNodeId: 'state:flag',
				path: [],
				source: 'flag',
				target: { kind: 'attribute', name: 'hidden' },
			},
			{
				hostNodeId: 'host:repeat-row',
				graphNodeId: 'state:items',
				path: [],
				source: 'items',
				target: { kind: 'text' },
			},
		],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	} as any;
	const renderData = {
		root: { templateId: 'template:App' },
		chunks: [{
			id: 'template:App',
			hosts: [{ hostNodeId: 'host:root' }],
		}],
	} as any;

	const publicView = createPublicProtocolView(protocolView, renderData);

	expect(publicView.locators).toEqual([{ hostNodeId: 'host:root', index: 0 }]);
	expect(publicView.events).toEqual([{ hostNodeId: 'host:root', eventName: 'click' }]);
	expect(publicView.domUpdates).toEqual([
		{
			hostNodeId: 'host:root',
			graphNodeId: 'state:flag',
			path: [],
			source: 'flag',
			target: { kind: 'attribute', name: 'hidden' },
		},
	]);
});

test('public render module literal gate accepts only directly embeddable state values', () => {
	expect(isDirectPublicLiteralValue({ items: [{ id: 1, label: 'One' }], selected: null })).toBe(
		true,
	);
	expect(isDirectPublicLiteralValue(new Date('2026-06-16T12:00:00.000Z'))).toBe(false);

	const recursive: unknown[] = [];
	recursive.push(recursive);
	expect(isDirectPublicLiteralValue(recursive)).toBe(false);
});

test('public render definitions and SSR bind sibling child events to distinct resolver IDs', async () => {
	const result = await compileTsrxModule({
		filename: 'src/BoundChildren.tsrx',
		source: `
function Child({ label }: { label: string }) @{
	<button onClick={() => console.log(label)}>{label}</button>
}
export function App() @{
	<main><Child label="first" /><Child label="second" /></main>
}
`,
		symbols: [],
	});
	const ids = result.boundSymbolResolver.rows.map((row) => row.id);
	expect(ids).toHaveLength(2);
	expect(new Set(ids).size).toBe(2);
	const definitions = JSON.stringify(result.publicRenderModule.componentDefinitions);
	for (const id of ids) {
		expect(definitions).toContain(id);
		expect(result.publicRenderModule.ssrModuleSource).toContain(id);
	}
});

test('same-module child SSR evaluates only template computed values owned by that child', async () => {
	const result = await compileTsrxModule({
		filename: 'src/ComputedOwner.tsrx',
		source: `
import { state } from '@markless/core';
function Child({ label }: { label: string }) @{
	<button>{label}</button>
}
export function App() @{
	let left = state('west');
	let right = state('east');
	<main><Child label="compass" /><output>{left + ':' + right}</output></main>
}
`,
		symbols: [],
	});
	const source = result.publicRenderModule.ssrModuleSource;
	const childStart = source.indexOf('async function marklessRenderSsrChild');
	const rootStart = source.indexOf('const marklessSsrPropEvents');
	expect(childStart).toBeGreaterThanOrEqual(0);
	expect(rootStart).toBeGreaterThan(childStart);
	expect(source.slice(childStart, rootStart)).not.toContain('computed:templateExpression:0');
	expect(source.slice(rootStart)).toContain('computed:templateExpression:0');
});

test('SSR branch selection reads an async computed through its graph binding', async () => {
	const result = await compileTsrxModule({
		filename: 'src/TelescopePanel.tsrx',
		source: `
import { computed } from '@markless/core';
export function TelescopePanel() @{
	const scan = computed(async () => ({ tracking: true }));
	<section>
		@try {
			@if (scan.tracking) { <strong>Tracking</strong> } @else { <em>Idle</em> }
		} @pending { <p>Booting</p> } @catch { <p>Fault</p> }
	</section>
}
`,
		symbols: [],
	});

	const source = result.publicRenderModule.ssrModuleSource;
	expect(source).toContain(
		'marklessSsrReadPublicPath(marklessSsrRenderStateValues.get("computed:scan"),["tracking"])',
	);
	expect(source).not.toContain('const arm=((scan.tracking)?0:1)');
});

test('linked component definitions carry the async boundary owning a composed edge', async () => {
	const child = await compileTsrxModule({
		filename: 'src/StatusBadge.tsrx',
		source: `export function StatusBadge({ active }) @{ <p>@if (active) { Live } @else { Idle }</p> }`,
		symbols: [],
	});
	const result = await compileTsrxModule({
		filename: 'src/Dashboard.tsrx',
		source: `
import { computed } from '@markless/core';
import { StatusBadge } from './StatusBadge.tsrx';
export function Dashboard() @{
	const status = computed(async () => ({ active: true }));
	<main>@try { <StatusBadge active={status.active} /> } @pending { <p>Wait</p> } @catch { <p>Failed</p> }</main>
}
`,
		symbols: [],
		importedModuleInterfaces: { './StatusBadge.tsrx': child.moduleGraphInterface },
	});

	expect(result.publicRenderModule.componentDefinitions).toEqual([
		expect.objectContaining({
			name: 'Dashboard',
			edges: [
				expect.objectContaining({
					id: 'component-edge:0',
					asyncBoundaryId: 'boundary:0',
				}),
			],
		}),
	]);
});
