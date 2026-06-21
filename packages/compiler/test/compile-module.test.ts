import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { deserializeGraphValue } from '../../serializer/src/index.ts';

const source = `
import { state } from '@arcade/core';

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
import { state } from '@arcade/core';
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
import { state, computed } from '@arcade/core';

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

type PublicRenderTestListener = (event: { readonly type: string }) => unknown;
type PublicRenderTestGraph = {
	readonly read: (graphNodeId: string, path?: readonly string[]) => unknown;
	readonly write: (write: { readonly graphNodeId: string; readonly value: unknown }) => void;
};

class PublicRenderTestText {
	readonly nodeType = 3;
	parentElement: PublicRenderTestElement | null = null;

	constructor(private value: string) {}

	get textContent() {
		return this.value;
	}

	set textContent(value: string) {
		this.value = value;
	}

	cloneNode() {
		return new PublicRenderTestText(this.value);
	}
}

class PublicRenderTestElement {
	readonly nodeType = 1;
	readonly childNodes: Array<PublicRenderTestElement | PublicRenderTestText> = [];
	readonly attributes = new Map<string, string>();
	readonly listeners = new Map<string, PublicRenderTestListener[]>();
	parentElement: PublicRenderTestElement | null = null;

	constructor(readonly tagName: string) {}

	get firstElementChild() {
		return this.childNodes.find((child) => child.nodeType === 1) as
			| PublicRenderTestElement
			| undefined;
	}

	get nextSibling() {
		const siblings = this.parentElement?.childNodes;
		const index = siblings?.indexOf(this) ?? -1;
		return index >= 0 ? siblings?.[index + 1] : undefined;
	}

	get textContent(): string {
		return this.childNodes.map((child) => child.textContent).join('');
	}

	set textContent(value: string) {
		this.replaceChildren(...(value ? [new PublicRenderTestText(value)] : []));
	}

	appendChild(child: PublicRenderTestElement | PublicRenderTestText) {
		child.parentElement?.removeChild(child);
		child.parentElement = this;
		this.childNodes.push(child);
		return child;
	}

	replaceChildren(...children: Array<PublicRenderTestElement | PublicRenderTestText>) {
		for (const child of this.childNodes) child.parentElement = null;
		this.childNodes.length = 0;
		for (const child of children) this.appendChild(child);
	}

	insertBefore(
		child: PublicRenderTestElement | PublicRenderTestText,
		before: PublicRenderTestElement | PublicRenderTestText | undefined,
	) {
		child.parentElement?.removeChild(child);
		const index = before ? this.childNodes.indexOf(before) : -1;
		child.parentElement = this;
		this.childNodes.splice(index >= 0 ? index : this.childNodes.length, 0, child);
		return child;
	}

	removeChild(child: PublicRenderTestElement | PublicRenderTestText) {
		const index = this.childNodes.indexOf(child);
		if (index >= 0) this.childNodes.splice(index, 1);
		child.parentElement = null;
		return child;
	}

	remove() {
		this.parentElement?.removeChild(this);
	}

	setAttribute(name: string, value: string) {
		this.attributes.set(name, value);
	}

	getAttribute(name: string) {
		return this.attributes.get(name);
	}

	addEventListener(type: string, listener: PublicRenderTestListener) {
		const listeners = this.listeners.get(type) ?? [];
		listeners.push(listener);
		this.listeners.set(type, listeners);
	}

	async dispatch(type: string) {
		for (const listener of this.listeners.get(type) ?? []) {
			await listener({ type });
		}
	}

	cloneNode(deep = false) {
		const clone = new PublicRenderTestElement(this.tagName);
		for (const [name, value] of this.attributes) clone.attributes.set(name, value);
		if (deep) clone.replaceChildren(...this.childNodes.map((child) => child.cloneNode(true)));
		return clone;
	}
}

class PublicRenderTestTemplate {
	readonly content = new PublicRenderTestElement('#fragment');

	set innerHTML(html: string) {
		this.content.replaceChildren(...parsePublicRenderTestHtml(html));
	}
}

function parsePublicRenderTestHtml(html: string) {
	const root = new PublicRenderTestElement('#root');
	const stack = [root];
	const tokens = html.match(/<\/?[^>]+>|[^<]+/g) ?? [];

	for (const token of tokens) {
		const parent = stack[stack.length - 1]!;
		if (token.startsWith('</')) {
			stack.pop();
			continue;
		}
		if (token.startsWith('<')) {
			const match = token.match(/^<([A-Za-z][\w-]*)([^>]*)>/);
			if (!match) continue;
			const element = new PublicRenderTestElement(match[1]!.toLowerCase());
			for (const attribute of match[2]!.matchAll(/\s+([^\s=]+)(?:="([^"]*)")?/g)) {
				element.setAttribute(attribute[1]!, attribute[2] ?? '');
			}
			parent.appendChild(element);
			if (!token.endsWith('/>')) stack.push(element);
			continue;
		}
		parent.appendChild(new PublicRenderTestText(token));
	}

	return root.childNodes;
}

async function importPublicRenderTestModule(
	source: string,
	globals?: {
		readonly document: unknown;
		readonly loadSymbol: unknown;
	},
): Promise<Record<string, unknown>> {
	const globalScope = globalThis as typeof globalThis & {
		__arcadePublicRenderTestDocument?: unknown;
		__arcadePublicRenderTestLoadSymbol?: unknown;
	};
	const previousDocument = globalScope.__arcadePublicRenderTestDocument;
	const previousLoadSymbol = globalScope.__arcadePublicRenderTestLoadSymbol;
	if (globals) {
		globalScope.__arcadePublicRenderTestDocument = globals.document;
		globalScope.__arcadePublicRenderTestLoadSymbol = globals.loadSymbol;
	}

	try {
		return (await import(
			`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`
		)) as Record<string, unknown>;
	} finally {
		globalScope.__arcadePublicRenderTestDocument = previousDocument;
		globalScope.__arcadePublicRenderTestLoadSymbol = previousLoadSymbol;
	}
}

function products(...items: ReadonlyArray<readonly [sku: string, name: string]>) {
	return items.map(([sku, name]) => ({
		meta: { sku },
		copy: { name },
	}));
}

function elementsByTag(root: PublicRenderTestElement, tagName: string): PublicRenderTestElement[] {
	const matches: PublicRenderTestElement[] = [];
	const visit = (node: PublicRenderTestElement | PublicRenderTestText) => {
		if (node.nodeType !== 1) return;
		if (node.tagName === tagName) matches.push(node);
		for (const child of node.childNodes) visit(child);
	};
	visit(root);
	return matches;
}

function rowTexts(root: PublicRenderTestElement): string[] {
	return elementsByTag(root, 'li').map((row) => row.textContent);
}

function rowClasses(root: PublicRenderTestElement): Array<string | undefined> {
	return elementsByTag(root, 'li').map((row) => row.getAttribute('class'));
}

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
	expect(result.symbolResolverModule).toContain('import(/* @vite-ignore */ moduleUrls[row[0]])');
	expect(result.symbolResolverModule).not.toContain('switch (id)');
	expect(result.symbolResolverModuleManifest).toEqual([
		1,
		null,
		null,
		['/assets/app.handlers.js', '/assets/app.domUpdates.js'],
		['onKeyDown_0', 'onClick_1', 'inputValue_2', 'buttonText_3'],
		{
			'symbol:0': [0, 0],
			'symbol:1': [0, 1],
			'symbol:2': [1, 2],
			'symbol:3': [1, 3],
		},
	]);

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

test('compileTsrxModule accepts the scoped umbrella authoring import', async () => {
	const result = await compileTsrxModule({
		filename: 'src/UmbrellaImport.tsrx',
		source: source.replace('@arcade/core', '@arcade/arcade'),
		symbols: [],
	});

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.semanticGraph.graphBindings).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ id: 'state:count', name: 'count' }),
			expect.objectContaining({ id: 'state:menu', name: 'menu' }),
		]),
	);
});

test('compileTsrxModule emits public render direct DOM artifacts for supported keyed repeats', async () => {
	const result = await compileTsrxModule({
		filename: 'src/KeyedEntries.tsrx',
		source: `
