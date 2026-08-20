import { expect, test, vi } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import {
	PUBLIC_RENDER_PHASE,
	PUBLIC_RENDER_PLAN_PASS_ID,
	PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT_CODE,
} from '../src/passes/public-render/diagnostics.ts';
import {
	ASYNC_BOUNDARY_ARM,
	deserializeGraphValue,
	renderPayloadScripts,
} from '../../serializer/src/index.ts';
import { resumeFromPayloadScripts } from '../../web/src/payload.ts';
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

const syncComputedSource = `
import { state, computed } from '@markless/core';

export function App() @{
	let count = state(2);
	const doubled = computed(() => count * 2);

	<p>{doubled}</p>
}
`;

const libraryComponentSource = `
import { state } from '@markless/core';

export function titleCopy(value) {
	return value.toUpperCase();
}

export function Card() @{
	let title = state("Library card");

	<article>{titleCopy(title)}</article>
}

export function Badge() @{
	let label = state("New");

	<span>{label}</span>
}
`;

function helperImports(source: string): string[] {
	return [
		...source.matchAll(/^import \{ ([^}]+) \} from '@markless\/web\/fns\/[^']+';/gm),
	].flatMap((match) => match[1]!.split(',').map((name) => name.trim()));
}

const wholeBindingAliasEventSource = `
import { state } from '@markless/core';

export function App() @{
	let origin = state(0);
	let mirror = origin;

	<button onClick={() => mirror++}>{origin}</button>
}
`;

const plainStateTextSource = `
import { state } from '@markless/core';

export function App() @{
	let count = state(2);

	<p>{count}</p>
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

test('compileTsrxModule wraps yuku-tsrx parse SyntaxErrors as structured diagnostics', async () => {
	const result = await compileTsrxModule({
		filename: 'src/DynamicTagCall.tsrx',
		source: `
export function App() @{
	const tag = () => 'section';

	<{tag()}>
		<p>Hi</p>
	</{tag()}>
}
`,
		symbols: [],
	});

	expect(result.semanticGraph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_PARSE_ERROR',
			severity: 'error',
			phase: 'parse',
			title: 'TSRX parser rejected this source',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			docsUrl: 'https://markless.dev/errors/MARKLESS_PARSE_ERROR',
		}),
	]);
	expect(result.semanticGraph.diagnostics[0]?.message).toContain(
		'TSRX dynamic tag expression must resolve to an element name',
	);
	expect(result.semanticGraph.diagnostics[0]?.why).toContain(
		'yuku-tsrx parser failed at phase parse',
	);
	expect(result.semanticGraph.diagnostics[0]?.suggestions[0]?.message).toContain(
		'https://tsrx.dev/specification',
	);
});

test('compileTsrxModule does not swallow non-parser compiler bugs', async () => {
	await expect(
		compileTsrxModule({
			filename: 'src/Bug.tsrx',
			source: null as unknown as string,
			symbols: [],
		}),
	).rejects.toThrow();
});

test('compileTsrxModule keeps valid source output byte-identical', async () => {
	const result = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source: plainStateTextSource,
		symbols: [],
	});
	const again = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source: plainStateTextSource,
		symbols: [],
	});

	expect(again.publicRenderModule.ssrModuleSource).toBe(
		result.publicRenderModule.ssrModuleSource,
	);
	expect(again.publicRenderModule.componentDefinitions).toEqual(
		result.publicRenderModule.componentDefinitions,
	);
	expect(again.symbolResolverModule).toBe(result.symbolResolverModule);
	expect(result.semanticGraph.diagnostics).toEqual([]);
});

test('compileTsrxModule exposes typed bound resolver rows for same-module children', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Bound.tsrx',
		source: `
function Child({ label }: { label: string }) @{
	<button onClick={() => console.log(label)}>{label}</button>
}
export function App() @{
	<><Child label="first" /><Child label="second" /></>
}
`,
		symbols: [],
	});

	expect(result.boundSymbolResolver.passId).toBe('bound-symbol-resolver');
	expect(result.boundSymbolResolver.rows).toHaveLength(2);
	expect(new Set(result.boundSymbolResolver.rows.map((row) => row.id)).size).toBe(2);
	expect(
		result.boundSymbolResolver.rows.every((row) => row.baseSymbolId.startsWith('symbol:')),
	).toBe(true);
});

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
	| PublicRenderTestText
	| PublicRenderTestComment;

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
		return publicRenderTestQuerySelector(this.childNodes, selector);
	}

	setAttribute(name: string, value: string) {
		if (name === 'class') this.classWriteCount++;
		this.attributes.set(name, value);
	}

	getAttribute(name: string) {
		return this.attributes.get(name);
	}

	removeAttribute(name: string) {
		this.attributes.delete(name);
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

	querySelector(selector: string): PublicRenderTestElement | undefined {
		return publicRenderTestQuerySelector(this.childNodes, selector);
	}

	cloneNode(deep = false) {
		const clone = new PublicRenderTestFragment();
		if (deep) clone.replaceChildren(...this.childNodes.map((child) => child.cloneNode(true)));
		return clone;
	}
}

class PublicRenderTestComment {
	readonly nodeType = 8;
	parentElement: PublicRenderTestContainer | null = null;
	constructor(readonly textContent: string) {}
	get tagName(): string {
		return '#comment';
	}
	cloneNode() {
		return new PublicRenderTestComment(this.textContent);
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
}

class PublicRenderTestTemplate {
	readonly content = new PublicRenderTestFragment();

	set innerHTML(html: string) {
		this.content.replaceChildren(...parsePublicRenderTestHtml(html));
	}

	// Real templates serialize their content fragment through the innerHTML
	// getter — the arm-render module relies on that to return html strings.
	get innerHTML(): string {
		return this.content.childNodes.map(serializePublicRenderTestNode).join('');
	}
}

function publicRenderTestQuerySelector(
	childNodes: ReadonlyArray<PublicRenderTestNode>,
	selector: string,
): PublicRenderTestElement | undefined {
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
	for (const child of childNodes) {
		const match = visit(child);
		if (match) return match;
	}
	return undefined;
}

// Round-trips what parsePublicRenderTestHtml understood: entities stay as
// authored (the parser never decodes them), attributes keep insertion order.
function serializePublicRenderTestNode(node: PublicRenderTestNode): string {
	if (node.nodeType === 8) return `<!--${node.textContent}-->`;
	if (node.nodeType === 3) return node.textContent;
	if (node.nodeType !== 1) {
		return node.childNodes.map(serializePublicRenderTestNode).join('');
	}
	const attributes = [...node.attributes].map(([name, value]) => ` ${name}="${value}"`).join('');
	const children = node.childNodes.map(serializePublicRenderTestNode).join('');
	return `<${node.tagName}${attributes}>${children}</${node.tagName}>`;
}

function publicRenderTestDocument() {
	return {
		createElement: (tagName: string) =>
			tagName === 'template'
				? new PublicRenderTestTemplate()
				: new PublicRenderTestElement(tagName),
		createDocumentFragment: () => new PublicRenderTestFragment(),
		createTextNode: (value: string) => new PublicRenderTestText(value),
	};
}

async function renderTestSsr(
	result: Awaited<ReturnType<typeof compileTsrxModule>>,
	props?: unknown,
) {
	const module = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	return (module.marklessRenderSsr as (props?: unknown) => Promise<{ readonly html: string }>)(
		props,
	);
}

function payloadStateCellValue(state: ProtocolStatePayload, graphNodeId: string): unknown {
	const cell = state.cells.find((candidate) => candidate.graphNodeId === graphNodeId);
	expect(cell).toBeDefined();
	expect(JSON.stringify(cell)).not.toContain('"$type":"undefined"');
	return deserializeGraphValue(cell!.value!);
}

async function expectRuntimeInitializerSnapshot(body: string, expected: number): Promise<void> {
	const result = await compileTsrxModule({
		filename: 'src/StateInit.tsrx',
		source: `import { state } from '@markless/core';
export function App() @{
${body}
<output>{n}</output>
}`,
		symbols: [],
	});
	const ssrOutput = (await renderTestSsr(result)) as {
		readonly html: string;
		readonly state: ProtocolStatePayload;
	};

	expect(ssrOutput.html).toBe(`<output>${expected}</output>`);
	expect(payloadStateCellValue(ssrOutput.state, 'state:n')).toBe(expected);
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
		document?: unknown;
		__marklessPublicRenderTestDocument?: unknown;
		__marklessPublicRenderTestLoadSymbol?: unknown;
		__marklessPublicRenderTestChildComponent?: unknown;
	};
	const previousTestDocument = globalScope.__marklessPublicRenderTestDocument;
	const previousLoadSymbol = globalScope.__marklessPublicRenderTestLoadSymbol;
	const previousChildComponent = globalScope.__marklessPublicRenderTestChildComponent;
	if (globals) {
		globalScope.document = globals.document;
		globalScope.__marklessPublicRenderTestDocument = globals.document;
		globalScope.__marklessPublicRenderTestLoadSymbol = globals.loadSymbol;
		globalScope.__marklessPublicRenderTestChildComponent = globals.childComponent;
	}

	try {
		const testSource = source.replace(
			/from (['"])@markless\/web\/fns\/([^'"]+)\1/g,
			(_match, _quote: string, helperModule: string) =>
				`from '${new URL(`../../web/src/fns/${helperModule}.ts`, import.meta.url).href}'`,
		);
		return (await import(
			`data:text/javascript;charset=utf-8,${encodeURIComponent(testSource)}`
		)) as Record<string, unknown>;
	} finally {
		globalScope.__marklessPublicRenderTestDocument = previousTestDocument;
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
		result.publicRenderModule.renderDataModuleSource,
		ssrSource,
		'export { marklessRenderSsr };',
	].join('\n');
}

function products(...items: ReadonlyArray<readonly [sku: string, name: string]>) {
	return items.map(([sku, name]) => ({
		meta: { sku },
		copy: { name },
	}));
}

async function drainPublicRenderMicrotasks(): Promise<void> {
	for (let index = 0; index < 8; index++) await Promise.resolve();
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

test('compileTsrxModule strips extracted sync policy calls from emitted handler symbols', async () => {
	const result = await compileTsrxModule({
		filename: 'src/AlternateSubmit.tsrx',
		source: `import { state } from '@markless/core';
export function AlternateSubmit() @{
	const gate = state({ armed: true, label: 'Queued' });
	let saved = state(false);
	<form onSubmit={(evt) => {
		if (gate.armed && evt.submitter === 'publish') {
			evt.preventDefault();
			evt.stopPropagation();
			saved = true;
		}
	}}>
		<button value="publish">{gate.label}</button>
		{saved}
	</form>
}`,
		symbols: [],
	});
	const submitSymbol = result.symbolModules.modules.find(
		(module) => module.kind === 'event-handler',
	);

	expect(result.protocolView.events[0]?.syncPolicy).toEqual(
		expect.objectContaining({ actions: ['preventDefault', 'stopPropagation'] }),
	);
	expect(submitSymbol?.source).not.toContain('preventDefault');
	expect(submitSymbol?.source).not.toContain('stopPropagation');
	expect(submitSymbol?.source).toContain('context.graph.write');
});

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
				source: "(event) => {\n\t\t\t\tif (menu.open && event.key === 'Escape') {\n\t\t\t\t\tmenu.open = false;\n\t\t\t\t}\n\t\t\t}",
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

test('public SSR helpers are imported from the helper catalog', async () => {
	const result = await compileTsrxModule({
		filename: 'src/card.tsrx',
		source: libraryComponentSource,
		symbols: [],
	});

	const combinedModuleSource = result.publicRenderModule.ssrModuleSource;

	expect(combinedModuleSource).not.toContain('function readMarklessPublicPath');
	expect(combinedModuleSource).toContain("from '@markless/web/fns/");
});

test('public render modules import catalog helpers instead of inlining helper bodies', async () => {
	const result = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source: `import { state } from '@markless/core';

export function App() @{
	let count = state(0);

	<><button onClick={() => count++}>{count}</button></>
}
`,
		symbols: [],
	});

	for (const moduleSource of [result.publicRenderModule.ssrModuleSource]) {
		expect(moduleSource).toContain("from '@markless/web/fns/");
		expect(moduleSource).not.toMatch(/^function markless(?!Render(?:Csr|Ssr)\b)/m);
		expect(moduleSource).not.toMatch(/^function readMarklessPublicPath\b/m);
	}

	const ssrHelperImports = helperImports(result.publicRenderModule.ssrModuleSource);
	expect(ssrHelperImports).toEqual(
		expect.arrayContaining([
			'renderSsrData',
			'marklessCloneState',
			'marklessStateValue',
			'marklessSsrComposeView',
			'marklessSsrReadPublicPath',
		]),
	);
	expect(ssrHelperImports).not.toContain('marklessSsrRepeatRows');
	expect(ssrHelperImports).not.toContain('marklessSsrCallbacks');
});

test('executed modules deliver object-path state initializer snapshots', async () => {
	await expectRuntimeInitializerSnapshot(
		`const cfg = { start: 7 };
const n = state(cfg.start);`,
		7,
	);
});

test('executed modules deliver identifier state initializer snapshots', async () => {
	await expectRuntimeInitializerSnapshot(
		`const seed = 3;
const n = state(seed);`,
		3,
	);
});

test('executed modules evaluate state initializers after earlier body statements', async () => {
	await expectRuntimeInitializerSnapshot(
		`let base = 2;
