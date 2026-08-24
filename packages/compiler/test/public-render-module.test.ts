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

test('SSR child props preserve callback symbols through a forwarding component', async () => {
	const result = await compileTsrxModule({
		filename: 'src/ForwardedAction.tsrx',
		source: `
function Action({ onChoose }) @{
	<button onClick={() => onChoose('cobalt')}>Choose</button>
}
function Panel({ onChoose }) @{
	<section><Action onChoose={onChoose} /></section>
}
export function App() @{
	<Panel onChoose={(value) => console.log(value)} />
}
`,
		symbols: [],
	});

	expect(result.publicRenderModule.ssrModuleSource).toContain(
		'"onChoose":marklessSsrCallbackSymbol(props,["onChoose"])',
	);
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

test('SSR repeat rows come from the authored collection when it is not a graph read', async () => {
	const result = await compileTsrxModule({
		filename: 'src/StaticNav.tsrx',
		source: `
import { navLinks } from './nav-links.ts';
const extras = [{ href: '/help', title: 'Help' }];
export function App() @{
	<nav>
		<ul>@for (const entry of navLinks; key entry.href) { <li>{entry.title}</li> }</ul>
		<ul>@for (const extra of extras; key extra.href) { <li>{extra.title}</li> }</ul>
	</nav>
}
`,
		symbols: [],
	});

	const source = result.publicRenderModule.ssrModuleSource;
	expect(source).toContain('repeatItems:(marklessSsrDataSlot,marklessSsrDataContext)=>{');
	expect(source).toContain('case "repeat:0":return (navLinks);');
	expect(source).toContain('case "repeat:1":return (extras);');
	expect(source).toContain(
		"default:throw new Error('MARKLESS_SSR_DATA_REPEAT_MISSING: '+marklessSsrDataSlot.repeatId);",
	);
	expect(source).toContain('import { navLinks } from "./nav-links.ts";');
	expect(source).toContain("const extras = [{ href: '/help', title: 'Help' }];");
});

test('SSR repeat items keep graph-backed collections on their graph read', async () => {
	const mixed = await compileTsrxModule({
		filename: 'src/MixedRepeats.tsrx',
		source: `
import { state } from '@markless/core';
const tags = ['new', 'hot'];
export function App() @{
	let rows = state([{ id: 'a', label: 'A' }]);
	<main>
		<ul>@for (const row of rows; key row.id) { <li>{row.label}</li> }</ul>
		<ul>@for (const tag of tags; key tag) { <li>{tag}</li> }</ul>
	</main>
}
`,
		symbols: [],
	});
	const graphOnly = await compileTsrxModule({
		filename: 'src/StateRepeat.tsrx',
		source: `
import { state } from '@markless/core';
export function App() @{
	let rows = state([{ id: 'a', label: 'A' }]);
	<ul>@for (const row of rows; key row.id) { <li>{row.label}</li> }</ul>
}
`,
		symbols: [],
	});

	expect(mixed.publicRenderModule.ssrModuleSource).toContain(
		'case "repeat:0":return marklessSsrReadPublicPath(marklessSsrRenderStateValues.get("state:rows"),[]);',
	);
	expect(mixed.publicRenderModule.ssrModuleSource).toContain('case "repeat:1":return (tags);');
	// A module whose repeats all read the graph keeps the renderer on its graph
	// path, so no callback is emitted for it.
	expect(graphOnly.publicRenderModule.ssrModuleSource).not.toContain('repeatItems:');
});

test('SSR repeat rows over a shared instance come from the graph, not a callback', async () => {
	const result = await compileTsrxModule({
		filename: 'src/SharedList.tsrx',
		source: `
import { shared, state } from '@markless/core';
export const listBox = shared(() => {
	const box = state({ items: [{ id: 'a', label: 'A' }] });
	return { ...box };
}, { scope: 'widget' });
export function List() @{
	const box = listBox();
	<ul>@for (const item of box.items; key item.id) { <li>{item.label}</li> }</ul>
}
`,
		symbols: [],
	});

	const source = result.publicRenderModule.ssrModuleSource;
	// Defect 86: this used to emit `case "repeat:0":return (box.items);` into a
	// module scope that declares no `box`, throwing on the first server render.
	expect(source).not.toContain('repeatItems:');
	expect(source).not.toContain('box.items');
	expect(source).toContain('"shared:src/SharedList.tsrx#listBox/state:box"');
});

test('SSR seeds only the prop cells an arm rebuild reads back', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Lantern.tsrx',
		source: `
import { state } from '@markless/core';
export function Lantern() @{
	let hot = state(false);
	<section><button onClick={() => hot = !hot}>t</button><Shade>glow</Shade>@if (hot) { <em>hot</em> }</section>
}
export function Shade({ children }) @{
	let lit = state(false);
	<div><button onClick={() => lit = !lit}>t</button>@if (lit) { <>{children}</> }</div>
}
`,
		symbols: [],
	});

	const source = result.publicRenderModule.ssrModuleSource;
	const shadeStart = source.indexOf('async function marklessRenderSsrShade');
	expect(shadeStart).toBeGreaterThanOrEqual(0);
	// The arm that shows projected children needs them back at flip time.
	expect(source.slice(shadeStart)).toContain(
		'marklessSsrSeedPropCells(marklessSsrComposeState(marklessSsrPayloadState, marklessSsrChildren), props, [{"graphNodeId":"prop:props","keys":["children"]}])',
	);
	// The root's arm owns its markup and reads no prop, so it seeds nothing:
	// exactly one component in the module pays for a prop cell.
	expect(source.match(/marklessSsrSeedPropCells\(/g)?.length).toBe(1);
});

test('SSR composition keeps the branch records a same-module component anchored', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Beacon.tsrx',
		source: `
import { state } from '@markless/core';
export function Lamp() @{
	let on = state(false);
	<span><button onClick={() => on = !on}>t</button>@if (on) { <b>on</b> }</span>
}
export function Beacon() @{
	<div><Lamp /></div>
}
`,
		symbols: [],
	});

	// Every SSR entry composes the view it just rendered; blanking the anchored
	// records left a non-root component's branch unwired after resume.
	const source = result.publicRenderModule.ssrModuleSource;
	expect(source).not.toContain('WithoutAnchors');
	expect(
		source.match(/marklessSsrComposeView\(marklessSsrRendered\.structure, payloadView,/g)?.length,
	).toBe(2);
});