import { state } from '@arcade/core';

export function App() @{
	let entries = state([]); let chosen = state(null); let draft = state({ code: 'draft' });
	<main><button onClick={() => entries.push({ code: draft.code, title: 'Draft' })}>Add</button><button onClick={() => delete draft.code}>Delete draft</button>
		<section>
			@for (const entry of entries; key entry.code) {
				<article class={chosen === entry.code ? 'picked' : 'plain'}>
					<h2>{entry.title}</h2>
					<button onClick={() => chosen = entry.code}>Choose</button>
				</article>
			}
		</section>
		<footer>Done</footer>
	</main>
}
`,
		symbols: [],
	});
	const moduleSource = result.publicRenderModule.moduleSource;

	expect(result.publicRenderPlan.keyedRepeats).toEqual([
		expect.objectContaining({
			repeatId: 'repeat:0',
			itemName: 'entry',
			collectionGraphNodeId: 'state:entries',
			keyPath: ['code'],
			rowTemplateHtml: '<article class=""><h2> </h2><button>Choose</button></article>',
		}),
	]);
	expect(result.publicRenderPlan.repeatGates).toEqual([
		{ repeatId: 'repeat:0', supported: true },
	]);
	for (const expected of [
		'export function App()',
		'const graph = createArcadePublicGraph()',
		'runtime: createArcadePublicRuntime(graph)',
	]) {
		expect(moduleSource).toContain(expected);
	}
	expect(moduleSource).toContain('!sameArcadePublicKeys(state.keys, nextKeys)');
	expect(moduleSource).toMatch(
		/call\(call\)[\s\S]*delete\(deletion\)[\s\S]*clearArcadePublicRows/,
	);
	for (const unexpected of [
		'state: payloadState',
		'view: arcadePublicView',
		'payloadView',
		'arcadePublicHostNodeIds',
		'arcadePublicHostNodeIndexes',
		'arcadePublicRepeatPlans',
	]) {
		expect(moduleSource).not.toContain(unexpected);
	}
});

test('compileTsrxModule public render module runs alternate keyed repeat shapes', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Catalog.tsrx',
		source: `