base += 1;
const n = state(base);`,
		3,
	);
});

// A `<` in markup text opens a tag only when the next character can start one: a letter,
// `{`, `/`, or `>`. Anything else is literal text, so `<3` and `<=` are what they look
// like rather than a parse error. Both shapes throw `Unexpected token` before this rule.
test('a less-than that cannot open a tag stays literal text and escapes in SSR html', async () => {
	for (const [name, text, expected] of [
		['digit', '<3', '&lt;3'],
		['operator', '<= arrow', '&lt;= arrow'],
	] as const) {
		const result = await compileTsrxModule({
			filename: `src/LessThan-${name}.tsrx`,
			source: `export function App() @{\n\t<span>${text}</span>\n}\n`,
			symbols: [],
		});

		expect(result.semanticGraph.diagnostics, name).toEqual([]);
		expect(result.publicRenderPlan.diagnostics, name).toEqual([]);
		expect((await renderTestSsr(result)).html, name).toBe(`<span>${expected}</span>`);
	}
});

// An element written inside a `{ … }` expression container has its children read by a
// different tokenizer path than bare markup text, so the rule has to hold there too.
// Markless itself has no construct for an element inside a container and rejects the
// shape in its own pass, but the literal `<` must reach that pass as text instead of
// killing the file with a parse error.
test('a less-than inside an expression container is text, not a parse error', async () => {
	const compileContainer = async (text: string) =>
		await compileTsrxModule({
			filename: 'src/LessThanContainer.tsrx',
			source: `export function App() @{\n\t<div>{<span>${text}</span>}</div>\n}\n`,
			symbols: [],
		});

	const literal = await compileContainer('<3');
	const plain = await compileContainer('ok');

	expect(literal.semanticGraph.diagnostics).toEqual([]);
	expect(literal.publicRenderPlan.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
		plain.publicRenderPlan.diagnostics.map((diagnostic) => diagnostic.code),
	);
});

test('B910 sync computed over state renders the derived value in SSR html', async () => {
	const result = await compileTsrxModule({
		filename: 'src/SyncComputed.tsrx',
		source: syncComputedSource,
		symbols: [],
	});

	const ssrOutput = await renderTestSsr(result);

	expect(ssrOutput.html).toBe('<p>4</p>');
	expect(result.protocolView.domUpdates).toEqual([
		expect.objectContaining({
			source: 'doubled',
			graphNodeId: 'computed:doubled',
			path: [],
			target: { kind: 'text' },
		}),
	]);
});

test('B910 SSR module source is not empty for a sync-computed component', async () => {
	const result = await compileTsrxModule({
		filename: 'src/SyncComputed.tsrx',
		source: syncComputedSource,
		symbols: [],
	});

	expect(result.publicRenderModule.ssrModuleSource).toContain('function marklessRenderSsr');
	expect(result.publicRenderModule.ssrModuleSource).toContain('const doubled');
});

test('B910 regressions keep async computed and plain state binding artifacts stable', async () => {
	const asyncResult = await compileTsrxModule({
		filename: 'src/AsyncComputed.tsrx',
		source: asyncComputedSource,
		symbols: [],
	});
	const plainResult = await compileTsrxModule({
		filename: 'src/PlainState.tsrx',
		source: plainStateTextSource,
		symbols: [],
	});

	expect(asyncResult.protocolState.computed).toEqual([
		{
			graphNodeId: 'computed:details',
			name: 'details',
			async: true,
			dependencies: [{ graphNodeId: 'state:query', path: [] }],
		},
	]);
	expect(asyncResult.protocolView.asyncBoundaries[0]?.asyncReads[0]).toMatchObject({
		source: 'details.title',
		graphNodeId: 'computed:details',
		path: ['title'],
		runnerSymbolId: 'symbol:1',
	});
	expect(plainResult.protocolView.domUpdates).toEqual([
		{
			hostNodeId: 'h0',
			source: 'count',
			graphNodeId: 'state:count',
			path: [],
			target: { kind: 'text' },
			symbolId: 'symbol:0',
		},
	]);
	expect(plainResult.publicRenderModule.renderDataModuleSource).toContain(
		'"statics":["<p><!--markless-slot:0-->","</p>"]',
	);
});

test('literal state initializers keep their exact protocol payload artifact', async () => {
	const result = await compileTsrxModule({
		filename: 'src/LiteralStateInit.tsrx',
		source: `import { state } from '@markless/core';
export function App() @{
const n = state(5);
<output>{n}</output>
}`,
		symbols: [],
	});

	expect(result.protocolState.cells).toEqual([
		{
			graphNodeId: 'state:n',
			name: 'n',
			valueKind: 'scalar',
			value: { version: 1, root: 5, records: [] },
		},
	]);
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
	const output = await (ssrModule.marklessRenderSsr as () => { readonly html: string })();

	expect(output.html).toBe('<main><h1>Markless Router</h1><button>Button 0</button></main>');
});

test('compileTsrxModule ignores plain helpers above the exported render root', async () => {
	const result = await compileTsrxModule({
		filename: 'src/HelperBeforeRoot.tsrx',
		source: `
function formatLabel(value) { return String(value).toUpperCase(); }

export function Dashboard() @{
	<article>{formatLabel('ready')}</article>
}
`,
		symbols: [],
	});

	expect(result.semanticGraph.components).toEqual([{ name: 'Dashboard' }]);
	expect(result.publicRenderPlan.diagnostics).toEqual([]);
	expect(result.publicRenderModule.ssrModuleSource).toContain('function marklessRenderSsr');
});

test('compileTsrxModule roots plan and module emit at the exported component', async () => {
	const result = await compileTsrxModule({
		filename: 'src/ExportedRootChoice.tsrx',
		source: `
function Preview() @{
	<aside>Preview only</aside>
}

export function Dashboard() @{
	<main>Chosen root</main>
}
`,
		symbols: [],
	});

	expect(
		result.renderData.chunks.find((chunk) => chunk.id === 'template:Dashboard')?.statics,
	).toEqual(['<main>Chosen root</main>']);
	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = await (ssrModule.marklessRenderSsr as () => { readonly html: string })();

	expect(output.html).toBe('<main>Chosen root</main>');
});

test('compileTsrxModule diagnoses modules with no renderable component root', async () => {
	const result = await compileTsrxModule({
		filename: 'src/OnlyHelpers.tsrx',
		source: `
function readMessage() { return 'hello'; }
function double(value) { return value * 2; }
`,
		symbols: [],
	});

	expect(result.publicRenderModule.moduleSource).toBe('');
	expect(result.publicRenderModule.ssrModuleSource).toBe('');
	expect(result.publicRenderModule.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_PUBLIC_RENDER_ROOT_UNSUPPORTED',
			severity: 'warning',
			phase: 'public-render',
			title: 'No renderable component root was found',
			message: expect.stringContaining('No component with a TSRX template root was found'),
			docsUrl: 'https://markless.dev/errors/MARKLESS_PUBLIC_RENDER_ROOT_UNSUPPORTED',
		}),
	]);
});

test('compileTsrxModule keeps single-component SSR html unchanged', async () => {
	const result = await compileTsrxModule({
		filename: 'src/SingleCard.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let label = state('Stable');

	<section><h2>{label}</h2><p>Static</p></section>
}
`,
		symbols: [],
	});
	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = await (ssrModule.marklessRenderSsr as () => { readonly html: string })();

	expect(output.html).toBe('<section><h2>Stable</h2><p>Static</p></section>');
});

test('compileTsrxModule preserves authored body effects in SSR', async () => {
	const result = await compileTsrxModule({
		filename: 'src/RenderBodyLog.tsrx',
		source: `
import { state } from '@markless/core';

export function App({ kind = 'demo' }) @{
	console.log('before');
	const token = state(7);
	console.log(token);

	<p data-kind={kind}>{token}</p>
}
`,
		symbols: [],
	});
	const log = vi.spyOn(console, 'log').mockImplementation(() => {});
	try {
		const ssrOutput = await renderTestSsr(result, { kind: 'demo' });
		expect(ssrOutput.html).toBe('<p data-kind="demo">7</p>');
		expect(log.mock.calls).toEqual([['before'], [7]]);
	} finally {
		log.mockRestore();
	}
});

test('compileTsrxModule keeps plain body statements in authored order in SSR modules', async () => {
	const result = await compileTsrxModule({
		filename: 'src/RenderBodyPlainStatements.tsrx',
		source: `
export function App({ suffix = 'tail' }) @{
	let segments = [];
	segments.push('head');
	segments.push(suffix);
	const label = segments.join('-');

	<main>{label}</main>
}
`,
		symbols: [],
	});
	const ssrSource = result.publicRenderModule.ssrModuleSource;

	for (const source of [ssrSource]) {
		expect(source.indexOf('let segments = [];')).toBeGreaterThan(-1);
		expect(source.indexOf("segments.push('head');")).toBeGreaterThan(
			source.indexOf('let segments = [];'),
		);
		expect(source.indexOf('segments.push(suffix);')).toBeGreaterThan(
			source.indexOf("segments.push('head');"),
		);
		expect(source.indexOf("const label = segments.join('-');")).toBeGreaterThan(
			source.indexOf('segments.push(suffix);'),
		);
	}
	expect(ssrSource.indexOf('const html = ')).toBeGreaterThan(
		ssrSource.indexOf("const label = segments.join('-');"),
	);

	const ssrOutput = await renderTestSsr(result, { suffix: 'tail' });
	expect(ssrOutput.html).toBe('<main>head-tail</main>');
});

test('compileTsrxModule diagnoses undeclared template reads before public render emit', async () => {
	const result = await compileTsrxModule({
		filename: 'src/UndeclaredTemplateRead.tsrx',
		source: `export function App() @{ <main>{missingLabel}</main> }`,
		symbols: [],
	});
	expect(result.publicRenderPlan.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_TEMPLATE_READ_UNDECLARED',
			severity: 'error',
			phase: 'public-render',
			message: expect.stringContaining('missingLabel'),
			docsUrl: 'https://markless.dev/errors/MARKLESS_TEMPLATE_READ_UNDECLARED',
		}),
	]);
	expect(result.publicRenderModule.ssrModuleSource).toBe('');
	expect(result.publicRenderModule.moduleSource).not.toContain('missingLabel');
});

test('compileTsrxModule reports template-as-value before undeclared local reads', async () => {
	const result = await compileTsrxModule({
		filename: 'src/TemplateAsValue.tsrx',
		source: `import { state } from '@markless/core';
export function App() @{
	const banner = <h1>Hi</h1>;
	const rows = [];
	rows.push(<li>One</li>);
	const view = state(<p>Stored</p>);
	const tiles = [<span>Tile</span>];
	<section>{banner}{rows}{view}{tiles}</section>
}`,
		symbols: [],
	});

	expect(result.semanticGraph.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
		expect.arrayContaining(['MARKLESS_TEMPLATE_AS_VALUE']),
	);
	expect(result.semanticGraph.hostNodes.map((host) => host.tagName)).toEqual(['section']);
	expect(result.protocolView.locators.map((locator) => locator.tagName)).toEqual(['section']);
	expect(result.protocolState.cells.map((cell) => cell.graphNodeId)).not.toContain('state:view');
	expect(result.publicRenderModule.moduleSource).not.toContain('marklessSsrText(banner)');
	expect(result.publicRenderModule.moduleSource).not.toContain('marklessSsrText(rows)');
});

test('compileTsrxModule renders plain body local template reads in SSR modules', async () => {
	const result = await compileTsrxModule({
		filename: 'src/PlainBodyLocalTemplateRead.tsrx',
		source: `export function App() @{ const label = 'render-once'; <main>{label}</main> }`,
		symbols: [],
	});
	expect(result.publicRenderPlan.diagnostics).toEqual([]);
	expect((await renderTestSsr(result)).html).toBe('<main>render-once</main>');
});

test('B913 compileTsrxModule renders component-body accumulator locals in SSR modules', async () => {
	const result = await compileTsrxModule({
		filename: 'src/AccumulatorLocal.tsrx',
		source: `export function App() @{ const rows = [1, 2, 3]; let total = 0; for (const row of rows) { total += row; } <main>{total}</main> }`,
		symbols: [],
	});
	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.stateLowering.diagnostics).toEqual([]);
	expect((await renderTestSsr(result)).html).toBe('<main>6</main>');
});

test('compileTsrxModule renders module-scope const template reads in SSR modules', async () => {
	const result = await compileTsrxModule({
		filename: 'src/ModuleConstTemplateRead.tsrx',
		source: `const title = 'Module title'; export function App() @{ <main>{title}</main> }`,
		symbols: [],
	});
	expect(result.publicRenderPlan.diagnostics).toEqual([]);
	expect((await renderTestSsr(result)).html).toBe('<main>Module title</main>');
});

test('compileTsrxModule renders prop template reads in SSR modules', async () => {
	const result = await compileTsrxModule({
		filename: 'src/PropTemplateRead.tsrx',
		source: `export function App({ label = 'prop value' }) @{ <main>{label}</main> }`,
		symbols: [],
	});
	expect(result.publicRenderPlan.diagnostics).toEqual([]);
	expect((await renderTestSsr(result, { label: 'prop value' })).html).toBe(
		'<main>prop value</main>',
	);
});

