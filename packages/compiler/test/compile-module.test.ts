import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { deserializeGraphValue } from '../../serializer/src/index.ts';
import { createEventOnlyResumeContainerFromPayloads } from '../../web/src/event-only-resume.ts';
import type { ProtocolStatePayload, ProtocolViewPayload } from '../../serializer/src/index.ts';

const source = `
import { state } from '@markless/core';

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
import { state } from '@markless/core';
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
import { state, computed } from '@markless/core';

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
import { state } from '@markless/core';

export default function Home() @{
	const count = state(0);

	<main>
		<h1>Markless Router</h1>
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

	replaceWith(...nodes: PublicRenderTestNode[]) {
		const parent = this.parentElement;
		const index = parent?.childNodes.indexOf(this) ?? -1;
		if (!parent || index < 0) return;
		for (const node of nodes) node.parentElement?.removeChild(node);
		for (const node of nodes) node.parentElement = parent;
		this.parentElement = null;
		parent.childNodes.splice(index, 1, ...nodes);
	}

	querySelector(selector: string): PublicRenderTestElement | undefined {
		const attribute = selector.match(/^\[([^=]+)="([^"]*)"\]$/);
		if (!attribute) return undefined;
		const [, name, value] = attribute;
		const visit = (node: PublicRenderTestNode): PublicRenderTestElement | undefined => {
			if (node.nodeType !== 1) return undefined;
			if (node.getAttribute(name!) === value) return node;
			for (const child of node.childNodes) {
				const match = visit(child);
				if (match) return match;
			}
			return undefined;
		};
		for (const child of this.childNodes) {
			const match = visit(child);
			if (match) return match;
		}
		return undefined;
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

class PublicRenderTestComment {
	readonly nodeType = 8;
	parentElement: PublicRenderTestContainer | null = null;
	constructor(readonly textContent: string) {}
	get tagName(): string {
		return '#comment';
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
	const tokens = html.match(/<!--[\s\S]*?-->|<\/?[^>]+>|[^<]+/g) ?? [];

	for (const token of tokens) {
		const parent = stack[stack.length - 1]!;
		if (token.startsWith('<!--')) {
			parent.appendChild(new PublicRenderTestComment(token.slice(4, -3)));
			continue;
		}
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
		__marklessPublicRenderTestDocument?: unknown;
		__marklessPublicRenderTestLoadSymbol?: unknown;
		__marklessPublicRenderTestChildComponent?: unknown;
	};
	const previousDocument = globalScope.__marklessPublicRenderTestDocument;
	const previousLoadSymbol = globalScope.__marklessPublicRenderTestLoadSymbol;
	const previousChildComponent = globalScope.__marklessPublicRenderTestChildComponent;
	if (globals) {
		globalScope.__marklessPublicRenderTestDocument = globals.document;
		globalScope.__marklessPublicRenderTestLoadSymbol = globals.loadSymbol;
		globalScope.__marklessPublicRenderTestChildComponent = globals.childComponent;
	}

	try {
		return (await import(
			`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`
		)) as Record<string, unknown>;
	} finally {
		globalScope.__marklessPublicRenderTestDocument = previousDocument;
		globalScope.__marklessPublicRenderTestLoadSymbol = previousLoadSymbol;
		globalScope.__marklessPublicRenderTestChildComponent = previousChildComponent;
	}
}

function ssrRenderTestModuleSource(
	result: Awaited<ReturnType<typeof compileTsrxModule>>,
	options: { readonly replaceChildImport?: boolean } = {},
): string {
	const ssrSource = options.replaceChildImport
		? result.publicRenderModule.ssrModuleSource.replace(
				/import (?:__marklessSsrComponent0|\{ [^}]+ as __marklessSsrComponent0 \}) from [^;]+;/,
				'const __marklessSsrComponent0 = globalThis.__marklessPublicRenderTestChildComponent;',
			)
		: result.publicRenderModule.ssrModuleSource;

	return [
		`const payloadState = ${JSON.stringify(result.protocolState)};`,
		`const payloadView = ${JSON.stringify(result.protocolView)};`,
		ssrSource,
		'export { marklessRenderSsr };',
	].join('\n');
}

function csrRenderTestModuleSource(
	result: Awaited<ReturnType<typeof compileTsrxModule>>,
	options: { readonly replaceChildImport?: boolean } = {},
): string {
	const source = result.publicRenderModule.csrModuleSource ?? '';
	const csrSource = options.replaceChildImport
		? source.replace(
				/import (?:__marklessCsrComponent0|\{ [^}]+ as __marklessCsrComponent0 \}) from [^;]+;/,
				'const __marklessCsrComponent0 = globalThis.__marklessPublicRenderTestChildComponent;',
			)
		: source;

	return [
		'const document = globalThis.__marklessPublicRenderTestDocument;',
		'const loadSymbol = globalThis.__marklessPublicRenderTestLoadSymbol;',
		`const payloadState = ${JSON.stringify(result.protocolState)};`,
		`const payloadView = ${JSON.stringify(result.protocolView)};`,
		csrSource,
		'export { marklessRenderCsr };',
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
	expect(result.payloadScripts.stateScript).toMatch(/^<script type="markless\/state">/);
	expect(result.payloadScripts.viewScript).toMatch(/^<script type="markless\/view">/);
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
	expect(result.publicRenderModule.ssrExportName).toBe('marklessRenderSsr');
	expect(result.publicRenderModule.ssrModuleSource).toContain('function marklessRenderSsr');
	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = (ssrModule.marklessRenderSsr as () => { readonly html: string })();

	expect(output.html).toBe('<main><h1>Markless Router</h1><button>Button 0</button></main>');
});

test('compileTsrxModule renders dynamic tags from state values in SSR html', async () => {
	const result = await compileTsrxModule({
		filename: 'src/DynamicCard.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let tag = state('article');
	let chosen = state('');

	<section>
		<{tag} class="card">Hi</{tag}>
		<button onClick={() => chosen = 'x'}>Go</button>
	</section>
}
`,
		symbols: [],
	});

	expect(result.publicRenderPlan.diagnostics).toEqual([]);
	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = (
		ssrModule.marklessRenderSsr as () => {
			readonly html: string;
			readonly view: { readonly locators: ReadonlyArray<Record<string, unknown>> };
		}
	)();

	expect(output.html).toBe(
		'<section><article class="card">Hi</article><button>Go</button></section>',
	);
	// The rendered dynamic element occupies dom-order slot 1; the button shifts past it.
	expect(output.view.locators).toEqual(
		expect.arrayContaining([expect.objectContaining({ tagName: 'button', index: 2 })]),
	);
});