import { state } from '@arcade/core';

export function Catalog() @{
	let catalog = state([]);
	let activeSku = state(null);

	<div>
		<button onClick={() => catalog = catalog}>Apply</button>
		<ul>
			@for (const product of catalog; key product.meta.sku) {
				<li class={activeSku === product.meta.sku ? 'focused' : 'muted'}>
					<strong>{product.copy.name}</strong>
					<em>{product.meta.sku}</em>
					<button onClick={() => activeSku = product.meta.sku}>Focus</button>
				</li>
			}
		</ul>
	</div>
}
`,
		symbols: [],
	});
	const syncSymbol = result.symbolResolver.symbols.find((symbol) =>
		symbol.source.includes('catalog = catalog'),
	);
	const focusSymbol = result.symbolResolver.symbols.find((symbol) =>
		symbol.source.includes('activeSku = product.meta.sku'),
	);
	const focusModule = result.symbolModules.modules.find(
		(module) => module.symbolId === focusSymbol?.id,
	);
	expect(syncSymbol).toBeDefined();
	expect(focusSymbol).toBeDefined();
	expect(focusModule).toBeDefined();

	const focusExports = await importPublicRenderTestModule(focusModule!.source);
	const scenarios = [
		products(['amber-1', 'Amber'], ['blue-2', 'Blue']),
		products(['amber-1', 'Amber'], ['blue-2', 'Blue'], ['copper-3', 'Copper']),
		products(['blue-2', 'Blue'], ['amber-1', 'Amber'], ['copper-3', 'Copper']),
		products(['blue-2', 'Blue'], ['copper-3', 'Copper']),
		[],
	];
	const loadSymbol = (symbolId: string) => {
		if (symbolId === syncSymbol?.id) {
			return ({ graph }: { readonly graph: PublicRenderTestGraph }) => {
				graph.write({
					graphNodeId: 'state:catalog',
					value: scenarios.shift(),
				});
			};
		}
		if (symbolId === focusSymbol?.id) return focusExports[focusModule!.exportName];
		throw new Error(`Unexpected public render test symbol ${symbolId}`);
	};
	const document = {
		createElement(tagName: string) {
			if (tagName === 'template') return new PublicRenderTestTemplate();
			return new PublicRenderTestElement(tagName);
		},
	};
	const publicModule = await importPublicRenderTestModule(
		[
			'const document = globalThis.__arcadePublicRenderTestDocument;',
			'const loadSymbol = globalThis.__arcadePublicRenderTestLoadSymbol;',
			result.publicRenderModule.moduleSource,
		].join('\n'),
		{ document, loadSymbol },
	);
	const rendered = publicModule.Catalog() as {
		readonly root: PublicRenderTestElement;
		readonly graph: PublicRenderTestGraph;
	};
	const apply = elementsByTag(rendered.root, 'button')[0]!;

	await apply.dispatch('click');
	expect(rowTexts(rendered.root)).toEqual(['Amberamber-1Focus', 'Blueblue-2Focus']);

	await apply.dispatch('click');
	expect(rowTexts(rendered.root)).toEqual([
		'Amberamber-1Focus',
		'Blueblue-2Focus',
		'Coppercopper-3Focus',
	]);

	await elementsByTag(rendered.root, 'li')[1]!.childNodes[2]!.dispatch('click');
	expect(rendered.graph.read('state:activeSku')).toBe('blue-2');
	expect(rowClasses(rendered.root)).toEqual(['muted', 'focused', 'muted']);

	await apply.dispatch('click');
	expect(rowTexts(rendered.root)).toEqual([
		'Blueblue-2Focus',
		'Amberamber-1Focus',
		'Coppercopper-3Focus',
	]);

	await apply.dispatch('click');
	expect(rowTexts(rendered.root)).toEqual(['Blueblue-2Focus', 'Coppercopper-3Focus']);
	expect(rowClasses(rendered.root)).toEqual(['focused', 'muted']);

	await apply.dispatch('click');
	expect(elementsByTag(rendered.root, 'li')).toEqual([]);
});

test('compileTsrxModule does not emit public render factories for non-literal direct state values', async () => {
	const result = await compileTsrxModule({
		filename: 'src/KeyedEntriesWithDate.tsrx',
		source: `