test('T005 compileTsrxModule renders pure composite template expressions in SSR modules', async () => {
	const result = await compileTsrxModule({
		filename: 'src/CompositeTemplateExpressions.tsrx',
		source: `import { state } from '@markless/core';
export function App() @{
	let flag = state(true);
	let count = state(2);
	const user = state({ pro: false, name: 'Ada' });
	const name = state(null);
	<section>
		<p>{flag ? 'Close' : 'Open'}</p>
		<p>{user.pro ? user.name : 'guest'}</p>
		<p>{count + 1}</p>
		<p>{flag && user.name}</p>
		<p>{name ?? 'anon'}</p>
		<p>{\`Hi \${user.name}\`}</p>
	</section>
}`,
		symbols: [],
	});

	const ssr = await renderTestSsr(result);

	expect(ssr.html).toContain('<p>Close</p>');
	expect(ssr.html).toContain('<p>guest</p>');
	expect(ssr.html).toContain('<p>3</p>');
	expect(ssr.html).toContain('<p>Ada</p>');
	expect(ssr.html).toContain('<p>anon</p>');
	expect(ssr.html).toContain('<p>Hi Ada</p>');
	expect(result.diagnostics ?? []).toEqual([]);
	expect(result.protocolView.domUpdates.map((update) => update.source)).toEqual([
		"flag ? 'Close' : 'Open'",
		"user.pro ? user.name : 'guest'",
		'count + 1',
		'flag && user.name',
		"name ?? 'anon'",
		'`Hi ${user.name}`',
	]);
	expect(result.protocolState.computed.map((computed) => computed.dependencies)).toEqual([
		[{ graphNodeId: 'state:flag', path: [] }],
		[
			{ graphNodeId: 'state:user', path: ['pro'] },
			{ graphNodeId: 'state:user', path: ['name'] },
		],
		[{ graphNodeId: 'state:count', path: [] }],
		[
			{ graphNodeId: 'state:flag', path: [] },
			{ graphNodeId: 'state:user', path: ['name'] },
		],
		[{ graphNodeId: 'state:name', path: [] }],
		[{ graphNodeId: 'state:user', path: ['name'] }],
	]);
});

test('T003 compileTsrxModule renders object style attributes as CSS text in SSR modules', async () => {
	const result = await compileTsrxModule({
		filename: 'src/StyleObjects.tsrx',
		source: `import { state } from '@markless/core';
export function App() @{
	let x = state(10);
	let y = state(20);
	let hue = state('teal');
	let gap = state(4);
	let missing = state(null);
	<section>
		<div style={{ position: 'absolute', marginTop: 0, lineHeight: 2 }}>Static</div>
		<div style={{ transform: \`translate(\${x}%, \${y}%)\` }}>Canonical</div>
		<div style={{ color: hue, marginTop: gap, zIndex: gap, background: missing }}>Mixed</div>
	</section>
}`,
		symbols: [],
	});

	expect(result.diagnostics ?? []).toEqual([]);
	expect(result.publicRenderPlan.diagnostics).toEqual([]);

	const ssr = await renderTestSsr(result);

	expect(ssr.html).toContain(
		'<div style="position:absolute;margin-top:0;line-height:2;">Static</div>',
	);
	expect(ssr.html).toContain('<div style="transform:translate(10%, 20%);">Canonical</div>');
	expect(ssr.html).toContain(
		'<div style="color:teal;margin-top:4px;z-index:4;">Mixed</div>',
	);

	const styleUpdates = result.protocolView.domUpdates.filter(
		(update) => update.target.kind === 'style',
	);
	expect(styleUpdates).toHaveLength(2);
	expect(new Set(styleUpdates.map((update) => update.graphNodeId)).size).toBe(2);
});

test('T011 compileTsrxModule renders referenced-const style objects identically to inline', async () => {
	const result = await compileTsrxModule({
		filename: 'src/StyleConstRefs.tsrx',
		source: `import { state } from '@markless/core';
const panel = { position: 'absolute', marginTop: 0 };
export function App() @{
	let x = state(10);
	let y = state(20);
	const sty = { transform: \`translate(\${x}%, \${y}%)\` };
	<section>
		<div style={panel}>Referenced</div>
		<div style={sty}>Canonical</div>
		<div style={{ ...panel, marginTop: 8 }}>Spread</div>
	</section>
}`,
		symbols: [],
	});

	expect(result.diagnostics ?? []).toEqual([]);
	expect(result.publicRenderPlan.diagnostics).toEqual([]);

	const ssr = await renderTestSsr(result);

	expect(ssr.html).toContain('<div style="position:absolute;margin-top:0;">Referenced</div>');
	expect(ssr.html).toContain('<div style="transform:translate(10%, 20%);">Canonical</div>');
	expect(ssr.html).toContain('<div style="position:absolute;margin-top:8px;">Spread</div>');

	const styleUpdates = result.protocolView.domUpdates.filter(
		(update) => update.target.kind === 'style',
	);
	expect(styleUpdates).toHaveLength(1);
});

test('compileTsrxModule lets pre-root guard clauses render nothing in SSR modules', async () => {
	const result = await compileTsrxModule({
		filename: 'src/RenderBodyGuard.tsrx',
		source: `
export function App({ hidden = false }) @{
	if (hidden) return null;

	<section>Visible</section>
}
`,
		symbols: [],
	});
	expect(await renderTestSsr(result, { hidden: true })).toBeNull();
	expect((await renderTestSsr(result, { hidden: false })).html).toBe(
		'<section>Visible</section>',
	);
});

test('compileTsrxModule diagnoses conditional component roots instead of deleting statement flow', async () => {
	const result = await compileTsrxModule({
		filename: 'src/ConditionalRoot.tsrx',
		source: `
export function App({ choice = false }) @{
	if (choice) return <a>First</a>;
	return <b>Second</b>;
}
`,
		symbols: [],
	});

	expect(result.publicRenderPlan.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_COMPONENT_ROOT_CONDITIONAL',
			severity: 'error',
			phase: 'public-render',
			title: expect.stringContaining('Component root is conditional'),
			message: expect.stringContaining('second template return'),
			docsUrl: 'https://markless.dev/errors/MARKLESS_COMPONENT_ROOT_CONDITIONAL',
		}),
	]);
});