test('compileTsrxModule wires events on dynamic tags with rendered-tag locators', async () => {
	const result = await compileTsrxModule({
		filename: 'src/DynamicButton.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let tag = state('article');
	let count = state(0);

	<section>
		<{tag} class="card" onClick={() => count++}>Hi</{tag}>
		<footer>Done</footer>
	</section>
}
`,
		symbols: [],
	});

	expect(result.publicRenderPlan.diagnostics).toEqual([]);
	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = (
		ssrModule.marklessRenderSsr as () => {
			readonly html: string;
			readonly view: {
				readonly locators: ReadonlyArray<Record<string, unknown>>;
				readonly events: ReadonlyArray<{
					readonly eventName: string;
					readonly symbolIds: ReadonlyArray<string>;
				}>;
			};
		}
	)();

	expect(output.html).toBe(
		'<section><article class="card">Hi</article><footer>Done</footer></section>',
	);
	// The dynamic element claims a real locator carrying its rendered tag.
	expect(output.view.locators).toEqual([
		expect.objectContaining({ tagName: 'section', index: 0 }),
		expect.objectContaining({ tagName: 'article', index: 1 }),
		expect.objectContaining({ tagName: 'footer', index: 2 }),
	]);
	const click = output.view.events.find((entry) => entry.eventName === 'click');
	expect(click).toBeDefined();
	expect(click!.symbolIds.length).toBeGreaterThan(0);
});

test('compileTsrxModule renders nothing for a nullish dynamic tag in SSR html', async () => {
	const result = await compileTsrxModule({
		filename: 'src/DynamicCard.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let tag = state(null);
	let chosen = state('');

	<section>
		<{tag} class="card">Hi</{tag}>
		<button onClick={() => chosen = 'x'}>Go</button>
	</section>
}
`,
		symbols: [],
	});

	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = (
		ssrModule.marklessRenderSsr as () => {
			readonly html: string;
			readonly view: { readonly locators: ReadonlyArray<Record<string, unknown>> };
		}
	)();

	expect(output.html).toBe('<section><button>Go</button></section>');
	expect(output.view.locators).toEqual(
		expect.arrayContaining([expect.objectContaining({ tagName: 'button', index: 1 })]),
	);
});

test('compileTsrxModule renders host element spread attributes in SSR html', async () => {
	const result = await compileTsrxModule({
		filename: 'src/SpreadCard.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	const meta = state({ id: 'main', title: 'Hero', hidden: false, onClick: 'ignored' });

	<section data-kind="card" {...meta} title="Final">Hi</section>
}
`,
		symbols: [],
	});

	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = (ssrModule.marklessRenderSsr as () => { readonly html: string })();

	expect(output.html).toBe('<section data-kind="card" id="main" title="Final">Hi</section>');
});

test('compileTsrxModule ships keyed repeat records with row events in the view payload', async () => {
	const result = await compileTsrxModule({
		filename: 'src/ResumableRows.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let entries = state([
		{ code: 'a', title: 'Alpha' },
		{ code: 'b', title: 'Beta' },
	]);
	let chosen = state('');

	<main>
		<section>
			@for (const entry of entries; key entry.code) {
				<article>
					<h2>{entry.title}</h2>
					<button onClick={() => chosen = entry.code}>Choose</button>
				</article>
			}
		</section>
	</main>
}
`,
		symbols: [],
	});

	expect(result.protocolView.keyedRepeats).toEqual([
		expect.objectContaining({
			id: 'repeat:0',
			parentHostNodeId: expect.any(String),
			collectionGraphNodeId: 'state:entries',
			collectionPath: [],
			keyPath: ['code'],
			itemName: 'entry',
			rowElementCount: 3,
			rowEvents: [
				expect.objectContaining({
					eventName: 'click',
					hostPath: [1],
					symbolIds: [expect.any(String)],
				}),
			],
		}),
	]);
});

