import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { deserializeGraphValue } from '../../serializer/src/index.ts';
import { createEventOnlyResumeContainerFromPayloads } from '../../web/src/event-only-resume.ts';
import type { ProtocolStatePayload, ProtocolViewPayload } from '../../serializer/src/index.ts';

const source = `
import { state } from 'arcade';

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
import { state } from 'arcade';
import { clamp } from './math';
import { makeItems } from './items';

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
				items.push(...makeItems(1000));
			}}
		>
			{menu.title}
		</button>
	</section>
}
`;

const asyncComputedSource = `
import { state, computed } from 'arcade';

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

const defaultExportPageSource = `
import { state } from 'arcade';

export default function Home() @{
	const count = state(0);

	<main>
		<h1>Arcade Router</h1>
		<button onClick={() => count++}>Button {count}</button>
	</main>
}
`;

type PublicRenderTestEvent = {
	readonly type: string;
	readonly target: PublicRenderTestElement | null;
};
type PublicRenderTestListener = (event: PublicRenderTestEvent) => unknown;
type PublicRenderTestGraph = {
	readonly read: (graphNodeId: string, path?: readonly string[]) => unknown;
	readonly write: (write: { readonly graphNodeId: string; readonly value: unknown }) => void;
};
type PublicRenderTestContainer = PublicRenderTestElement | PublicRenderTestFragment;
type PublicRenderTestNode =
	| PublicRenderTestElement
	| PublicRenderTestFragment
	| PublicRenderTestText;

class PublicRenderTestText {
	readonly nodeType = 3;
	nodeValueWriteCount = 0;
	textContentWriteCount = 0;
	parentElement: PublicRenderTestContainer | null = null;

	constructor(private value: string) {}

	get nodeValue() {
		return this.value;
	}

	set nodeValue(value: string) {
		this.nodeValueWriteCount++;
		this.value = value;
	}

	get textContent() {
		return this.value;
	}

	set textContent(value: string) {
		this.textContentWriteCount++;
		this.value = value;
	}

	cloneNode() {
		return new PublicRenderTestText(this.value);
	}
}

class PublicRenderTestElement {
	readonly nodeType = 1;
	readonly childNodes: PublicRenderTestNode[] = [];
	readonly attributes = new Map<string, string>();
	readonly listeners = new Map<string, PublicRenderTestListener[]>();
	classWriteCount = 0;
	parentElement: PublicRenderTestContainer | null = null;

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

	get className(): string {
		return this.attributes.get('class') ?? '';
	}

	set className(value: string) {
		this.classWriteCount++;
		this.attributes.set('class', value);
	}

	appendChild(child: PublicRenderTestNode) {
		if (child.nodeType === 11) {
			while (child.childNodes.length > 0) this.appendChild(child.childNodes[0]!);
			return child;
		}
		child.parentElement?.removeChild(child);
		child.parentElement = this;
		this.childNodes.push(child);
		return child;
	}

	replaceChildren(...children: PublicRenderTestNode[]) {
		for (const child of this.childNodes) child.parentElement = null;
		this.childNodes.length = 0;
		for (const child of children) this.appendChild(child);
	}

	insertBefore(child: PublicRenderTestNode, before: PublicRenderTestNode | undefined) {
		if (child.nodeType === 11) {
			while (child.childNodes.length > 0) this.insertBefore(child.childNodes[0]!, before);
			return child;
		}
		child.parentElement?.removeChild(child);
		const index = before ? this.childNodes.indexOf(before) : -1;
		child.parentElement = this;
		this.childNodes.splice(index >= 0 ? index : this.childNodes.length, 0, child);
		return child;
	}

	removeChild(child: PublicRenderTestNode) {
		const index = this.childNodes.indexOf(child);
		if (index >= 0) this.childNodes.splice(index, 1);
		child.parentElement = null;
		return child;
	}

	remove() {
		this.parentElement?.removeChild(this);
	}

	setAttribute(name: string, value: string) {
		if (name === 'class') this.classWriteCount++;
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

	async dispatch(type: string, event: PublicRenderTestEvent = { type, target: this }) {
		for (const listener of this.listeners.get(type) ?? []) {
			await listener(event);
		}
		if (this.parentElement?.nodeType === 1) {
			await this.parentElement.dispatch(type, event);
		}
	}

	cloneNode(deep = false) {
		const clone = new PublicRenderTestElement(this.tagName);
		for (const [name, value] of this.attributes) clone.attributes.set(name, value);
		if (deep) clone.replaceChildren(...this.childNodes.map((child) => child.cloneNode(true)));
		return clone;
	}
}

class PublicRenderTestFragment {
	readonly nodeType = 11;
	readonly childNodes: PublicRenderTestNode[] = [];
	parentElement: PublicRenderTestContainer | null = null;

	get firstElementChild() {
		return this.childNodes.find((child) => child.nodeType === 1) as
			| PublicRenderTestElement
			| undefined;
	}

	appendChild(child: PublicRenderTestNode) {
		if (child.nodeType === 11) {
			while (child.childNodes.length > 0) this.appendChild(child.childNodes[0]!);
			return child;
		}
		child.parentElement?.removeChild(child);
		child.parentElement = this;
		this.childNodes.push(child);
		return child;
	}

	replaceChildren(...children: PublicRenderTestNode[]) {
		for (const child of this.childNodes) child.parentElement = null;
		this.childNodes.length = 0;
		for (const child of children) this.appendChild(child);
	}

	removeChild(child: PublicRenderTestNode) {
		const index = this.childNodes.indexOf(child);
		if (index >= 0) this.childNodes.splice(index, 1);
		child.parentElement = null;
		return child;
	}
}

class PublicRenderTestTemplate {
	readonly content = new PublicRenderTestFragment();

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
		readonly document?: unknown;
		readonly loadSymbol?: unknown;
		readonly childComponent?: unknown;
	},
): Promise<Record<string, unknown>> {
	const globalScope = globalThis as typeof globalThis & {
		__arcadePublicRenderTestDocument?: unknown;
		__arcadePublicRenderTestLoadSymbol?: unknown;
		__arcadePublicRenderTestChildComponent?: unknown;
	};
	const previousDocument = globalScope.__arcadePublicRenderTestDocument;
	const previousLoadSymbol = globalScope.__arcadePublicRenderTestLoadSymbol;
	const previousChildComponent = globalScope.__arcadePublicRenderTestChildComponent;
	if (globals) {
		globalScope.__arcadePublicRenderTestDocument = globals.document;
		globalScope.__arcadePublicRenderTestLoadSymbol = globals.loadSymbol;
		globalScope.__arcadePublicRenderTestChildComponent = globals.childComponent;
	}

	try {
		return (await import(
			`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`
		)) as Record<string, unknown>;
	} finally {
		globalScope.__arcadePublicRenderTestDocument = previousDocument;
		globalScope.__arcadePublicRenderTestLoadSymbol = previousLoadSymbol;
		globalScope.__arcadePublicRenderTestChildComponent = previousChildComponent;
	}
}

function ssrRenderTestModuleSource(
	result: Awaited<ReturnType<typeof compileTsrxModule>>,
	options: { readonly replaceChildImport?: boolean } = {},
): string {
	const ssrSource = options.replaceChildImport
		? result.publicRenderModule.ssrModuleSource.replace(
				/import (?:__arcadeSsrComponent0|\{ [^}]+ as __arcadeSsrComponent0 \}) from [^;]+;/,
				'const __arcadeSsrComponent0 = globalThis.__arcadePublicRenderTestChildComponent;',
			)
		: result.publicRenderModule.ssrModuleSource;

	return [
		`const payloadState = ${JSON.stringify(result.protocolState)};`,
		`const payloadView = ${JSON.stringify(result.protocolView)};`,
		ssrSource,
		'export { arcadeRenderSsr };',
	].join('\n');
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

function classWriteCounts(root: PublicRenderTestElement, tagName = 'li'): number[] {
	return elementsByTag(root, tagName).map((row) => row.classWriteCount);
}

function textNodesByTag(root: PublicRenderTestElement, tagName: string): PublicRenderTestText[] {
	const textNodes: PublicRenderTestText[] = [];
	const visit = (node: PublicRenderTestNode) => {
		if (node.nodeType === 3) {
			textNodes.push(node);
			return;
		}
		for (const child of node.childNodes) visit(child);
	};
	for (const element of elementsByTag(root, tagName)) {
		for (const child of element.childNodes) visit(child);
	}
	return textNodes;
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
	expect(result).not.toHaveProperty('renderShell');
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

test('compileTsrxModule treats a default exported TSRX function as the public render root', async () => {
	const result = await compileTsrxModule({
		filename: 'pages/index.tsrx',
		source: defaultExportPageSource,
		symbols: [],
	});

	expect(result.semanticGraph.components).toEqual([{ name: 'Home' }]);
	expect(result.protocolView.locators).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ hostNodeId: 'h0', tagName: 'main' }),
			expect.objectContaining({ hostNodeId: 'h2', tagName: 'button' }),
		]),
	);
	expect(result.publicRenderModule.ssrExportName).toBe('arcadeRenderSsr');
	expect(result.publicRenderModule.ssrModuleSource).toContain('function arcadeRenderSsr');
	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = (ssrModule.arcadeRenderSsr as () => { readonly html: string })();

	expect(output.html).toBe('<main><h1>Arcade Router</h1><button>Button 0</button></main>');
});

test('compileTsrxModule passes component children into SSR component props', async () => {
	const result = await compileTsrxModule({
		filename: 'pages/index.tsrx',
		source: `