test('compileTsrxModule diagnoses body statements the render module cannot represent', async () => {
	const result = await compileTsrxModule({
		filename: 'src/UnsupportedBodyStatement.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	const count = state(1), label = 'ready';

	<p>{count}</p>
}
`,
		symbols: [],
	});

	expect(result.publicRenderPlan.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_RENDER_BODY_UNSUPPORTED',
			severity: 'error',
			phase: 'public-render',
			title: expect.stringContaining('Component body statement is not supported'),
			message: expect.stringContaining('count'),
			docsUrl: 'https://markless.dev/errors/MARKLESS_RENDER_BODY_UNSUPPORTED',
		}),
	]);
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
	const output = await (
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
	const output = await (
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
	const output = await (
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
	const output = await (ssrModule.marklessRenderSsr as () => { readonly html: string })();

	expect(output.html).toBe('<section data-kind="card" id="main" title="Final">Hi</section>');
});

test('B921 keeps string, number, and boolean attribute rendering intact', async () => {
	const result = await compileTsrxModule({
		filename: 'src/ScalarAttributes.tsrx',
		source: `import { state } from '@markless/core';
export function App() @{ const label = state('Menu'); const count = state(3); const open = state(true); <section data-label={label} data-count={count} data-open={open}>Hi</section> }`,
		symbols: [],
	});

	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = await (ssrModule.marklessRenderSsr as () => { readonly html: string })();

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(output.html).toBe(
		'<section data-label="Menu" data-count="3" data-open="true">Hi</section>',
	);
});

test('B921 rejects spread handler bags before render modules interpolate undeclared spread sources', async () => {
	const result = await compileTsrxModule({
		filename: 'src/SpreadHandlers.tsrx',
		source: `import { state } from '@markless/core';
export function App() @{ let count = state(0); const handlers = { onClick: () => count++ }; <button {...handlers}>{count}</button> }`,
		symbols: [],
	});

	expect(result.semanticGraph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_EVENT_SPREAD_UNSUPPORTED',
			severity: 'error',
		}),
	]);
	expect(result.publicRenderModule.ssrModuleSource).not.toContain('...(handlers)');
});

test('compileTsrxModule renders the @empty branch in the direct render module', async () => {
	const result = await compileTsrxModule({
		filename: 'src/EmptyRows.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let entries = state([]);

	<main>
		<ul>
			@for (const entry of entries; key entry.code) {
				<li>{entry.title}</li>
			} @empty {
				<p>No drafts</p>
			}
		</ul>
	</main>
}
`,
		symbols: [],
	});

	expect(result.renderData.repeats).toEqual([
		expect.objectContaining({ repeatId: 'repeat:0', emptyChunkId: 'repeat:repeat:0:empty' }),
	]);
	const moduleSource = result.publicRenderModule.moduleSource;
	// The direct sync renders the empty branch when the collection is empty
	// instead of leaving a silently blank parent (browser-matrix bug).
	expect(result.publicRenderModule.renderDataModuleSource).toContain('No drafts');
	expect(moduleSource).toContain('"emptyChunkId":"repeat:repeat:0:empty"');
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

	expect(result.renderData.repeats).toEqual([expect.objectContaining({ repeatId: 'repeat:0' })]);
	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = await (
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
	const output = await (ssrModule.marklessRenderSsr as () => { readonly html: string })();

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
	const output = await (ssrModule.marklessRenderSsr as () => { readonly html: string })();

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
	// Index-reading rows stay off the direct-DOM runtime, which cannot rewrite
	// index text on reorder yet.
	expect(result.renderData.repeats[0]).toEqual(
		expect.objectContaining({ directSupported: false }),
	);

	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = await (
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

test('compileTsrxModule renders positional-key repeat rows in SSR output', async () => {
	const result = await compileTsrxModule({
		filename: 'src/PositionRows.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let records = state([
		{ uuid: 'x', label: 'One' },
		{ uuid: 'y', label: 'Two' },
	]);

	<section>
		// markless-allow MARKLESS_REPEAT_KEY_IS_INDEX: static list, order never changes
		@for (const record of records; index slot; key slot) {
			<p>{record.label}</p>
		}
	</section>
}
`,
		symbols: [],
	});

	expect(result.semanticGraph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_REPEAT_KEY_IS_INDEX',
			severity: 'warning',
			suppressed: true,
			suppressionReason: 'static list, order never changes',
		}),
	]);
	expect(result.renderData.repeats[0]).toEqual(
		expect.objectContaining({ directSupported: false }),
	);

	const ssrOutput = await renderTestSsr(result);

	expect(ssrOutput.html).toBe('<section><p>One</p><p>Two</p></section>');
});

test('compileTsrxModule keeps ordinary keyed repeat SSR html unchanged', async () => {
	const result = await compileTsrxModule({
		filename: 'src/StableRows.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let records = state([
		{ uuid: 'x', label: 'One' },
		{ uuid: 'y', label: 'Two' },
	]);

	<section>
		@for (const record of records; key record.uuid) {
			<p>{record.label}</p>
		}
	</section>
}
`,
		symbols: [],
	});

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.renderData.repeats).toEqual([expect.objectContaining({ repeatId: 'repeat:0' })]);
	const ssrOutput = await renderTestSsr(result);

	expect(ssrOutput.html).toBe('<section><p>One</p><p>Two</p></section>');
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
	const output = await (
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
	const output = await (
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
			.card:hover::before { content: 'hover'; }
			@media (min-width: 40rem) { .card > h2:first-child { font-weight: 700; } }
			@KEYFRAMES pulse { from { opacity: 0; } 50% { opacity: .5; } to { opacity: 1; } }
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
	expect(styleScope!.cssText).toContain(`.card.${scope}:hover::before { content: 'hover'; }`);
	expect(styleScope!.cssText).toContain(
		`@media (min-width: 40rem) { .card > h2.${scope}:first-child { font-weight: 700; } }`,
	);
	expect(styleScope!.cssText).toContain(
		`@KEYFRAMES pulse { from { opacity: 0; } 50% { opacity: .5; } to { opacity: 1; } }`,
	);
	expect(styleScope!.cssText).not.toContain(`from.${scope}`);
	expect(styleScope!.cssText).not.toContain(`50%.${scope}`);

	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = await (ssrModule.marklessRenderSsr as () => { readonly html: string })();

	// Host elements gain the scope class; the <style> block itself emits no HTML.
	expect(output.html).toBe(
		`<section class="card ${scope}"><h2 class="title ${scope}">Hi</h2><footer class="${scope}">Done</footer></section>`,
	);
	expect(output.html).not.toContain('<style');
});

// A <style> block that cannot be scope-compiled is dropped from the build, so
// the drop has to be explained. `collectStyleScopes` reports it and the public
// render plan is the single pass that carries those diagnostics to the author;
// the semantic-graph markup collector calls the same helper only for the scope
// class, which is why re-reporting there would duplicate this one diagnostic.
test('compileTsrxModule reports a <style> block whose CSS cannot be scope-compiled', async () => {
	const result = await compileTsrxModule({
		filename: 'src/BrokenStyle.tsrx',
		source: `
export function App() @{
	<section class="card">
		<style>
			.card { color: red;
		</style>
		<footer>Done</footer>
	</section>
}
`,
		symbols: [],
	});

	expect(result.publicRenderPlan.styleScopes).toEqual([]);
	expect(result.publicRenderPlan.diagnostics).toEqual([
		expect.objectContaining({
			code: PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT_CODE,
			phase: PUBLIC_RENDER_PHASE,
			passId: PUBLIC_RENDER_PLAN_PASS_ID,
			title: expect.stringContaining('<style>'),
			message: expect.stringContaining('could not be scope-compiled'),
			primarySpan: expect.objectContaining({ filename: 'src/BrokenStyle.tsrx' }),
		}),
	]);
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
	// Fragment roots remain on the linked render-data and SSR paths.
	expect(result.publicRenderModule.moduleSource).toBe('');
	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = await (
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

test('compileTsrxModule places children as raw template projection', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Card.tsrx',
		source: `
export function Card({ children }) @{
	<section class="card">
		<h2>Card</h2>
		{children}
	</section>
}
`,
		symbols: [],
	});

	// Children placement is a template projection of compiler-rendered HTML —
	// escaping it (marklessSsrText) turns projected markup into visible text.
	expect(result.publicRenderModule.renderDataModuleSource).toContain('"raw":true');
	expect(result.publicRenderModule.ssrModuleSource).not.toContain(
		'marklessSsrChildrenHtml(children)',
	);

	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = await (
		ssrModule.marklessRenderSsr as (props: {
			readonly children?: string;
		}) => Promise<{ readonly elementCount: number; readonly html: string }>
	)({ children: '<p class="projected">Projected content</p>' });
	expect(output.html).toContain('<p class="projected">Projected content</p>');
	// A raw props string has no child-view side channel, so elementCount remains
	// the compiler-owned hosts in this component.
	expect(output.elementCount).toBe(2);
});

test('compileTsrxModule supports control-flow children in fragment roots', async () => {
	const result = await compileTsrxModule({
		filename: 'src/FragmentBranch.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let open = state(true);

	<>
		<h1>Panel</h1>
		@if (open) { <p>Shown</p> } @else { <p>Hidden</p> }
	</>
}
`,
		symbols: [],
	});

	// Fragment top level counts as top-level for the branch gates: the @if
	// child is gate-eligible instead of a fragment-root diagnostic.
	expect(result.diagnostics ?? []).toEqual([]);
	expect(result.renderData.branches).toEqual([
		expect.objectContaining({ branchSiteId: 'branch-site:0' }),
	]);
	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = await (
		ssrModule.marklessRenderSsr as () => Promise<{ readonly html: string }>
	)();
	expect(output.html).toBe(
		'<h1>Panel</h1>' +
			'<!--markless:branch:branch-site:0--><p>Shown</p><!--/markless:branch:branch-site:0-->',
	);
});

test('compileTsrxModule names the nested component blocking a fragment root', async () => {
	const result = await compileTsrxModule({
		filename: 'src/FragmentNestedComponent.tsrx',
		source: `
import { Counter } from './counter.tsrx';

export function App() @{
	<>
		<main>
			<h1>Title</h1>
			<Counter />
		</main>
	</>
}
`,
		symbols: [],
	});

	expect(result.publicRenderModule.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: 'MARKLESS_PUBLIC_RENDER_ROOT_UNSUPPORTED',
				severity: 'error',
				message: expect.stringContaining('the <Counter> component inside <main>'),
			}),
		]),
	);
	const diagnostic = result.publicRenderModule.diagnostics.find(
		(entry) => entry.code === 'MARKLESS_PUBLIC_RENDER_ROOT_UNSUPPORTED',
	);
	expect(diagnostic?.suggestions?.[0]?.message).toContain('single root element');
});

test('compileTsrxModule fragment-root diagnostic skips supported control flow to name the offender', async () => {
	const result = await compileTsrxModule({
		filename: 'src/FragmentBranchThenComponent.tsrx',
		source: `
import { state } from '@markless/core';
import { Widget } from './widget.tsrx';

export function App() @{
	let open = state(true);

	<>
		@if (open) { <p>Shown</p> } @else { <p>Hidden</p> }
		<Widget />
	</>
}
`,
		symbols: [],
	});

	const diagnostic = result.publicRenderModule.diagnostics.find(
		(entry) => entry.code === 'MARKLESS_PUBLIC_RENDER_ROOT_UNSUPPORTED',
	);
	// The @if child is supported, so the diagnostic must name the component,
	// not misreport the control-flow block.
	expect(diagnostic?.message).toContain('the <Widget> component');
	expect(diagnostic?.message).not.toContain('control-flow');
});

test('compileTsrxModule parenthesizes non-atomic @if tests in SSR output', async () => {
	const result = await compileTsrxModule({
		filename: 'src/BranchPrecedence.tsrx',
		source: `import { state } from '@markless/core'; export function App() @{ let primary = state(null); let fallback = state(true); <section>@if (primary ?? fallback) { <p>Shown</p> } @else { <p>Hidden</p> }</section> }`,
		symbols: [],
	});

	expect(result.publicRenderModule.ssrModuleSource).toContain(
		'const arm=((primary ?? fallback)?0:1)',
	);
});

test('compileTsrxModule keeps arm behaviors and handles out of the flat streams', async () => {
	const result = await compileTsrxModule({
		filename: 'src/ArmBehavior.tsrx',
		source: `
import { attach, element, state } from '@markless/core';

export function App() @{
	let open = state(true);
	const box = element();

	<main>
		@if (open) {
			<section el={box} attach={(host) => { host.dataset.ready = 'yes'; }}>
				<p>On</p>
			</section>
		} @else {
			<p>Off</p>
		}
	</main>
}
`,
		symbols: [],
	});

	expect(result.renderData.branches).toEqual([
		expect.objectContaining({ branchSiteId: 'branch-site:0' }),
	]);
	// Arm-host behaviors and handles ride armRecords exclusively.
	expect(result.protocolView.behaviors).toEqual([]);
	expect(result.protocolView.elementHandles).toEqual([]);
	expect(result.protocolView.branches?.[0]?.armRecords?.[0]).toEqual(
		expect.objectContaining({
			behaviors: [expect.objectContaining({ hostPath: [0] })],
			elementHandles: [expect.objectContaining({ hostPath: [0], name: 'box' })],
		}),
	);
});

test('compileTsrxModule plans arm records for branch arms with events', async () => {
	const result = await compileTsrxModule({
		filename: 'src/ArmEvents.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let open = state(true);
	let note = state('');

	<main>
		@if (open) {
			<section>
				<button onClick={() => note = 'from-open'}>Open action</button>
			</section>
		} @else {
			<section>
				<button onClick={() => note = 'from-closed'}>Closed action</button>
			</section>
		}
		<output>{note}</output>
	</main>
}
`,
		symbols: [],
	});

	// Arms with events are now gate-supported…
	expect(result.renderData.branches).toEqual([
		expect.objectContaining({ branchSiteId: 'branch-site:0' }),
	]);
	// …and their event records ride the branch record as arm-relative host
	// paths (the L2 rowEvents convention), one entry per arm.
	expect(result.protocolView.branches?.[0]).toEqual(
		expect.objectContaining({
			id: 'branch-site:0',
			armRecords: [
				expect.objectContaining({
					events: [
						expect.objectContaining({
							hostPath: [0, 0],
							eventName: 'click',
							symbolIds: [expect.any(String)],
						}),
					],
				}),
				expect.objectContaining({
					events: [
						expect.objectContaining({
							hostPath: [0, 0],
							eventName: 'click',
							symbolIds: [expect.any(String)],
						}),
					],
				}),
			],
		}),
	);
	// Arm host events leave the flat stream — they can never match by
	// dom-order locator after a flip.
	expect(result.protocolView.events).toEqual([]);
	// Arm hosts leave the locator stream with extras compensation, so the
	// trailing <output> locator index still counts them.
	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = await (
		ssrModule.marklessRenderSsr as () => Promise<{
			readonly html: string;
			readonly view: {
				readonly locators: ReadonlyArray<{
					readonly hostNodeId: string;
					readonly index: number;
					readonly tagName: string;
				}>;
			};
		}>
	)();
	const outputLocator = output.view.locators.find((locator) => locator.tagName === 'output');
	expect(outputLocator).toBeDefined();
	// main(0), section(1), button(2) -> output at dom-order index 3.
	expect(outputLocator!.index).toBe(3);
	expect(output.view.locators.some((locator) => locator.tagName === 'button')).toBe(false);
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

	expect(result.renderData.branches).toEqual([
		expect.objectContaining({ branchSiteId: 'branch-site:0' }),
	]);
	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = await (
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
	expect(
		result.renderData.boundaries.filter((boundary) => boundary.protocolSupported),
	).toHaveLength(1);

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
	expect(result.renderData.boundaries).toEqual([
		expect.objectContaining({ boundaryId: 'boundary:0', protocolSupported: true }),
	]);
	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = await (
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

// D5/D6 streaming (T107): a render context with a streaming runner registry
// makes unsettled boundaries render their @pending arm NOW (never the @catch
// arm with an undefined error); a later pass with the same context renders
// the settled @try arm from the one shared run() execution. No context means
// exact blocking behavior.
test('T107 streaming render context renders @pending first and the settled @try arm on re-render', async () => {
	const result = await compileTsrxModule({
		filename: 'src/SlowPanel.tsrx',
		source: `
import { computed, state } from '@markless/core';

export function App() @{
	let topic = state('otters');
	const facts = computed(async () => ({ headline: 'Fact about ' + topic }));

	<section>
		@try { <article><h2>{facts.headline}</h2><button onClick={() => topic = 'owls'}>Next</button></article> }
		@pending { <p>Gathering facts</p> }
		@catch { <p>No facts today</p> }
	</section>
}
`,
		symbols: [],
	});

	expect(result.publicRenderPlan.diagnostics).toEqual([]);
	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const renderSsr = ssrModule.marklessRenderSsr as (
		props?: unknown,
		renderContext?: unknown,
	) => Promise<{
		readonly html: string;
		readonly state: ProtocolStatePayload;
		readonly view: {
			readonly asyncBoundaries: ReadonlyArray<{
				readonly armRecords?: unknown;
			}>;
		};
	}>;
	const runs = new Map<string, { readonly promise: Promise<unknown> }>();
	const streamingContext = { streaming: { runs } };

	const shell = await renderSsr(undefined, streamingContext);
	expect(shell.html).toContain('<p>Gathering facts</p>');
	expect(shell.html).not.toContain('Fact about');
	expect(shell.html).not.toContain('No facts today');
	expect(
		shell.state.computed.find((computed) => computed.graphNodeId === 'computed:facts')
			?.snapshot,
	).toMatchObject({ status: 'pending' });

	await runs.get('computed:facts')?.promise;
	const settledPass = await renderSsr(undefined, streamingContext);
	expect(settledPass.html).toContain('Fact about otters');
	expect(settledPass.html).not.toContain('Gathering facts');
	const armRecords = settledPass.view.asyncBoundaries[0]?.armRecords as {
		readonly events: ReadonlyArray<{ readonly eventName: string }>;
	};
	expect(Array.isArray(armRecords)).toBe(false);
	expect(armRecords.events).toEqual(
		expect.arrayContaining([expect.objectContaining({ eventName: 'click' })]),
	);

	// No render context: exact blocking behavior (await inline, settled arm).
	const blocking = await renderSsr();
	expect(blocking.html).toContain('Fact about otters');
	expect(
		blocking.state.computed.find((computed) => computed.graphNodeId === 'computed:facts')
			?.snapshot,
	).toMatchObject({ status: 'fulfilled' });
});

// Grammar finding (verified empirically 2026-07-07; TSRX MCP unavailable in
// the T107 session): @try + @catch WITHOUT @pending parses and keeps a
// supported boundary gate, so the hold-the-stream branch is reachable. The
// authored @pending arm is the structural streaming opt-in; without one the
// boundary holds the stream — the server awaits it even under streaming.
test('T107 a @try without @pending holds the stream (settled arm in the shell)', async () => {
	const result = await compileTsrxModule({
		filename: 'src/HeldPanel.tsrx',
		source: `
import { computed, state } from '@markless/core';

export function App() @{
	let topic = state('otters');
	const facts = computed(async () => ({ headline: 'Fact about ' + topic }));

	<section>
		@try { <h2>{facts.headline}</h2> }
		@catch { <p>No facts today</p> }
	</section>
}
`,
		symbols: [],
	});

	expect(result.publicRenderPlan.diagnostics).toEqual([]);
	expect(result.renderData.boundaries).toEqual([
		expect.objectContaining({ boundaryId: 'boundary:0', protocolSupported: true }),
	]);
	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const renderSsr = ssrModule.marklessRenderSsr as (
		props?: unknown,
		renderContext?: unknown,
	) => Promise<{ readonly html: string; readonly state: ProtocolStatePayload }>;

	const shell = await renderSsr(undefined, { streaming: { runs: new Map() } });
	expect(shell.html).toContain('Fact about otters');
	expect(
		shell.state.computed.find((computed) => computed.graphNodeId === 'computed:facts')
			?.snapshot,
	).toMatchObject({ status: 'fulfilled' });
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
	const output = await (
		ssrModule.marklessRenderSsr as () => {
			readonly html: string;
			readonly view: { readonly locators: ReadonlyArray<Record<string, unknown>> };
		}
	)();

	expect(output.html).toBe(
		'<section><!--markless:branch:branch-site:0--><p>B</p><!--/markless:branch:branch-site:0--></section>',
	);
	// Only the rendered case's element may claim a dom-order locator slot.
	// Arm hosts ride armRecords since L4 (single convention for all arms);
	// only the section remains in the flat locator stream.
	expect(output.view.locators).toEqual([
		expect.objectContaining({ tagName: 'section', index: 0 }),
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
	const output = await (ssrModule.marklessRenderSsr as () => { readonly html: string })();

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
					return {
						html: `<a href="${props.href}">${props.children}</a>`,
						elementCount: 1,
					};
				},
			},
		},
	);
	const output = await (ssrModule.marklessRenderSsr as () => { readonly html: string })();

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
					return { html: String(props.children ?? ''), elementCount: 3 };
				},
			},
		},
	);
	const output = await (
		ssrModule.marklessRenderSsr as (props: { children: string }) => {
			readonly html: string;
		}
	)({ children: '<main>Docs</main>' });

	expect(output.html).toBe(
		'<head><title>Markless Router</title></head><body><main>Docs</main></body>',
	);
});