test('compileTsrxModule renders supported keyed repeat rows in SSR html', async () => {
	const result = await compileTsrxModule({
		filename: 'src/EntryList.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let entries = state([
		{ code: 'a', title: 'Alpha' },
		{ code: 'b', title: 'Beta' },
	]);
	let chosen = state('');

	<main>
		<section>
			@for (const entry of entries; key entry.code) {
				<article>
					<h2>{entry.title}</h2>
					<button onClick={() => chosen = entry.code}>Choose</button>
				</article>
			}
		</section>
		<button onClick={() => chosen = ''}>Reset</button>
	</main>
}
`,
		symbols: [],
	});

	expect(result.publicRenderPlan.repeatGates).toEqual([
		expect.objectContaining({ repeatId: 'repeat:0', supported: true }),
	]);
	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = (
		ssrModule.marklessRenderSsr as () => {
			readonly html: string;
			readonly view: { readonly locators: ReadonlyArray<Record<string, unknown>> };
		}
	)();

	expect(output.html).toBe(
		'<main><section>' +
			'<article><h2>Alpha</h2><button>Choose</button></article>' +
			'<article><h2>Beta</h2><button>Choose</button></article>' +
			'</section><button>Reset</button></main>',
	);
	// The trailing button's dom-order index must count the six row elements
	// (2 rows x article/h2/button) so browser resume locates the right node.
	expect(output.view.locators).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ tagName: 'main', index: 0 }),
			expect.objectContaining({ tagName: 'section', index: 1 }),
			expect.objectContaining({ tagName: 'button', index: 8 }),
		]),
	);
});

test('compileTsrxModule renders an arrow-function component in SSR html', async () => {
	const result = await compileTsrxModule({
		filename: 'src/ArrowCard.tsrx',
		source: `
import { state } from '@markless/core';

export const App = () => @{
	let label = state('Hello');

	<main>
		<p>{label}</p>
	</main>
}
`,
		symbols: [],
	});

	expect(result.semanticGraph.components).toEqual([{ name: 'App' }]);
	expect(result.publicRenderPlan.diagnostics).toEqual([]);
	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = (ssrModule.marklessRenderSsr as () => { readonly html: string })();

	expect(output.html).toBe('<main><p>Hello</p></main>');
});

test('compileTsrxModule renders a return-form component body in SSR html', async () => {
	const result = await compileTsrxModule({
		filename: 'src/ReturnCard.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let label = state('Hello');

	return <main>
		<p>{label}</p>
	</main>;
}
`,
		symbols: [],
	});

	expect(result.publicRenderPlan.diagnostics).toEqual([]);
	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = (ssrModule.marklessRenderSsr as () => { readonly html: string })();

	expect(output.html).toBe('<main><p>Hello</p></main>');
});

test('compileTsrxModule renders keyed repeat rows that read the index clause in SSR html', async () => {
	const result = await compileTsrxModule({
		filename: 'src/IndexedRows.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let items = state([
		{ id: 'a', name: 'Alpha' },
		{ id: 'b', name: 'Beta' },
	]);
	let chosen = state('');

	<main>
		<ul>
			@for (const item of items; index i; key item.id) {
				<li>{i}{item.name}</li>
			}
		</ul>
		<button onClick={() => chosen = 'x'}>Go</button>
	</main>
}
`,
		symbols: [],
	});

	expect(result.publicRenderPlan.diagnostics).toEqual([]);
	expect(result.publicRenderPlan.repeatGates).toEqual([
		{ repeatId: 'repeat:0', supported: true, ssrOnly: true },
	]);
	// Index-reading rows stay off the direct-DOM runtime, which cannot rewrite
	// index text on reorder yet.
	expect(result.publicRenderPlan.keyedRepeats).toEqual([]);

	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = (
		ssrModule.marklessRenderSsr as () => {
			readonly html: string;
			readonly view: { readonly locators: ReadonlyArray<Record<string, unknown>> };
		}
	)();

	expect(output.html).toBe(
		'<main><ul><li>0Alpha</li><li>1Beta</li></ul><button>Go</button></main>',
	);
	expect(output.view.locators).toEqual(
		expect.arrayContaining([expect.objectContaining({ tagName: 'button', index: 4 })]),
	);
});

test('compileTsrxModule renders the @empty branch when the keyed repeat has no items', async () => {
	const result = await compileTsrxModule({
		filename: 'src/EmptyList.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let items = state([]);
	let chosen = state('');

	<main>
		<ul>
			@for (const item of items; key item.id) {
				<li>{item.name}</li>
			} @empty {
				<li>No items yet</li>
			}
		</ul>
		<button onClick={() => chosen = 'x'}>Add</button>
	</main>
}
`,
		symbols: [],
	});

	expect(result.publicRenderPlan.diagnostics).toEqual([]);
	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = (
		ssrModule.marklessRenderSsr as () => {
			readonly html: string;
			readonly view: { readonly locators: ReadonlyArray<Record<string, unknown>> };
		}
	)();

	expect(output.html).toBe('<main><ul><li>No items yet</li></ul><button>Add</button></main>');
	// The taken @empty branch occupies a real dom-order slot; later hosts shift.
	expect(output.view.locators).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ tagName: 'li', index: 2 }),
			expect.objectContaining({ tagName: 'button', index: 3 }),
		]),
	);
});

test('compileTsrxModule skips the @empty branch when keyed repeat rows render', async () => {
	const result = await compileTsrxModule({
		filename: 'src/EmptyList.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let items = state([
		{ id: 'a', name: 'Alpha' },
		{ id: 'b', name: 'Beta' },
	]);
	let chosen = state('');

	<main>
		<ul>
			@for (const item of items; key item.id) {
				<li>{item.name}</li>
			} @empty {
				<li>No items yet</li>
			}
		</ul>
		<button onClick={() => chosen = 'x'}>Add</button>
	</main>
}
`,
		symbols: [],
	});

	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = (
		ssrModule.marklessRenderSsr as () => {
			readonly html: string;
			readonly view: { readonly locators: ReadonlyArray<Record<string, unknown>> };
		}
	)();

	expect(output.html).toBe(
		'<main><ul><li>Alpha</li><li>Beta</li></ul><button>Add</button></main>',
	);
	expect(output.view.locators).toEqual(
		expect.arrayContaining([expect.objectContaining({ tagName: 'button', index: 4 })]),
	);
});

test('compileTsrxModule scopes <style> blocks and renders scope classes in SSR html', async () => {
	const result = await compileTsrxModule({
		filename: 'src/StyledCard.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let label = state('Hi');

	<section class="card">
		<style>
			.card { color: red; }
			.card h2, .title { font-size: 2rem; }
		</style>
		<h2 class="title">{label}</h2>
		<footer>Done</footer>
	</section>
}
`,
		symbols: [],
	});

	expect(result.publicRenderPlan.diagnostics).toEqual([]);
	const styleScope = result.publicRenderPlan.styleScopes[0];
	expect(styleScope).toEqual(
		expect.objectContaining({ scopeId: expect.stringMatching(/^mk-[a-z0-9]+$/) }),
	);
	const scope = styleScope!.scopeId;
	// Every selector's subject compound gains the scope class.
	expect(styleScope!.cssText).toContain(`.card.${scope} { color: red; }`);
	expect(styleScope!.cssText).toContain(
		`.card h2.${scope}, .title.${scope} { font-size: 2rem; }`,
	);

	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = (ssrModule.marklessRenderSsr as () => { readonly html: string })();

	// Host elements gain the scope class; the <style> block itself emits no HTML.
	expect(output.html).toBe(
		`<section class="card ${scope}"><h2 class="title ${scope}">Hi</h2><footer class="${scope}">Done</footer></section>`,
	);
	expect(output.html).not.toContain('<style');
});