import { state } from '@arcade/core';

export function App() @{
	let entries = state([]);
	let chosen = state(null);
	const created = state(new Date('2026-06-16T12:00:00.000Z'));

	<main>
		<section>
			@for (const entry of entries; key entry.code) {
				<article class={chosen === entry.code ? 'picked' : 'plain'}>
					<h2>{entry.title}</h2>
					<button onClick={() => chosen = entry.code}>Choose</button>
				</article>
			}
		</section>
		<footer>Done</footer>
	</main>
}
`,
		symbols: [],
	});

	expect(result.protocolState.cells).toEqual([
		expect.objectContaining({ graphNodeId: 'state:entries' }),
		expect.objectContaining({ graphNodeId: 'state:chosen' }),
		expect.objectContaining({ graphNodeId: 'state:created' }),
	]);
	expect(result.publicRenderModule.moduleSource).toBe('');
	expect(result.publicRenderModule.moduleSource).not.toContain('createArcadePublicGraph');
	expect(result.publicRenderModule.moduleSource).not.toContain(
		'runtime: createArcadePublicRuntime(graph)',
	);
});

test('compileTsrxModule does not emit misleading public render factories for multi-component modules', async () => {
	const result = await compileTsrxModule({
		filename: 'src/MultiComponentEntries.tsrx',
		source: `import { state } from '@arcade/core';
export function App() @{
let entries = state([]);
<main>@for (const entry of entries; key entry.code) {<article>{entry.title}</article>}</main>
}
export function Other() @{<aside>Other</aside>}`,
		symbols: [],
	});

	expect(result.publicRenderModule.moduleSource).toBe('');
});

test('compileTsrxModule does not emit public render factories for static shell expressions', async () => {
	for (const [name, shell] of [
		['text', "<h1>{'Entries'}</h1>"],
		['attribute', '<h1 title={label}>Entries</h1>'],
	] as const) {
		const result = await compileTsrxModule({
			filename: `src/StaticShell-${name}.tsrx`,
			source: `import { state } from '@arcade/core';
export function App() @{
let entries = state([]); const label = 'Entries';
<main>${shell}<section>@for (const entry of entries; key entry.code) {<article>{entry.title}</article>}</section></main>
}`,
			symbols: [],
		});

		expect(result.publicRenderModule.moduleSource).toBe('');
	}
});

test('compileTsrxModule does not emit public render factories for unsupported repeat plans', async () => {
	const result = await compileTsrxModule({
		filename: 'src/UnsupportedEntries.tsrx',
		source: `import { state } from '@arcade/core';
export function App() @{
let entries = state([]);
<main><p>No entries</p>@for (const entry of entries; key entry.code) {<article>{entry.title}</article>}</main>
}`,
		symbols: [],
	});

	expect(result.publicRenderPlan.repeatGates).toEqual([
		{
			repeatId: 'repeat:0',
			supported: false,
			reason: 'repeat-parent-must-contain-only-repeat',
		},
	]);
	expect(result.publicRenderModule.moduleSource).toBe('');
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