test('compileTsrxModule records component children in linked component definitions', async () => {
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
	const definitions = JSON.stringify(result.publicRenderModule.componentDefinitions);
	expect(definitions).toContain('"projection":{"kind":"static-markup","markup":"Docs"');
	expect(definitions).toContain('"name":"href","kind":"serializable","value":"/docs"');
});

test('compileTsrxModule awaits demanded async work and serves the resolved arm in SSR', async () => {
	const result = await compileTsrxModule({
		filename: 'src/SsrAwait.tsrx',
		source: `
import { computed, state } from '@markless/core';

export function App() @{
	let query = state('markless');
	let details = computed(async () => {
		return { title: 'Result: ' + query };
	});

	<main>
		<h1>Search</h1>
		@try { <p>{details.title}</p> } @pending { <p>Loading</p> } @catch { <p>Broken</p> }
	</main>
}
`,
		symbols: [],
	});

	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = await (
		ssrModule.marklessRenderSsr as () => Promise<{
			readonly html: string;
			readonly state: {
				readonly computed: ReadonlyArray<Record<string, unknown>>;
			};
		}>
	)();

	// v1 initial render awaits demanded async nodes (spec 03:181) and serves
	// the resolved @try arm between the same anchors — never @pending.
	expect(output.html).toBe(
		'<main><h1>Search</h1>' +
			'<!--markless:async:boundary:0--><p>Result: markless</p><!--/markless:async:boundary:0-->' +
			'</main>',
	);
	// The payload carries the settled snapshot so resume starts zero runners.
	expect(output.state.computed).toEqual([
		expect.objectContaining({
			graphNodeId: 'computed:details',
			snapshot: expect.objectContaining({
				status: 'fulfilled',
				version: 1,
				value: { title: 'Result: markless' },
			}),
		}),
	]);
});