test('compileTsrxModule renders fragment-rooted components in SSR html', async () => {
	const result = await compileTsrxModule({
		filename: 'src/FragmentCard.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);

	<>
		<header>Site</header>
		<button onClick={() => count++}>{count}</button>
	</>
}
`,
		symbols: [],
	});

	expect(result.publicRenderPlan.diagnostics).toEqual([]);
	// Direct module stays off; the standard CSR module renders fragments
	// (owner-ratified target-as-root semantics).
	expect(result.publicRenderModule.moduleSource).toBe('');
	expect(result.publicRenderModule.csrModuleSource).not.toBe('');
	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = (
		ssrModule.marklessRenderSsr as () => {
			readonly html: string;
			readonly view: {
				readonly locators: ReadonlyArray<Record<string, unknown>>;
				readonly events: ReadonlyArray<Record<string, unknown>>;
			};
		}
	)();

	expect(output.html).toBe('<header>Site</header><button>0</button>');
	// Sibling roots take flat contiguous dom-order slots.
	expect(output.view.locators).toEqual([
		expect.objectContaining({ tagName: 'header', index: 0 }),
		expect.objectContaining({ tagName: 'button', index: 1 }),
	]);
	expect(output.view.events).toEqual([expect.objectContaining({ eventName: 'click' })]);
});

test('compileTsrxModule builds fragment-rooted CSR output as a fragment with child locators', async () => {
	const result = await compileTsrxModule({
		filename: 'src/FragmentCard.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);

	<>
		<header>Site</header>
		<button onClick={() => count++}>{count}</button>
	</>
}
`,
		symbols: [],
	});

	const document = {
		createElement(tagName: string) {
			return tagName === 'template'
				? new PublicRenderTestTemplate()
				: new PublicRenderTestElement(tagName);
		},
	};
	const csrModule = await importPublicRenderTestModule(csrRenderTestModuleSource(result), {
		document,
	});
	const output = (
		csrModule.marklessRenderCsr as () => {
			readonly root: {
				readonly nodeType: number;
				readonly childNodes: ReadonlyArray<PublicRenderTestElement>;
			};
			readonly view: { readonly locators: ReadonlyArray<Record<string, unknown>> };
		}
	)();

	// The root is a document fragment holding both sibling roots.
	expect(output.root.nodeType).toBe(11);
	expect(
		output.root.childNodes
			.filter((child) => child.nodeType === 1)
			.map((child) => child.tagName),
	).toEqual(['header', 'button']);
	// Locators are fragment-relative (no root element in the walk); the web
	// render() entry offsets them +1 when the mount target becomes the root.
	expect(output.view.locators).toEqual([
		expect.objectContaining({ tagName: 'header', index: 0 }),
		expect.objectContaining({ tagName: 'button', index: 1 }),
	]);
});

test('compileTsrxModule emits branch anchors around the taken arm with union re-indexing', async () => {
	const result = await compileTsrxModule({
		filename: 'src/BranchFlip.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let open = state(true);
	let value = state('ready');

	<section>
		@if (open) { <p>Shown</p> } @else { <p>Hidden</p> }
		@try { <em>{value}</em> } @pending { <em>Loading</em> } @catch { <em>Broken</em> }
	</section>
}
`,
		symbols: [],
	});

	expect(result.publicRenderPlan.branchReactivityGates).toEqual([
		{ branchSiteId: 'branch-site:0', supported: true },
	]);
	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = (
		ssrModule.marklessRenderSsr as () => {
			readonly html: string;
			readonly view: {
				readonly branches?: ReadonlyArray<Record<string, unknown>>;
			};
		}
	)();

	// Anchors wrap only the taken arm; the async boundary keeps its own pair.
	expect(output.html).toBe(
		'<section>' +
			'<!--markless:branch:branch-site:0--><p>Shown</p><!--/markless:branch:branch-site:0-->' +
			'<!--markless:async:boundary:0--><em>Loading</em><!--/markless:async:boundary:0-->' +
			'</section>',
	);
	// The runtime's takenArm merges INTO the payload branch records — it must
	// never replace them, or the served payload loses symbolId/testReads and
	// the browser silently treats the branch as static (caught by the
	// ssr-branch-flip witness box).
	expect(output.view.branches).toEqual([
		expect.objectContaining({
			id: 'branch-site:0',
			takenArm: 0,
			symbolId: expect.any(String),
			testReads: [expect.objectContaining({ graphNodeId: 'state:open' })],
			startAnchor: expect.objectContaining({ strategy: 'dom-order-comment' }),
		}),
	]);
	// Union re-indexing: the branch pair takes comment indexes 0/1, so the
	// boundary's payload anchors shift to 2/3.
	expect(result.protocolView.asyncBoundaries[0]).toEqual(
		expect.objectContaining({
			startAnchor: expect.objectContaining({ index: 2 }),
			endAnchor: expect.objectContaining({ index: 3 }),
		}),
	);
});

test('compileTsrxModule plans branch-update symbols wired onto protocol branch records', async () => {
	const result = await compileTsrxModule({
		filename: 'src/BranchSymbol.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let open = state(true);

	<section>
		@if (open) { <p>Shown</p> } @else { <p>Hidden</p> }
	</section>
}
`,
		symbols: [],
	});

	const planned = result.symbolResolver.symbols.find((symbol) => symbol.kind === 'branch-update');
	expect(planned).toEqual(
		expect.objectContaining({
			kind: 'branch-update',
			branchSiteId: 'branch-site:0',
			testSource: 'open',
		}),
	);
	expect(result.protocolView.branches).toEqual([
		expect.objectContaining({
			id: 'branch-site:0',
			symbolId: planned!.id,
			testReads: [expect.objectContaining({ graphNodeId: 'state:open', path: [] })],
		}),
	]);
});