import { Link } from 'arcade/router';

export default function Home() @{
	<main>
		<Link href="/docs">Docs</Link>
	</main>
}
`,
		symbols: [],
	});
	const ssrModule = await importPublicRenderTestModule(
		ssrRenderTestModuleSource(result, { replaceChildImport: true }),
		{
			childComponent: {
				renderSsr(props: { readonly children?: unknown; readonly href?: string }) {
					return { html: `<a href="${props.href}">${props.children}</a>` };
				},
			},
		},
	);
	const output = (ssrModule.arcadeRenderSsr as () => { readonly html: string })();

	expect(output.html).toBe('<main><a href="/docs">Docs</a></main>');
});

test('compileTsrxModule preserves value imports used by public render expressions', async () => {
	const result = await compileTsrxModule({
		filename: 'pages/index.tsrx',
		source: `
import { routeHref } from 'virtual:test-route-href';
import { Link } from 'arcade/router';

export default function Home() @{
	<main>
		<Link href={routeHref('/docs/[...slug]', { slug: ['intro'] })}>Docs</Link>
	</main>
}
`,
		symbols: [],
	});

	expect(result.publicRenderModule.ssrModuleSource).toContain(
		'import { routeHref } from "virtual:test-route-href";',
	);
	expect(result.publicRenderModule.csrModuleSource).toContain(
		'import { routeHref } from "virtual:test-route-href";',
	);

	const ssrModule = await importPublicRenderTestModule(
		ssrRenderTestModuleSource(result, { replaceChildImport: true }).replace(
			'import { routeHref } from "virtual:test-route-href";',
			'const routeHref = (_pattern, params) => `/docs/${params.slug.join("/")}`;',
		),
		{
			childComponent: {
				renderSsr(props: { readonly children?: unknown; readonly href?: string }) {
					return { html: `<a href="${props.href}">${props.children}</a>` };
				},
			},
		},
	);
	const output = (ssrModule.arcadeRenderSsr as () => { readonly html: string })();

	expect(output.html).toBe('<main><a href="/docs/intro">Docs</a></main>');
});

test('compileTsrxModule imports TSRX child components through their default SSR artifact', async () => {
	const result = await compileTsrxModule({
		filename: 'src/root.tsrx',
		source: `
import { Counter } from './Counter.tsrx';

export function App() @{
	<section>
		<Counter />
		<span>hello</span>
	</section>
}
`,
		symbols: [],
	});

	expect(result.publicRenderModule.ssrModuleSource).toContain(
		'import __arcadeSsrComponent0 from "./Counter.tsrx";',
	);
	expect(result.publicRenderModule.ssrModuleSource).not.toContain(
		'import { Counter as __arcadeSsrComponent0 } from "./Counter.tsrx";',
	);
});

test('compileTsrxModule accepts the main authoring import', async () => {
	const result = await compileTsrxModule({
		filename: 'src/MainImport.tsrx',
		source,
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

test('compileTsrxModule emits conditional class DOM updates from graph tests', async () => {
	const result = await compileTsrxModule({
		filename: 'src/ConditionalClass.tsrx',
		source: `
import { state } from 'arcade';