test('compileTsrxModule settles async-computed dependencies through two SSR boundaries', async () => {
	const result = await compileTsrxModule({
		filename: 'src/SsrAsyncChain.tsrx',
		source: `
import { computed, state } from '@markless/core';

export function App() @{
	let version = state(0);
	const first = computed(async () => ({ revision: version, label: 'first:' + version }));
	const second = computed(async () => ({ label: 'second:' + first.revision }));

	<main>
		@try { <p>{first.label}</p> } @pending { <p>Loading first</p> } @catch { <p>Broken first</p> }
		@try { <p>{second.label}</p> } @pending { <p>Loading second</p> } @catch { <p>Broken second</p> }
	</main>
}
`,
		symbols: [],
	});

	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = await (
		ssrModule.marklessRenderSsr as () => Promise<{
			readonly html: string;
			readonly state: ProtocolStatePayload;
		}>
	)();

	expect(output.html).toContain('<p>first:0</p>');
	expect(output.html).toContain('<p>second:0</p>');
	expect(output.html).not.toContain('Loading');
	expect(output.html).not.toContain('Broken');
	expect(output.state.computed.map((computed) => computed.snapshot?.status)).toEqual([
		'fulfilled',
		'fulfilled',
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

	const ssrModule = await importPublicRenderTestModule(
		ssrRenderTestModuleSource(result, { replaceChildImport: true }).replace(
			'import { routeHref } from "virtual:test-route-href";',
			'const routeHref = (_pattern, params) => `/docs/${params.slug.join("/")}`;',
		),
		{
			childComponent: {
				renderSsr(props: { readonly children?: unknown; readonly href?: string }) {
					return {
						html: `<a href="${props.href}">${props.children}</a>`,
						elementCount: 1,
					};
				},
			},
		},
	);
	const output = await (ssrModule.marklessRenderSsr as () => { readonly html: string })();

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

test('B917 compileTsrxModule renders same-module child components in SSR', async () => {
	const result = await compileTsrxModule({
		filename: 'src/SameModuleCard.tsrx',
		source: `
import { state } from '@markless/core';
export function App() @{
	let count = state(7);
	<main><Card value={count} /><button>+</button></main>
}
function Card({ value }) @{
	<article class="card"><strong>{value}</strong></article>
}
`,
		symbols: [],
	});

	expect(result.renderData.root).toEqual({ componentName: 'App', templateId: 'template:App' });

	const ssrOutput = (await renderTestSsr(result)) as {
		readonly html: string;
	};

	expect(ssrOutput.html).toBe(
		'<main><article class="card"><strong>7</strong></article><button>+</button></main>',
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

	// L4: the spans are arm hosts of a gate-supported branch site, so the
	// same-host conditional text update rides the branch armRecords instead
	// of the flat stream (dom-order locators cannot name flip-replaced arms).
	const armDomUpdates = (result.protocolView.branches ?? []).flatMap((branch) =>
		(branch.armRecords ?? []).flatMap((arm) => arm.domUpdates),
	);
	expect(armDomUpdates).toEqual(
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
	expect(result.protocolView.domUpdates).toEqual([]);
});

test('T009a direct chunk bootstrap emits renderData statics and slot coordinates for supported keyed repeats', async () => {
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
	expect(moduleSource).toContain('createMarklessDirectChunkRenderer');
	expect(moduleSource).toContain('rootChunkId:marklessRenderData.root.templateId');
	expect(moduleSource).toContain('"rowChunkId":"repeat:repeat:0:row"');
	expect(result.publicRenderModule.renderDataModuleSource).toContain('"kind":"comment-anchor"');
	expect(moduleSource).not.toContain('function createMarklessPublicRoot()');
	expect(moduleSource).not.toContain('function createMarklessPublicRepeat0Row()');
	expect(moduleSource).not.toContain('rowTemplateHtml');
	expect(moduleSource).not.toContain('emptyTemplateHtml');
	const addSymbol = result.symbolResolver.symbols.find((symbol) =>
		symbol.source.includes('entries.push'),
	);
	const deleteDraftSymbol = result.symbolResolver.symbols.find((symbol) =>
		symbol.source.includes('delete draft.code'),
	);

	expect(addSymbol).toBeDefined();
	expect(deleteDraftSymbol).toBeDefined();
	const bootstrap = result.publicRenderModule.moduleSource;
	expect(bootstrap).toContain(
		JSON.stringify({
			eventName: 'click',
			hostNodeId: addSymbol!.hostNodeId,
			hostPath: [0],
			symbolIds: [addSymbol!.id],
		}).slice(1, -1),
	);
	expect(bootstrap).toContain(
		JSON.stringify({
			eventName: 'click',
			hostNodeId: deleteDraftSymbol!.hostNodeId,
			hostPath: [1],
			symbolIds: [deleteDraftSymbol!.id],
		}).slice(1, -1),
	);
	/* retired plan projection previously duplicated these records:
	expect([]).toEqual([
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
	]); */
	expect(result.renderData.repeats).toEqual([
		expect.objectContaining({
			repeatId: 'repeat:0',
			itemName: 'entry',
			collectionGraphNodeId: 'state:entries',
			keyPath: ['code'],
			parentPath: [2],
		}),
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
	expect(result.publicRenderModule.renderDataModuleSource).toContain('"statics":["<main>');
	expect(result.publicRenderModule.renderDataModuleSource).toContain('<!--markless-slot:0-->');
	expect(moduleSource).toContain('"hostPath":[0],"symbolIds":["symbol:0"]');
	expect(moduleSource).toContain('"hostPath":[1],"symbolIds":["symbol:1"]');
	expect(moduleSource).toContain("from '@markless/web/fns/direct'");
	expect(moduleSource).toContain('const dirtyGraphNodeIds = new Set();');
	expect(moduleSource).toContain('const dirtyArrayIndexes = new Map();');
	expect(moduleSource).toContain(
		'isDirty(graphNodeId) { return dirtyGraphNodeIds.has(graphNodeId); }',
	);
	expect(moduleSource).toContain(
		'dirtyIndexes(graphNodeId) { return dirtyArrayIndexes.get(graphNodeId); }',
	);
	expect(moduleSource).toMatch(/call\(call\)[\s\S]*delete\(deletion\)/);
	expect(moduleSource).not.toContain('document.createElement');
	expect(moduleSource).not.toContain('createMarklessPublicRepeat');
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

test('T009a direct chunk bootstrap stays DOM-equal across alternate keyed repeat shapes', async () => {
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
		createTextNode(value: string) {
			return new PublicRenderTestText(value);
		},
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
			result.publicRenderModule.renderDataModuleSource,
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
		createTextNode(value: string) {
			return new PublicRenderTestText(value);
		},
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
			result.publicRenderModule.renderDataModuleSource,
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
		createTextNode(value: string) {
			return new PublicRenderTestText(value);
		},
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
			result.publicRenderModule.renderDataModuleSource,
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

test('compileTsrxModule public render module rejects duplicate runtime keys', async () => {
	const result = await compileTsrxModule({
		filename: 'src/DuplicateArticles.tsrx',
		source: `
import { state } from '@markless/core';

export function DuplicateArticles() @{
	let entries = state([
		{ code: 'fruit', title: 'Apple' },
		{ code: 'fruit', title: 'Pear' },
	]);

	<section>
		@for (const entry of entries; key entry.code) {
			<article>{entry.title}</article>
		}
	</section>
}
`,
		symbols: [],
	});
	const document = {
		createTextNode(value: string) {
			return new PublicRenderTestText(value);
		},
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
			'const loadSymbol = () => undefined;',
			result.publicRenderModule.renderDataModuleSource,
			result.publicRenderModule.moduleSource,
		].join('\n'),
		{ document },
	);

	expect(() => publicModule.DuplicateArticles()).toThrowError(
		expect.objectContaining({
			code: 'MARKLESS_REPEAT_KEY_DUPLICATE',
			message: 'MARKLESS_REPEAT_KEY_DUPLICATE: Duplicate @for key "fruit" from entry.code.',
			phase: 'runtime',
			docsUrl: 'https://markless.dev/errors/MARKLESS_REPEAT_KEY_DUPLICATE',
			repeatId: 'repeat:0',
			keyPath: ['code'],
			collidingValue: 'fruit',
		}),
	);
});

test('T009a direct chunk bootstrap stays DOM-equal for empty and populated keyed rows', async () => {
	const result = await compileTsrxModule({
		filename: 'src/UndefinedArticles.tsrx',
		source: `
import { state } from '@markless/core';

export function UndefinedArticles() @{
	let entries = state(undefined);

	<section>
		<button onClick={() => entries = [{ code: 'alpha', title: 'Alpha' }, { code: 'beta', title: 'Beta' }]}>Load</button>
		<ul>
			@for (const entry of entries; key entry.code) {
				<li class="row">{entry.title}</li>
			} @empty {
				<li class="empty">No items yet</li>
			}
		</ul>
	</section>
}
`,
		symbols: [],
	});
	const loadEntriesSymbol = result.symbolResolver.symbols.find((symbol) =>
		symbol.source.includes("'Alpha'"),
	);
	expect(loadEntriesSymbol).toBeDefined();

	const document = publicRenderTestDocument();
	const publicModule = await importPublicRenderTestModule(
		[
			'const document = globalThis.__marklessPublicRenderTestDocument;',
			'const loadSymbol = globalThis.__marklessPublicRenderTestLoadSymbol;',
			result.publicRenderModule.renderDataModuleSource,
			result.publicRenderModule.moduleSource,
		].join('\n'),
		{
			document,
			loadSymbol(symbolId: string) {
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
			},
		},
	);
	const rendered = publicModule.UndefinedArticles() as { readonly root: PublicRenderTestElement };

	expect(elementsByTag(rendered.root, 'li').map((row) => row.textContent)).toEqual([
		'No items yet',
	]);
	await elementsByTag(rendered.root, 'button')[0]!.dispatch('click');
	expect(elementsByTag(rendered.root, 'li').map((row) => row.textContent)).toEqual([
		'Alpha',
		'Beta',
	]);
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
		createTextNode(value: string) {
			return new PublicRenderTestText(value);
		},
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
			result.publicRenderModule.renderDataModuleSource,
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
		createTextNode(value: string) {
			return new PublicRenderTestText(value);
		},
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
			result.publicRenderModule.renderDataModuleSource,
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

test('T009a direct chunk bootstrap stays DOM-equal for initial and updated static text', async () => {
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
	expect(
		result.renderData.chunks.find((chunk) => chunk.id === 'template:Scoreboard')?.slots,
	).toContainEqual(
		expect.objectContaining({
			kind: 'text',
			residue: { kind: 'graph-read', graphNodeId: 'state:score', path: ['total'] },
		}),
	);
	expect(result.publicRenderModule.moduleSource).toContain(
		'createMarklessDirectChunkRenderer(marklessDirectChunkData)',
	);
	expect(result.publicRenderModule.renderDataModuleSource).toContain(
		'"coordinate":{"kind":"comment-anchor","path":[0,0,0]}',
	);

	const incrementExports = await importPublicRenderTestModule(incrementModule!.source);
	const loadSymbolCalls = new Map<string, number>();
	const loadSymbol = (symbolId: string) => {
		loadSymbolCalls.set(symbolId, (loadSymbolCalls.get(symbolId) ?? 0) + 1);
		if (symbolId === incrementSymbol?.id) return incrementExports[incrementModule!.exportName];
		throw new Error(`Unexpected public render test symbol ${symbolId}`);
	};
	let templateParses = 0;
	const document = {
		createTextNode(value: string) {
			return new PublicRenderTestText(value);
		},
		createElement(tagName: string) {
			if (tagName === 'template') {
				templateParses++;
				return new PublicRenderTestTemplate();
			}
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
			result.publicRenderModule.renderDataModuleSource,
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
	expect(templateParses).toBe(1);
	expect(loadSymbolCalls.get(incrementSymbol!.id)).toBe(undefined);
	await button.dispatch('click');
	expect(rendered.graph.read('state:score', ['total'])).toBe(2);
	expect(button.textContent).toBe('2');
	expect(secondRendered.graph.read('state:score', ['total'])).toBe(1);
	expect(secondButton.textContent).toBe('1');
	expect(loadSymbolCalls.get(incrementSymbol!.id)).toBe(1);
});

test('B905s2 compile output updates same-module helper-created state', async () => {
	const result = await compileTsrxModule({
		filename: 'src/HelperCounter.tsrx',
		source: `import { state } from '@markless/core'; function counterPair() { const n = state(5); return n; } export function App() @{ const count = counterPair(); <button onClick={() => count++}>{count}</button> }`,
		symbols: [],
	});
	const incrementSymbol = result.symbolResolver.symbols.find((symbol) =>
		symbol.source.includes('count++'),
	);
	const incrementModule = result.symbolModules.modules.find(
		(module) => module.symbolId === incrementSymbol?.id,
	);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.stateLowering.diagnostics).toEqual([]);
	expect(payloadStateCellValue(result.protocolState, 'state:App.count.counterPair.n')).toBe(5);
	expect(incrementModule?.source).toContain('graphNodeId: "state:App.count.counterPair.n"');

	const incrementExports = await importPublicRenderTestModule(incrementModule!.source);
	let value = 5;
	const handler = incrementExports[incrementModule!.exportName] as (context: any) => unknown;

	handler({
		graph: {
			update(input) {
				expect(input.graphNodeId).toBe('state:App.count.counterPair.n');
				value = input.update(value) as number;
				return value;
			},
		},
	});
	expect(value).toBe(6);
});

test('compileTsrxModule composes child-component branch records in SSR views', async () => {
	const child = await compileTsrxModule({
		filename: 'src/StatusBadge.tsrx',
		source: `
export function StatusBadge({ active }) @{
	<span class="badge">
		@if (active) { <em class="live">Live</em> } @else { <em class="idle">Idle</em> }
	</span>
}
`,
		symbols: [],
	});
	const parent = await compileTsrxModule({
		filename: 'src/Dashboard.tsrx',
		source: `
import { state } from '@markless/core';
import { StatusBadge } from './StatusBadge.tsrx';

export function Dashboard() @{
	let streaming = state(true);

	<main>
		<button onClick={() => streaming = !streaming}>Toggle</button>
		<StatusBadge active={streaming} />
	</main>
}
`,
		symbols: [],
	});

	const childSsrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(child));
	const parentSsrModule = await importPublicRenderTestModule(
		ssrRenderTestModuleSource(parent, { replaceChildImport: true }),
		{ childComponent: { renderSsr: childSsrModule.marklessRenderSsr } },
	);
	const output = await (
		parentSsrModule.marklessRenderSsr as () => Promise<{
			readonly html: string;
			readonly view: {
				readonly branches?: ReadonlyArray<{
					readonly id: string;
					readonly takenArm?: number;
					readonly startAnchor: { readonly index: number };
					readonly endAnchor: { readonly index: number };
					readonly testReads?: ReadonlyArray<{ readonly graphNodeId: string }>;
				}>;
			};
		}>
	)();

	// The served html carries prefixed anchor ids so instances cannot collide…
	expect(output.html).toContain('<!--markless:branch:c0:branch-site:0-->');
	expect(output.html).toContain('<em class="live">Live</em>');
	// …and the composed payload carries the child branch record: prefixed id,
	// runtime takenArm, remapped test read, anchors matching the html scan.
	expect(output.view.branches).toEqual([
		expect.objectContaining({
			id: 'c0:branch-site:0',
			takenArm: 0,
			startAnchor: expect.objectContaining({ index: 0 }),
			endAnchor: expect.objectContaining({ index: 1 }),
			testReads: [expect.objectContaining({ graphNodeId: 'state:streaming' })],
		}),
	]);
});

test('compileTsrxModule renders imported sibling text from each SSR edge props', async () => {
	const child = await compileTsrxModule({
		filename: 'src/CaptureButton.tsrx',
		source: `export function CaptureButton({ label, marker, count, onTrace }) @{
	<button data-capture-graph={marker === 'graph'} data-capture-literal={marker === 'literal'}>{label}</button>
}`,
		symbols: [],
	});
	const parent = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source: `import { state } from '@markless/core';
import { CaptureButton } from './CaptureButton.tsrx';

export function Page() @{
	let graphLabel = state('Server spruce');
	let count = state(0);
	let trace = state('none');
	<main>
		<CaptureButton marker="graph" label={graphLabel} count={count} onTrace={(value) => trace = value} />
		<CaptureButton marker="literal" label="Server copper" count={count} onTrace={(value) => trace = value} />
	</main>
}`,
		symbols: [],
	});

	const childSsrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(child));
	const parentSsrModule = await importPublicRenderTestModule(
		ssrRenderTestModuleSource(parent, { replaceChildImport: true }),
		{ childComponent: { renderSsr: childSsrModule.marklessRenderSsr } },
	);
	const output = await (
		parentSsrModule.marklessRenderSsr as () => Promise<{
			readonly html: string;
			readonly view: {
				readonly domUpdates: ReadonlyArray<{
					readonly hostNodeId: string;
					readonly graphNodeId: string;
				}>;
			};
		}>
	)();

	expect(output.html).toContain('data-capture-graph="true"');
	expect(output.html).toContain('data-capture-literal="true"');
	expect(output.html).toContain('>Server spruce</button>');
	expect(output.html).toContain('>Server copper</button>');
	expect(output.view.domUpdates).toEqual([
		expect.objectContaining({ hostNodeId: 'c0:h0', graphNodeId: 'state:graphLabel' }),
	]);
});

test('compileTsrxModule offsets sibling children by element count, not locator count', async () => {
	const badge = await compileTsrxModule({
		filename: 'src/StatusBadge.tsrx',
		source: `
export function StatusBadge({ active }) @{
	<span class="badge">
		@if (active) { <em class="live">Live</em> } @else { <em class="idle">Idle</em> }
	</span>
}
`,
		symbols: [],
	});
	const parent = await compileTsrxModule({
		filename: 'src/Shell.tsrx',
		source: `
import { state } from '@markless/core';
import { StatusBadge } from './StatusBadge.tsrx';

export function Shell() @{
	let streaming = state(true);

	<main>
		<button onClick={() => streaming = !streaming}>Toggle</button>
		<StatusBadge active={streaming} />
		<footer>Tail</footer>
	</main>
}
`,
		symbols: [],
	});

	const childSsrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(badge));
	const parentSsrModule = await importPublicRenderTestModule(
		ssrRenderTestModuleSource(parent, { replaceChildImport: true }),
		{ childComponent: { renderSsr: childSsrModule.marklessRenderSsr } },
	);
	const output = await (
		parentSsrModule.marklessRenderSsr as () => Promise<{
			readonly html: string;
			readonly view: {
				readonly locators: ReadonlyArray<{
					readonly tagName: string;
					readonly index: number;
				}>;
			};
		}>
	)();

	// dom-order elements: main(0), button(1), span.badge(2), em(3 — the
	// child's ARM host: an element WITHOUT a locator), footer(4). Offsetting
	// by locator count would place the footer at 4 - 1 = index 3 (the em) —
	// the demo-app resume abort (RuntimeResumeError c3:h0).
	const footer = output.view.locators.find((locator) => locator.tagName === 'footer');
	expect(footer).toBeDefined();
	expect(footer!.index).toBe(4);
});

test('compileTsrxModule remaps composed child behavior input reads', async () => {
	const parent = await compileTsrxModule({
		filename: 'src/Deck.tsrx',
		source: `
import { state } from '@markless/core';
import { FrameHost } from './FrameHost.tsrx';

export function Deck() @{
	let clip = state('abc123');

	<main>
		<FrameHost videoId={clip} />
	</main>
}
`,
		symbols: [],
	});

	const parentSsrModule = await importPublicRenderTestModule(
		ssrRenderTestModuleSource(parent, { replaceChildImport: true }),
		{
			childComponent: {
				// Stubbed child output: a behavior whose input reads the child's
				// videoId prop (the arena keeps prop reads in the record so
				// composition can remap them).
				renderSsr: () => ({
					html: '<div class="frame"></div>',
					elementCount: 1,
					state: { version: 1, cells: [], computed: [] },
					view: {
						version: 1,
						locators: [
							{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'div' },
						],
						events: [],
						domUpdates: [],
						behaviors: [
							{
								hostNodeId: 'h0',
								source: 'loadFrame(videoId)',
								functionSource: 'loadFrame',
								inputSources: ['videoId'],
								inputGraphReads: [
									{
										inputIndex: 0,
										source: 'videoId',
										graphNodeId: 'prop:props',
										path: ['videoId'],
									},
								],
								symbolId: 'symbol:0',
							},
						],
						elementHandles: [],
						asyncBoundaries: [],
					},
				}),
			},
		},
	);
	const output = await (
		parentSsrModule.marklessRenderSsr as () => Promise<{
			readonly view: {
				readonly behaviors: ReadonlyArray<{
					readonly hostNodeId: string;
					readonly inputGraphReads?: ReadonlyArray<{
						readonly graphNodeId: string;
						readonly path: ReadonlyArray<string>;
					}>;
				}>;
			};
		}>
	)();

	// The composed behavior's input reads must point at the parent graph node,
	// not the child-local prop node the composed graph does not have —
	// otherwise the behavior activates with undefined inputs (the demo's
	// YouTube controller class of failure).
	const composed = output.view.behaviors.find((behavior) =>
		behavior.hostNodeId.startsWith('c0:'),
	);
	expect(composed).toBeDefined();
	expect(composed!.inputGraphReads ?? []).toEqual([
		expect.objectContaining({ graphNodeId: 'state:clip', path: [] }),
	]);
});

test('B908 Unit B emits same-file function declaration behavior factories', async () => {
	const result = await compileTsrxModule({
		filename: 'src/BehaviorFactory.tsrx',
		source: `
import { state } from '@markless/core';

function installChart(options) {
	return (canvas) => {
		canvas.dataset.points = String(options.points);
	};
}

export function App() @{
	const config = state({ points: 3 });

	<canvas attach={installChart(config)} />
}
`,
		symbols: [],
	});

	const behavior = result.protocolView.behaviors.find(
		(record) => record.source === 'installChart(config)',
	);
	expect(behavior?.symbolId).toBeDefined();

	const module = result.symbolModules.modules.find(
		(item) => item.symbolId === behavior?.symbolId,
	);
	expect(module?.kind).toBe('behavior');
	expect(module?.source).toContain('function installChart(options) {');
	expect(module?.source).toContain('canvas.dataset.points = String(options.points);');
	expect(module?.source).toContain('const behavior = function installChart(options)');
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
	const output = await (
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
	const scripts = renderPayloadScripts({
		state: output.state,
		view: output.view,
	});
	const { graph, runtime } = await resumeFromPayloadScripts({
		...scripts,
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

	await runtime.dispatch({ type: 'click', target: button as never });

	expect(graph.read('state:count')).toBe(1);
	expect(button.textContent).toBe('BUTTON 1');
});

test('B918 same-module prop-forwarded handle resolves for parent event handlers', async () => {
	const result = await compileTsrxModule({
		filename: 'src/ForwardedFocusBox.tsrx',
		source: `
import { element } from '@markless/core';

function Field(inputProps: { input: unknown }) @{
	<input el={inputProps.input} />
}

export function App() @{
	const field = element<HTMLInputElement>();

	<section>
		<Field input={field} />
		<button onClick={() => field.focus()}>Focus</button>
	</section>
}
`,
		symbols: [],
	});

	const input = new PublicRenderTestElement('input') as PublicRenderTestElement & {
		focus: () => void;
	};
	input.focus = vi.fn();
	const module = result.symbolModules.modules.find((item) => item.kind === 'event-handler');
	expect(module).toBeDefined();
	const exports = await importPublicRenderTestModule(module!.source);
	const handler = exports[module!.exportName] as (context: {
		readonly getElementHandle: (name: string) => unknown;
	}) => void;

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.protocolView.elementHandles).toEqual([
		expect.objectContaining({ handleId: 'element:field', name: 'field' }),
	]);

	handler({
		getElementHandle(name) {
			return name === 'field' ? input : undefined;
		},
	});

	expect(input.focus).toHaveBeenCalledTimes(1);
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

	expect(result.renderData.repeats).toEqual([expect.objectContaining({ repeatId: 'repeat:0' })]);
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

test('compileTsrxModule emits handler writes through whole-binding aliases', async () => {
	const result = await compileTsrxModule({
		filename: 'src/WholeBindingAliasEvent.tsrx',
		source: wholeBindingAliasEventSource,
		symbols: [],
	});

	const symbol = result.symbolResolver.symbols.find(
		(symbol) => symbol.kind === 'event-handler' && symbol.source.includes('mirror++'),
	);
	const module = result.symbolModules.modules.find((item) => item.symbolId === symbol?.id);

	expect(result.semanticGraph.aliases).toEqual([
		expect.objectContaining({
			name: 'mirror',
			target: 'origin',
			declarationKind: 'let',
		}),
	]);
	expect(result.stateLowering.diagnostics).toEqual([]);
	expect(module?.source).toContain(
		'import { marklessWriteScalar } from "@markless/web/fns/write-scalar";',
	);
	expect(module?.source).toContain('return marklessWriteScalar(context, {');
	expect(module?.source).toContain('graphNodeId: "state:origin"');
	expect(module?.source).not.toContain('path: []');
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

test('compileTsrxModule plans async reads for derives with try/catch/finally', async () => {
	const result = await compileTsrxModule({
		filename: 'src/AsyncTryCatchComputed.tsrx',
		source: `
import { computed, state } from '@markless/core';

export function App() @{
	const query = state('Ada');
	const details = computed(async () => {
		try {
			const title = query;
			await Promise.resolve();
			return { title };
		} catch {
			return { title: 'guest' };
		} finally {
			const seen = query;
			void seen;
		}
	});

	<main>
		@try { <p>{details.title}</p> } @pending { <p>Loading</p> } @catch { <p>Broken</p> }
	</main>
}
`,
		symbols: [],
	});
	const update = result.symbolModules.modules.find(
		(module) => module.kind === 'async-boundary-update',
	);

	expect(result.semanticGraph.asyncBoundaries).toEqual([
		expect.objectContaining({ id: 'boundary:0' }),
	]);
	expect(result.protocolView.asyncBoundaries).toEqual([
		expect.objectContaining({
			id: 'boundary:0',
			updateSymbolId: update?.symbolId,
			asyncReads: [
				expect.objectContaining({
					source: 'details.title',
					graphNodeId: 'computed:details',
					path: ['title'],
					runnerSymbolId: 'symbol:1',
				}),
			],
		}),
	]);

	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = await (
		ssrModule.marklessRenderSsr as () => Promise<{ readonly html: string }>
	)();

	expect(output.html).toBe(
		'<main><!--markless:async:boundary:0--><p>Ada</p><!--/markless:async:boundary:0--></main>',
	);
});

test('compileTsrxModule SSR resolves an async derive that catches its own error', async () => {
	const result = await compileTsrxModule({
		filename: 'src/AsyncCaughtValue.tsrx',
		source: `
import { computed } from '@markless/core';

export function App() @{
	const details = computed(async () => {
		try {
			throw new Error('handled');
		} catch {
			return { title: 'Fallback value' };
		}
	});

	<main>
		@try { <p>{details.title}</p> } @pending { <p>Loading</p> } @catch { <p>Broken</p> }
	</main>
}
`,
		symbols: [],
	});
	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = await (
		ssrModule.marklessRenderSsr as () => Promise<{ readonly html: string }>
	)();

	expect(output.html).toBe(
		'<main><!--markless:async:boundary:0--><p>Fallback value</p><!--/markless:async:boundary:0--></main>',
	);
});

test('compileTsrxModule SSR routes uncaught async derive failures to @catch', async () => {
	const result = await compileTsrxModule({
		filename: 'src/AsyncUncaughtError.tsrx',
		source: `
import { computed } from '@markless/core';

export function App() @{
	const details = computed(async () => {
		throw new Error('unhandled');
	});

	<main>
		@try { <p>{details.title}</p> } @pending { <p>Loading</p> } @catch { <p>Broken</p> }
	</main>
}
`,
		symbols: [],
	});
	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = await (
		ssrModule.marklessRenderSsr as () => Promise<{ readonly html: string }>
	)();

	expect(output.html).toBe(
		'<main><!--markless:async:boundary:0--><p>Broken</p><!--/markless:async:boundary:0--></main>',
	);
});

test('computed named after a member it reads is not a dependency cycle', async () => {
	const result = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source: `import { computed } from '@markless/core';
export default function Home() @{
	const view = computed(async () => ({ repos: [{ id: 'a' }] }));
	const repos = computed(() => view.repos ?? []);
	<main>
		@for (const r of repos; key r.id) {
			<div class="row">{r.id}</div>
		}
	</main>
}`,
		symbols: [],
	});

	expect(result.semanticGraph.diagnostics.map((item) => item.code)).not.toContain(
		'MARKLESS_COMPUTED_DEPENDENCY_CYCLE',
	);
	expect(result.semanticGraph.graphBindings.map((binding) => binding.id)).toContain(
		'computed:repos',
	);
	// The repeat resolves its collection to the computed binding.
	expect(result.semanticGraph.keyedRepeats[0]).toMatchObject({
		collectionGraphNodeId: 'computed:repos',
	});
});

test('repeat rows support item-derived dynamic attributes (href/testid class)', async () => {
	const result = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source: `import { state } from '@markless/core';
export default function List() @{
	let rows = state([{ id: 'a' }]);
	<main>
		@for (const r of rows; key r.id) {
			<a class="row-title" href={'#/r/' + r.id} data-testid={'repo-link-' + r.id}>{r.id}</a>
		}
	</main>
}`,
		symbols: [],
	});

	expect(result.renderData.repeats[0]).toMatchObject({ repeatId: 'repeat:0' });
	// SSR row mapper evaluates the attribute expressions with the item in scope.
	expect(result.publicRenderModule.ssrModuleSource).toContain("'#/r/' + r.id");
	expect(result.publicRenderModule.ssrModuleSource).toContain("'repo-link-' + r.id");
});

const componentRowsPageSource = `import { state } from '@markless/core';
import { TagBadge } from './TagBadge.tsrx';

export default function Catalog() @{
	let picked = state('none');
	let goods = state([
		{ sku: 'g1', title: 'First' },
		{ sku: 'g2', title: 'Second' },
	]);

	<main>
		<ul class="goods">
			@for (const good of goods; key good.sku) {
				<li data-sku={good.sku} onClick={() => picked = good.sku}><TagBadge title={good.title} /></li>
			}
		</ul>
		<output data-picked>{picked}</output>
	</main>
}`;

test('keyed repeat rows render component invocations from item-scope props', async () => {
	const child = await compileTsrxModule({
		filename: 'src/TagBadge.tsrx',
		source: `export function TagBadge({ title }) @{
	<figure class="tag"><figcaption>{title}</figcaption></figure>
}`,
		symbols: [],
	});
	const page = await compileTsrxModule({
		filename: 'src/Catalog.tsrx',
		source: componentRowsPageSource,
		symbols: [],
	});

	const childSsrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(child));
	const pageSsrModule = await importPublicRenderTestModule(
		ssrRenderTestModuleSource(page, { replaceChildImport: true }),
		{ childComponent: { renderSsr: childSsrModule.marklessRenderSsr } },
	);
	const output = await (
		pageSsrModule.marklessRenderSsr as () => Promise<{
			readonly html: string;
			readonly view: ProtocolViewPayload;
		}>
	)();

	// Each row executed the component with the row's item in scope.
	expect(output.html).toContain(
		'<li data-sku="g1"><figure class="tag"><figcaption>First</figcaption></figure></li>',
	);
	expect(output.html).toContain(
		'<li data-sku="g2"><figure class="tag"><figcaption>Second</figcaption></figure></li>',
	);

	// Row events ship for resume dispatch.
	const repeat = output.view.keyedRepeats?.[0];
	expect(repeat?.rowEvents).toEqual([
		{ hostPath: [], eventName: 'click', symbolIds: [expect.any(String)] },
	]);

	// Locators stay dom-order exact across component-rendered row elements:
	// main(0) ul(1) li(2) figure(3) figcaption(4) li(5) figure(6) figcaption(7) output(8).
	const parentLocator = output.view.locators.find(
		(locator) => locator.hostNodeId === repeat?.parentHostNodeId,
	);
	expect(parentLocator).toMatchObject({ tagName: 'ul', index: 1 });
	const outputLocator = output.view.locators.find((locator) => locator.tagName === 'output');
	expect(outputLocator).toMatchObject({ index: 8 });
	expect(
		output.view.domUpdates.some(
			(update) =>
				update.graphNodeId === 'state:picked' &&
				update.hostNodeId === outputLocator?.hostNodeId,
		),
	).toBe(true);
});

test('interactive components in repeat rows refuse loudly at row render', async () => {
	const page = await compileTsrxModule({
		filename: 'src/Catalog.tsrx',
		// Variant of componentRowsPageSource: the data-URL module loader caches
		// identical emitted sources, so this compile must differ byte-wise.
		source: componentRowsPageSource.replace("state('none')", "state('unset')"),
		symbols: [],
	});
	const interactiveChild = {
		renderSsr: () => ({
			html: '<em class="tag">x</em>',
			view: {
				locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'em' }],
				events: [{ hostNodeId: 'h0', eventName: 'click', symbolIds: ['symbol:0'] }],
				domUpdates: [],
				behaviors: [],
				elementHandles: [],
			},
		}),
	};

	const pageSsrModule = await importPublicRenderTestModule(
		ssrRenderTestModuleSource(page, { replaceChildImport: true }),
		{ childComponent: interactiveChild },
	);
	await expect((pageSsrModule.marklessRenderSsr as () => Promise<unknown>)()).rejects.toThrow(
		'MARKLESS_ROW_COMPONENT_INTERACTIVE: <TagBadge> inside a @for row has its own state, events, or async content, so its interactions cannot resume. Keep components in @for rows presentational (markup from item props, like <Link>), or move the interactive content out of the row.',
	);
});

// Components PROJECTED through another component's children prop must render
// in CSR string emission too (the page CSR module and tier-4 arm-render
// modules): SSR already composes them, and a silent CSR drop loses router
// <Link> anchors on every client-side route swap (dashboard issues list).
// They render markup-only through the projected-child splice; interactive
// child output refuses loudly at render.

test('viewless child components (Link-style) offset later host locators', async () => {
	const page = await compileTsrxModule({
		filename: 'src/Nav.tsrx',
		source: `import { state } from '@markless/core';
import { Jump } from './Jump.tsrx';

export default function Nav() @{
	let taps = state(0);

	<nav>
		<Jump target="home"><span class="counter">{taps}</span></Jump>
		<button onClick={() => taps++}>{taps}</button>
	</nav>
}`,
		symbols: [],
	});
	// Link-shaped stub: markup only, children html interpolated, no view.
	const jump = {
		renderSsr: (props: { readonly children?: unknown }) => ({
			html: `<a data-jump>${props.children == null ? '' : String(props.children)}</a>`,
			elementCount: 1,
		}),
	};
	const pageSsrModule = await importPublicRenderTestModule(
		ssrRenderTestModuleSource(page, { replaceChildImport: true }),
		{ childComponent: jump },
	);
	const output = await (
		pageSsrModule.marklessRenderSsr as () => Promise<{
			readonly html: string;
			readonly view: ProtocolViewPayload;
		}>
	)();

	expect(output.html).toBe(
		'<nav><a data-jump><span class="counter">0</span></a><button>0</button></nav>',
	);
	// DOM order: nav(0) a(1) span(2) button(3). The span is a page-owned host
	// projected through the child's children prop; the anchor belongs to the
	// viewless child and must still shift both following locators.
	const spanLocator = output.view.locators.find((locator) => locator.tagName === 'span');
	const buttonLocator = output.view.locators.find((locator) => locator.tagName === 'button');
	expect(spanLocator).toMatchObject({ index: 2 });
	expect(buttonLocator).toMatchObject({ index: 3 });
	// The click record survives composition wired to the button's host id.
	expect(output.view.events.some((event) => event.hostNodeId === buttonLocator?.hostNodeId)).toBe(
		true,
	);
});

// A page declared AFTER a same-module component must keep ONE host id space:
// the payload records (events, dom updates, keyed repeats) are keyed by the
// semantic graph's module-wide host ids, so the page's rendered locators must
// use the same ids or every hostNodeId-keyed record silently drops during
// composition (component-wrapped-rows known-red: row events never wired).
test('same-module component before the page keeps payload records aligned with rendered locators', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Board.tsrx',
		source: `import { state } from '@markless/core';

function Chip({ text }) @{
	<aside class="chip"><strong>{text}</strong></aside>
}

export function Board() @{
	let tally = state(0);
	let entries = state([
		{ slug: 'one', name: 'One' },
		{ slug: 'two', name: 'Two' },
	]);

	<section>
		<Chip text="Pinned" />
		<p data-tally>Total {tally}</p>
		<nav>
			@for (const entry of entries; key entry.slug) {
				<span data-entry={entry.slug} onClick={() => tally++}>{entry.name}</span>
			}
		</nav>
	</section>
}`,
		symbols: [],
	});

	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = await (
		ssrModule.marklessRenderSsr as () => Promise<{
			readonly html: string;
			readonly view: ProtocolViewPayload;
		}>
	)();

	const locatorIds = new Set(output.view.locators.map((locator) => locator.hostNodeId));
	// The repeat parent (nav) must be locatable, or resume never wires row events.
	const repeat = output.view.keyedRepeats?.[0];
	expect(repeat?.rowEvents).toEqual([
		{ hostPath: [], eventName: 'click', symbolIds: [expect.any(String)] },
	]);
	expect(locatorIds.has(repeat!.parentHostNodeId)).toBe(true);
	// The tally text update must survive composition (same id space as locators).
	expect(
		output.view.domUpdates.some(
			(update) => update.graphNodeId === 'state:tally' && locatorIds.has(update.hostNodeId),
		),
	).toBe(true);
});

test('repeat inside an async arm registers the boundary read and SSRs rows', async () => {
	const result = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source: `import { computed } from '@markless/core';
export default function Home() @{
	const view = computed(async () => ({ repos: [{ id: 'a' }, { id: 'b' }] }));
	<main>
		@try {
			<div class="list">
				@for (const r of view.repos; key r.id) {
					<a class="row" href={'#/r/' + r.id}>{r.id}</a>
				}
			</div>
		} @pending { <p>Loading</p> } @catch { <p>Broken</p> }
	</main>
}`,
		symbols: [],
	});

	expect(result.protocolView.asyncBoundaries[0]?.asyncReads).toEqual([
		expect.objectContaining({ graphNodeId: 'computed:view' }),
	]);
	expect(result.publicRenderModule.renderDataModuleSource).toContain(
		'"rowChunkId":"repeat:repeat:0:row"',
	);
	expect(result.publicRenderModule.ssrModuleSource).not.toContain('marklessSsrRepeatRows');
});

test('keyed repeat row handlers inside async arms keep their row binding in context', async () => {
	const result = await compileTsrxModule({
		filename: 'src/AsyncFeed.tsrx',
		source: `import { computed, state } from '@markless/core';
export default function AsyncFeed() @{
	let selectedKey = state('none');
	const feed = computed(async () => ({
		updates: [{ id: 'one', project: 'compiler', version: '1.0', stage: 'ready' }],
	}));
	<main>
		@try {
			<ul>
				@for (const update of feed.updates; key update.id) {
					<li onClick={() => selectedKey = update.id}>
						<strong>{update.project}</strong>
						<span>{update.version}</span>
						<span>{update.stage}</span>
					</li>
				}
			</ul>
		} @pending { <p>Loading</p> } @catch { <p>Failed</p> }
	</main>
}`,
		symbols: [],
	});
	const handler = result.symbolModules.modules.find((module) => module.kind === 'event-handler');

	expect(handler?.source).toContain('value: context.locals?.update?.id');
	expect(handler?.source).not.toMatch(/\bvalue:\s*update\.id\b/);
});

test('SSR derives a template-read sync computed after all async ancestors settle', async () => {
	const result = await compileTsrxModule({
		filename: 'src/SignalCardSsr.tsrx',
		source: `import { computed } from '@markless/core';
export default function SignalCardSsr() @{
	const east = computed(async () => ({ label: 'east' }));
	const west = computed(async () => ({ label: 'west' }));
	const card = computed(() => ({ label: east.label + '-' + west.label }));
	<section>
		@try { <p>{card.label}</p> }
		@pending { <p>Aligning</p> }
		@catch { <p>Unavailable</p> }
	</section>
}`,
		symbols: [],
	});
	const ssrModule = await importPublicRenderTestModule(ssrRenderTestModuleSource(result));
	const output = await (
		ssrModule.marklessRenderSsr as () => Promise<{
			readonly html: string;
			readonly view: ProtocolViewPayload;
		}>
	)();

	expect(output.html).toContain('<p>east-west</p>');
	expect(output.html).not.toContain('Unavailable');
	expect(output.view.asyncBoundaries[0]).toEqual(
		expect.objectContaining({
			runnerGraphNodeId: 'computed:card',
			initiallyServedArm: ASYNC_BOUNDARY_ARM.try,
			updateSymbolId: expect.any(String),
		}),
	);
});

test('component-rooted pages publish linked component definitions', async () => {
	const result = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source: `import { state } from '@markless/core';
import { Shell } from './shell.tsrx';

export default function Page() @{
	let n = state(0);
	<Shell>
		<button data-n onClick={() => n++}>N {n}</button>
	</Shell>
}`,
		symbols: [],
	});

	expect(result.publicRenderModule.componentDefinitions).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				name: 'Page',
				edges: expect.arrayContaining([
					expect.objectContaining({ childComponentName: 'Shell' }),
				]),
			}),
		]),
	);
});