test('compileTsrxModule ships only gate-supported async boundary anchors, re-indexed', async () => {
	const result = await compileTsrxModule({
		filename: 'src/NestedAsync.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let value = state('ready');

	<section>
		@try {
			<div>
				<p>{value}</p>
				@try { <em>{value}</em> } @pending { <em>Inner</em> } @catch { <em>Broken</em> }
			</div>
		} @pending { <p>Loading</p> } @catch { <p>Broken</p> }
		<article>
			@try { <span>{value}</span> } @pending { <span>Later</span> } @catch { <span>Nope</span> }
		</article>
	</section>
}
`,
		symbols: [],
	});

	// Boundary 0 contains boundary 1 (both unsupported: nested); boundary 2 is
	// inside <article> at the top level of its parent... it is conditional-free
	// and non-nested, so it gates supported.
	const supported = result.publicRenderPlan.asyncBoundaryGates.filter((gate) => gate.supported);
	expect(supported).toHaveLength(1);

	// The runtime payload must ship ONLY anchors that the SSR emitter actually
	// emits, re-indexed contiguously — otherwise resume throws
	// missingCommentAnchorError on the phantom records.
	expect(result.protocolView.asyncBoundaries).toHaveLength(1);
	expect(result.protocolView.asyncBoundaries[0]).toEqual(
		expect.objectContaining({
			startAnchor: expect.objectContaining({ strategy: 'dom-order-comment', index: 0 }),
			endAnchor: expect.objectContaining({ strategy: 'dom-order-comment', index: 1 }),
		}),
	);
});

test('compileTsrxModule renders async boundary anchors with @pending content in SSR html', async () => {
	const result = await compileTsrxModule({
		filename: 'src/AsyncCard.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let value = state('ready');

	<section>
		@try { <p>{value}</p> } @pending { <p>Loading</p> } @catch { <p>Broken</p> }
		<footer>Done</footer>
	</section>
}
`,
		symbols: [],
	});

	expect(result.publicRenderPlan.diagnostics).toEqual([]);
	expect(result.publicRenderPlan.asyncBoundaryGates).toEqual([
		{ boundaryId: 'boundary:0', supported: true },
	]);
	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = (
		ssrModule.marklessRenderSsr as () => {
			readonly html: string;
			readonly view: { readonly locators: ReadonlyArray<Record<string, unknown>> };
		}
	)();

	// Exactly two comments wrap only the @pending branch; @try/@catch content
	// stays out of SSR html until the runtime resolves the boundary.
	expect(output.html).toBe(
		'<section>' +
			'<!--markless:async:boundary:0--><p>Loading</p><!--/markless:async:boundary:0-->' +
			'<footer>Done</footer></section>',
	);
	// Comments are not elements: the footer's dom-order element index only
	// counts section, pending <p>, footer.
	expect(output.view.locators).toEqual(
		expect.arrayContaining([expect.objectContaining({ tagName: 'footer', index: 2 })]),
	);
});

test('compileTsrxModule renders the matching @switch case in SSR html', async () => {
	const result = await compileTsrxModule({
		filename: 'src/SwitchCard.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let kind = state('beta');

	<section>
		@switch (kind) {
			@case 'alpha': { <p>A</p> }
			@case 'beta': { <p>B</p> }
			@default: { <p>D</p> }
		}
	</section>
}
`,
		symbols: [],
	});

	expect(result.publicRenderPlan.diagnostics).toEqual([]);
	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = (
		ssrModule.marklessRenderSsr as () => {
			readonly html: string;
			readonly view: { readonly locators: ReadonlyArray<Record<string, unknown>> };
		}
	)();

	expect(output.html).toBe(
		'<section><!--markless:branch:branch-site:0--><p>B</p><!--/markless:branch:branch-site:0--></section>',
	);
	// Only the rendered case's element may claim a dom-order locator slot.
	expect(output.view.locators).toEqual([
		expect.objectContaining({ tagName: 'section', index: 0 }),
		expect.objectContaining({ tagName: 'p', index: 1 }),
	]);
});

test('compileTsrxModule renders the @switch default case when no test matches', async () => {
	const result = await compileTsrxModule({
		filename: 'src/SwitchCard.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let kind = state('other');

	<section>
		@switch (kind) {
			@case 'alpha': { <p>A</p> }
			@default: { <p>D</p> }
		}
	</section>
}
`,
		symbols: [],
	});

	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = (ssrModule.marklessRenderSsr as () => { readonly html: string })();

	expect(output.html).toBe(
		'<section><!--markless:branch:branch-site:0--><p>D</p><!--/markless:branch:branch-site:0--></section>',
	);
});