export function App() @{
	let selected = state(false);

	<button class={selected ? 'library-song selected' : 'library-song'}>
		Pick
	</button>
}
`,
		symbols: [],
	});

	expect(result.protocolView.domUpdates).toContainEqual(
		expect.objectContaining({
			source: 'selected',
			graphNodeId: 'state:selected',
			path: [],
			target: {
				kind: 'class',
				trueValue: 'library-song selected',
				falseValue: 'library-song',
			},
		}),
	);
});

test('compileTsrxModule emits same-host conditional branch text DOM updates', async () => {
	const result = await compileTsrxModule({
		filename: 'src/ConditionalBranchText.tsrx',
		source: `
import { state } from 'arcade';

export function App() @{
	let playing = state(false);

	<button onClick={() => playing = !playing}>
		@if (playing) {
			<span class="play-icon">Pause</span>
		} @else {
			<span class="play-icon">Play</span>
		}
	</button>
}
`,
		symbols: [],
	});

	expect(result.protocolView.domUpdates).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				source: 'playing',
				graphNodeId: 'state:playing',
				path: [],
				target: {
					kind: 'text',
					trueValue: 'Pause',
					falseValue: 'Play',
				},
			}),
		]),
	);

	const conditionalTextHostIds = new Set(
		result.protocolView.domUpdates
			.filter(
				(update) =>
					update.target?.kind === 'text' &&
					update.target.trueValue === 'Pause' &&
					update.target.falseValue === 'Play',
			)
			.map((update) => update.hostNodeId),
	);

	expect(
		result.publicRenderPlan.staticHostLocators.some((locator) =>
			conditionalTextHostIds.has(locator.hostNodeId),
		),
	).toBe(true);
});

test('compileTsrxModule emits public render direct DOM artifacts for supported keyed repeats', async () => {
	const result = await compileTsrxModule({
		filename: 'src/KeyedEntries.tsrx',
		source: `