test('component-rooted render data records an imported child as the root slot', async () => {
	const result = await compileTsrxModule({
		filename: 'src/ImportedRoot.tsrx',
		source: `import Child from './Child.tsrx';

export default function Page() @{
	<Child />
}`,
		symbols: [],
	});
	expect(JSON.stringify(result.renderData)).toContain('"kind":"child-component"');
	expect(JSON.stringify(result.renderData)).toContain(
		'"coordinate":{"kind":"comment-anchor","path":[0]}',
	);
});

test('event-handler symbol modules import every referenced module import (need 13 tail)', async () => {
	const result = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source: `import { state, computed } from '@markless/core';
import { Shell } from './shell.tsrx';
import { sendJson, currentActor, nextIssueId } from './lib.ts';

export default function Page() @{
	const model = computed(async () => ({ view: { n: 1 } }));
	<div class="app">
		@try {
			<Shell actors={model.view}>
				<button data-s onClick={async () => {
					const title = document.getElementById('new-title').value.trim();
					if (!title) return;
					const id = nextIssueId(model.view);
					await sendJson('POST', '/api/x', { id, title, author: currentActor() });
					location.hash = '#/done/' + id;
				}}>Go</button>
			</Shell>
		} @pending { <p>L</p> } @catch { <p>B</p> }
	</div>
}`,
		symbols: [],
	});

	const handler = result.symbolModules.modules.find((module) => module.symbolId === 'symbol:0');
	expect(handler?.source).toContain('nextIssueId');
	expect(handler?.source).toContain('import { sendJson }');
	expect(handler?.source).toContain('import { currentActor }');
});