test('compileTsrxModule passes component children into SSR component props', async () => {
	const result = await compileTsrxModule({
		filename: 'pages/index.tsrx',
		source: `
import { Link } from '@markless/core/router';

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
	const output = (ssrModule.marklessRenderSsr as () => { readonly html: string })();

	expect(output.html).toBe('<main><a href="/docs">Docs</a></main>');
});

test('compileTsrxModule emits SSR for an imported component root', async () => {
	const result = await compileTsrxModule({
		filename: 'document.tsrx',
		source: `
import { Html } from '@markless/core/router';

export default function Document({ children }: { readonly children?: unknown }) @{
	<Html>
		<head>
			<title>Markless Router</title>
		</head>
		<body>{children}</body>
	</Html>
}
`,
		symbols: [],
	});

	expect(result.publicRenderModule.ssrExportName).toBe('marklessRenderSsr');
	expect(result.publicRenderModule.ssrModuleSource).toContain(
		'import { Html as __marklessSsrComponent0 } from "@markless/core/router";',
	);

	const ssrModule = await importPublicRenderTestModule(
		ssrRenderTestModuleSource(result, { replaceChildImport: true }),
		{
			childComponent: {
				renderSsr(props: { readonly children?: unknown }) {
					return { html: String(props.children ?? '') };
				},
			},
		},
	);
	const output = (
		ssrModule.marklessRenderSsr as (props: { children: string }) => {
			readonly html: string;
		}
	)({ children: '<main>Docs</main>' });

	expect(output.html).toBe(
		'<head><title>Markless Router</title></head><body>&lt;main&gt;Docs&lt;/main&gt;</body>',
	);
});

test('compileTsrxModule passes component children into CSR component props', async () => {
	const result = await compileTsrxModule({
		filename: 'pages/index.tsrx',
		source: `
import { state } from '@markless/core';
import { Link } from '@markless/core/router';

export default function Home() @{
	const count = state(0);

	<main>
		<Link href="/docs">Docs</Link>
		<button onClick={() => count++}>{count}</button>
	</main>
}
`,
		symbols: [],
	});
	const document = {
		createElement(tagName: string) {
			return tagName === 'template'
				? new PublicRenderTestTemplate()
				: new PublicRenderTestElement(tagName);
		},
	};
	const csrModule = await importPublicRenderTestModule(
		csrRenderTestModuleSource(result, { replaceChildImport: true }),
		{
			document,
			childComponent: {
				renderCsr(props: { readonly children?: unknown; readonly href?: string }) {
					const anchor = new PublicRenderTestElement('a');
					anchor.setAttribute('href', props.href ?? '');
					anchor.textContent = String(props.children ?? '');
					return { root: anchor };
				},
			},
		},
	);
	const output = (
		csrModule.marklessRenderCsr as () => { readonly root: PublicRenderTestElement }
	)();
	const anchors = elementsByTag(output.root, 'a');

	expect(anchors).toHaveLength(1);
	expect(anchors[0]?.getAttribute('href')).toBe('/docs');
	expect(anchors[0]?.textContent).toBe('Docs');
});

test('compileTsrxModule emits branch anchors in the CSR string path', async () => {
	const result = await compileTsrxModule({
		filename: 'src/CsrBranch.tsrx',
		source: `
import { state } from '@markless/core';

export function App({ heading }) @{
	let open = state(true);

	<main>
		<h1>{heading}</h1>
		@if (open) { <p>Shown</p> } @else { <p>Hidden</p> }
	</main>
}
`,
		symbols: [],
	});

	const document = {
		createElement(tagName: string) {
			return tagName === 'template'
				? new PublicRenderTestTemplate()
				: new PublicRenderTestElement(tagName);
		},
	};
	const csrModule = await importPublicRenderTestModule(csrRenderTestModuleSource(result), {
		document,
	});
	const output = (
		csrModule.marklessRenderCsr as (props: { readonly heading: string }) => {
			readonly root: PublicRenderTestElement;
			readonly view: { readonly branches?: ReadonlyArray<Record<string, unknown>> };
		}
	)({ heading: 'Cards' });

	// The CSR-built DOM contains the same anchor comments SSR emits, so the
	// same resume runtime can flip the range on the live graph.
	const kinds = output.root.childNodes.map((child) =>
		child.nodeType === 8
			? `#comment:${(child as { textContent?: string }).textContent}`
			: (child as PublicRenderTestElement).tagName,
	);
	expect(kinds).toEqual([
		'h1',
		'#comment:markless:branch:branch-site:0',
		'p',
		'#comment:/markless:branch:branch-site:0',
	]);
	// The composed view carries the payload branch records for the runtime.
	expect(output.view.branches).toEqual([
		expect.objectContaining({ id: 'branch-site:0', symbolId: expect.any(String) }),
	]);
});

test('compileTsrxModule renders @switch and dynamic tags in the CSR string path', async () => {
	const result = await compileTsrxModule({
		filename: 'src/CsrParity.tsrx',
		source: `
import { state } from '@markless/core';

export function App({ heading }) @{
	let kind = state('beta');
	let tag = state('article');

	<main>
		<h1>{heading}</h1>
		@switch (kind) {
			@case 'alpha': { <p>A</p> }
			@case 'beta': { <p>B</p> }
			@default: { <p>D</p> }
		}
		<{tag} class="card">Hi</{tag}>
	</main>
}
`,
		symbols: [],
	});

	expect(result.publicRenderPlan.diagnostics).toEqual([]);
	const document = {
		createElement(tagName: string) {
			return tagName === 'template'
				? new PublicRenderTestTemplate()
				: new PublicRenderTestElement(tagName);
		},
	};
	const csrModule = await importPublicRenderTestModule(csrRenderTestModuleSource(result), {
		document,
	});
	const output = (
		csrModule.marklessRenderCsr as (props: { readonly heading: string }) => {
			readonly root: PublicRenderTestElement;
		}
	)({ heading: 'Cards' });

	expect(elementsByTag(output.root, 'p').map((element) => element.textContent)).toEqual(['B']);
	const articles = elementsByTag(output.root, 'article');
	expect(articles).toHaveLength(1);
	expect(articles[0]?.getAttribute('class')).toBe('card');
	expect(articles[0]?.textContent).toBe('Hi');
});

test('compileTsrxModule renders keyed repeat rows in the CSR string path', async () => {
	const result = await compileTsrxModule({
		filename: 'src/CsrRows.tsrx',
		source: `
import { state } from '@markless/core';

export function App({ heading }) @{
	let items = state([
		{ id: 'a', name: 'Alpha' },
		{ id: 'b', name: 'Beta' },
	]);

	<main>
		<h1>{heading}</h1>
		<ul>
			@for (const item of items; key item.id) {
				<li>{item.name}</li>
			} @empty {
				<li>No items yet</li>
			}
		</ul>
	</main>
}
`,
		symbols: [],
	});

	const document = {
		createElement(tagName: string) {
			return tagName === 'template'
				? new PublicRenderTestTemplate()
				: new PublicRenderTestElement(tagName);
		},
	};
	const csrModule = await importPublicRenderTestModule(csrRenderTestModuleSource(result), {
		document,
	});
	const output = (
		csrModule.marklessRenderCsr as (props: { readonly heading: string }) => {
			readonly root: PublicRenderTestElement;
		}
	)({ heading: 'Cards' });

	expect(elementsByTag(output.root, 'li').map((element) => element.textContent)).toEqual([
		'Alpha',
		'Beta',
	]);
});

test('compileTsrxModule renders the @empty branch in the CSR string path', async () => {
	const result = await compileTsrxModule({
		filename: 'src/CsrEmpty.tsrx',
		source: `
import { state } from '@markless/core';

export function App({ heading }) @{
	let items = state([]);

	<main>
		<h1>{heading}</h1>
		<ul>
			@for (const item of items; key item.id) {
				<li>{item.name}</li>
			} @empty {
				<li>No items yet</li>
			}
		</ul>
	</main>
}
`,
		symbols: [],
	});

	const document = {
		createElement(tagName: string) {
			return tagName === 'template'
				? new PublicRenderTestTemplate()
				: new PublicRenderTestElement(tagName);
		},
	};
	const csrModule = await importPublicRenderTestModule(csrRenderTestModuleSource(result), {
		document,
	});
	const output = (
		csrModule.marklessRenderCsr as (props: { readonly heading: string }) => {
			readonly root: PublicRenderTestElement;
		}
	)({ heading: 'Cards' });

	expect(elementsByTag(output.root, 'li').map((element) => element.textContent)).toEqual([
		'No items yet',
	]);
});

test('compileTsrxModule preserves value imports used by public render expressions', async () => {
	const result = await compileTsrxModule({
		filename: 'pages/index.tsrx',
		source: `
import { routeHref } from 'virtual:test-route-href';
import { Link } from '@markless/core/router';

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
	const output = (ssrModule.marklessRenderSsr as () => { readonly html: string })();

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
		'import __marklessSsrComponent0 from "./Counter.tsrx";',
	);
	expect(result.publicRenderModule.ssrModuleSource).not.toContain(
		'import { Counter as __marklessSsrComponent0 } from "./Counter.tsrx";',
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
import { state } from '@markless/core';

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
import { state } from '@markless/core';

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
import { state } from '@markless/core';

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
		'const graph = createMarklessPublicGraph()',
		'runtime: { async dispatch() {} }',
	]) {
		expect(moduleSource).toContain(expected);
	}
	expect(moduleSource).not.toContain('function createMarklessPublicRuntime');
	expect(moduleSource).not.toContain('view: { version: 1');
	expect(moduleSource).toContain('!sameMarklessPublicKeys(state.keys, nextKeys)');
	expect(moduleSource).toContain(
		'const repeatState0 = { rows: new Map(), keys: [], classValue: undefined };',
	);
	expect(moduleSource).toContain('createMarklessPublicLoadSymbol(root, repeatState0)');
	expect(moduleSource).toContain(
		'syncMarklessPublicRepeat0(root, graph, componentLoadSymbol, repeatState0);',
	);
	expect(moduleSource).toContain(
		'syncMarklessPublicRepeat0(root, context.graph, loadMarklessPublicSymbol, repeatState0);',
	);
	expect(moduleSource).not.toContain('function syncMarklessPublicRepeats');
	expect(moduleSource).not.toContain('const marklessPublicRepeatStates');
	expect(moduleSource).not.toContain('function repeatState(root) {');
	expect(moduleSource).not.toContain('function repeatState(root, planIndex)');
	expect(moduleSource).not.toContain('states = []');
	expect(moduleSource).toContain('function createMarklessPublicRepeat0Record(row, item)');
	expect(moduleSource).toContain('function createMarklessPublicRepeat0Row()');
	expect(moduleSource).toContain('let marklessPublicRepeat0Template;');
	expect(moduleSource).toContain('const rowRoot = createMarklessPublicRepeat0Row();');
	expect(moduleSource).toContain('record = createMarklessPublicRepeat0Record(rowRoot, item);');
	expect(moduleSource).not.toContain('createMarklessPublicRow(');
	expect(moduleSource).not.toContain('marklessPublicRowTemplates');
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
	expect(moduleSource).not.toContain('readMarklessPublicPath(item, ["code"])');
	expect(moduleSource).not.toContain('readMarklessPublicPath(item, ["title"])');
	expect(moduleSource).not.toContain('nodeAtPath(record.root');
	expect(moduleSource).not.toContain('nodeAtPath(row');
	expect(moduleSource).toContain('function nodeAtPath(root, path)');
	expect(moduleSource).not.toContain('await graph.flush();');
	expect(moduleSource).toContain('graph.flush();');
	expect(moduleSource).toContain('function readMarklessPublicRepeat0ClassValues(graph)');
	expect(moduleSource).toContain(
		'const collectionDirty = graph.isDirty?.("state:entries") ?? true;',
	);
	expect(moduleSource).toContain('const classDirty = graph.isDirty?.("state:chosen");');
	expect(moduleSource).toContain('const items = graph.read("state:entries");');
	expect(moduleSource).toContain('return graph.read("state:chosen");');
	expect(moduleSource).not.toContain('graph.read("state:entries", [])');
	expect(moduleSource).not.toContain('graph.read("state:chosen", [])');
	expect(moduleSource).toContain(
		'const classValue = readMarklessPublicRepeat0ClassValues(graph);',
	);
	expect(moduleSource).toContain('writeMarklessPublicRepeat0Row(record, item, classValue);');
	expect(moduleSource).toContain('attachMarklessPublicRepeat0Events(record);');
	expect(moduleSource).not.toContain(
		'attachMarklessPublicRepeat0Events(record, graph, loadSymbolForRepeat);',
	);
	expect(moduleSource).toContain(
		'delegateMarklessPublicRepeat0Events(parent, graph, loadSymbolForRepeat);',
	);
	expect(moduleSource).toContain('event0: row.childNodes?.[1],');
	expect(moduleSource).toContain('const element0 = record.event0;');
	expect(moduleSource).not.toContain('const element0 = record.root.childNodes?.[1];');
	expect(moduleSource).toContain('element0.__marklessPublicRepeat0Event0 = record;');
	expect(moduleSource).toContain('parent.addEventListener("click"');
	expect(moduleSource).toContain('const record = eventTarget?.__marklessPublicRepeat0Event0;');
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
		'patchMarklessPublicRepeat0DirtyRows(state, items, dirtyIndexes, classValue)',
	);
	expect(moduleSource).toContain('function replaceMarklessPublicRows(parent, state, keys)');
	expect(moduleSource).toContain('document.createDocumentFragment()');
	expect(moduleSource).toContain('const newRows = document.createDocumentFragment();');
	expect(moduleSource).toContain('newRows.appendChild(record.root);');
	expect(moduleSource).toContain('parent.appendChild?.(newRows);');
	expect(moduleSource).toContain('pruneMarklessPublicRows(state, nextKeys)');
	expect(moduleSource).toContain('const record = state.rows.get(matchValue);');
	expect(moduleSource).not.toContain('const liveKeys = new Set();');
	expect(moduleSource).not.toContain('const nodes = [];');
	expect(moduleSource).not.toContain('const mismatch = [];');
	expect(moduleSource).not.toContain('function appendMarklessPublicRows');
	expect(moduleSource).not.toContain('parent.replaceChildren(...marklessPublicRowsForKeys');
	expect(moduleSource).not.toContain('events: new Set()');
	expect(moduleSource).not.toContain('record.events');
	expect(moduleSource).not.toContain('marklessPublicEventMatch');
	expect(moduleSource).not.toContain('eventTargets');
	expect(moduleSource).not.toContain('findMarklessPublicRepeatEventRecord');
	expect(moduleSource).toMatch(
		/call\(call\)[\s\S]*delete\(deletion\)[\s\S]*clearMarklessPublicRows/,
	);
	expect(moduleSource).toContain(
		'if (parent.replaceChildren) parent.replaceChildren(); else parent.textContent = "";',
	);
	expect(moduleSource).not.toContain(
		'if (parent.textContent !== undefined) parent.textContent = ""; else parent.replaceChildren?.();',
	);
	for (const unexpected of [
		'state: payloadState',
		'view: marklessPublicView',
		'payloadView',
		'marklessPublicHostNodeIds',
		'marklessPublicHostNodeIndexes',
		'marklessPublicRepeatPlans',
	]) {
		expect(moduleSource).not.toContain(unexpected);
	}
});

test('compileTsrxModule public render module runs alternate keyed repeat shapes', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Catalog.tsrx',
		source: `
import { state } from '@markless/core';

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
			'const document = globalThis.__marklessPublicRenderTestDocument;',
			'const loadSymbol = globalThis.__marklessPublicRenderTestLoadSymbol;',
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
import { state } from '@markless/core';

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
			'const document = globalThis.__marklessPublicRenderTestDocument;',
			'const loadSymbol = globalThis.__marklessPublicRenderTestLoadSymbol;',
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
import { state } from '@markless/core';

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
			'const document = globalThis.__marklessPublicRenderTestDocument;',
			'const loadSymbol = globalThis.__marklessPublicRenderTestLoadSymbol;',
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
import { state } from '@markless/core';

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
			'const document = globalThis.__marklessPublicRenderTestDocument;',
			'const loadSymbol = globalThis.__marklessPublicRenderTestLoadSymbol;',
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
import { state } from '@markless/core';

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
			'const document = globalThis.__marklessPublicRenderTestDocument;',
			'const loadSymbol = globalThis.__marklessPublicRenderTestLoadSymbol;',
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
import { state } from '@markless/core';

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
		'function syncMarklessPublicStaticText(root, graph)',
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
			'const document = globalThis.__marklessPublicRenderTestDocument;',
			'const loadSymbol = globalThis.__marklessPublicRenderTestLoadSymbol;',
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
import { state } from '@markless/core';

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
				renderSsr: childSsrModule.marklessRenderSsr,
			},
		},
	);
	const output = (
		parentSsrModule.marklessRenderSsr as () => {
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
import { state } from '@markless/core';

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
	expect(result.publicRenderModule.moduleSource).not.toContain('createMarklessPublicGraph');
	expect(result.publicRenderModule.moduleSource).not.toContain(
		'runtime: createMarklessPublicRuntime(graph)',
	);
});

test('compileTsrxModule does not emit misleading public render factories for multi-component modules', async () => {
	const result = await compileTsrxModule({
		filename: 'src/MultiComponentEntries.tsrx',
		source: `import { state } from '@markless/core';
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
			source: `import { state } from '@markless/core';
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
		source: `import { state } from '@markless/core';
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