import { state } from 'arcade';

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
	const addSymbol = result.symbolResolver.symbols.find((symbol) =>
		symbol.source.includes('entries.push'),
	);
	const deleteDraftSymbol = result.symbolResolver.symbols.find((symbol) =>
		symbol.source.includes('delete draft.code'),
	);

	expect(addSymbol).toBeDefined();
	expect(deleteDraftSymbol).toBeDefined();
	expect(result.publicRenderPlan.staticEventControls).toEqual([
		{
			eventName: 'click',
			hostNodeId: addSymbol!.hostNodeId,
			hostPath: [0],
			symbolIds: [addSymbol!.id],
		},
		{
			eventName: 'click',
			hostNodeId: deleteDraftSymbol!.hostNodeId,
			hostPath: [1],
			symbolIds: [deleteDraftSymbol!.id],
		},
	]);
	expect(result.publicRenderPlan.keyedRepeats).toEqual([
		expect.objectContaining({
			repeatId: 'repeat:0',
			itemName: 'entry',
			collectionGraphNodeId: 'state:entries',
			keyPath: ['code'],
			parentPath: [2],
			rowTemplateHtml: '<article class=""><h2> </h2><button>Choose</button></article>',
		}),
	]);
	expect(result.publicRenderPlan.repeatGates).toEqual([
		{ repeatId: 'repeat:0', supported: true },
	]);
	for (const expected of [
		'export function App()',
		'const graph = createArcadePublicGraph()',
		'runtime: { async dispatch() {} }',
	]) {
		expect(moduleSource).toContain(expected);
	}
	expect(moduleSource).not.toContain('function createArcadePublicRuntime');
	expect(moduleSource).not.toContain('view: { version: 1');
	expect(moduleSource).toContain('!sameArcadePublicKeys(state.keys, nextKeys)');
	expect(moduleSource).toContain(
		'const repeatState0 = { rows: new Map(), keys: [], classValue: undefined };',
	);
	expect(moduleSource).toContain('createArcadePublicLoadSymbol(root, repeatState0)');
	expect(moduleSource).toContain(
		'syncArcadePublicRepeat0(root, graph, componentLoadSymbol, repeatState0);',
	);
	expect(moduleSource).toContain(
		'syncArcadePublicRepeat0(root, context.graph, loadArcadePublicSymbol, repeatState0);',
	);
	expect(moduleSource).not.toContain('function syncArcadePublicRepeats');
	expect(moduleSource).not.toContain('const arcadePublicRepeatStates');
	expect(moduleSource).not.toContain('function repeatState(root) {');
	expect(moduleSource).not.toContain('function repeatState(root, planIndex)');
	expect(moduleSource).not.toContain('states = []');
	expect(moduleSource).toContain('function createArcadePublicRepeat0Record(row, item)');
	expect(moduleSource).toContain('function createArcadePublicRepeat0Row()');
	expect(moduleSource).toContain('let arcadePublicRepeat0Template;');
	expect(moduleSource).toContain('const rowRoot = createArcadePublicRepeat0Row();');
	expect(moduleSource).toContain('record = createArcadePublicRepeat0Record(rowRoot, item);');
	expect(moduleSource).not.toContain('createArcadePublicRow(');
	expect(moduleSource).not.toContain('arcadePublicRowTemplates');
	expect(moduleSource).toContain('text0: row.childNodes?.[0]?.childNodes?.[0],');
	expect(moduleSource).toContain('class0: row,');
	expect(moduleSource).not.toContain('record.targets');
	expect(moduleSource).toContain('[[0],"click",["symbol:0"]]');
	expect(moduleSource).toContain('[[1],"click",["symbol:1"]]');
	expect(moduleSource).toContain('const element = nodeAtPath(root, path);');
	expect(moduleSource).toContain('const parent = root.childNodes?.[2];');
	expect(moduleSource).not.toContain('const parent = elementAtDomOrder(root');
	expect(moduleSource).not.toContain('function elementAtDomOrder');
	expect(moduleSource).toContain('const textTarget0 = record.text0;');
	expect(moduleSource).toContain('item.code');
	expect(moduleSource).toContain('item.title');
	expect(moduleSource).not.toContain('readArcadePublicPath(item, ["code"])');
	expect(moduleSource).not.toContain('readArcadePublicPath(item, ["title"])');
	expect(moduleSource).not.toContain('nodeAtPath(record.root');
	expect(moduleSource).not.toContain('nodeAtPath(row');
	expect(moduleSource).toContain('function nodeAtPath(root, path)');
	expect(moduleSource).not.toContain('await graph.flush();');
	expect(moduleSource).toContain('graph.flush();');
	expect(moduleSource).toContain('function readArcadePublicRepeat0ClassValues(graph)');
	expect(moduleSource).toContain(
		'const collectionDirty = graph.isDirty?.("state:entries") ?? true;',
	);
	expect(moduleSource).toContain('const classDirty = graph.isDirty?.("state:chosen");');
	expect(moduleSource).toContain('const items = graph.read("state:entries");');
	expect(moduleSource).toContain('return graph.read("state:chosen");');
	expect(moduleSource).not.toContain('graph.read("state:entries", [])');
	expect(moduleSource).not.toContain('graph.read("state:chosen", [])');
	expect(moduleSource).toContain('const classValue = readArcadePublicRepeat0ClassValues(graph);');
	expect(moduleSource).toContain('writeArcadePublicRepeat0Row(record, item, classValue);');
	expect(moduleSource).toContain('attachArcadePublicRepeat0Events(record);');
	expect(moduleSource).not.toContain(
		'attachArcadePublicRepeat0Events(record, graph, loadSymbolForRepeat);',
	);
	expect(moduleSource).toContain(
		'delegateArcadePublicRepeat0Events(parent, graph, loadSymbolForRepeat);',
	);
	expect(moduleSource).toContain('event0: row.childNodes?.[1],');
	expect(moduleSource).toContain('const element0 = record.event0;');
	expect(moduleSource).not.toContain('const element0 = record.root.childNodes?.[1];');
	expect(moduleSource).toContain('element0.__arcadePublicRepeat0Event0 = record;');
	expect(moduleSource).toContain('parent.addEventListener("click"');
	expect(moduleSource).toContain('const record = eventTarget?.__arcadePublicRepeat0Event0;');
	expect(moduleSource).not.toContain('element0.addEventListener("click"');
	expect(moduleSource).toContain('const dirtyGraphNodeIds = new Set();');
	expect(moduleSource).toContain('const dirtyArrayIndexes = new Map();');
	expect(moduleSource).toContain(
		'isDirty(graphNodeId) { return dirtyGraphNodeIds.has(graphNodeId); }',
	);
	expect(moduleSource).toContain(
		'dirtyIndexes(graphNodeId) { return dirtyArrayIndexes.get(graphNodeId); }',
	);
	expect(moduleSource).toContain('const dirtyIndexes = graph.dirtyIndexes?.("state:entries");');
	expect(moduleSource).toContain(
		'patchArcadePublicRepeat0DirtyRows(state, items, dirtyIndexes, classValue)',
	);
	expect(moduleSource).toContain('function replaceArcadePublicRows(parent, state, keys)');
	expect(moduleSource).toContain('document.createDocumentFragment()');
	expect(moduleSource).toContain('const newRows = document.createDocumentFragment();');
	expect(moduleSource).toContain('newRows.appendChild(record.root);');
	expect(moduleSource).toContain('parent.appendChild?.(newRows);');
	expect(moduleSource).toContain('pruneArcadePublicRows(state, nextKeys)');
	expect(moduleSource).toContain('const record = state.rows.get(matchValue);');
	expect(moduleSource).not.toContain('const liveKeys = new Set();');
	expect(moduleSource).not.toContain('const nodes = [];');
	expect(moduleSource).not.toContain('const mismatch = [];');
	expect(moduleSource).not.toContain('function appendArcadePublicRows');
	expect(moduleSource).not.toContain('parent.replaceChildren(...arcadePublicRowsForKeys');
	expect(moduleSource).not.toContain('events: new Set()');
	expect(moduleSource).not.toContain('record.events');
	expect(moduleSource).not.toContain('arcadePublicEventMatch');
	expect(moduleSource).not.toContain('eventTargets');
	expect(moduleSource).not.toContain('findArcadePublicRepeatEventRecord');
	expect(moduleSource).toMatch(
		/call\(call\)[\s\S]*delete\(deletion\)[\s\S]*clearArcadePublicRows/,
	);
	expect(moduleSource).toContain(
		'if (parent.replaceChildren) parent.replaceChildren(); else parent.textContent = "";',
	);
	expect(moduleSource).not.toContain(
		'if (parent.textContent !== undefined) parent.textContent = ""; else parent.replaceChildren?.();',
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
import { state } from 'arcade';

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
					<button onClick={() => activeSku = product.meta.sku}><span>Focus</span></button>
					<button onClick={() => activeSku = product.copy.name}></button>
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
	const nameSymbol = result.symbolResolver.symbols.find((symbol) =>
		symbol.source.includes('activeSku = product.copy.name'),
	);
	const focusModule = result.symbolModules.modules.find(
		(module) => module.symbolId === focusSymbol?.id,
	);
	const nameModule = result.symbolModules.modules.find(
		(module) => module.symbolId === nameSymbol?.id,
	);
	expect(syncSymbol).toBeDefined();
	expect(focusSymbol).toBeDefined();
	expect(nameSymbol).toBeDefined();
	expect(focusModule).toBeDefined();
	expect(nameModule).toBeDefined();

	const focusExports = await importPublicRenderTestModule(focusModule!.source);
	const nameExports = await importPublicRenderTestModule(nameModule!.source);
	const initialProducts = products(['amber-1', 'Amber'], ['blue-2', 'Blue']);
	const appendedProducts = [...initialProducts, ...products(['copper-3', 'Copper'])];
	const scenarios = [
		initialProducts,
		appendedProducts,
		products(['amber-1', 'Amber Prime'], ['blue-2', 'Blue'], ['copper-3', 'Copper']),
		products(['blue-2', 'Blue'], ['amber-1', 'Amber Prime'], ['copper-3', 'Copper']),
		products(['blue-2', 'Blue'], ['copper-3', 'Copper']),
		[],
	];
	const loadSymbolCalls = new Map<string, number>();
	const loadSymbol = (symbolId: string) => {
		loadSymbolCalls.set(symbolId, (loadSymbolCalls.get(symbolId) ?? 0) + 1);
		if (symbolId === syncSymbol?.id) {
			return ({ graph }: { readonly graph: PublicRenderTestGraph }) => {
				graph.write({
					graphNodeId: 'state:catalog',
					value: scenarios.shift(),
				});
			};
		}
		if (symbolId === focusSymbol?.id) return focusExports[focusModule!.exportName];
		if (symbolId === nameSymbol?.id) return nameExports[nameModule!.exportName];
		throw new Error(`Unexpected public render test symbol ${symbolId}`);
	};
	const document = {
		createElement(tagName: string) {
			if (tagName === 'template') return new PublicRenderTestTemplate();
			return new PublicRenderTestElement(tagName);
		},
		createDocumentFragment() {
			return new PublicRenderTestFragment();
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
	expect(loadSymbolCalls.get(syncSymbol!.id)).toBe(undefined);
	expect(loadSymbolCalls.get(focusSymbol!.id)).toBe(undefined);

	await apply.dispatch('click');
	expect(loadSymbolCalls.get(syncSymbol!.id)).toBe(1);
	expect(rowTexts(rendered.root)).toEqual(['Amberamber-1Focus', 'Blueblue-2Focus']);
	const list = elementsByTag(rendered.root, 'ul')[0]!;
	const firstFocusButton = elementsByTag(rendered.root, 'li')[0]!
		.childNodes[2]! as PublicRenderTestElement;
	const firstNameButton = elementsByTag(rendered.root, 'li')[0]!
		.childNodes[3]! as PublicRenderTestElement;
	expect(list.listeners.get('click')).toHaveLength(1);
	expect(firstFocusButton.listeners.get('click')).toBe(undefined);
	expect(firstNameButton.listeners.get('click')).toBe(undefined);

	await firstNameButton.dispatch('click');
	expect(rendered.graph.read('state:activeSku')).toBe('Amber');
	expect(rowClasses(rendered.root)).toEqual(['muted', 'muted']);

	const appendDispatch = apply.dispatch('click');
	expect(rowTexts(rendered.root)).toEqual([
		'Amberamber-1Focus',
		'Blueblue-2Focus',
		'Coppercopper-3Focus',
	]);
	await appendDispatch;
	const firstRowBeforeReplacement = elementsByTag(rendered.root, 'li')[0]!;

	const secondFocusButton = elementsByTag(rendered.root, 'li')[1]!
		.childNodes[2]! as PublicRenderTestElement;
	const secondFocusSpan = secondFocusButton.childNodes[0]! as PublicRenderTestElement;
	await secondFocusSpan.dispatch('click');
	expect(rendered.graph.read('state:activeSku')).toBe('blue-2');
	expect(rowClasses(rendered.root)).toEqual(['muted', 'focused', 'muted']);

	await apply.dispatch('click');
	expect(rowTexts(rendered.root)).toEqual([
		'Amber Primeamber-1Focus',
		'Blueblue-2Focus',
		'Coppercopper-3Focus',
	]);
	expect(elementsByTag(rendered.root, 'li')[0]).toBe(firstRowBeforeReplacement);
	expect(rowClasses(rendered.root)).toEqual(['muted', 'focused', 'muted']);

	const cachedFocusSpan = firstFocusButton.childNodes[0]! as PublicRenderTestElement;
	const cachedFocusDispatch = cachedFocusSpan.dispatch('click');
	expect(rendered.graph.read('state:activeSku')).toBe('amber-1');
	expect(rowClasses(rendered.root)).toEqual(['focused', 'muted', 'muted']);
	await cachedFocusDispatch;

	await apply.dispatch('click');
	expect(rowTexts(rendered.root)).toEqual([
		'Blueblue-2Focus',
		'Amber Primeamber-1Focus',
		'Coppercopper-3Focus',
	]);

	await apply.dispatch('click');
	expect(rowTexts(rendered.root)).toEqual(['Blueblue-2Focus', 'Coppercopper-3Focus']);
	expect(rowClasses(rendered.root)).toEqual(['muted', 'muted']);

	await apply.dispatch('click');
	expect(elementsByTag(rendered.root, 'li')).toEqual([]);
	expect(loadSymbolCalls.get(syncSymbol!.id)).toBe(1);
	expect(loadSymbolCalls.get(focusSymbol!.id)).toBe(1);
	expect(loadSymbolCalls.get(nameSymbol!.id)).toBe(1);
});

test('compileTsrxModule public render module skips redundant empty class writes', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Articles.tsrx',
		source: `
import { state } from 'arcade';

export function Articles() @{
	let entries = state([]);
	let selected = state(null);

	<section>
		<button onClick={() => entries = [{ code: 'alpha', title: 'Alpha' }, { code: 'beta', title: 'Beta' }]}>Load</button>
		<div>
			@for (const entry of entries; key entry.code) {
				<article class={selected === entry.code ? 'chosen' : ''}>
					<h2>{entry.title}</h2>
					<button onClick={() => selected = entry.code}>Pick</button>
				</article>
			}
		</div>
	</section>
}
`,
		symbols: [],
	});
	const loadEntriesSymbol = result.symbolResolver.symbols.find((symbol) =>
		symbol.source.includes('entries ='),
	);
	const selectSymbol = result.symbolResolver.symbols.find((symbol) =>
		symbol.source.includes('selected = entry.code'),
	);
	expect(loadEntriesSymbol).toBeDefined();
	expect(selectSymbol).toBeDefined();

	const loadSymbol = (symbolId: string) => {
		if (symbolId === loadEntriesSymbol?.id) {
			return ({ graph }: { readonly graph: PublicRenderTestGraph }) => {
				graph.write({
					graphNodeId: 'state:entries',
					value: [
						{ code: 'alpha', title: 'Alpha' },
						{ code: 'beta', title: 'Beta' },
					],
				});
			};
		}
		if (symbolId === selectSymbol?.id) {
			return ({
				graph,
				locals,
			}: {
				readonly graph: PublicRenderTestGraph;
				readonly locals: { readonly entry: { readonly code: string } };
			}) => graph.write({ graphNodeId: 'state:selected', value: locals.entry.code });
		}
		throw new Error(`Unexpected public render test symbol ${symbolId}`);
	};
	const document = {
		createElement(tagName: string) {
			if (tagName === 'template') return new PublicRenderTestTemplate();
			return new PublicRenderTestElement(tagName);
		},
		createDocumentFragment() {
			return new PublicRenderTestFragment();
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
	const rendered = publicModule.Articles() as { readonly root: PublicRenderTestElement };
	const loadButton = elementsByTag(rendered.root, 'button')[0]!;

	await loadButton.dispatch('click');
	expect(elementsByTag(rendered.root, 'article').map((row) => row.getAttribute('class'))).toEqual(
		['', ''],
	);
	expect(classWriteCounts(rendered.root, 'article')).toEqual([0, 0]);

	const articles = elementsByTag(rendered.root, 'article');
	await (articles[1]!.childNodes[1]! as PublicRenderTestElement).dispatch('click');
	expect(elementsByTag(rendered.root, 'article').map((row) => row.getAttribute('class'))).toEqual(
		['', 'chosen'],
	);
	expect(classWriteCounts(rendered.root, 'article')).toEqual([0, 1]);

	await (articles[0]!.childNodes[1]! as PublicRenderTestElement).dispatch('click');
	expect(elementsByTag(rendered.root, 'article').map((row) => row.getAttribute('class'))).toEqual(
		['chosen', ''],
	);
	expect(classWriteCounts(rendered.root, 'article')).toEqual([1, 2]);
});