test('compiled CSR keyed row behaviors attach once per key and clean removed records once', async () => {
	const result = await compileTsrxModule({
		filename: 'src/EffectfulRows.tsrx',
		source: `import { element, state } from '@markless/core';
import { installRow } from './row-behavior.ts';
export function App() @{
	let rows = state([{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }, { id: 'c', label: 'Gamma' }, { id: 'd', label: 'Delta' }]);
	const row = element<HTMLTableRowElement>();
	<main>
		<button onClick={() => rows = [{ id: 'a', label: 'Alpha next' }, { id: 'b', label: 'Beta next' }, { id: 'c', label: 'Gamma next' }, { id: 'd', label: 'Delta next' }]}>Reuse</button>
		<button onClick={() => rows = [{ id: 'd', label: 'Delta next' }, { id: 'c', label: 'Gamma next' }, { id: 'b', label: 'Beta next' }, { id: 'a', label: 'Alpha next' }]}>Reorder</button>
		<button onClick={() => rows = [{ id: 'd', label: 'Delta next' }, { id: 'a', label: 'Alpha next' }]}>Remove</button>
		<button onClick={() => rows = []}>Clear</button>
		<button onClick={() => rows = [{ id: 'a', label: 'Alpha fresh' }, { id: 'b', label: 'Beta fresh' }, { id: 'c', label: 'Gamma fresh' }, { id: 'd', label: 'Delta fresh' }]}>Remount</button>
		<table><tbody>@for (const item of rows; key item.id) {
			<tr el={row} attach={installRow(item.id)}><td>{item.label}</td></tr>
		}</tbody></table>
	</main>
}`,
		symbols: [],
	});

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.renderData.repeats).toEqual([expect.objectContaining({ repeatId: 'repeat:0' })]);
	expect(result.publicRenderModule.rootExportName).toBe('App');
	expect(result.publicRenderModule.moduleSource).toContain(
		'"rowBehaviors":[{"hostPath":[],"symbolId":"symbol:5"',
	);
	expect(result.publicRenderModule.moduleSource).toContain('createMarklessDirectChunkRenderer');
	expect(result.protocolView.behaviors).toEqual([]);
	expect(result.protocolView.keyedRepeats?.[0]).not.toHaveProperty('rowBehaviors');

	const hostsByKey = new Map<string, PublicRenderTestElement>();
	const cleanupCounts = new Map<string, number>();
	let attachments = 0;
	const behaviorSymbol = result.symbolResolver.symbols.find(
		(symbol) => symbol.kind === 'behavior',
	);
	const eventSymbols = result.symbolResolver.symbols.filter(
		(symbol) => symbol.kind === 'event-handler',
	);
	const eventRows = [
		[
			{ id: 'a', label: 'Alpha next' },
			{ id: 'b', label: 'Beta next' },
			{ id: 'c', label: 'Gamma next' },
			{ id: 'd', label: 'Delta next' },
		],
		[
			{ id: 'd', label: 'Delta next' },
			{ id: 'c', label: 'Gamma next' },
			{ id: 'b', label: 'Beta next' },
			{ id: 'a', label: 'Alpha next' },
		],
		[
			{ id: 'd', label: 'Delta next' },
			{ id: 'a', label: 'Alpha next' },
		],
		[],
		[
			{ id: 'a', label: 'Alpha fresh' },
			{ id: 'b', label: 'Beta fresh' },
			{ id: 'c', label: 'Gamma fresh' },
			{ id: 'd', label: 'Delta fresh' },
		],
	] as const;
	const loadSymbol = (symbolId: string) => {
		if (symbolId === behaviorSymbol?.id) {
			return ({
				element,
				behaviorInputs,
			}: {
				readonly element: PublicRenderTestElement;
				readonly behaviorInputs: [string];
			}) => {
				const key = behaviorInputs[0];
				attachments++;
				hostsByKey.set(key, element);
				return () => {
					cleanupCounts.set(key, (cleanupCounts.get(key) ?? 0) + 1);
					hostsByKey.delete(key);
				};
			};
		}
		const eventIndex = eventSymbols.findIndex((candidate) => candidate.id === symbolId);
		if (eventIndex < 0) throw new Error(`Unexpected symbol ${symbolId}`);
		return ({ graph }: { readonly graph: PublicRenderTestGraph }) =>
			graph.write({ graphNodeId: 'state:rows', value: eventRows[eventIndex] });
	};
	const publicModule = await importPublicRenderTestModule(
		[
			'const document = globalThis.__marklessPublicRenderTestDocument;',
			'const loadSymbol = globalThis.__marklessPublicRenderTestLoadSymbol;',
			result.publicRenderModule.renderDataModuleSource,
			result.publicRenderModule.moduleSource,
		].join('\n'),
		{ document: publicRenderTestDocument(), loadSymbol },
	);
	const rendered = publicModule.App() as { readonly root: PublicRenderTestElement };
	await drainPublicRenderMicrotasks();
	const buttons = elementsByTag(rendered.root, 'button');
	const mountedHosts = new Map(hostsByKey);

	expect(attachments).toBe(4);
	expect(new Set(hostsByKey.values()).size).toBe(4);
	await buttons[0]!.dispatch('click');
	await drainPublicRenderMicrotasks();
	expect(attachments).toBe(4);
	expect(cleanupCounts.size).toBe(0);
	expect(hostsByKey).toEqual(mountedHosts);

	await buttons[1]!.dispatch('click');
	await drainPublicRenderMicrotasks();
	expect(attachments).toBe(4);
	expect(cleanupCounts.size).toBe(0);
	const reorderedRows = elementsByTag(rendered.root, 'tr');
	expect(reorderedRows).toHaveLength(4);
	expect(reorderedRows[0]).toBe(mountedHosts.get('d'));
	expect(reorderedRows[1]).toBe(mountedHosts.get('c'));
	expect(reorderedRows[2]).toBe(mountedHosts.get('b'));
	expect(reorderedRows[3]).toBe(mountedHosts.get('a'));

	await buttons[2]!.dispatch('click');
	await drainPublicRenderMicrotasks();
	expect(Object.fromEntries(cleanupCounts)).toEqual({ b: 1, c: 1 });
	expect(hostsByKey.get('a')).toBe(mountedHosts.get('a'));
	expect(hostsByKey.get('d')).toBe(mountedHosts.get('d'));

	await buttons[3]!.dispatch('click');
	await drainPublicRenderMicrotasks();
	expect(Object.fromEntries(cleanupCounts)).toEqual({ a: 1, b: 1, c: 1, d: 1 });

	await buttons[4]!.dispatch('click');
	await drainPublicRenderMicrotasks();
	expect(attachments).toBe(8);
	expect(Object.fromEntries(cleanupCounts)).toEqual({ a: 1, b: 1, c: 1, d: 1 });
	for (const key of ['a', 'b', 'c', 'd'])
		expect(hostsByKey.get(key)).not.toBe(mountedHosts.get(key));
});