test('compileTsrxModule public render module appends initial keyed rows into an empty parent', async () => {
	const result = await compileTsrxModule({
		filename: 'src/InitialArticles.tsrx',
		source: `
import { state } from 'arcade';

export function InitialArticles() @{
	let entries = state([]);

	<section>
		<button onClick={() => entries = [{ code: 'alpha', title: 'Alpha' }, { code: 'beta', title: 'Beta' }]}>Load</button>
		<div>
			@for (const entry of entries; key entry.code) {
				<article>
					<h2>{entry.title}</h2>
				</article>
			}
		</div>
	</section>
}
`,
		symbols: [],
	});
	const loadEntriesSymbol = result.symbolResolver.symbols.find((symbol) =>
		symbol.source.includes('entries ='),
	);
	expect(loadEntriesSymbol).toBeDefined();

	const loadSymbol = (symbolId: string) => {
		if (symbolId === loadEntriesSymbol?.id) {
			return ({ graph }: { readonly graph: PublicRenderTestGraph }) => {
				graph.write({
					graphNodeId: 'state:entries',
					value: [
						{ code: 'alpha', title: 'Alpha' },
						{ code: 'beta', title: 'Beta' },
					],
				});
			};
		}
		throw new Error(`Unexpected public render test symbol ${symbolId}`);
	};
	const document = {
		createElement(tagName: string) {
			if (tagName === 'template') return new PublicRenderTestTemplate();
			return new PublicRenderTestElement(tagName);
		},
		createDocumentFragment() {
			return new PublicRenderTestFragment();
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
	const rendered = publicModule.InitialArticles() as { readonly root: PublicRenderTestElement };
	const list = elementsByTag(rendered.root, 'div')[0]!;
	const originalAppendChild = list.appendChild.bind(list);
	const originalReplaceChildren = list.replaceChildren.bind(list);
	let appendCalls = 0;
	let replaceCalls = 0;
	list.appendChild = (child) => {
		appendCalls++;
		return originalAppendChild(child);
	};
	list.replaceChildren = (...children) => {
		replaceCalls++;
		return originalReplaceChildren(...children);
	};

	await elementsByTag(rendered.root, 'button')[0]!.dispatch('click');

	expect(elementsByTag(rendered.root, 'article').map((row) => row.textContent)).toEqual([
		'Alpha',
		'Beta',
	]);
	expect(appendCalls).toBeGreaterThan(0);
	expect(replaceCalls).toBe(0);
});

test('compileTsrxModule public render module replaces all-new keyed rows with the built fragment', async () => {
	const result = await compileTsrxModule({
		filename: 'src/ReplaceArticles.tsrx',
		source: `
import { state } from 'arcade';

export function ReplaceArticles() @{
	let entries = state([]);

	<section>
		<button onClick={() => entries = [{ code: 'alpha', title: 'Alpha' }, { code: 'beta', title: 'Beta' }]}>Load</button>
		<button onClick={() => entries = [{ code: 'copper', title: 'Copper' }, { code: 'delta', title: 'Delta' }]}>Replace</button>
		<div>
			@for (const entry of entries; key entry.code) {
				<article>
					<h2>{entry.title}</h2>
				</article>
			}
		</div>
	</section>
}
`,
		symbols: [],
	});
	const loadEntriesSymbol = result.symbolResolver.symbols.find((symbol) =>
		symbol.source.includes("'Alpha'"),
	);
	const replaceEntriesSymbol = result.symbolResolver.symbols.find((symbol) =>
		symbol.source.includes("'Copper'"),
	);
	expect(loadEntriesSymbol).toBeDefined();
	expect(replaceEntriesSymbol).toBeDefined();

	const loadSymbol = (symbolId: string) => {
		if (symbolId === loadEntriesSymbol?.id) {
			return ({ graph }: { readonly graph: PublicRenderTestGraph }) => {
				graph.write({
					graphNodeId: 'state:entries',
					value: [
						{ code: 'alpha', title: 'Alpha' },
						{ code: 'beta', title: 'Beta' },
					],
				});
			};
		}
		if (symbolId === replaceEntriesSymbol?.id) {
			return ({ graph }: { readonly graph: PublicRenderTestGraph }) => {
				graph.write({
					graphNodeId: 'state:entries',
					value: [
						{ code: 'copper', title: 'Copper' },
						{ code: 'delta', title: 'Delta' },
					],
				});
			};
		}
		throw new Error(`Unexpected public render test symbol ${symbolId}`);
	};
	let fragmentCreations = 0;
	const document = {
		createElement(tagName: string) {
			if (tagName === 'template') return new PublicRenderTestTemplate();
			return new PublicRenderTestElement(tagName);
		},
		createDocumentFragment() {
			fragmentCreations++;
			return new PublicRenderTestFragment();
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
	const rendered = publicModule.ReplaceArticles() as { readonly root: PublicRenderTestElement };
	const [loadButton, replaceButton] = elementsByTag(rendered.root, 'button');

	await loadButton!.dispatch('click');
	expect(elementsByTag(rendered.root, 'article').map((row) => row.textContent)).toEqual([
		'Alpha',
		'Beta',
	]);
	fragmentCreations = 0;

	await replaceButton!.dispatch('click');

	expect(elementsByTag(rendered.root, 'article').map((row) => row.textContent)).toEqual([
		'Copper',
		'Delta',
	]);
	expect(fragmentCreations).toBe(1);
});

test('compileTsrxModule public render module writes keyed text bindings through text nodes', async () => {
	const result = await compileTsrxModule({
		filename: 'src/TextArticles.tsrx',
		source: `
import { state } from 'arcade';

export function TextArticles() @{
	let entries = state([]);

	<section>
		<button onClick={() => entries = [{ code: 'alpha', title: 'Alpha' }, { code: 'beta', title: 'Beta' }]}>Load</button>
		<button onClick={() => entries = [{ code: 'alpha', title: 'Alpha Prime' }, { code: 'beta', title: 'Beta Prime' }]}>Rename</button>
		<div>
			@for (const entry of entries; key entry.code) {
				<article>
					<h2>{entry.title}</h2>
				</article>
			}
		</div>
	</section>
}
`,
		symbols: [],
	});
	const loadEntriesSymbol = result.symbolResolver.symbols.find((symbol) =>
		symbol.source.includes("'Alpha'"),
	);
	const renameEntriesSymbol = result.symbolResolver.symbols.find((symbol) =>
		symbol.source.includes("'Alpha Prime'"),
	);
	expect(loadEntriesSymbol).toBeDefined();
	expect(renameEntriesSymbol).toBeDefined();

	const loadSymbol = (symbolId: string) => {
		if (symbolId === loadEntriesSymbol?.id) {
			return ({ graph }: { readonly graph: PublicRenderTestGraph }) => {
				graph.write({
					graphNodeId: 'state:entries',
					value: [
						{ code: 'alpha', title: 'Alpha' },
						{ code: 'beta', title: 'Beta' },
					],
				});
			};
		}
		if (symbolId === renameEntriesSymbol?.id) {
			return ({ graph }: { readonly graph: PublicRenderTestGraph }) => {
				graph.write({
					graphNodeId: 'state:entries',
					value: [
						{ code: 'alpha', title: 'Alpha Prime' },
						{ code: 'beta', title: 'Beta Prime' },
					],
				});
			};
		}
		throw new Error(`Unexpected public render test symbol ${symbolId}`);
	};
	const document = {
		createElement(tagName: string) {
			if (tagName === 'template') return new PublicRenderTestTemplate();
			return new PublicRenderTestElement(tagName);
		},
		createDocumentFragment() {
			return new PublicRenderTestFragment();
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
	const rendered = publicModule.TextArticles() as { readonly root: PublicRenderTestElement };
	const [loadButton, renameButton] = elementsByTag(rendered.root, 'button');

	await loadButton!.dispatch('click');
	expect(elementsByTag(rendered.root, 'article').map((row) => row.textContent)).toEqual([
		'Alpha',
		'Beta',
	]);
	expect(textNodesByTag(rendered.root, 'h2').map((text) => text.nodeValueWriteCount)).toEqual([
		1, 1,
	]);
	expect(textNodesByTag(rendered.root, 'h2').map((text) => text.textContentWriteCount)).toEqual([
		0, 0,
	]);

	await renameButton!.dispatch('click');
	expect(elementsByTag(rendered.root, 'article').map((row) => row.textContent)).toEqual([
		'Alpha Prime',
		'Beta Prime',
	]);
	expect(textNodesByTag(rendered.root, 'h2').map((text) => text.nodeValueWriteCount)).toEqual([
		2, 2,
	]);
	expect(textNodesByTag(rendered.root, 'h2').map((text) => text.textContentWriteCount)).toEqual([
		0, 0,
	]);
});

test('compileTsrxModule public render module runs static text state bindings', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Scoreboard.tsrx',
		source: `
import { state } from 'arcade';

export function Scoreboard() @{
	let score = state({ total: 1 });

	<section>
		<button onClick={() => score.total++}>{score.total}</button>
		<p>Stable</p>
	</section>
}
`,
		symbols: [],
	});
	const incrementSymbol = result.symbolResolver.symbols.find((symbol) =>
		symbol.source.includes('score.total++'),
	);
	const incrementModule = result.symbolModules.modules.find(
		(module) => module.symbolId === incrementSymbol?.id,
	);

	expect(incrementSymbol).toBeDefined();
	expect(incrementModule).toBeDefined();
	expect((result.publicRenderPlan as any).staticTextWrites).toEqual([
		{
			source: 'score.total',
			graphNodeId: 'state:score',
			path: ['total'],
			nodePath: [0, 0],
		},
	]);
	expect(result.publicRenderModule.moduleSource).toContain(
		'function syncArcadePublicStaticText(root, graph)',
	);

	const incrementExports = await importPublicRenderTestModule(incrementModule!.source);
	const loadSymbolCalls = new Map<string, number>();
	const loadSymbol = (symbolId: string) => {
		loadSymbolCalls.set(symbolId, (loadSymbolCalls.get(symbolId) ?? 0) + 1);
		if (symbolId === incrementSymbol?.id) return incrementExports[incrementModule!.exportName];
		throw new Error(`Unexpected public render test symbol ${symbolId}`);
	};
	const document = {
		createElement(tagName: string) {
			if (tagName === 'template') return new PublicRenderTestTemplate();
			return new PublicRenderTestElement(tagName);
		},
		createDocumentFragment() {
			return new PublicRenderTestFragment();
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
	const rendered = publicModule.Scoreboard() as {
		readonly root: PublicRenderTestElement;
		readonly graph: PublicRenderTestGraph & {
			readonly update: (update: {
				readonly graphNodeId: string;
				readonly path?: readonly string[];
				readonly update: (value: unknown) => unknown;
				readonly returnValue?: 'previous' | 'next';
			}) => unknown;
		};
	};
	const secondRendered = publicModule.Scoreboard() as {
		readonly root: PublicRenderTestElement;
		readonly graph: PublicRenderTestGraph;
	};
	const button = elementsByTag(rendered.root, 'button')[0]!;
	const secondButton = elementsByTag(secondRendered.root, 'button')[0]!;

	expect(button.textContent).toBe('1');
	expect(secondButton.textContent).toBe('1');
	expect(loadSymbolCalls.get(incrementSymbol!.id)).toBe(undefined);
	await button.dispatch('click');
	expect(rendered.graph.read('state:score', ['total'])).toBe(2);
	expect(button.textContent).toBe('2');
	expect(secondRendered.graph.read('state:score', ['total'])).toBe(1);
	expect(secondButton.textContent).toBe('1');
	expect(loadSymbolCalls.get(incrementSymbol!.id)).toBe(1);
});

test('compileTsrxModule composes imported child BUTTON counters for SSR resume', async () => {
	const child = await compileTsrxModule({
		filename: 'src/Counter.tsrx',
		source: `
import { state } from 'arcade';

export function Counter() @{
	let count = state(0);

	<button onClick={() => count++}>BUTTON {count}</button>
}
`,
		symbols: [],
	});
	const parent = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source: `
import { Counter } from './Counter.tsrx';

export function App() @{
	<section>
		<Counter />
	</section>
}
`,
		symbols: [],
	});

	const childSsrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(child));
	const parentSsrModule = await importPublicRenderTestModule(
		ssrRenderTestModuleSource(parent, { replaceChildImport: true }),
		{
			childComponent: {
				renderSsr: childSsrModule.arcadeRenderSsr,
			},
		},
	);
	const output = (
		parentSsrModule.arcadeRenderSsr as () => {
			readonly html: string;
			readonly state: ProtocolStatePayload;
			readonly view: ProtocolViewPayload;
		}
	)();
	const countCell = output.state.cells.find((cell) => cell.graphNodeId === 'state:count');
	const button = new PublicRenderTestElement('button');
	button.textContent = 'BUTTON 0';
	const root = new PublicRenderTestElement('section');
	root.appendChild(button);
	const symbolModules = new Map(
		child.symbolModules.modules.map((module) => [module.symbolId, module]),
	);
	const symbolExports = new Map<string, Record<string, unknown>>();
	for (const module of child.symbolModules.modules) {
		symbolExports.set(module.symbolId, await importPublicRenderTestModule(module.source));
	}
	const container = createEventOnlyResumeContainerFromPayloads({
		state: output.state,
		view: output.view,
		root: root as never,
		loadSymbol(symbolId) {
			const childSymbolId = symbolId.startsWith('c0:') ? symbolId.slice(3) : symbolId;
			const module = symbolModules.get(childSymbolId);
			if (!module) throw new Error(`Unexpected child symbol ${symbolId}`);
			return symbolExports.get(childSymbolId)?.[module.exportName] as never;
		},
	});

	expect(output.html).toBe('<section><button>BUTTON 0</button></section>');
	expect(countCell).toBeDefined();
	expect(deserializeGraphValue(countCell!.value!)).toBe(0);

	await container.dispatch({ type: 'click', target: button as never });

	expect(container.graph.read('state:count')).toBe(1);
	expect(button.textContent).toBe('BUTTON 1');
});

test('compileTsrxModule does not emit public render factories for non-literal direct state values', async () => {
	const result = await compileTsrxModule({
		filename: 'src/KeyedEntriesWithDate.tsrx',
		source: `
import { state } from 'arcade';

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
		source: `import { state } from 'arcade';
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
			source: `import { state } from 'arcade';
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
		source: `import { state } from 'arcade';
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
	expect(clickModule).toContain('args: [...context.graph.read("state:nextItems")]');
	expect(clickModule).toContain('args: [...makeItems(1000)]');
	expect(clickModule).toContain('import { makeItems } from "./items";');
	expect(inputModule).toContain('graphNodeId: "state:menu"');
	expect(inputModule).toContain('path: ["title"]');
	expect(inputModule).toContain('value: context.element?.value');
	expect(inputCollectionModule).toContain('graphNodeId: "state:items"');
	expect(inputCollectionModule).toContain('args: [context.element?.value]');
	expect(inputCollectionModule).not.toContain('args: ["third"]');
	expect(dateModule).toContain('context.graph.call({');
	expect(dateModule).toContain('graphNodeId: "state:currentDate"');
	expect(dateModule).toContain('path: []');
	expect(dateModule).toContain('method: "setTime"');
	expect(dateModule).toContain('args: [context.graph.read("state:nextTime")]');

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
		'value: context.graph.read("state:total") + context.graph.read("state:profile", ["step"])',
	);

	const nestedAddModule = eventModuleSource('total = (total + profile.step) * profile.scale');

	expect(nestedAddModule).toContain('context.graph.write({');
	expect(nestedAddModule).toContain('graphNodeId: "state:total"');
	expect(nestedAddModule).toContain('path: []');
	expect(nestedAddModule).toContain(
		'value: (context.graph.read("state:total") + context.graph.read("state:profile", ["step"])) * context.graph.read("state:profile", ["scale"])',
	);

	const conditionalModule = eventModuleSource('total = menu.open ? profile.step : total');

	expect(conditionalModule).toContain('context.graph.write({');
	expect(conditionalModule).toContain('graphNodeId: "state:total"');
	expect(conditionalModule).toContain('path: []');
	expect(conditionalModule).toContain(
		'value: context.graph.read("state:menu", ["open"]) ? context.graph.read("state:profile", ["step"]) : context.graph.read("state:total")',
	);

	const callValueModule = eventModuleSource('total = Math.max(total, profile.step)');

	expect(callValueModule).toContain('context.graph.write({');
	expect(callValueModule).toContain('graphNodeId: "state:total"');
	expect(callValueModule).toContain('path: []');
	expect(callValueModule).toContain(
		'value: Math.max(context.graph.read("state:total"), context.graph.read("state:profile", ["step"]))',
	);

	const importedCallValueModule = eventModuleSource('total = clamp(total, profile.step)');

	expect(importedCallValueModule).toContain('import { clamp } from "./math";');
	expect(importedCallValueModule).toContain('context.graph.write({');
	expect(importedCallValueModule).toContain('graphNodeId: "state:total"');
	expect(importedCallValueModule).toContain('path: []');
	expect(importedCallValueModule).toContain(
		'value: clamp(context.graph.read("state:total"), context.graph.read("state:profile", ["step"]))',
	);

	const arrayLiteralModule = eventModuleSource('items = [nextItem');

	expect(arrayLiteralModule).toContain('context.graph.write({');
	expect(arrayLiteralModule).toContain('graphNodeId: "state:items"');
	expect(arrayLiteralModule).toContain('path: []');
	expect(arrayLiteralModule).toContain(
		'value: [context.graph.read("state:nextItem"), "fallback"]',
	);

	const arraySpreadModule = eventModuleSource('items = [...nextItems');

	expect(arraySpreadModule).toContain('context.graph.write({');
	expect(arraySpreadModule).toContain('graphNodeId: "state:items"');
	expect(arraySpreadModule).toContain('path: []');
	expect(arraySpreadModule).toContain(
		'value: [...context.graph.read("state:nextItems"), context.graph.read("state:nextItem")]',
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
		'value: { ...context.graph.read("state:settings"), title: context.graph.read("state:menu", ["title"]) }',
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
	expect(runnerModule?.source).toContain('const query = read("state:query");');
	expect(runnerModule?.source).toContain(
		"const response = await fetch('/api/details/' + q, { signal });",
	);
	expect(result.protocolView.asyncBoundaries[0]?.asyncReads[0]?.runnerSymbolId).toBe('symbol:1');
});
