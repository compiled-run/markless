import {
	ASYNC_BOUNDARY_ARM,
	ASYNC_PROTOCOL_VERSION,
	PROTOCOL_EVENT_ACTION_KIND,
	type ProtocolViewPayload,
} from '@markless/serializer';
import { createProtocolStatePayload } from '@markless/serializer';
import { expect, test } from 'vitest';
import { transformTsrxModule } from '../../bundler/src/transform.ts';
import { emitQueuedResumeContainerEvent } from '../../bundler/src/source-module.ts';
import { compileTsrxModule } from '../../compiler/src/index.ts';
import { render, renderToString } from '../src/index.ts';
import { marklessBoundSymbolId } from '../src/fns/bound-symbol.ts';
import { renderCsrRuntime } from '../src/render-csr.ts';

type FakeElement = {
	readonly nodeType: 1;
	readonly tagName: string;
	readonly childNodes: FakeElement[];
	readonly listeners: Array<{
		readonly type: string;
		readonly listener: (event: FakeEvent) => Promise<void>;
		readonly options?: { readonly capture?: boolean } | boolean;
	}>;
	textContent?: string;
	parentElement?: FakeElement | null;
	querySelector?: (selector: string) => { readonly textContent?: string | null } | null;
	addEventListener(
		type: string,
		listener: (event: FakeEvent) => Promise<void>,
		options?: { readonly capture?: boolean } | boolean,
	): void;
};

type FakeEvent = {
	readonly type: string;
	readonly target: FakeElement;
	readonly key?: string;
	defaultPrevented?: boolean;
	propagationStopped?: boolean;
	preventDefault?: () => void;
	stopPropagation?: () => void;
};

type FakeFragment = {
	readonly nodeType: 11;
	readonly childNodes: FakeElement[];
};

function element(tagName: string, childNodes: FakeElement[] = []): FakeElement {
	const node: FakeElement = {
		nodeType: 1,
		tagName,
		childNodes,
		listeners: [],
		addEventListener(type, listener, options) {
			this.listeners.push({ type, listener, options });
		},
	};
	(node as unknown as { removeChild(child: unknown): unknown }).removeChild = (
		child: unknown,
	) => {
		const index = node.childNodes.indexOf(child as FakeElement);
		if (index >= 0) node.childNodes.splice(index, 1);
		(child as { parentNode?: unknown }).parentNode = null;
		return child;
	};
	(node as unknown as { insertBefore(child: unknown, before: unknown): unknown }).insertBefore = (
		child: unknown,
		before: unknown,
	) => {
		const index = before ? node.childNodes.indexOf(before as FakeElement) : -1;
		(child as { parentNode?: unknown }).parentNode = node;
		node.childNodes.splice(
			index >= 0 ? index : node.childNodes.length,
			0,
			child as FakeElement,
		);
		return child;
	};
	for (const child of childNodes) {
		child.parentElement = node;
		(child as unknown as { parentNode?: unknown }).parentNode = node;
	}
	return node;
}

function event(type: string, target: FakeElement): FakeEvent {
	return { type, target };
}

function captureDispatchDocument(
	nativePayloads: ReadonlyArray<{
		readonly dataId: string;
		readonly definition: Readonly<Record<string, unknown>>;
		readonly templates: ReadonlyArray<{ readonly id: string; readonly markup: string }>;
	}> = [],
) {
	const definitions = new Map(
		nativePayloads.map((payload) => [payload.dataId, payload.definition]),
	);
	const templates = new Map(
		nativePayloads.flatMap((payload) =>
			payload.templates.map((template) => [template.id, template.markup] as const),
		),
	);
	const nativeNodes = new Map<string, unknown>();
	const document = {
		getElementById(id: string) {
			let node = nativeNodes.get(id);
			if (node) return node;
			const definition = definitions.get(id);
			if (definition) node = { textContent: JSON.stringify(definition) };
			else {
				const markup = templates.get(id);
				if (markup !== undefined) {
					node = document.createElement('template');
					(node as { innerHTML: string }).innerHTML = markup;
				}
			}
			if (node) nativeNodes.set(id, node);
			return node;
		},
		createTextNode(value: string) {
			return captureDispatchText(value);
		},
		createElement(tagName: string) {
			if (tagName !== 'template') return captureDispatchElement(tagName);
			let childNodes: FakeElement[] = [];
			return {
				content: {
					nodeType: 11 as const,
					cloneNode() {
						return {
							nodeType: 11 as const,
							childNodes: childNodes.map((child) => cloneCaptureDispatchNode(child)),
						};
					},
					get childNodes() {
						return childNodes;
					},
					get firstElementChild() {
						return childNodes.find((child) => child.nodeType === 1);
					},
					querySelector(selector: string) {
						const match = selector.match(/^\[([^=]+)="([^"]*)"\]$/);
						if (!match) return null;
						const [, name, value] = match;
						const pending = [...childNodes];
						while (pending.length > 0) {
							const candidate = pending.shift()!;
							if (
								(
									candidate as FakeElement & {
										getAttribute?: (name: string) => string | null;
									}
								).getAttribute?.(name!) === value
							)
								return candidate;
							pending.push(...(candidate.childNodes ?? []));
						}
						return null;
					},
					appendChild(node: FakeFragment | FakeElement) {
						childNodes.push(...(node.nodeType === 11 ? node.childNodes : [node]));
						return node;
					},
				},
				get innerHTML() {
					return childNodes.map(serializeCaptureDispatchNode).join('');
				},
				set innerHTML(html: string) {
					childNodes = parseCaptureDispatchHtml(html);
				},
			};
		},
	};
	return document;
}

function serializeCaptureDispatchNode(node: FakeElement): string {
	if (node.nodeType === 8) return `<!--${node.textContent ?? ''}-->`;
	if (node.nodeType !== 1) return node.textContent ?? '';
	const attributes = (node as FakeElement & { attributes?: Map<string, string> }).attributes;
	const renderedAttributes = attributes
		? [...attributes].map(([name, value]) => ` ${name}="${value}"`).join('')
		: '';
	const tagName = node.tagName.toLowerCase();
	return `<${tagName}${renderedAttributes}>${node.childNodes
		.map(serializeCaptureDispatchNode)
		.join('')}</${tagName}>`;
}

function captureDispatchElement(
	tagName: string,
	attributes: ReadonlyArray<readonly [string, string]> = [],
): FakeElement {
	const node = element(tagName.toUpperCase()) as FakeElement & {
		attributes: Map<string, string>;
		getAttribute(name: string): string | null;
		setAttribute(name: string, value: string): void;
		removeAttribute(name: string): void;
		replaceWith(...replacement: FakeElement[]): void;
		remove(): void;
		cloneNode(deep?: boolean): FakeElement;
	};
	node.attributes = new Map(attributes);
	node.getAttribute = (name) => node.attributes.get(name) ?? null;
	node.setAttribute = (name, value) => node.attributes.set(name, value);
	node.removeAttribute = (name) => node.attributes.delete(name);
	node.querySelector = (selector) => {
		const match = selector.match(/^\[([^=]+)="([^"]*)"\]$/);
		if (!match) return null;
		const [, name, value] = match;
		const visit = (candidate: FakeElement): FakeElement | null => {
			if (
				candidate.nodeType === 1 &&
				(candidate as typeof node).getAttribute?.(name!) === value
			)
				return candidate;
			for (const child of candidate.childNodes ?? []) {
				const found = visit(child);
				if (found) return found;
			}
			return null;
		};
		for (const child of node.childNodes) {
			const found = visit(child);
			if (found) return found;
		}
		return null;
	};
	node.replaceWith = (...replacement) => {
		const parent = node.parentElement;
		if (!parent) return;
		const index = parent.childNodes.indexOf(node);
		if (index < 0) return;
		parent.childNodes.splice(index, 1, ...replacement);
		for (const child of replacement) {
			child.parentElement = parent;
			(child as unknown as { parentNode?: FakeElement }).parentNode = parent;
		}
		node.parentElement = null;
		(node as unknown as { parentNode?: null }).parentNode = null;
	};
	node.cloneNode = (deep = false) => {
		const clone = captureDispatchElement(tagName, [...node.attributes]);
		if (deep) {
			clone.childNodes.push(
				...node.childNodes.map((child) => cloneCaptureDispatchNode(child)),
			);
			for (const child of clone.childNodes) {
				child.parentElement = clone;
				(child as unknown as { parentNode?: FakeElement }).parentNode = clone;
			}
		}
		return clone;
	};
	node.remove = () => {
		const parent = node.parentElement;
		if (!parent) return;
		const index = parent.childNodes.indexOf(node);
		if (index >= 0) parent.childNodes.splice(index, 1);
		node.parentElement = null;
	};
	return node;
}

function parseCaptureDispatchHtml(html: string): FakeElement[] {
	const root = captureDispatchElement('root');
	const stack = [root];
	for (const token of html.match(/<\/?[^>]+>|[^<]+/g) ?? []) {
		if (token.startsWith('</')) {
			stack.pop();
			continue;
		}
		const parent = stack[stack.length - 1]!;
		if (token.startsWith('<')) {
			if (token.startsWith('<!--')) {
				const comment = captureDispatchComment(token.slice(4, -3));
				Object.assign(comment, {
					nodeType: 8,
					parentElement: parent,
					parentNode: parent,
				});
				parent.childNodes.push(comment);
				continue;
			}
			const match = token.match(/^<([A-Za-z][\w-]*)([^>]*)>/);
			if (!match) continue;
			const attributes = [...match[2]!.matchAll(/\s+([^\s=]+)(?:="([^"]*)")?/g)].map(
				(attribute) => [attribute[1]!, attribute[2] ?? ''] as const,
			);
			const child = captureDispatchElement(match[1]!, attributes);
			parent.childNodes.push(child);
			child.parentElement = parent;
			(child as unknown as { parentNode?: FakeElement }).parentNode = parent;
			if (!token.endsWith('/>')) stack.push(child);
			continue;
		}
		const text = captureDispatchText(token);
		text.parentElement = parent;
		(text as unknown as { parentNode?: FakeElement }).parentNode = parent;
		parent.childNodes.push(text);
	}
	return root.childNodes;
}

function captureDispatchText(value: string): FakeElement {
	return captureDispatchLeaf(3, value);
}

function captureDispatchComment(value: string): FakeElement {
	return captureDispatchLeaf(8, value);
}

function captureDispatchLeaf(nodeType: 3 | 8, value: string): FakeElement {
	const node = {
		nodeType,
		tagName: nodeType === 8 ? '#comment' : '#text',
		textContent: value,
		childNodes: [],
		listeners: [],
		parentElement: null,
		addEventListener() {},
	} as unknown as FakeElement & {
		replaceWith(...nodes: FakeElement[]): void;
		cloneNode(): FakeElement;
	};
	node.replaceWith = (...nodes) => {
		const parent = node.parentElement;
		if (!parent) return;
		const index = parent.childNodes.indexOf(node);
		if (index < 0) return;
		parent.childNodes.splice(index, 1, ...nodes);
		for (const child of nodes) {
			child.parentElement = parent;
			(child as unknown as { parentNode?: FakeElement }).parentNode = parent;
		}
		node.parentElement = null;
		(node as unknown as { parentNode?: null }).parentNode = null;
	};
	node.cloneNode = () => captureDispatchLeaf(nodeType, String(node.textContent ?? ''));
	return node;
}

function cloneCaptureDispatchNode(node: FakeElement): FakeElement {
	const clone = (node as FakeElement & { cloneNode?: (deep?: boolean) => FakeElement }).cloneNode;
	return clone
		? clone.call(node, true)
		: captureDispatchLeaf(node.nodeType as 3 | 8, String(node.textContent ?? ''));
}

function javascriptModuleUrl(source: string): string {
	return `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;
}

function localWebFunctionImports(source: string): string {
	return source.replace(
		/from ["']@markless\/web\/fns\/([^"']+)["']/g,
		(_match, helperModule: string) =>
			`from '${new URL(`../src/fns/${helperModule}.ts`, import.meta.url).href}'`,
	);
}

type CaptureDispatchImport = {
	readonly specifier: string;
	readonly filename: string;
	readonly source: string;
	readonly imports?: ReadonlyArray<CaptureDispatchImport>;
};

async function transformCaptureDispatchModule(
	filename: string,
	source: string,
	imports: ReadonlyArray<CaptureDispatchImport> = [],
	environment: 'client' | 'server' = 'client',
) {
	const transformed = await transformTsrxModule({
		filename,
		source,
		environment,
		executionLog: 'never',
	});
	if (imports.length === 0) return transformed;

	const children = await Promise.all(
		imports.map(async (imported) => ({
			imported,
			transformed: await transformCaptureDispatchModule(
				imported.filename,
				imported.source,
				imported.imports,
				environment,
			),
		})),
	);
	const importedSymbols = children.flatMap(({ imported, transformed: child }) => {
		const componentEdgeId = transformed.manifest.symbolRoutes?.find(
			(route) => route.importSource === imported.specifier,
		)?.componentEdgeId;
		if (!componentEdgeId || !child.manifest.captureMetadata) return [];
		return child.manifest.symbols.flatMap((symbol) => {
			const captureSymbol = child.manifest.captureMetadata?.extractedSymbols.find(
				(candidate) => candidate.symbolId === symbol.symbolId,
			);
			return captureSymbol?.captureSlots.some((slot) => slot.propName !== undefined)
				? [
						{
							id: `imported:${encodeURIComponent(imported.filename)}:${symbol.symbolId}`,
							chunk: symbol.virtualModuleId,
							exportName: symbol.exportName,
							componentEdgeId,
							captureSymbol,
						},
					]
				: [];
		});
	});
	return transformTsrxModule({
		filename,
		source,
		symbols: importedSymbols,
		environment,
		executionLog: 'never',
	});
}

async function captureDispatchSymbolSource(
	source: string,
	imports: ReadonlyArray<CaptureDispatchImport>,
	environment: 'client' | 'server' = 'client',
): Promise<string> {
	let localized = localWebFunctionImports(source);
	for (const imported of imports) {
		localized = localized
			.split(imported.specifier)
			.join(
				await captureDispatchModuleUrl(
					imported.filename,
					imported.source,
					imported.imports,
					environment,
				),
			);
	}
	return localized;
}

async function captureDispatchImportedSymbolUrls(
	imports: ReadonlyArray<CaptureDispatchImport>,
	environment: 'client' | 'server' = 'client',
): Promise<Map<string, string>> {
	const entries: Array<readonly [string, string]> = [];
	for (const imported of imports) {
		const transformed = await transformCaptureDispatchModule(
			imported.filename,
			imported.source,
			imported.imports,
			environment,
		);
		for (const module of transformed.virtualModules.filter(
			(candidate) => candidate.type === 'symbol',
		)) {
			entries.push([
				module.id,
				javascriptModuleUrl(
					await captureDispatchSymbolSource(
						module.source,
						imported.imports ?? [],
						environment,
					),
				),
			]);
		}
		entries.push(
			...(await captureDispatchImportedSymbolUrls(imported.imports ?? [], environment)),
		);
	}
	return new Map(entries);
}

async function captureDispatchModuleUrl(
	filename: string,
	source: string,
	imports: ReadonlyArray<CaptureDispatchImport> = [],
	environment: 'client' | 'server' = 'client',
): Promise<string> {
	const transformed = await transformCaptureDispatchModule(
		filename,
		source,
		imports,
		environment,
	);
	const symbolUrls = new Map(
		await Promise.all(
			transformed.virtualModules
				.filter((module) => module.type === 'symbol')
				.map(
					async (module) =>
						[
							module.id,
							javascriptModuleUrl(
								await captureDispatchSymbolSource(
									module.source,
									imports,
									environment,
								),
							),
						] as const,
				),
		),
	);
	const allSymbolUrls = new Map([
		...symbolUrls,
		...(await captureDispatchImportedSymbolUrls(imports, environment)),
	]);
	const resolver = transformed.virtualModules.find((module) => module.type === 'resolver');
	let browserModuleSource = transformed.code;
	if (resolver) {
		let resolverSource = resolver.source;
		for (const [moduleId, moduleUrl] of allSymbolUrls)
			resolverSource = resolverSource.split(moduleId).join(moduleUrl);
		browserModuleSource = browserModuleSource
			.split(resolver.id)
			.join(javascriptModuleUrl(resolverSource));
	}
	const payload = transformed.virtualModules.find((module) => module.type === 'payload')!;
	browserModuleSource = localWebFunctionImports(
		browserModuleSource.split(payload.id).join(javascriptModuleUrl(payload.source)),
	);
	const renderData = transformed.virtualModules.find((module) => module.type === 'render-data');
	if (renderData) {
		browserModuleSource = browserModuleSource
			.split(renderData.id)
			.join(javascriptModuleUrl(renderData.source));
	}
	for (const [moduleId, moduleUrl] of allSymbolUrls)
		browserModuleSource = browserModuleSource.split(moduleId).join(moduleUrl);
	for (const imported of imports) {
		const moduleUrl = await captureDispatchModuleUrl(
			imported.filename,
			imported.source,
			imported.imports,
			environment,
		);
		browserModuleSource = browserModuleSource.split(imported.specifier).join(moduleUrl);
	}
	const unresolvedVirtualIds = browserModuleSource.match(/virtual:markless:[^"']+/g);
	if (unresolvedVirtualIds)
		throw new Error(`${filename}: ${JSON.stringify(unresolvedVirtualIds)}`);
	return javascriptModuleUrl(browserModuleSource);
}

type CompiledCaptureDispatch = {
	readonly compiled: Awaited<ReturnType<typeof compileTsrxModule>>;
	readonly composedCaptureAnalysis: NonNullable<
		Awaited<ReturnType<typeof transformCaptureDispatchModule>>['manifest']['captureMetadata']
	>;
	readonly loadedIds: string[];
	readonly output: {
		readonly root: FakeElement;
		readonly state: ReturnType<typeof createProtocolStatePayload>;
		readonly view: ProtocolViewPayload;
		readonly loadSymbol: (symbolId: string) => unknown;
	};
	readonly runtime: Awaited<ReturnType<typeof render>>;
};

async function captureDispatchClientLoader(
	filename: string,
	source: string,
	imports: ReadonlyArray<CaptureDispatchImport>,
) {
	const transformed = await transformCaptureDispatchModule(filename, source, imports);
	const symbolUrls = new Map(
		await Promise.all(
			transformed.virtualModules
				.filter((module) => module.type === 'symbol')
				.map(
					async (module) =>
						[
							module.id,
							javascriptModuleUrl(
								await captureDispatchSymbolSource(module.source, imports),
							),
						] as const,
				),
		),
	);
	const allSymbolUrls = new Map([
		...symbolUrls,
		...(await captureDispatchImportedSymbolUrls(imports)),
	]);
	const resolver = transformed.virtualModules.find((module) => module.type === 'resolver')!;
	let resolverSource = resolver.source;
	for (const [moduleId, moduleUrl] of allSymbolUrls) {
		resolverSource = resolverSource.split(moduleId).join(moduleUrl);
	}
	const resolverModule = (await import(javascriptModuleUrl(resolverSource))) as {
		readonly loadSymbol: CompiledCaptureDispatch['output']['loadSymbol'];
	};
	const childLoaders = new Map(
		await Promise.all(
			imports.map(
				async (imported) =>
					[
						imported.specifier,
						(
							await captureDispatchClientLoader(
								imported.filename,
								imported.source,
								imported.imports ?? [],
							)
						).loadSymbol,
					] as const,
			),
		),
	);
	const loadSymbol: CompiledCaptureDispatch['output']['loadSymbol'] = (symbolId) => {
		const route = transformed.manifest.symbolRoutes?.find((candidate) =>
			symbolId.startsWith(candidate.prefix),
		);
		if (!route) return resolverModule.loadSymbol(symbolId);
		const childLoader = childLoaders.get(route.importSource);
		if (!childLoader) return resolverModule.loadSymbol(symbolId);
		return childLoader(symbolId.slice(route.prefix.length));
	};
	return { transformed, loadSymbol };
}

async function withCompiledCaptureDispatch(
	filename: string,
	source: string,
	inspect: (result: CompiledCaptureDispatch) => Promise<void>,
	options: {
		readonly expectResolver?: boolean;
		readonly imports?: ReadonlyArray<CaptureDispatchImport>;
	} = {},
): Promise<void> {
	const compiled = await compileTsrxModule({ filename, source, symbols: [] });
	const { transformed, loadSymbol: clientLoadSymbol } = await captureDispatchClientLoader(
		filename,
		source,
		options.imports ?? [],
	);
	if (options.expectResolver !== false) {
		expect(transformed.code).toMatch(
			/const marklessSymbolResolverModule = \(\) => import\(["']virtual:markless:resolver:/,
		);
		expect(transformed.code).toMatch(
			/\.then\(\(mod\) => readMarklessSourceSymbol\(mod, ["']symbol_/,
		);
		expect(transformed.code).toContain('mod.init__virtual_markless_symbol?.();');
	}
	expect(transformed.code).not.toContain('createMarklessCsrChunkRenderer');
	const serverUrl = await captureDispatchModuleUrl(
		filename,
		source,
		options.imports ?? [],
		'server',
	);

	const global = globalThis as { document?: unknown };
	const previousDocument = global.document;
	global.document = captureDispatchDocument();
	try {
		const serverModule = (await import(serverUrl)) as {
			readonly default: {
				readonly renderSsr: () => Promise<{
					readonly html: string;
					readonly state: CompiledCaptureDispatch['output']['state'];
					readonly view: CompiledCaptureDispatch['output']['view'];
				}>;
			};
		};
		const serverOutput = await serverModule.default.renderSsr();
		const output: CompiledCaptureDispatch['output'] = {
			root: parseCaptureDispatchHtml(serverOutput.html)[0]!,
			state: serverOutput.state,
			view: serverOutput.view,
			loadSymbol: clientLoadSymbol,
		};
		const loadedIds: string[] = [];
		const loadSymbol = output.loadSymbol;
		const runtime = await render(
			{
				renderCsr: () => ({
					...output,
					loadSymbol(symbolId: string) {
						loadedIds.push(symbolId);
						return loadSymbol(symbolId);
					},
				}),
			},
			{ target: { replaceChildren() {} } },
		);
		await inspect({
			compiled,
			composedCaptureAnalysis: transformed.manifest.captureMetadata!,
			loadedIds,
			output,
			runtime,
		});
	} finally {
		global.document = previousDocument;
	}
}

async function withCompiledCaptureResume(
	filename: string,
	source: string,
	imports: ReadonlyArray<CaptureDispatchImport>,
	inspect: (result: {
		readonly root: FakeElement;
		readonly view: ProtocolViewPayload;
		readonly runtime: Awaited<ReturnType<typeof render>>;
	}) => Promise<void>,
): Promise<void> {
	const [client, serverUrl] = await Promise.all([
		captureDispatchClientLoader(filename, source, imports),
		captureDispatchModuleUrl(filename, source, imports, 'server'),
	]);
	const global = globalThis as { document?: unknown };
	const previousDocument = global.document;
	global.document = captureDispatchDocument();
	try {
		const serverModule = (await import(serverUrl)) as {
			readonly default: {
				readonly renderSsr: () => Promise<{
					readonly html: string;
					readonly state: ReturnType<typeof createProtocolStatePayload>;
					readonly view: ProtocolViewPayload;
				}>;
			};
		};
		const serverOutput = await serverModule.default.renderSsr();
		const root = parseCaptureDispatchHtml(serverOutput.html)[0]!;
		const runtime = await render(
			() => ({
				root,
				state: serverOutput.state,
				view: serverOutput.view,
				loadSymbol: client.loadSymbol,
			}),
			{ target: { replaceChildren() {} } },
		);
		await inspect({ root, view: serverOutput.view, runtime });
	} finally {
		global.document = previousDocument;
	}
}

function descendants(root: FakeElement, tagName: string): FakeElement[] {
	return [root, ...root.childNodes.flatMap((child) => descendants(child, tagName))].filter(
		(node) => node.tagName === tagName,
	);
}

function renderedText(node: FakeElement): string {
	return node.textContent ?? node.childNodes.map(renderedText).join('');
}

function viewWithClick(): ProtocolViewPayload {
	return {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'button' }],
		events: [{ hostNodeId: 'h0', eventName: 'click', symbolIds: ['symbol:click'] }],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
}

function viewWithClickDomUpdate(): ProtocolViewPayload {
	return {
		...viewWithClick(),
		domUpdates: [
			{
				hostNodeId: 'h0',
				source: 'count',
				graphNodeId: 'state:count',
				path: [],
				target: { kind: 'text' },
				symbolId: 'symbol:text',
			},
		],
	};
}

function viewWithClickSyncComputedDomUpdate(): ProtocolViewPayload {
	return {
		...viewWithClick(),
		domUpdates: [
			{
				hostNodeId: 'h0',
				source: 'doubled',
				graphNodeId: 'computed:doubled',
				path: [],
				target: { kind: 'text' },
				symbolId: 'symbol:text',
			},
		],
	};
}

function viewWithSyncPolicy(): ProtocolViewPayload {
	return {
		...viewWithClick(),
		events: [
			{
				hostNodeId: 'h0',
				eventName: 'keydown',
				syncPolicy: {
					when: { type: 'event-equals', field: 'key', value: 'Escape' },
					actions: ['preventDefault', 'stopPropagation'],
				},
				symbolIds: ['symbol:key'],
			},
		],
	};
}

function viewWithElementHandle(): ProtocolViewPayload {
	return {
		...viewWithClick(),
		elementHandles: [{ hostNodeId: 'h0', handleId: 'handle:counter', name: 'counter' }],
	};
}

function viewWithAsyncBoundary(): ProtocolViewPayload {
	return {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'p' }],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [
			{
				id: 'boundary:0',
				startAnchor: { strategy: 'dom-order-comment', index: 0 },
				endAnchor: { strategy: 'dom-order-comment', index: 1 },
				asyncReads: [
					{
						source: 'details',
						graphNodeId: 'computed:details',
						path: ['title'],
						runnerSymbolId: 'symbol:details-runner',
					},
				],
			},
		],
	};
}

function staticView(): ProtocolViewPayload {
	return {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
}

function duplicateKeyRepeatView(): ProtocolViewPayload {
	return {
		...staticView(),
		locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'ul' }],
		keyedRepeats: [
			{
				id: 'repeat:0',
				parentHostNodeId: 'h0',
				collectionGraphNodeId: 'state:rows',
				collectionPath: [],
				keyPath: ['category'],
				itemName: 'row',
				rowElementCount: 1,
				rowEvents: [],
			},
		],
	};
}

const duplicateRows = [
	{ category: 'fruit', label: 'apple' },
	{ category: 'fruit', label: 'pear' },
	{ category: 'veg', label: 'kale' },
];

function duplicateRowsState() {
	return createProtocolStatePayload({
		cells: [
			{ graphNodeId: 'state:rows', name: 'rows', valueKind: 'array', value: duplicateRows },
		],
	});
}

test('render creates a CSR container without payload scripts or the inline resumer', async () => {
	const target = {
		children: [] as FakeElement[],
		replaceChildren(...children: FakeElement[]) {
			this.children = children;
		},
	};
	const state = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 }],
	});
	const loadedSymbols: string[] = [];
	let componentBodyRuns = 0;

	const container = await render(
		() => {
			componentBodyRuns++;
			const button = element('BUTTON');
			button.textContent = 'Count 0';
			return {
				root: button,
				state,
				view: viewWithClick(),
				loadSymbol(symbolId: string) {
					loadedSymbols.push(symbolId);
					return ({ graph }) => {
						graph.write({ graphNodeId: 'state:count', value: 1 });
					};
				},
			};
		},
		{ target },
	);

	expect(componentBodyRuns).toBe(1);
	expect(target.children).toEqual([container.root]);
	expect(container.phase).toBe('csr');
	expect(container.payloadScripts).toBeUndefined();
	expect(container.resumerScript).toBeUndefined();
	expect(loadedSymbols).toEqual([]);

	await container.root.listeners[0].listener(event('click', container.root));

	expect(loadedSymbols).toEqual(['symbol:click']);
	expect(container.graph.read('state:count')).toBe(1);
});

test('render rejects duplicate runtime keys before mounting CSR output', async () => {
	const target = {
		children: [] as FakeElement[],
		replaceChildren(...children: FakeElement[]) {
			this.children = children;
		},
	};

	await expect(
		render(
			() => ({
				root: element(
					'UL',
					duplicateRows.map(() => element('LI')),
				),
				state: duplicateRowsState(),
				view: duplicateKeyRepeatView(),
				loadSymbol: () => () => undefined,
			}),
			{ target },
		),
	).rejects.toMatchObject({
		code: 'MARKLESS_REPEAT_KEY_DUPLICATE',
		message: 'MARKLESS_REPEAT_KEY_DUPLICATE: Duplicate @for key "fruit" from row.category.',
		phase: 'runtime',
		docsUrl: 'https://markless.dev/errors/MARKLESS_REPEAT_KEY_DUPLICATE',
		keyPath: ['category'],
		collidingValue: 'fruit',
	});
	expect(target.children).toEqual([]);
});

test('render adopts the mount target as container root for fragment-rooted components', async () => {
	const header = element('HEADER');
	const button = element('BUTTON');
	button.textContent = 'Count 0';
	const target = element('DIV') as FakeElement & {
		replaceChildren(...children: Array<FakeElement | FakeFragment>): void;
	};
	target.replaceChildren = (...children) => {
		// Real DOM expands document fragments on insertion.
		target.childNodes.length = 0;
		for (const child of children) {
			if (child.nodeType === 11) {
				for (const fragmentChild of child.childNodes) {
					fragmentChild.parentElement = target;
					target.childNodes.push(fragmentChild);
				}
				child.childNodes.length = 0;
				continue;
			}
			child.parentElement = target;
			target.childNodes.push(child);
		}
	};
	const fragment: FakeFragment = { nodeType: 11, childNodes: [header, button] };
	const state = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 }],
	});
	const view: ProtocolViewPayload = {
		version: ASYNC_PROTOCOL_VERSION,
		// Fragment-relative locators: the compiled CSR module indexes the
		// fragment children 0..n with no root element in the walk.
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'header' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
		],
		events: [{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:click'] }],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const loadedSymbols: string[] = [];

	const container = await render(
		() => ({
			root: fragment as unknown as Parameters<typeof render>[0] extends never
				? never
				: FakeElement,
			state,
			view,
			liveHostNodes: new Map([
				['h0', header],
				['h1', button],
			]),
			loadSymbol(symbolId: string) {
				loadedSymbols.push(symbolId);
				return ({ graph }: { graph: { write(input: unknown): void } }) => {
					graph.write({ graphNodeId: 'state:count', value: 1 });
				};
			},
		}),
		{ target },
	);

	// Ratified D3 semantics: the mount target is the container root.
	expect(container.root).toBe(target);
	expect(target.childNodes.map((child) => child.tagName)).toEqual(['HEADER', 'BUTTON']);
	// Delegation lives on the target, and fragment-relative locators were
	// offset +1 so the second sibling still resolves after adoption.
	await target.listeners
		.find((entry) => entry.type === 'click')!
		.listener(event('click', button));
	expect(loadedSymbols).toEqual(['symbol:click']);
	expect(container.graph.read('state:count')).toBe(1);
});

test('render flips CSR branch ranges through the full resume runtime', async () => {
	const startAnchor = {
		nodeType: 8 as const,
		textContent: 'markless:branch:branch-site:0',
	} as unknown as FakeElement;
	const shown = element('P');
	const endAnchor = {
		nodeType: 8 as const,
		textContent: '/markless:branch:branch-site:0',
	} as unknown as FakeElement;
	const root = element('MAIN', [startAnchor, shown, endAnchor]);
	const target = {
		children: [] as FakeElement[],
		replaceChildren(...children: FakeElement[]) {
			this.children = children;
		},
	};
	const state = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:open', name: 'open', valueKind: 'scalar', value: true }],
	});
	const view: ProtocolViewPayload = {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'main' }],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
		branches: [
			{
				id: 'branch-site:0',
				startAnchor: { strategy: 'dom-order-comment', index: 0 },
				endAnchor: { strategy: 'dom-order-comment', index: 1 },
				symbolId: 'symbol:flip',
				testReads: [{ source: 'open', graphNodeId: 'state:open', path: [] }],
			},
		],
	};
	const loadedSymbols: string[] = [];
	const replacement = element('SPAN');

	const container = await render(
		() => ({
			root,
			state,
			view,
			loadSymbol(symbolId: string) {
				loadedSymbols.push(symbolId);
				return () => ({ arm: 1, html: '<span>Hidden</span>' });
			},
		}),
		{
			target,
			renderBranchHtml: () => [replacement as never],
		},
	);

	// Branch-bearing views must take the full resume runtime, and the arm
	// seeds from graph reads with no symbol load at startup.
	expect(loadedSymbols).toEqual([]);
	await container.runtime.start?.();

	container.graph.write({ graphNodeId: 'state:open', value: false });
	await container.graph.flush?.();

	expect(loadedSymbols).toEqual(['symbol:flip']);
	expect(
		root.childNodes.map((child) => (child.nodeType === 8 ? '#comment' : child.tagName)),
	).toEqual(['#comment', 'SPAN', '#comment']);
});

test('resume-events dispatches a compiled child record through its instance-bound captures', async () => {
	const source = `
import { state } from '@markless/core';

function Child({ label, onTrace }: { label: string; onTrace: (payload: { count: number; label: string }) => void }) @{
	let count = state(0);
	<button onClick={() => { count++; onTrace({ count, label }); }}>Increment</button>
}

export function App() @{
	let observed = state(0);
	<main><Child label="trace" onTrace={(payload) => observed = payload.count} /><output>{observed}</output></main>
}
`;
	await withCompiledCaptureDispatch('src/CaptureDispatch.tsrx', source, async (result) => {
		const registeredRecord = result.output.view.events.find(
			(record) => record.hostNodeId === 'c0:h0' && record.eventName === 'click',
		)!;
		const childHandler = result.compiled.captureAnalysis.extractedSymbols.find(
			(symbol) => symbol.kind === 'event-handler' && symbol.owner?.componentName === 'Child',
		)!;
		const boundRow = result.compiled.boundSymbolResolver.rows.find(
			(row) => row.baseSymbolId === childHandler.symbolId,
		)!;
		const button = descendants(result.output.root, 'BUTTON')[0]!;

		expect(registeredRecord.symbolIds).toEqual([boundRow.id]);
		expect(registeredRecord.symbolIds).not.toContain(childHandler.symbolId);
		await result.runtime.runtime.dispatch(event('click', button) as never);

		expect(result.runtime.graph.read('state:observed')).toBe(1);
		expect(result.loadedIds[0]).toBe(boundRow.id);
		expect(result.loadedIds).not.toContain(childHandler.symbolId);
	});
});

test('compiled sibling captures dispatch through distinct instance-bound routes', async () => {
	const source = `
import { state } from '@markless/core';

function SignalButton({ label, onTrace }) @{
	// Stateless by design: instance-scoped state() is out of this tranche, so the
	// per-instance proof rides on distinct labels and callbacks, not child state.
	<button type="button" data-signal={label} onClick={() => {
		onTrace({ count: 1, source: label });
	}}>{label}</button>
}

export default function CaptureSlotSiblings() @{
	let graphLabel = state('Graph cedar');
	let graphResult = state('none');
	let count = state(99);
	<section>
		<SignalButton
			label={graphLabel}
			onTrace={(payload) => graphResult = payload.source + ':' + payload.count}
		/>
		<SignalButton
			label="Literal coral"
			onTrace={(payload) => count = payload.count}
		/>
		<output>{graphResult}</output>
		<output>{count}</output>
	</section>
}
`;
	await withCompiledCaptureDispatch(
		'src/CaptureSlotSiblings.tsrx',
		source,
		async ({ compiled, loadedIds, output, runtime }) => {
			const childHandler = compiled.captureAnalysis.extractedSymbols.find(
				(symbol) =>
					symbol.kind === 'event-handler' &&
					symbol.owner?.componentName === 'SignalButton',
			)!;
			const rows = compiled.boundSymbolResolver.rows.filter(
				(row) => row.baseSymbolId === childHandler.symbolId,
			);
			const records = output.view.events.filter((record) => record.eventName === 'click');

			// The child handler captures exactly the two props it closes over, and each
			// slot carries one route per sibling instance edge. Pin what each slot IS so
			// a phantom slot, or a collapse of the two instance routes into one, fails here.
			expect(childHandler.captureSlots.map((slot) => slot.propName)).toEqual([
				'onTrace',
				'label',
			]);
			const [callbackSlot, labelSlot] = childHandler.captureSlots;
			expect(callbackSlot!.routes).toEqual([
				expect.objectContaining({
					kind: 'callback-route',
					componentEdgeId: 'component-edge:0',
					componentEdgePath: ['component-edge:0'],
				}),
				expect.objectContaining({
					kind: 'callback-route',
					componentEdgeId: 'component-edge:1',
					componentEdgePath: ['component-edge:1'],
				}),
			]);
			expect(
				callbackSlot!.routes.map((route) =>
					route.kind === 'callback-route' ? route.callbackSymbolId : route.kind,
				),
			).toEqual(['symbol:1', 'symbol:2']);
			expect(labelSlot!.routes).toEqual([
				expect.objectContaining({
					kind: 'graph-reference',
					componentEdgeId: 'component-edge:0',
					componentEdgePath: ['component-edge:0'],
					graphNodeId: 'state:graphLabel',
					path: [],
				}),
				expect.objectContaining({
					kind: 'compiler-known-constant',
					componentEdgeId: 'component-edge:1',
					componentEdgePath: ['component-edge:1'],
					value: 'Literal coral',
				}),
			]);
			expect(rows).toHaveLength(2);
			expect(rows.map((row) => row.componentEdgePath)).toEqual([
				['component-edge:0'],
				['component-edge:1'],
			]);
			expect(records.map((record) => record.hostNodeId)).toEqual(['c0:h0', 'c1:h0']);
			expect(records.map((record) => record.symbolIds[0])).toEqual(rows.map((row) => row.id));

			const buttons = descendants(output.root, 'BUTTON');
			expect(buttons).toHaveLength(2);
			expect(renderedText(buttons[0]!)).toBe('Graph cedar');
			expect(renderedText(buttons[1]!)).toBe('Literal coral');
			await runtime.runtime.dispatch(event('click', buttons[0]!) as never);
			expect(runtime.graph.read('state:graphResult')).toBe('Graph cedar:1');
			expect(runtime.graph.read('state:count')).toBe(99);

			await runtime.runtime.dispatch(event('click', buttons[1]!) as never);
			expect(runtime.graph.read('state:count')).toBe(1);
			expect(runtime.graph.read('state:graphResult')).toBe('Graph cedar:1');
			expect(loadedIds.filter((symbolId) => symbolId.startsWith('bound:'))).toEqual(
				rows.map((row) => row.id),
			);
		},
	);
});

test('compiled sibling keyed child rows dispatch through their instance callback route', async () => {
	const source = `
import { state } from '@markless/core';
import { RowList } from './row-list.tsrx';

export default function KeyedChildSiblings() @{
	let firstRows = state([{ id: 'first', label: 'First cedar' }]);
	let secondRows = state([{ id: 'second', label: 'Second quartz' }]);
	let firstResult = state('none');
	let secondResult = state('none');
	<main>
		<RowList rows={firstRows} onPick={() => firstResult = 'first'} />
		<RowList rows={secondRows} onPick={() => secondResult = 'second'} />
		<output>{firstResult}</output>
		<output>{secondResult}</output>
	</main>
}
`;
	await withCompiledCaptureDispatch(
		'src/KeyedChildSiblings.tsrx',
		source,
		async ({ output, runtime }) => {
			const repeats = output.view.keyedRepeats ?? [];
			expect(repeats.map((repeat) => repeat.id)).toEqual(['c0:repeat:0', 'c1:repeat:0']);
			expect(repeats.map((repeat) => repeat.parentHostNodeId)).toEqual(['c0:h0', 'c1:h0']);
			expect(repeats.map((repeat) => repeat.collectionGraphNodeId)).toEqual([
				'state:firstRows',
				'state:secondRows',
			]);
			expect(repeats[0]!.rowEvents[0]!.symbolIds).not.toEqual(
				repeats[1]!.rowEvents[0]!.symbolIds,
			);
			const buttons = descendants(output.root, 'BUTTON');
			expect(buttons.map(renderedText)).toEqual(['First cedar', 'Second quartz']);
			await runtime.runtime.dispatch(event('click', buttons[1]!) as never);
			expect(runtime.graph.read('state:firstResult')).toBe('none');
			expect(runtime.graph.read('state:secondResult')).toBe('second');
		},
		{
			imports: [
				{
					specifier: './row-list.tsrx',
					filename: 'src/row-list.tsrx',
					source: `
export function RowList({ rows, onPick }) @{
	<ul>
		@for (const row of rows; key row.id) {
			<li><button type="button" onClick={() => onPick()}>{row.label}</button></li>
		}
	</ul>
}
`,
				},
			],
		},
	);
});

test('compiled parent state keeps a child prop-driven class update instance-bound and executable', async () => {
	const source = `
import { state } from '@markless/core';

function Library({ libraryOpen }: { libraryOpen: boolean }) @{
	<aside class={libraryOpen ? 'library active-library' : 'library'}>Songs</aside>
}

export default function MusicPlayer() @{
	let libraryOpen = state(false);
	<main>
		<button type="button" onClick={() => libraryOpen = !libraryOpen}>Toggle</button>
		<Library libraryOpen={libraryOpen} />
	</main>
}
`;
	await withCompiledCaptureDispatch(
		'src/MusicPlayer.tsrx',
		source,
		async ({ compiled, output, runtime }) => {
			const updateSymbol = compiled.captureAnalysis.extractedSymbols.find(
				(symbol) =>
					symbol.kind === 'dom-update' && symbol.owner?.componentName === 'Library',
			)!;
			const update = output.view.domUpdates.find(
				(candidate) => candidate.target.kind === 'class',
			)!;
			const boundUpdate = compiled.boundSymbolResolver.rows.find(
				(row) => row.baseSymbolId === updateSymbol.symbolId,
			)!;
			const button = descendants(output.root, 'BUTTON')[0]!;
			const sidebar = descendants(output.root, 'ASIDE')[0] as FakeElement & {
				getAttribute(name: string): string | null;
			};

			expect(update).toEqual(
				expect.objectContaining({
					hostNodeId: 'c0:h0',
					graphNodeId: 'state:libraryOpen',
					symbolId: boundUpdate.id,
				}),
			);
			expect(sidebar.getAttribute('class')).toBe('library');
			await runtime.runtime.dispatch(event('click', button) as never);
			expect(sidebar.getAttribute('class')).toBe('library active-library');
		},
	);
});

test('compiled expression-tested class binding renders and then moves after dispatch', async () => {
	const source = `
import { state } from '@markless/core';

export default function Explorer() @{
	let picked = state('body');
	<section>
		<button type="button" onClick={() => picked = 'markup'}>Markup</button>
		<span class={picked === 'body' ? 'file-line is-lit' : 'file-line'}>body</span>
		<span class={picked === 'markup' ? 'file-line is-lit' : 'file-line'}>markup</span>
	</section>
}
`;
	await withCompiledCaptureDispatch(
		'src/Explorer.tsrx',
		source,
		async ({ output, runtime }) => {
			const classUpdates = output.view.domUpdates.filter(
				(candidate) => candidate.target.kind === 'class',
			);
			expect(classUpdates).toHaveLength(2);
			const button = descendants(output.root, 'BUTTON')[0]!;
			const [bodyLine, markupLine] = descendants(output.root, 'SPAN') as Array<
				FakeElement & { getAttribute(name: string): string | null }
			>;

			expect(bodyLine!.getAttribute('class')).toBe('file-line is-lit');
			expect(markupLine!.getAttribute('class')).toBe('file-line');

			await runtime.runtime.dispatch(event('click', button) as never);

			expect(bodyLine!.getAttribute('class')).toBe('file-line');
			expect(markupLine!.getAttribute('class')).toBe('file-line is-lit');
		},
		{ expectResolver: false },
	);
});

test('compiled parent state updates a composed child direct-value attribute after dispatch', async () => {
	const source = `
import { state } from '@markless/core';
import { Song } from './song.tsrx';
import { Player } from './player.tsrx';

export default function MusicPlayer() @{
	let playerCommand = state('cue');
	let playerCommandVersion = state(0);
	let isPlaying = state(false);
	const currentSong = state({
		name: 'Cedar',
		artist: 'Quartz',
		cover: '/cedar.jpg',
		videoId: 'cedar-1',
	});
	<main>
		<Song
			currentSong={currentSong}
			isPlaying={isPlaying}
			playerCommand={playerCommand}
			playerCommandVersion={playerCommandVersion}
		/>
		<Player onPlayToggle={() => {
			playerCommand = isPlaying ? 'pause' : 'play';
			playerCommandVersion++;
			isPlaying = !isPlaying;
		}} />
	</main>
}
`;
	await withCompiledCaptureDispatch(
		'src/DirectValueChild.tsrx',
		source,
		async ({ output, runtime }) => {
			const button = descendants(output.root, 'BUTTON')[0]!;
			const frame = descendants(output.root, 'DIV')[0] as FakeElement & {
				getAttribute(name: string): string | null;
			};
			const commandUpdate = output.view.domUpdates.find(
				(update) =>
					update.target.kind === 'attribute' && update.target.name === 'data-command',
			)!;
			const resumeRuntime = runtime.runtime as {
				getElement(hostNodeId: string): FakeElement | undefined;
			};

			expect(frame.getAttribute('data-command')).toBe('cue');
			await runtime.runtime.start();
			expect(resumeRuntime.getElement(commandUpdate.hostNodeId)).toBe(frame);
			await runtime.runtime.dispatch(event('click', button) as never);
			expect(runtime.graph.read('state:playerCommand')).toBe('play');
			expect(frame.getAttribute('data-command')).toBe('play');
		},
		{
			expectResolver: false,
			imports: [
				{
					specifier: './song.tsrx',
					filename: 'src/song.tsrx',
					source: `
import { YouTubePlayer } from './youtube-player.tsrx';

export function Song({ currentSong, isPlaying, playerCommand, playerCommandVersion }) @{
	<article>
		<YouTubePlayer
			isPlaying={isPlaying}
			playerCommand={playerCommand}
			playerCommandVersion={playerCommandVersion}
			track={currentSong}
		/>
		<div class={isPlaying ? 'record rotating' : 'record'}>
			<img alt={currentSong.name} src={currentSong.cover} />
		</div>
		<h2>{currentSong.name}</h2>
		<h3>{currentSong.artist}</h3>
	</article>
}
`,
					imports: [
						{
							specifier: './youtube-player.tsrx',
							filename: 'src/youtube-player.tsrx',
							source: `
export function YouTubePlayer({ isPlaying, playerCommand, playerCommandVersion, track }) @{
	<div
		class="youtube-frame-host"
		data-video-id={track.videoId}
		data-playing={isPlaying}
		data-command={playerCommand}
		data-command-version={playerCommandVersion}
	></div>
}
`,
						},
					],
				},
				{
					specifier: './player.tsrx',
					filename: 'src/player.tsrx',
					source: `
export function Player({ onPlayToggle }) @{
	<button type="button" onClick={() => onPlayToggle()}>Play</button>
}
`,
				},
			],
		},
	);
});

test('resumed parent state updates a composed child direct-value attribute after dispatch', async () => {
	const source = `
import { state } from '@markless/core';
import { Song } from './resume-song.tsrx';

export default function ResumedMusicPlayer() @{
	let command = state('cue');
	let highlighted = state(false);
	<main>
		<button type="button" onClick={() => command = 'play'}>Play</button>
		<Song command={command} highlighted={highlighted} />
	</main>
}
`;
	const imports: ReadonlyArray<CaptureDispatchImport> = [
		{
			specifier: './resume-song.tsrx',
			filename: 'src/resume-song.tsrx',
			source: `
import { CommandHost } from './command-host.tsrx';

export function Song({ command, highlighted }) @{
	<article>
		<CommandHost command={command} />
		<div class={highlighted ? 'song active' : 'song'}>Track</div>
	</article>
}
`,
			imports: [
				{
					specifier: './command-host.tsrx',
					filename: 'src/command-host.tsrx',
					source: `
export function CommandHost({ command }) @{
	<div class="youtube-frame-host" data-command={command}></div>
}
`,
				},
			],
		},
	];
	await withCompiledCaptureResume(
		'src/ResumedDirectValueChild.tsrx',
		source,
		imports,
		async ({ root, runtime }) => {
			const button = descendants(root, 'BUTTON')[0]!;
			const frame = descendants(root, 'DIV').find(
				(candidate) =>
					(
						candidate as FakeElement & { getAttribute(name: string): string | null }
					).getAttribute('class') === 'youtube-frame-host',
			) as FakeElement & { getAttribute(name: string): string | null };

			expect(frame.getAttribute('data-command')).toBe('cue');
			await runtime.runtime.dispatch(event('click', button) as never);
			expect(frame.getAttribute('data-command')).toBe('play');
		},
	);
});

test('compiled parent state updates alternate composed child value targets after dispatch', async () => {
	const source = `
import { state } from '@markless/core';

function StatusReadout({ announcement, accessibilityLabel }) @{
	<output aria-label={accessibilityLabel}>{announcement}</output>
}

export default function Dashboard() @{
	let announcement = state('Waiting');
	let accessibilityLabel = state('Pending status');
	<section>
		<button type="button" onClick={() => {
			announcement = 'Ready';
			accessibilityLabel = 'Ready status';
		}}>Advance</button>
		<StatusReadout
			announcement={announcement}
			accessibilityLabel={accessibilityLabel}
		/>
	</section>
}
`;
	await withCompiledCaptureDispatch(
		'src/AlternateValueTargets.tsrx',
		source,
		async ({ output, runtime }) => {
			const button = descendants(output.root, 'BUTTON')[0]!;
			const status = descendants(output.root, 'OUTPUT')[0] as FakeElement & {
				getAttribute(name: string): string | null;
			};
			expect(status.getAttribute('aria-label')).toBe('Pending status');
			expect(renderedText(status)).toBe('Waiting');
			await runtime.runtime.dispatch(event('click', button) as never);
			expect(status.getAttribute('aria-label')).toBe('Ready status');
			expect(renderedText(status)).toBe('Ready');
		},
	);
});

test('compiled static children projection composes without classifying the projection as an unmapped child prop update', async () => {
	const source = `
import { state } from '@markless/core';
import { Card } from './card.tsrx';

export default function ProjectedCard() @{
	let note = state('none');
	<main>
		<Card><p class="projected">Projected content</p></Card>
		<button onClick={() => note = 'clicked'}>Go</button>
		<output>{note}</output>
	</main>
}
`;
	await withCompiledCaptureDispatch(
		'src/ProjectedCard.tsrx',
		source,
		async ({ output, runtime }) => {
			const projected = descendants(output.root, 'P')[0]!;
			const button = descendants(output.root, 'BUTTON')[0]!;
			const status = descendants(output.root, 'OUTPUT')[0]!;

			expect(renderedText(projected)).toBe('Projected content');
			await runtime.runtime.dispatch(event('click', button) as never);
			expect(renderedText(status)).toBe('clicked');
		},
		{
			expectResolver: false,
			imports: [
				{
					specifier: './card.tsrx',
					filename: 'src/card.tsrx',
					source: `
export function Card({ children }) @{
	<section class="card">{children}</section>
}
`,
				},
			],
		},
	);
});

test('compiled child branch remaps its parent-prop test read and flips after dispatch', async () => {
	const source = `
import { state } from '@markless/core';
import { StatusBadge } from './status-badge.tsrx';

export default function Dashboard() @{
	let streaming = state(true);
	<main>
		<button onClick={() => streaming = !streaming}>Toggle</button>
		<StatusBadge active={streaming} />
	</main>
}
`;
	await withCompiledCaptureDispatch(
		'src/Dashboard.tsrx',
		source,
		async ({ output, runtime }) => {
			const button = descendants(output.root, 'BUTTON')[0]!;
			const initialBadges = descendants(output.root, 'EM');
			expect(initialBadges.map(renderedText)).toEqual(['Live']);
			expect(output.view.events).toEqual([
				expect.objectContaining({ eventName: 'click', symbolIds: ['symbol:0'] }),
			]);
			await runtime.runtime.dispatch(event('click', button) as never);
			expect(runtime.graph.read('state:streaming')).toBe(false);
			expect(output.view.branches![0]!.testReads).toEqual([
				{ source: 'active', graphNodeId: 'state:streaming', path: [] },
			]);
			expect(descendants(output.root, 'EM').map(renderedText)).toEqual(['Idle']);
		},
		{
			expectResolver: false,
			imports: [
				{
					specifier: './status-badge.tsrx',
					filename: 'src/status-badge.tsrx',
					source: `
export function StatusBadge({ active }) @{
	<span class="badge">
		@if (active) { <em class="live">Live</em> } @else { <em class="idle">Idle</em> }
	</span>
}
`,
				},
			],
		},
	);
});

test('compiled constant-prop child branch keeps its rendered arm without a live branch record', async () => {
	const source = `
function Badge({ active }) @{
	<span class="badge">
		@if (active) { <em>Live</em> } @else { <em>Idle</em> }
	</span>
}

export default function Dashboard() @{
	<main><Badge active={true} /></main>
}
`;
	await withCompiledCaptureDispatch(
		'src/ConstantBadge.tsrx',
		source,
		async ({ output }) => {
			expect(descendants(output.root, 'EM').map(renderedText)).toEqual(['Live']);
			expect(output.view.branches).toEqual([]);
		},
		{ expectResolver: false },
	);
});

test('compiled nested forwarding dispatches each callback through its full edge path', async () => {
	const source = `
import { state } from '@markless/core';

function NestedTrigger({ label, onForward }) @{
	<button type="button" onClick={() => onForward(label)}>{label}</button>
}

function DirectRelay({ label, onForward }) @{
	<div><NestedTrigger label={label} onForward={onForward} /></div>
}

export default function CaptureSlotNested() @{
	let firstCalls = state(0);
	let secondCalls = state(0);
	let firstValue = state('none');
	let secondValue = state('none');
	<section>
		<DirectRelay
			label="Nested elm"
			onForward={(value) => { firstCalls++; firstValue = value; }}
		/>
		<DirectRelay
			label="Nested quartz"
			onForward={(value) => { secondCalls++; secondValue = value; }}
		/>
		<output>{firstCalls}:{firstValue}</output>
		<output>{secondCalls}:{secondValue}</output>
	</section>
}
`;
	await withCompiledCaptureDispatch(
		'src/CaptureSlotNested.tsrx',
		source,
		async ({ compiled, loadedIds, output, runtime }) => {
			const childHandler = compiled.captureAnalysis.extractedSymbols.find(
				(symbol) =>
					symbol.kind === 'event-handler' &&
					symbol.owner?.componentName === 'NestedTrigger',
			)!;
			const rows = compiled.boundSymbolResolver.rows.filter(
				(row) => row.baseSymbolId === childHandler.symbolId,
			);
			const records = output.view.events.filter((record) => record.eventName === 'click');

			expect(childHandler.captureSlots).toHaveLength(2);
			expect(rows).toHaveLength(2);
			expect(rows.map((row) => row.componentEdgePath)).toEqual([
				['component-edge:1', 'component-edge:0'],
				['component-edge:2', 'component-edge:0'],
			]);
			expect(records.map((record) => record.hostNodeId)).toEqual(['c0:c0:h0', 'c1:c0:h0']);
			const recordSymbolIds = records.map((record) => record.symbolIds[0]);

			const buttons = descendants(output.root, 'BUTTON');
			expect(buttons).toHaveLength(2);
			await runtime.runtime.dispatch(event('click', buttons[0]!) as never);
			expect(runtime.graph.read('state:firstCalls')).toBe(1);
			expect(runtime.graph.read('state:firstValue')).toBe('Nested elm');
			expect(runtime.graph.read('state:secondCalls')).toBe(0);

			await runtime.runtime.dispatch(event('click', buttons[1]!) as never);
			expect(runtime.graph.read('state:secondCalls')).toBe(1);
			expect(runtime.graph.read('state:secondValue')).toBe('Nested quartz');
			expect(runtime.graph.read('state:firstCalls')).toBe(1);
			expect(recordSymbolIds).toEqual(rows.map((row) => row.id));
			expect(loadedIds.filter((symbolId) => symbolId.startsWith('bound:'))).toEqual(
				rows.map((row) => row.id),
			);
		},
	);
});

test('compiled imported child dispatches through a forwarding component to the grandparent callback', async () => {
	const childSource = `
export function LibrarySong({ song, onSelect }) @{
	<button type="button" onClick={() => onSelect(song.name)}>{song.name}</button>
}
`;
	const child = await compileTsrxModule({
		filename: 'src/LibrarySong.tsrx',
		source: childSource,
		symbols: [],
	});
	const childTransform = await transformTsrxModule({
		filename: 'src/LibrarySong.tsrx',
		source: childSource,
		environment: 'client',
		executionLog: 'never',
	});
	const childHandler = child.captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.kind === 'event-handler',
	)!;
	const childManifestSymbol = childTransform.manifest.symbols.find(
		(symbol) => symbol.symbolId === childHandler.symbolId,
	)!;
	const childSymbolModule = childTransform.virtualModules.find(
		(module) => module.id === childManifestSymbol.virtualModuleId,
	)!;
	const childInput = {
		id: 'imported:LibrarySong:symbol:0',
		chunk: childManifestSymbol.virtualModuleId,
		exportName: childManifestSymbol.exportName,
		componentEdgeId: 'component-edge:0',
		captureSymbol: childHandler,
	};
	const library = await compileTsrxModule({
		filename: 'src/Library.tsrx',
		source: `
import { LibrarySong } from './LibrarySong.tsrx';

export function Library({ songOne, onSelectOne }) @{
	<LibrarySong song={songOne} onSelect={onSelectOne} />
}
`,
		symbols: [childInput],
	});
	const forwarded = library.captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.loaderSymbolId === childInput.id,
	)!;
	const libraryRow = library.boundSymbolResolver.rows.find(
		(row) => row.loaderSymbolId === childInput.id,
	)!;
	const appSource = `
import { state } from '@markless/core';
import { Library } from './Library.tsrx';

export function App() @{
	let song = state({ name: 'Imported cedar' });
	let selected = state('none');
	<main>
		<Library songOne={song} onSelectOne={(name) => selected = name} />
		<output>{selected}</output>
	</main>
}
`;
	const appInput = {
		id: 'imported:Library:symbol:0',
		chunk: childManifestSymbol.virtualModuleId,
		exportName: childManifestSymbol.exportName,
		componentEdgeId: 'component-edge:0',
		captureSymbol: forwarded,
	};
	const app = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source: appSource,
		symbols: [appInput],
	});
	const appTransform = await transformTsrxModule({
		filename: 'src/App.tsrx',
		source: appSource,
		symbols: [appInput],
		environment: 'client',
		executionLog: 'never',
	});
	const appRow = app.boundSymbolResolver.rows.find((row) => row.loaderSymbolId === appInput.id)!;
	const libraryBoundId = marklessBoundSymbolId(
		{ boundSymbols: { [childHandler.symbolId]: libraryRow.id } },
		childHandler.symbolId,
	);
	const appBoundId = marklessBoundSymbolId(
		{ boundSymbols: { [childHandler.symbolId]: appRow.id } },
		libraryBoundId,
	);

	expect(libraryBoundId).toBe(libraryRow.id);
	expect(appBoundId).toBe(appRow.id);
	expect(app.captureAnalysis.diagnostics).toEqual([]);
	expect(appRow.captureSlots.map((slot) => slot.route)).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ kind: 'callback-route' }),
			expect.objectContaining({ kind: 'graph-reference', graphNodeId: 'state:song' }),
		]),
	);

	const symbolUrls = new Map(
		appTransform.virtualModules
			.filter((module) => module.type === 'symbol')
			.map((module) => [
				module.id,
				javascriptModuleUrl(localWebFunctionImports(module.source)),
			]),
	);
	symbolUrls.set(
		childManifestSymbol.virtualModuleId,
		javascriptModuleUrl(localWebFunctionImports(childSymbolModule.source)),
	);
	const resolver = appTransform.virtualModules.find((module) => module.type === 'resolver')!;
	let resolverSource = resolver.source;
	for (const [moduleId, moduleUrl] of symbolUrls) {
		resolverSource = resolverSource.split(moduleId).join(moduleUrl);
	}
	const loadedResolver = (await import(javascriptModuleUrl(resolverSource))) as {
		readonly loadSymbol: (symbolId: string) => unknown;
	};
	const button = element('BUTTON');
	const runtime = await render(
		{
			renderCsr: () => ({
				root: button,
				state: app.protocolState,
				view: {
					version: ASYNC_PROTOCOL_VERSION,
					locators: [
						{
							hostNodeId: 'c0:c0:h0',
							strategy: 'dom-order',
							index: 0,
							tagName: 'button',
						},
					],
					events: [
						{ hostNodeId: 'c0:c0:h0', eventName: 'click', symbolIds: [appBoundId] },
					],
					domUpdates: [],
					behaviors: [],
					elementHandles: [],
					asyncBoundaries: [],
				},
				loadSymbol: loadedResolver.loadSymbol,
			}),
		},
		{ target: { replaceChildren() {} } },
	);

	await runtime.runtime.dispatch(event('click', button) as never);
	expect(runtime.graph.read('state:selected')).toBe('Imported cedar');
});

test('render dispatch throws a tagged error when no event record matches', async () => {
	const button = element('BUTTON');
	const outside = element('BUTTON');
	const container = await render(
		() => ({
			root: button,
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
			loadSymbol: () => () => undefined,
		}),
		{ target: { replaceChildren() {} } },
	);

	await expect(container.runtime.dispatch(event('click', outside))).rejects.toMatchObject({
		code: 'MARKLESS_EVENT_DISPATCH_UNMATCHED',
		phase: 'event',
		eventName: 'click',
	});
});

// The container listener is installed because ONE element carries a record, so
// it also sees every event of that type fired on elements that carry none. Only
// a record the runtime cannot route is a defect; a record-free element is not.
function delegatedTriggerView(action: Readonly<Record<string, unknown>>) {
	return {
		...staticView(),
		locators: [{ hostNodeId: 'router:link', strategy: 'dom-order', index: 1, tagName: 'a' }],
		events: [{ hostNodeId: 'router:link', eventName: 'click', symbolIds: [], action }],
	};
}

function captureReportedRuntimeErrors(): {
	readonly reported: unknown[];
	readonly restore: () => void;
} {
	const host = globalThis as { reportError?: (error: unknown) => void };
	const previous = host.reportError;
	const reported: unknown[] = [];
	host.reportError = (error) => void reported.push(error);
	return { reported, restore: () => void (host.reportError = previous) };
}

test('CSR external delegation no-ops on its recorded element and lets record-free siblings through', async () => {
	const link = element('A');
	const unowned = element('BUTTON');
	const root = element('MAIN', [link, unowned]);
	const surface = captureReportedRuntimeErrors();
	try {
		const container = await renderCsrRuntime({
			output: {
				root,
				liveHostNodes: new Map([['router:link', link]]),
				state: createProtocolStatePayload({ cells: [] }),
				view: delegatedTriggerView({
					kind: PROTOCOL_EVENT_ACTION_KIND.externalDelegate,
					owner: 'router',
				}),
				loadSymbol() {
					throw new Error('external delegation must not load a Markless symbol');
				},
			},
			options: {},
		} as never);
		const clickListener = root.listeners.find((entry) => entry.type === 'click')?.listener;
		expect(clickListener).toBeDefined();

		await expect(clickListener!(event('click', link))).resolves.toBeUndefined();
		expect(() => container.graph).toThrow('MARKLESS_CSR_GRAPH_NOT_DEMANDED');

		await expect(clickListener!(event('click', unowned))).resolves.toBeUndefined();
		expect(surface.reported).toEqual([]);
	} finally {
		surface.restore();
	}
});

test('CSR delegated triggers report a record whose action kind names no route', async () => {
	const link = element('A');
	const root = element('MAIN', [link]);
	const surface = captureReportedRuntimeErrors();
	try {
		await renderCsrRuntime({
			output: {
				root,
				liveHostNodes: new Map([['router:link', link]]),
				state: createProtocolStatePayload({ cells: [] }),
				view: delegatedTriggerView({ kind: 'nonexistent-route', owner: 'router' }),
				loadSymbol() {
					throw new Error('an unrouted record must not load a Markless symbol');
				},
			},
			options: {},
		} as never);
		const clickListener = root.listeners.find((entry) => entry.type === 'click')?.listener;

		await expect(clickListener!(event('click', link))).resolves.toBeUndefined();
		expect(surface.reported).toMatchObject([
			{
				code: 'MARKLESS_CSR_DELEGATED_TRIGGER_UNMATCHED',
				phase: 'event',
				eventName: 'click',
				selector: 'a',
				severity: 'error',
			},
		]);
		expect(String((surface.reported[0] as Error).message)).toContain('nonexistent-route');
	} finally {
		surface.restore();
	}
});

test('CSR delegated clicks dispatch once whether full runtime demand starts before or during the click', async () => {
	async function clickCount(demandBeforeClick: boolean): Promise<number> {
		const button = element('BUTTON');
		const container = await renderCsrRuntime({
			output: {
				root: button,
				liveHostNodes: new Map([['h0', button]]),
				state: createProtocolStatePayload({
					cells: [
						{
							graphNodeId: 'state:count',
							name: 'count',
							valueKind: 'scalar',
							value: 0,
						},
					],
				}),
				view: viewWithClick(),
				loadSymbol:
					async () =>
					({ graph }) => {
						graph.update({
							graphNodeId: 'state:count',
							update: (value) => Number(value) + 1,
						});
					},
			},
			options: {},
		} as never);
		if (demandBeforeClick) await container.runtime.start();
		for (const { type, listener } of Array.from(button.listeners)) {
			if (type === 'click') await listener(event('click', button));
		}
		return Number(container.graph.read('state:count'));
	}

	await expect(clickCount(false)).resolves.toBe(1);
	await expect(clickCount(true)).resolves.toBe(1);
});

test('CSR delegated dispatch adopts a streamed arm event record exactly once', async () => {
	const shellButton = element('BUTTON');
	const armButton = element('BUTTON');
	const root = element('MAIN', [shellButton, armButton]);
	const liveHostNodes = new Map([
		['h-shell', shellButton],
		['h-arm', armButton],
	]);
	const events: ProtocolViewPayload['events'][number][] = [
		{ hostNodeId: 'h-shell', eventName: 'click', symbolIds: ['symbol:shell'] },
	];
	const view: ProtocolViewPayload = {
		...staticView(),
		locators: [],
		events,
	};
	const state = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:logged', name: 'logged', valueKind: 'scalar', value: 0 }],
	});
	const container = await renderCsrRuntime({
		output: {
			root,
			liveHostNodes,
			state,
			view,
			loadSymbol:
				async (symbolId) =>
				({ graph }) => {
					if (symbolId !== 'symbol:arm') return;
					graph.update({
						graphNodeId: 'state:logged',
						update: (value) => Number(value) + 1,
					});
				},
		},
		options: {},
	} as never);

	// The pending shell installed the permanent capture listener. The streamed
	// installment arrives later and its adopted record must extend that same
	// listener's dispatch table before the settled-arm button is clicked.
	events.push({ hostNodeId: 'h-arm', eventName: 'click', symbolIds: ['symbol:arm'] });
	await container.runtime.start();
	const clickListener = root.listeners.find((entry) => entry.type === 'click')?.listener;
	expect(clickListener).toBeDefined();

	await clickListener!(event('click', armButton));
	await clickListener!(event('click', armButton));
	expect(container.graph.read('state:logged')).toBe(2);
});

test('render starts artifact-owned CSR preload work without requiring app code', async () => {
	const root = element('MAIN');
	const target = {
		children: [] as FakeElement[],
		replaceChildren(...children: FakeElement[]) {
			this.children = children;
		},
	};
	const preloads: string[] = [];

	await render(
		{
			preload() {
				preloads.push('started');
			},
			renderCsr() {
				return { root };
			},
		},
		{ target },
	);

	expect(preloads).toEqual(['started']);
	expect(target.children).toEqual([root]);
});

test('render activates every authored CSR behavior symbol before interaction', async () => {
	const root = element('BUTTON');
	const state = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 }],
	});
	const target = {
		children: [] as FakeElement[],
		replaceChildren(...children: FakeElement[]) {
			this.children = children;
		},
	};
	const loadedSymbols: string[] = [];
	const installed: string[] = [];

	await render(
		{
			renderCsr() {
				return {
					root,
					state,
					view: {
						...viewWithClickDomUpdate(),
						behaviors: [
							{
								hostNodeId: 'h0',
								source: 'chart',
								functionSource: 'chart',
								inputSources: [],
								symbolId: 'symbol:chart',
							},
							{
								hostNodeId: 'h0',
								source: 'coldChart',
								functionSource: 'coldChart',
								inputSources: [],
								symbolId: 'symbol:cold-chart',
							},
						],
						elementHandles: [],
						asyncBoundaries: [],
					},
					loadSymbol(symbolId: string) {
						loadedSymbols.push(symbolId);
						if (symbolId === 'symbol:click') {
							return ({ graph }) => {
								graph.write({ graphNodeId: 'state:count', value: 1 });
							};
						}
						if (symbolId === 'symbol:text') {
							return (context) => ({
								type: 'setText',
								locator: context.domUpdate?.hostNodeId ?? 'h0',
								value: context.value,
							});
						}
						return ({ element: host }) => {
							installed.push(host.tagName);
						};
					},
				};
			},
		},
		{ target },
	);

	expect(loadedSymbols).toEqual(['symbol:chart', 'symbol:cold-chart']);
	expect(installed).toEqual(['BUTTON', 'BUTTON']);
	expect(target.children).toEqual([root]);

	await root.listeners[0].listener(event('click', root));

	expect(loadedSymbols).toEqual([
		'symbol:chart',
		'symbol:cold-chart',
		'symbol:click',
		'symbol:text',
	]);
	expect(root.textContent).toBe('1');
});

test('render returns a compiler-provided CSR runtime without event resume startup', async () => {
	const target = {
		children: [] as FakeElement[],
		replaceChildren(...children: FakeElement[]) {
			this.children = children;
		},
	};
	const root = element('DIV');
	const graph = {
		read() {
			return 'ready';
		},
	};
	const runtime = {
		graph,
		view: staticView(),
		async dispatch() {},
	};

	const container = await render(
		() => ({
			root,
			graph,
			runtime,
		}),
		{
			target,
			get loadSymbol() {
				throw new Error('fast-path render must not read fallback loadSymbol');
			},
		},
	);

	expect(target.children).toEqual([root]);
	expect(container.graph).toBe(graph);
	expect(container.runtime).toBe(runtime);
});

test('render uses the narrow CSR event path to apply DOM update symbols', async () => {
	const target = {
		children: [] as FakeElement[],
		replaceChildren(...children: FakeElement[]) {
			this.children = children;
		},
	};
	const state = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 }],
	});
	const loadedSymbols: string[] = [];
	const button = element('BUTTON');
	button.textContent = '0';

	const container = await render(
		() => ({
			root: button,
			state,
			view: viewWithClickDomUpdate(),
			loadSymbol(symbolId: string) {
				loadedSymbols.push(symbolId);
				if (symbolId === 'symbol:click') {
					return ({ graph }) => {
						graph.update({
							graphNodeId: 'state:count',
							path: [],
							returnValue: 'next',
							update(value) {
								return Number(value) + 1;
							},
						});
					};
				}
				return (context) => ({
					type: 'setText',
					locator: context.domUpdate?.hostNodeId ?? 'h0',
					value: context.value,
				});
			},
		}),
		{ target },
	);

	await container.root.listeners[0].listener(event('click', container.root));

	expect(loadedSymbols).toEqual(['symbol:click', 'symbol:text']);
	expect(container.graph.read('state:count')).toBe(1);
	expect(button.textContent).toBe('1');
});

test('render wires CSR sync computed dependencies through the full runtime', async () => {
	const target = {
		children: [] as FakeElement[],
		replaceChildren(...children: FakeElement[]) {
			this.children = children;
		},
	};
	const button = element('BUTTON');
	button.textContent = '4';
	const state = {
		...createProtocolStatePayload({
			cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 2 }],
		}),
		computed: [
			{
				graphNodeId: 'computed:doubled',
				name: 'doubled',
				async: false,
				deriveSymbolId: 'symbol:derive',
				dependencies: [{ graphNodeId: 'state:count', path: [] }],
			},
		],
	};
	const loadedSymbols: string[] = [];

	const container = await render(
		() => ({
			root: button,
			state: state as never,
			view: viewWithClickSyncComputedDomUpdate(),
			loadSymbol(symbolId: string) {
				loadedSymbols.push(symbolId);
				if (symbolId === 'symbol:click') {
					return ({ graph }) =>
						graph.update({
							graphNodeId: 'state:count',
							path: [],
							returnValue: 'next',
							update: (value) => Number(value) + 1,
						});
				}
				if (symbolId === 'symbol:derive') {
					return ({ graph }) => Number(graph.read('state:count')) * 2;
				}
				return (context) => ({
					type: 'setText',
					locator: context.domUpdate?.hostNodeId ?? 'h0',
					value: context.value,
				});
			},
		}),
		{ target },
	);

	await container.root.listeners[0].listener(event('click', container.root));

	expect(loadedSymbols).toEqual(['symbol:click', 'symbol:derive', 'symbol:text']);
	expect(container.graph.read('computed:doubled')).toBe(6);
	expect(button.textContent).toBe('6');
});

test('render falls back from the event-only path when element handles are present', async () => {
	const target = {
		children: [] as FakeElement[],
		replaceChildren(...children: FakeElement[]) {
			this.children = children;
		},
	};
	const button = element('BUTTON');
	const state = createProtocolStatePayload({ cells: [] });
	let resolvedHandle: FakeElement | undefined;

	const container = await render(
		() => ({
			root: button,
			state,
			view: viewWithElementHandle(),
			loadSymbol() {
				return ({ getElementHandle }) => {
					resolvedHandle = getElementHandle('counter') as FakeElement | undefined;
				};
			},
		}),
		{ target },
	);

	await container.root.listeners[0].listener(event('click', container.root));

	expect(resolvedHandle).toBe(button);
});

test('renderToString emits an SSR container and omits the resumer for static output', async () => {
	let componentBodyRuns = 0;
	const html = await renderToString(() => {
		componentBodyRuns++;
		return {
			html: '<main><p>Static news</p></main>',
			state: createProtocolStatePayload({
				cells: [
					{
						graphNodeId: 'state:article',
						name: 'article',
						valueKind: 'object',
						value: { title: 'Static news' },
					},
				],
			}),
			view: {
				...staticView(),
				locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'main' }],
				domUpdates: [
					{
						hostNodeId: 'h0',
						source: 'article',
						graphNodeId: 'state:article',
						path: ['title'],
						target: { kind: 'text' },
						symbolId: 'symbol:static-text',
					},
				],
			},
		};
	});

	expect(componentBodyRuns).toBe(1);
	expect(html).toBe('<div data-async-container><main><p>Static news</p></main></div>');
	expect(html).not.toContain('type="markless/state"');
	expect(html).not.toContain('type="markless/view"');
	expect(html).not.toContain('data-async-resumer');
});

test.each([
	{
		name: 'an element event',
		state: createProtocolStatePayload({ cells: [] }),
		view: viewWithClick(),
	},
	{
		name: 'a keyed-row event',
		state: createProtocolStatePayload({ cells: [] }),
		view: {
			...duplicateKeyRepeatView(),
			keyedRepeats: duplicateKeyRepeatView().keyedRepeats?.map((repeat) => ({
				...repeat,
				rowEvents: [{ hostPath: [0], eventName: 'click', symbolIds: ['symbol:row-click'] }],
			})),
		},
	},
	{
		name: 'a sync computed derive symbol',
		state: {
			...createProtocolStatePayload({ cells: [] }),
			computed: [
				{
					graphNodeId: 'computed:greeting',
					name: 'greeting',
					async: false,
					deriveSymbolId: 'symbol:derive-greeting',
					dependencies: [],
				},
			],
		},
		view: staticView(),
	},
	{
		name: 'an async boundary',
		state: createProtocolStatePayload({ cells: [] }),
		view: viewWithAsyncBoundary(),
	},
])('renderToString keeps payload scripts and the resumer for $name', async ({ state, view }) => {
	const html = await renderToString(
		() => ({ html: '<button type="button">Resume</button>', state, view }),
		{ resumeModuleUrl: '/async-resume.js' },
	);

	expect(html).toContain('type="markless/state"');
	expect(html).toContain('type="markless/view"');
	expect(html).toContain('data-async-resumer');
});

// Live directValue cells (page props seeded by the host, need 14) must be
// envelope-encoded before the payload script is served — resume validation
// rejects a leaked directValue on first interaction.
test('renderToString envelope-encodes live directValue state cells before serving', async () => {
	const html = await renderToString(() => ({
		html: '<button>Go</button>',
		state: {
			version: ASYNC_PROTOCOL_VERSION,
			cells: [
				{
					graphNodeId: 'prop:props',
					name: 'props',
					valueKind: 'object' as const,
					directValue: { params: { owner: 'ada' }, status: 200 },
				},
			],
			computed: [],
		},
		view: viewWithClick(),
	}));

	expect(html).toContain('"graphNodeId":"prop:props"');
	expect(html).not.toContain('directValue');
	expect(html).toContain('"records"');
});

/**
 * The Escape primer is pay-per-use, and this is the wall that keeps it that way.
 *
 * The gate is the `overlay` mark in the served html, because that is where the
 * mark is written - it is a static attribute, so no payload record carries it.
 * A page with no mark has to ship a resumer that is byte-identical to the one it
 * shipped before the primer existed, which is what the prefix check says: the
 * marked page's resumer is the unmarked one plus an appended tail and nothing
 * else.
 */
// What elevation costs a page that uses it, in inline-resumer source bytes,
// before compression. Re-anchor it in the same change set that moves it.
const OVERLAY_PRIMER_BYTES = 1498;

function inlineResumerSourceOf(html: string): string {
	const found = /<script data-async-resumer[^>]*>([\s\S]*?)<\/script>/.exec(html);
	if (!found) throw new Error('Expected an inline resumer script in the served html.');
	return found[1] ?? '';
}

test('renderToString ships the overlay Escape primer only for a page that carries the mark', async () => {
	const serve = (html: string) =>
		renderToString(
			() => ({
				html,
				state: createProtocolStatePayload({ cells: [] }),
				view: viewWithClick(),
			}),
			{ resumeModuleUrl: '/async-resume.js' },
		);

	const plain = inlineResumerSourceOf(await serve('<button type="button">Go</button>'));
	const elevated = inlineResumerSourceOf(
		await serve('<button type="button" overlay="">Go</button>'),
	);

	expect(plain).not.toContain('__marklessOverlayPrimedDismissal');
	expect(elevated).toContain('__marklessOverlayPrimedDismissal');
	// Appended, never composed in: the unmarked page's bytes are untouched.
	expect(elevated.startsWith(plain)).toBe(true);
	expect(elevated.length - plain.length).toBe(OVERLAY_PRIMER_BYTES);
});

test('renderToString rejects duplicate runtime keys on the static output path', async () => {
	await expect(
		renderToString(() => ({
			html: '<ul><li>apple</li><li>pear</li><li>kale</li></ul>',
			state: duplicateRowsState(),
			view: duplicateKeyRepeatView(),
		})),
	).rejects.toMatchObject({
		code: 'MARKLESS_REPEAT_KEY_DUPLICATE',
		message: 'MARKLESS_REPEAT_KEY_DUPLICATE: Duplicate @for key "fruit" from row.category.',
		phase: 'runtime',
		docsUrl: 'https://markless.dev/errors/MARKLESS_REPEAT_KEY_DUPLICATE',
		keyPath: ['category'],
		collidingValue: 'fruit',
	});
});

test('renderToString keeps fragment sibling roots as direct container children and offsets their locators', async () => {
	const html = await renderToString({
		renderSsr: () => ({
			html: '<header>Site</header><button type="button">0</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: {
				version: ASYNC_PROTOCOL_VERSION,
				locators: [
					{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'header' },
					{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
				],
				events: [{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:click'] }],
				domUpdates: [],
				behaviors: [],
				elementHandles: [],
				asyncBoundaries: [],
			},
		}),
	});

	// Fragment-rooted SSR html is concatenated sibling roots. The container must
	// keep both siblings as its direct children with no extra wrapper element,
	// so container-scoped locator indexes stay aligned to the element walk.
	expect(html).toContain(
		'<div data-async-container><header>Site</header><button type="button">0</button>',
	);

	const view = JSON.parse(extractScriptText(html, 'markless/view')) as ProtocolViewPayload;

	// The container div is walk-element 0, so both flat dom-order sibling
	// locators are offset by +1 (0 -> 1 and 1 -> 2).
	expect(view.locators).toEqual([
		{ hostNodeId: 'h0', strategy: 'dom-order', index: 1, tagName: 'header' },
		{ hostNodeId: 'h1', strategy: 'dom-order', index: 2, tagName: 'button' },
	]);
	expect(view.events).toEqual([
		{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:click'] },
	]);
});

test('renderToString keeps async boundary anchors as the only comments in document order', async () => {
	const html = await renderToString(
		() => ({
			html: '<!--markless:async:boundary:0--><p>Pending</p><!--/markless:async:boundary:0-->',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithAsyncBoundary(),
		}),
		{
			nonce: 'nonce-1',
			resumerSource: 'globalThis.__started = true;',
		},
	);

	expect(html).toContain('data-async-container');
	expect(html).toContain('<script type="markless/state">');
	expect(html).toContain('<script type="markless/view">');
	expect(html).toContain('dom-order-comment');

	// Container wrapping, payload scripts, and the inline resumer must not add
	// comment nodes: flat comment-anchor indexes stay aligned only if the two
	// compiler-emitted anchors are the only comments in the container.
	expect(html.match(/<!--/g)).toHaveLength(2);

	const startIndex = html.indexOf('<!--markless:async:boundary:0-->');
	const endIndex = html.indexOf('<!--/markless:async:boundary:0-->');
	expect(startIndex).toBeGreaterThanOrEqual(0);
	expect(endIndex).toBeGreaterThan(startIndex);
	expect(startIndex).toBeLessThan(html.indexOf('<p>Pending</p>'));
	expect(html.indexOf('<p>Pending</p>')).toBeLessThan(endIndex);
	expect(endIndex).toBeLessThan(html.indexOf('<script type="markless/state">'));
});

test('renderToString emits one inline resumer for SSR containers with browser triggers', async () => {
	const html = await renderToString(
		() => ({
			html: '<button type="button">Count 0</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
		}),
		{
			nonce: 'nonce-1',
			resumerSource: 'globalThis.__started = (globalThis.__started ?? 0) + 1;',
		},
	);

	expect(html.match(/data-async-resumer/g)).toHaveLength(1);
	expect(html).toContain('<script type="markless/state">');
	expect(html).toContain('<script type="markless/view">');
	expect(html.indexOf('<script type="markless/view">')).toBeLessThan(
		html.indexOf('data-async-resumer'),
	);
	expect(html).toContain('<script data-async-resumer nonce="nonce-1">');
	expect(html).toContain('globalThis.__started');
});

test('renderToString does not wake Markless for an externally delegated record', async () => {
	const html = await renderToString(
		() => ({
			html: '<a href="/docs">Docs</a>',
			state: createProtocolStatePayload({ cells: [] }),
			view: {
				...staticView(),
				locators: [
					{
						hostNodeId: 'router:link',
						strategy: 'dom-order',
						index: 0,
						tagName: 'a',
					},
				],
				events: [
					{
						hostNodeId: 'router:link',
						eventName: 'click',
						symbolIds: [],
						action: {
							kind: PROTOCOL_EVENT_ACTION_KIND.externalDelegate,
							owner: 'router',
						},
					},
				],
			},
		}),
		{ resumeModuleUrl: '/app.js' },
	);

	expect(html).not.toContain('data-async-resumer');
	expect(html).not.toContain('type="markless/view"');
});

test('renderToString wakes the runtime for arm-record event types', async () => {
	const html = await renderToString(
		() => ({
			html: '<main><!--markless:branch:branch-site:0--><section><button>Go</button></section><!--/markless:branch:branch-site:0--></main>',
			state: createProtocolStatePayload({ cells: [] }),
			view: {
				version: ASYNC_PROTOCOL_VERSION,
				locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'main' }],
				events: [],
				domUpdates: [],
				behaviors: [],
				elementHandles: [],
				asyncBoundaries: [],
				branches: [
					{
						id: 'branch-site:0',
						startAnchor: { strategy: 'dom-order-comment', index: 0 },
						endAnchor: { strategy: 'dom-order-comment', index: 1 },
						symbolId: 'symbol:flip',
						testReads: [{ source: 'open', graphNodeId: 'state:open', path: [] }],
						armRecords: [
							{
								events: [
									{
										hostPath: [0, 0],
										eventName: 'click',
										symbolIds: ['symbol:go'],
									},
								],
								domUpdates: [],
								behaviors: [],
								elementHandles: [],
							},
						],
					},
				],
			},
		}),
		{ resumeModuleUrl: '/app.js' },
	);

	// A click on an arm host may be the page's FIRST interaction: the inline
	// resumer must include arm-record event types in its wake set and forward
	// unmatched events so the full runtime resolves the arm match.
	expect(html).toContain('data-async-resumer');
	expect(html).toContain('armRecords');
	expect(html).toContain('eventRecord: null');
});

test('renderToString serializes runtime-attached async snapshots into valid payloads', async () => {
	const html = await renderToString(
		() => ({
			html: '<p>Hello Ada</p>',
			state: {
				...createProtocolStatePayload({ cells: [] }),
				computed: [
					{
						graphNodeId: 'computed:details',
						name: 'details',
						async: true,
						// Runtime-attached snapshot: raw values, not envelopes.
						snapshot: {
							status: 'fulfilled',
							version: 1,
							key: null,
							value: { title: 'Hello Ada' },
						},
					},
				],
			} as never,
			view: viewWithClick(),
			resumeModuleUrl: '/app.js',
		}),
		{ resumeModuleUrl: '/app.js' },
	);

	const stateJson = /<script type="markless\/state">(.*?)<\/script>/.exec(html)?.[1];
	expect(stateJson).toBeDefined();
	// The served payload must decode: raw snapshot key/value are serialized
	// into graph envelopes (the browser threw MARKLESS_PAYLOAD_INVALID on
	// first interaction otherwise — caught by the browser matrix).
	const { assertProtocolStatePayload } =
		await import('../../serializer/src/protocol-validation.ts');
	expect(() => assertProtocolStatePayload(JSON.parse(stateJson!))).not.toThrow();
});

test('renderToString self-wakes when a fulfilled boundary read has an unsettled upstream runner', async () => {
	const html = await renderToString(
		() => ({
			html: '<p>Prior label</p>',
			state: {
				...createProtocolStatePayload({ cells: [] }),
				computed: [
					{
						graphNodeId: 'computed:source',
						name: 'source',
						async: true,
						snapshot: { status: 'pending', version: 1, key: null },
					},
					{
						graphNodeId: 'computed:label',
						name: 'label',
						async: true,
						dependencies: [{ graphNodeId: 'computed:source', path: [] }],
						snapshot: {
							status: 'fulfilled',
							version: 1,
							key: null,
							value: { text: 'Prior label' },
						},
					},
				],
			} as never,
			view: {
				...staticView(),
				asyncRunners: {
					'computed:source': 'symbol:source',
					'computed:label': 'symbol:label',
				},
				asyncBoundaries: [
					{
						id: 'boundary:0',
						startAnchor: { strategy: 'dom-order-comment', index: 0 },
						endAnchor: { strategy: 'dom-order-comment', index: 1 },
						asyncReads: [
							{
								source: 'label.text',
								graphNodeId: 'computed:label',
								path: ['text'],
							},
						],
					},
				],
			} as ProtocolViewPayload,
		}),
		{ resumeModuleUrl: '/app.js' },
	);

	expect(html).toContain('data-markless-self-wake');
	expect(extractResumerSource(html)).toContain('queueMicrotask');
	expect(extractResumerSource(html)).toContain('DOMContentLoaded');
	expect(extractResumerSource(html)).toContain('requestAnimationFrame');
});

test('renderToString self-wakes through a sync computed boundary read', async () => {
	const html = await renderToString(
		() => ({
			html: '<p>Loading</p>',
			state: {
				...createProtocolStatePayload({ cells: [] }),
				computed: [
					{
						graphNodeId: 'computed:source',
						name: 'source',
						async: true,
						snapshot: { status: 'idle', version: 0 },
					},
					{
						graphNodeId: 'computed:card',
						name: 'card',
						async: false,
						dependencies: [{ graphNodeId: 'computed:source', path: [] }],
					},
				],
			} as never,
			view: {
				...staticView(),
				asyncRunners: { 'computed:source': 'symbol:source' },
				asyncBoundaries: [
					{
						id: 'boundary:0',
						startAnchor: { strategy: 'dom-order-comment', index: 0 },
						endAnchor: { strategy: 'dom-order-comment', index: 1 },
						asyncReads: [
							{
								source: 'card.caption',
								graphNodeId: 'computed:card',
								path: ['caption'],
							},
						],
					},
				],
			} as ProtocolViewPayload,
		}),
		{ resumeModuleUrl: '/app.js' },
	);

	expect(html).toContain('data-markless-self-wake');
});

test('renderToString emits the resumer for keyed-repeat row events', async () => {
	const html = await renderToString(
		() => ({
			html: '<section><article><h2>Alpha</h2><button>Choose</button></article></section>',
			state: createProtocolStatePayload({ cells: [] }),
			view: {
				version: ASYNC_PROTOCOL_VERSION,
				locators: [],
				events: [],
				domUpdates: [],
				behaviors: [],
				elementHandles: [],
				asyncBoundaries: [],
				keyedRepeats: [
					{
						id: 'repeat:0',
						parentHostNodeId: 'h1',
						collectionGraphNodeId: 'state:entries',
						collectionPath: [],
						keyPath: ['code'],
						itemName: 'entry',
						rowElementCount: 3,
						rowEvents: [{ hostPath: [1], eventName: 'click', symbolIds: ['symbol:0'] }],
					},
				],
			},
		}),
		{ resumeModuleUrl: '/app.js' },
	);

	// Row events are browser triggers: keyed-only pages must bootstrap the
	// resumer, and the inline delegation must forward unmatched clicks of row
	// event types so the full runtime can resolve the row.
	expect(html).toContain('data-async-resumer');
	// The inline source collects row event types from the payload and forwards
	// unmatched events of those types without a record.
	expect(html).toContain('keyedRepeats ?? []');
	expect(html).toContain('eventRecord: null');
});

test('renderToString selects the policy-capable resumer for a row-borne sync policy', async () => {
	const html = await renderToString(
		() => ({
			html: '<section><article><h2>Alpha</h2><button>Choose</button></article></section>',
			state: createProtocolStatePayload({
				cells: [
					{ graphNodeId: 'state:menu', name: 'menu', valueKind: 'object', value: { open: true } },
				],
			}),
			view: {
				version: ASYNC_PROTOCOL_VERSION,
				locators: [],
				// The page's ONLY policy sits on a repeat row. Scanning `events` alone
				// would ship the policy data with a resumer that cannot apply it.
				events: [],
				domUpdates: [],
				behaviors: [],
				elementHandles: [],
				asyncBoundaries: [],
				keyedRepeats: [
					{
						id: 'repeat:0',
						parentHostNodeId: 'h1',
						collectionGraphNodeId: 'state:entries',
						collectionPath: [],
						keyPath: ['code'],
						itemName: 'entry',
						rowElementCount: 3,
						rowEvents: [
							{
								hostPath: [1],
								eventName: 'click',
								symbolIds: ['symbol:0'],
								syncPolicy: {
									when: {
										type: 'and',
										conditions: [
											{ type: 'graph-truthy', graphNodeId: 'state:menu', path: ['open'] },
											{ type: 'event-equals', field: 'button', value: 0 },
										],
									},
									actions: ['preventDefault'],
								},
							},
						],
					},
				],
			},
		}),
		{ resumeModuleUrl: '/app.js' },
	);

	expect(html).toContain('__MARKLESS_INLINE_SYNC_POLICY__=true');
	// The row policy reads the graph, so the graph-capable flavour is the one owed.
	expect(html).toContain('__MARKLESS_INLINE_GRAPH_SYNC_POLICY__=true');
});

test('renderToString keeps the policy-free resumer when no row carries a sync policy', async () => {
	const html = await renderToString(
		() => ({
			html: '<section><article><h2>Alpha</h2><button>Choose</button></article></section>',
			state: createProtocolStatePayload({ cells: [] }),
			view: {
				version: ASYNC_PROTOCOL_VERSION,
				locators: [],
				events: [],
				domUpdates: [],
				behaviors: [],
				elementHandles: [],
				asyncBoundaries: [],
				keyedRepeats: [
					{
						id: 'repeat:0',
						parentHostNodeId: 'h1',
						collectionGraphNodeId: 'state:entries',
						collectionPath: [],
						keyPath: ['code'],
						itemName: 'entry',
						rowElementCount: 3,
						rowEvents: [{ hostPath: [1], eventName: 'click', symbolIds: ['symbol:0'] }],
					},
				],
			},
		}),
		{ resumeModuleUrl: '/app.js' },
	);

	expect(html).toContain('__MARKLESS_INLINE_SYNC_POLICY__=false');
	expect(html).toContain('__MARKLESS_INLINE_GRAPH_SYNC_POLICY__=false');
});

test('renderToString emits the resumer for keyed-repeat row events in a served async arm', async () => {
	const html = await renderToString(
		() => ({
			html: '<!--markless:async:boundary:0--><ul><li>Beacon</li></ul><!--/markless:async:boundary:0-->',
			state: createProtocolStatePayload({ cells: [] }),
			view: {
				...staticView(),
				asyncBoundaries: [
					{
						id: 'boundary:0',
						runnerGraphNodeId: 'computed:feed',
						initiallyServedArm: ASYNC_BOUNDARY_ARM.try,
						startAnchor: { strategy: 'dom-order-comment', index: 0 },
						endAnchor: { strategy: 'dom-order-comment', index: 1 },
						asyncReads: [],
						armRecords: {
							locators: [
								{
									hostNodeId: 'h-list',
									strategy: 'arm-relative',
									index: 0,
									tagName: 'ul',
								},
							],
							events: [],
							behaviors: [],
							elementHandles: [],
							keyedRepeats: [
								{
									id: 'repeat:0',
									parentHostNodeId: 'h-list',
									collectionGraphNodeId: 'state:entries',
									collectionPath: [],
									keyPath: ['id'],
									itemName: 'entry',
									rowElementCount: 1,
									rowEvents: [
										{
											hostPath: [],
											eventName: 'click',
											symbolIds: ['symbol:row'],
										},
									],
								},
							],
						},
					},
				],
			} as ProtocolViewPayload,
		}),
		{ resumeModuleUrl: '/app.js' },
	);

	expect(html).toContain('data-async-resumer');
	expect(html).toContain('armRecords.keyedRepeats ?? []');
});

test('renderToString emits ordered modulepreload links before interactive payload startup', async () => {
	const html = await renderToString(
		() => ({
			html: '<button type="button">Count 0</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
		}),
		{
			nonce: 'nonce-1',
			modulePreloads: [
				{ href: '/build/shared.js', fetchPriority: 'high' },
				'/build/symbol.js',
				'/build/shared.js',
				{ href: '/build/low.js', fetchPriority: 'low' },
			],
			resumerSource: 'globalThis.__started = true;',
		},
	);

	expect(html.match(/rel="modulepreload"/g)).toHaveLength(3);
	expect(html).toContain(
		'<link rel="modulepreload" href="/build/shared.js" crossorigin="anonymous" fetchpriority="high" nonce="nonce-1">',
	);
	expect(html).toContain(
		'<link rel="modulepreload" href="/build/symbol.js" crossorigin="anonymous" nonce="nonce-1">',
	);
	expect(html).toContain(
		'<link rel="modulepreload" href="/build/low.js" crossorigin="anonymous" fetchpriority="low" nonce="nonce-1">',
	);
	expect(html.indexOf('rel="modulepreload"')).toBeLessThan(html.indexOf('<button'));
	expect(html.indexOf('rel="modulepreload"')).toBeLessThan(html.indexOf('data-async-resumer'));
});

test('renderToString uses compiled artifact modulepreloads by default', async () => {
	const html = await renderToString({
		modulePreloads: [{ href: '/src/App.tsrx?import', fetchPriority: 'high' }],
		resumeModuleUrl: '/src/App.tsrx?import',
		renderSsr: () => ({
			html: '<button type="button">Count 0</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
		}),
	});

	expect(html).toContain(
		'<link rel="modulepreload" href="/src/App.tsrx?import" crossorigin="anonymous" fetchpriority="high">',
	);
});

test('renderToString emits compiled artifact head injections before the container', async () => {
	const html = await renderToString({
		headInjections: [
			{
				tag: 'script',
				location: 'head',
				attributes: { type: 'module', src: '/@vite/client' },
			},
		],
		renderSsr: () => ({
			html: '<button type="button">Count 0</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
		}),
	});

	expect(html).toContain('<script type="module" src="/@vite/client"></script>');
	expect(html.indexOf('/@vite/client')).toBeLessThan(html.indexOf('<div'));
});

test('renderToString keeps storage-free output byte-identical when seed metadata is absent', async () => {
	const html = await renderToString(() => ({ html: '<main>Archive</main>' }));

	expect(html).toBe('<div data-async-container><main>Archive</main></div>');
});

test('renderToString emits the immediate storage seed as the leading fragment and keeps storage-only payloads', async () => {
	const html = await renderToString({
		storageSeeds: [
			{
				slotKey: 'src/Settings.tsrx#theme-mode',
				driverKey: 'theme-mode',
				fallback: 'light',
			},
		],
		renderSsr: () => ({
			html: '<main>Settings</main>',
			state: createProtocolStatePayload({
				cells: [],
				storage: [
					{
						graphNodeId: 'storage:src/Settings.tsrx#theme-mode',
						key: 'theme-mode',
					},
				],
			}),
			view: staticView(),
		}),
	} as never);

	expect(html).toMatch(/^<script>/);
	const seed = html.slice(0, html.indexOf('</script>'));
	expect(seed).toContain('Symbol.for("tsrx.storage/1")');
	expect(seed).toContain('src/Settings.tsrx#theme-mode');
	expect(seed).toContain('localStorage.getItem');
	expect(seed).toContain('document.documentElement.setAttribute(a,v)');
	expect(seed).toContain('"data-theme-mode"');
	expect(html.indexOf('</script>')).toBeLessThan(html.indexOf('<div data-async-container'));
	expect(html).toContain('type="markless/state"');
	expect(html).toContain('type="markless/view"');
	expect(html).toContain('data-async-resumer');
});

test('renderToString applies the executable nonce to the storage seed', async () => {
	const html = await renderToString(
		{
			storageSeeds: [
				{
					slotKey: 'src/Settings.tsrx#theme-mode',
					driverKey: 'theme-mode',
					fallback: 'light',
				},
			],
			renderSsr: () => ({ html: '<main>Settings</main>' }),
		} as never,
		{ nonce: 'seed-nonce' },
	);

	expect(html).toMatch(/^<script nonce="seed-nonce">/);
});

test('the server transform carries reachable storage seeds as structured artifact metadata', async () => {
	const transformed = await transformTsrxModule({
		filename: 'src/Settings.tsrx',
		source: `
import { storage } from '@markless/core';
export const theme = storage('theme-mode', 'light');
export function Settings() @{
	<main>{theme}</main>
}
`,
		environment: 'server',
		executionLog: 'never',
	});

	expect(transformed.code).toContain('storageSeeds:');
	expect(transformed.code).toContain('"slotKey": "src/Settings.tsrx#theme-mode"');
	expect(transformed.code).toContain('"driverKey": "theme-mode"');
	expect(transformed.code).toContain('"fallback": "light"');
	expect(transformed.code).not.toContain('localStorage.getItem');

	const unused = await transformTsrxModule({
		filename: 'src/UnusedSettings.tsrx',
		source: `
import { storage } from '@markless/core';
export const theme = storage('theme-mode', 'light');
export function Settings() @{
	<main>Settings</main>
}
`,
		environment: 'server',
		executionLog: 'never',
	});
	expect(unused.code).not.toContain('storageSeeds:');
});

test('renderToString uses the compiled artifact resume module URL by default', async () => {
	const resumeModuleUrl = createResumeModuleUrl('artifact-default');
	const html = await renderToString({
		resumeModuleUrl,
		renderSsr: () => ({
			html: '<button type="button">Count 0</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
		}),
	});

	expect(extractResumerSource(html)).toContain(JSON.stringify(resumeModuleUrl));
});

test('renderToString uses the compiled resumer mode when logging metadata is omitted', async () => {
	const html = await renderToString({
		resumeModuleUrl: '/build/resume.js',
		inlineResumerSources: {
			debug: false,
			executionLog: 'never',
			event: 'globalThis.__compiledEventResumer = true;',
			syncPolicy: 'globalThis.__compiledSyncResumer = true;',
			graphSyncPolicyOwner: 'globalThis.__compiledGraphOwner = true;',
			graphSyncPolicyConsumer: 'globalThis.__compiledGraphConsumer = true;',
		},
		renderSsr: () => ({
			html: '<button type="button">Count 0</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
		}),
	});

	expect(extractResumerSource(html)).toBe('globalThis.__compiledEventResumer = true;');
});

test('renderToString inline event resumer imports the resume module only after interaction', async () => {
	const resumeModuleUrl = createResumeModuleUrl();
	const html = await renderToString(
		() => ({
			html: '<button type="button">Count 0</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
		}),
		{ executionLog: 'never', resumeModuleUrl },
	);
	const view = JSON.parse(extractScriptText(html, 'markless/view')) as ProtocolViewPayload;
	const resumerSource = extractResumerSource(html);
	expect(resumerSource).not.toContain('queueMicrotask');
	const button = element('BUTTON');
	const root = element('DIV', [button]);
	const listeners: Array<(event: FakeEvent) => Promise<void>> = [];
	root.querySelector = (selector) =>
		selector === 'script[type="markless/view"]' ? { textContent: JSON.stringify(view) } : null;
	root.addEventListener = (type, listener, options) => {
		const capture =
			options === true || (typeof options === 'object' && options.capture === true);
		if (type === 'click' && capture) listeners.push(listener);
	};
	const document = {
		currentScript: {
			closest(selector: string) {
				return selector === '[data-async-container]' ? root : null;
			},
		},
		createTreeWalker() {
			const nodes = [button];
			return {
				nextNode() {
					return nodes.shift() ?? null;
				},
			};
		},
	};
	const globalScope = globalThis as typeof globalThis & {
		document?: unknown;
		__asyncResumerTest?: {
			imports: number;
			events: string[];
		};
	};
	const previousDocument = globalScope.document;
	const previousTestState = globalScope.__asyncResumerTest;
	globalScope.document = document;
	globalScope.__asyncResumerTest = { imports: 0, events: [] };

	try {
		await import(`data:text/javascript,${encodeURIComponent(resumerSource)}`);

		expect(listeners).toHaveLength(1);
		expect(globalScope.__asyncResumerTest).toEqual({ imports: 0, events: [] });

		await listeners[0](event('click', button));

		expect(globalScope.__asyncResumerTest).toEqual({
			imports: 1,
			events: ['click:DIV'],
		});

		await listeners[0](event('click', button));

		expect(globalScope.__asyncResumerTest).toEqual({
			imports: 1,
			events: ['click:DIV', 'click:DIV'],
		});
	} finally {
		if (previousDocument === undefined) {
			delete globalScope.document;
		} else {
			globalScope.document = previousDocument;
		}
		if (previousTestState === undefined) {
			delete globalScope.__asyncResumerTest;
		} else {
			globalScope.__asyncResumerTest = previousTestState;
		}
	}
});

test('renderToString inline event resumer serializes a cold interaction storm through one global queue', async () => {
	const resumeModuleUrl = createQueuedResumeModuleUrl();
	const html = await renderToString(
		() => ({
			html: '<button type="button">Count 0</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
		}),
		{ executionLog: 'never', resumeModuleUrl },
	);
	const view = JSON.parse(extractScriptText(html, 'markless/view')) as ProtocolViewPayload;
	const resumerSource = extractResumerSource(html);
	const button = element('BUTTON');
	const root = element('DIV', [button]);
	const listeners: Array<(event: FakeEvent) => Promise<void>> = [];
	root.querySelector = (selector) =>
		selector === 'script[type="markless/view"]' ? { textContent: JSON.stringify(view) } : null;
	root.addEventListener = (type, listener, options) => {
		const capture =
			options === true || (typeof options === 'object' && options.capture === true);
		if (type === 'click' && capture) listeners.push(listener);
	};
	const document = {
		currentScript: {
			closest(selector: string) {
				return selector === '[data-async-container]' ? root : null;
			},
		},
		createTreeWalker() {
			const nodes = [button];
			return { nextNode: () => nodes.shift() ?? null };
		},
	};
	const globalScope = globalThis as typeof globalThis & {
		document?: unknown;
		__marklessQueueTest?: { order: string[]; release?: () => void };
	};
	const previousDocument = globalScope.document;
	const previousState = globalScope.__marklessQueueTest;
	globalScope.document = document;
	globalScope.__marklessQueueTest = { order: [] };

	try {
		await import(`data:text/javascript,${encodeURIComponent(resumerSource)}`);
		expect(listeners).toHaveLength(1);
		const firstEvent = { ...event('click', button), key: 'first' };
		const first = listeners[0](firstEvent);
		const duplicate = listeners[0](firstEvent);
		const second = listeners[0]({ ...event('click', button), key: 'second' });
		for (let turn = 0; turn < 20 && globalScope.__marklessQueueTest.order.length === 0; turn++)
			await new Promise((resolve) => setTimeout(resolve, 0));
		expect(globalScope.__marklessQueueTest.order).toEqual(['start:first']);
		globalScope.__marklessQueueTest.release?.();
		await Promise.all([first, duplicate, second]);
		expect(globalScope.__marklessQueueTest.order).toEqual([
			'start:first',
			'end:first',
			'start:second',
			'end:second',
		]);
		Object.assign(firstEvent, { key: 'reused', timeStamp: 2 });
		await listeners[0](firstEvent);
		expect(globalScope.__marklessQueueTest.order.slice(-2)).toEqual([
			'start:reused',
			'end:reused',
		]);
		expect(listeners).toHaveLength(1);
	} finally {
		if (previousDocument === undefined) delete globalScope.document;
		else globalScope.document = previousDocument;
		if (previousState === undefined) delete globalScope.__marklessQueueTest;
		else globalScope.__marklessQueueTest = previousState;
	}
});

test('renderToString execution log activation stays inline and mirrors summary without imports', async () => {
	const html = await renderToString(
		() => ({
			html: '<button type="button">Count 0</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
		}),
		{ executionLog: 'always', resumeModuleUrl: '/resume.js' },
	);
	const resumerSource = extractResumerSource(html);

	expect(resumerSource).not.toContain('startMarklessExecutionLog');
	expect(resumerSource).not.toContain('preloadedModuleCount');
	expect(resumerSource).toContain('const __MARKLESS_INLINE_EXECUTION_LOG__="always";');
	expect(resumerSource).toContain('globalScope.__mxLog ||= new Set()');
	expect(resumerSource).toContain('console.log(summary)');
	expect(resumerSource).toContain('setAttribute("data-markless-log-summary", summary)');
	expect(resumerSource).toContain('setAttribute("data-markless-log-app-bytes", "0")');
	expect(resumerSource).toContain('setAttribute("data-markless-log-instrument-bytes", "0")');
	expect(resumerSource).toContain('removeAttribute("data-markless-log-app-bytes")');
});

test('renderToString defaults to auto execution log bootstrap for interactive SSR', async () => {
	const html = await renderToString(
		() => ({
			html: '<button type="button">Count 0</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
		}),
		{ resumeModuleUrl: '/resume.js' },
	);
	const resumerSource = extractResumerSource(html);

	expect(resumerSource).toContain('const __MARKLESS_INLINE_EXECUTION_LOG__="auto";');
	expect(resumerSource).toContain('localhost|127\\.0\\.0\\.1|\\[::1\\]');
	expect(resumerSource).toContain(
		'new URLSearchParams(currentLocation.search).has("markless-log")',
	);
	expect(resumerSource).toContain('localStorage.getItem("marklessLog") === "1"');
	expect(resumerSource).toContain('globalScope.__mxLog ||= new Set()');
	expect(resumerSource).toContain('querySelectorAll("link[rel=modulepreload]")');
	expect(resumerSource).not.toContain('rel="modulepreload"');
});

test('renderToString marks the typed fallback for execution-log removal when disabled', async () => {
	const html = await renderToString(
		() => ({
			html: '<button type="button">Count 0</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
		}),
		{ executionLog: 'never', resumeModuleUrl: '/resume.js' },
	);
	const resumerSource = extractResumerSource(html);

	expect(resumerSource).toContain('const __MARKLESS_INLINE_EXECUTION_LOG__="never";');
});

test('renderToString inline event resumer remains the sole authority after runtime startup', async () => {
	const resumeModuleUrl = createResumeRuntimeStartedModuleUrl();
	const html = await renderToString(
		() => ({
			html: '<button type="button">Count 0</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
		}),
		{ executionLog: 'never', resumeModuleUrl },
	);
	const view = JSON.parse(extractScriptText(html, 'markless/view')) as ProtocolViewPayload;
	const resumerSource = extractResumerSource(html);
	const button = element('BUTTON');
	const root = element('DIV', [button]);
	const listeners: Array<(event: FakeEvent) => Promise<void>> = [];
	root.querySelector = (selector) =>
		selector === 'script[type="markless/view"]' ? { textContent: JSON.stringify(view) } : null;
	root.addEventListener = (type, listener, options) => {
		const capture =
			options === true || (typeof options === 'object' && options.capture === true);
		if (type === 'click' && capture) listeners.push(listener);
	};
	const document = {
		currentScript: {
			closest(selector: string) {
				return selector === '[data-async-container]' ? root : null;
			},
		},
		createTreeWalker() {
			const nodes = [button];
			return {
				nextNode() {
					return nodes.shift() ?? null;
				},
			};
		},
	};
	const globalScope = globalThis as typeof globalThis & {
		document?: unknown;
		__asyncResumerTest?: {
			imports: number;
			events: string[];
		};
	};
	const previousDocument = globalScope.document;
	const previousTestState = globalScope.__asyncResumerTest;
	globalScope.document = document;
	globalScope.__asyncResumerTest = { imports: 0, events: [] };

	try {
		await import(`data:text/javascript,${encodeURIComponent(resumerSource)}`);

		await listeners[0](event('click', button));
		await listeners[0](event('click', button));

		expect(globalScope.__asyncResumerTest).toEqual({
			imports: 1,
			events: ['click:DIV', 'registered:click:DIV'],
		});
	} finally {
		if (previousDocument === undefined) {
			delete globalScope.document;
		} else {
			globalScope.document = previousDocument;
		}
		if (previousTestState === undefined) {
			delete globalScope.__asyncResumerTest;
		} else {
			globalScope.__asyncResumerTest = previousTestState;
		}
	}
});

test('renderToString marks the typed event-only fallback for sync-policy removal', async () => {
	const html = await renderToString(
		() => ({
			html: '<button type="button">Count 0</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
		}),
		{ resumeModuleUrl: '/async-resume.js' },
	);
	const resumerSource = extractResumerSource(html);

	expect(resumerSource).toContain('const __MARKLESS_INLINE_SYNC_POLICY__=false;');
	expect(resumerSource).toContain('const __MARKLESS_INLINE_GRAPH_SYNC_POLICY__=false;');
});

test('renderToString inline event resumer runs sync policy before importing resume module', async () => {
	const resumeModuleUrl = createResumeModuleUrl('sync-policy');
	const html = await renderToString(
		() => ({
			html: '<button type="button">Close</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithSyncPolicy(),
		}),
		{ executionLog: 'never', resumeModuleUrl },
	);
	const view = JSON.parse(extractScriptText(html, 'markless/view')) as ProtocolViewPayload;
	const resumerSource = extractResumerSource(html);
	const button = element('BUTTON');
	const root = element('DIV', [button]);
	const listeners: Array<(event: FakeEvent) => Promise<void>> = [];
	root.querySelector = (selector) =>
		selector === 'script[type="markless/view"]' ? { textContent: JSON.stringify(view) } : null;
	root.addEventListener = (type, listener, options) => {
		const capture =
			options === true || (typeof options === 'object' && options.capture === true);
		if (type === 'keydown' && capture) listeners.push(listener);
	};
	const document = {
		currentScript: {
			closest(selector: string) {
				return selector === '[data-async-container]' ? root : null;
			},
		},
		createTreeWalker() {
			const nodes = [button];
			return {
				nextNode() {
					return nodes.shift() ?? null;
				},
			};
		},
	};
	const globalScope = globalThis as typeof globalThis & {
		document?: unknown;
		__asyncResumerTest?: {
			imports: number;
			events: string[];
		};
	};
	const previousDocument = globalScope.document;
	const previousTestState = globalScope.__asyncResumerTest;
	globalScope.document = document;
	globalScope.__asyncResumerTest = { imports: 0, events: [] };

	try {
		await import(`data:text/javascript,${encodeURIComponent(resumerSource)}`);

		expect(listeners).toHaveLength(1);

		const keydown: FakeEvent = {
			type: 'keydown',
			target: button,
			key: 'Escape',
			defaultPrevented: false,
			propagationStopped: false,
			preventDefault() {
				this.defaultPrevented = true;
			},
			stopPropagation() {
				this.propagationStopped = true;
			},
		};
		const dispatched = listeners[0](keydown);

		expect(keydown.defaultPrevented).toBe(true);
		expect(keydown.propagationStopped).toBe(true);
		expect(globalScope.__asyncResumerTest).toEqual({ imports: 0, events: [] });

		await dispatched;

		expect(globalScope.__asyncResumerTest).toEqual({
			imports: 1,
			events: ['keydown:DIV'],
		});
	} finally {
		if (previousDocument === undefined) {
			delete globalScope.document;
		} else {
			globalScope.document = previousDocument;
		}
		if (previousTestState === undefined) {
			delete globalScope.__asyncResumerTest;
		} else {
			globalScope.__asyncResumerTest = previousTestState;
		}
	}
});

test('renderToString inline event resumer evaluates sync policy before importing symbols', async () => {
	const resumeModuleUrl = createSyncPolicyResumeModuleUrl();
	const html = await renderToString(
		() => ({
			html: '<button type="button">Save</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: {
				...viewWithClick(),
				events: [
					{
						hostNodeId: 'h0',
						eventName: 'click',
						syncPolicy: {
							when: {
								type: 'and',
								conditions: [
									{ type: 'constant-truthy', value: true },
									{ type: 'event-equals', field: 'key', value: 'Enter' },
								],
							},
							actions: ['preventDefault', 'stopPropagation'],
						},
						symbolIds: ['symbol:click'],
					},
				],
			},
		}),
		{ executionLog: 'never', resumeModuleUrl },
	);
	const view = JSON.parse(extractScriptText(html, 'markless/view')) as ProtocolViewPayload;
	const resumerSource = extractResumerSource(html);
	const button = element('BUTTON');
	const root = element('DIV', [button]);
	const listeners: Array<(event: FakeEvent) => Promise<void>> = [];
	root.querySelector = (selector) =>
		selector === 'script[type="markless/view"]' ? { textContent: JSON.stringify(view) } : null;
	root.addEventListener = (type, listener, options) => {
		const capture =
			options === true || (typeof options === 'object' && options.capture === true);
		if (type === 'click' && capture) listeners.push(listener);
	};
	const document = {
		currentScript: {
			closest(selector: string) {
				return selector === '[data-async-container]' ? root : null;
			},
		},
		createTreeWalker() {
			const nodes = [button];
			return {
				nextNode() {
					return nodes.shift() ?? null;
				},
			};
		},
	};
	const globalScope = globalThis as typeof globalThis & {
		document?: unknown;
		__asyncResumerSyncPolicyTest?: {
			order: string[];
		};
	};
	const previousDocument = globalScope.document;
	const previousTestState = globalScope.__asyncResumerSyncPolicyTest;
	globalScope.document = document;
	globalScope.__asyncResumerSyncPolicyTest = { order: [] };

	try {
		await import(`data:text/javascript,${encodeURIComponent(resumerSource)}`);

		await listeners[0]({
			type: 'click',
			target: button,
			key: 'Enter',
			defaultPrevented: false,
			propagationStopped: false,
			preventDefault() {
				globalScope.__asyncResumerSyncPolicyTest?.order.push('preventDefault');
				this.defaultPrevented = true;
			},
			stopPropagation() {
				globalScope.__asyncResumerSyncPolicyTest?.order.push('stopPropagation');
				this.propagationStopped = true;
			},
		} as FakeEvent);

		expect(globalScope.__asyncResumerSyncPolicyTest).toEqual({
			order: ['preventDefault', 'stopPropagation', 'import', 'handler:true:true:true'],
		});
	} finally {
		if (previousDocument === undefined) {
			delete globalScope.document;
		} else {
			globalScope.document = previousDocument;
		}
		if (previousTestState === undefined) {
			delete globalScope.__asyncResumerSyncPolicyTest;
		} else {
			globalScope.__asyncResumerSyncPolicyTest = previousTestState;
		}
	}
});

test('renderToString inline event resumer reads graph-backed sync policy before importing symbols', async () => {
	const resumeModuleUrl = createSyncPolicyResumeModuleUrl('graph-policy');
	const html = await renderToString(
		() => ({
			html: '<button type="button">Close</button>',
			state: createProtocolStatePayload({
				cells: [
					{
						graphNodeId: 'state:menu',
						name: 'menu',
						valueKind: 'object',
						value: { open: true },
					},
				],
			}),
			view: {
				...viewWithClick(),
				events: [
					{
						hostNodeId: 'h0',
						eventName: 'click',
						syncPolicy: {
							when: {
								type: 'graph-truthy',
								graphNodeId: 'state:menu',
								path: ['open'],
							},
							actions: ['preventDefault'],
						},
						symbolIds: ['symbol:click'],
					},
				],
			},
		}),
		{ executionLog: 'never', resumeModuleUrl },
	);
	const state = extractScriptText(html, 'markless/state');
	const view = JSON.parse(extractScriptText(html, 'markless/view')) as ProtocolViewPayload;
	const resumerSource = extractResumerSource(html);
	expect(resumerSource).toContain('__marklessEventOnlyGraph');
	const button = element('BUTTON');
	const root = element('DIV', [button]);
	const listeners: Array<(event: FakeEvent) => Promise<void>> = [];
	root.querySelector = (selector) => {
		if (selector === 'script[type="markless/state"]') return { textContent: state };
		if (selector === 'script[type="markless/view"]')
			return { textContent: JSON.stringify(view) };
		return null;
	};
	root.addEventListener = (type, listener, options) => {
		const capture =
			options === true || (typeof options === 'object' && options.capture === true);
		if (type === 'click' && capture) listeners.push(listener);
	};
	const document = {
		currentScript: {
			closest(selector: string) {
				return selector === '[data-async-container]' ? root : null;
			},
		},
		createTreeWalker() {
			const nodes = [button];
			return {
				nextNode() {
					return nodes.shift() ?? null;
				},
			};
		},
	};
	const globalScope = globalThis as typeof globalThis & {
		document?: unknown;
		__asyncResumerSyncPolicyTest?: {
			order: string[];
		};
	};
	const previousDocument = globalScope.document;
	const previousTestState = globalScope.__asyncResumerSyncPolicyTest;
	globalScope.document = document;
	globalScope.__asyncResumerSyncPolicyTest = { order: [] };

	try {
		await import(`data:text/javascript,${encodeURIComponent(resumerSource)}`);

		await listeners[0]({
			type: 'click',
			target: button,
			defaultPrevented: false,
			propagationStopped: false,
			preventDefault() {
				globalScope.__asyncResumerSyncPolicyTest?.order.push('preventDefault');
				this.defaultPrevented = true;
			},
			stopPropagation() {
				globalScope.__asyncResumerSyncPolicyTest?.order.push('stopPropagation');
				this.propagationStopped = true;
			},
		} as FakeEvent);

		expect(globalScope.__asyncResumerSyncPolicyTest).toEqual({
			order: ['preventDefault', 'import', 'handler:true:false:true'],
		});
	} finally {
		if (previousDocument === undefined) {
			delete globalScope.document;
		} else {
			globalScope.document = previousDocument;
		}
		if (previousTestState === undefined) {
			delete globalScope.__asyncResumerSyncPolicyTest;
		} else {
			globalScope.__asyncResumerSyncPolicyTest = previousTestState;
		}
	}
});

test('renderToString emits graph sync-policy inline runtime once for repeated payloads', async () => {
	const inlineRuntimeRegistry = new Set<string>();
	const renderContainer = () =>
		renderToString(
			() => ({
				html: '<button type="button">Close</button>',
				state: createProtocolStatePayload({
					cells: [
						{
							graphNodeId: 'state:menu',
							name: 'menu',
							valueKind: 'object',
							value: { open: true },
						},
					],
				}),
				view: {
					...viewWithClick(),
					events: [
						{
							hostNodeId: 'h0',
							eventName: 'click',
							syncPolicy: {
								when: {
									type: 'graph-truthy',
									graphNodeId: 'state:menu',
									path: ['open'],
								},
								actions: ['preventDefault'],
							},
							symbolIds: ['symbol:click'],
						},
					],
				},
			}),
			{ executionLog: 'never', resumeModuleUrl: '/async-resume.js', inlineRuntimeRegistry },
		);
	const documentHtml = (
		await Promise.all([renderContainer(), renderContainer(), renderContainer()])
	).join('');
	const inlineSources = extractAllResumerSources(documentHtml).join('\n');

	expect(
		inlineSources.match(/const __MARKLESS_INLINE_SHARED_GRAPH_POLICY__=true;/g),
	).toHaveLength(1);
	expect(
		inlineSources.match(/const __MARKLESS_INLINE_SHARED_GRAPH_POLICY__=false;/g),
	).toHaveLength(2);
});

test('renderToString inline event resumer reads built-in graph values for sync policy', async () => {
	const resumeModuleUrl = createSyncPolicyResumeModuleUrl('map-policy');
	const html = await renderToString(
		() => ({
			html: '<button type="button">Filter</button>',
			state: createProtocolStatePayload({
				cells: [
					{
						graphNodeId: 'state:filters',
						name: 'filters',
						valueKind: 'object',
						value: new Map([['open', true]]),
					},
				],
			}),
			view: {
				...viewWithClick(),
				events: [
					{
						hostNodeId: 'h0',
						eventName: 'click',
						syncPolicy: {
							when: {
								type: 'graph-truthy',
								graphNodeId: 'state:filters',
								path: [],
							},
							actions: ['preventDefault'],
						},
						symbolIds: ['symbol:click'],
					},
				],
			},
		}),
		{ executionLog: 'never', resumeModuleUrl },
	);
	const state = extractScriptText(html, 'markless/state');
	const view = JSON.parse(extractScriptText(html, 'markless/view')) as ProtocolViewPayload;
	const resumerSource = extractResumerSource(html);
	const button = element('BUTTON');
	const root = element('DIV', [button]);
	const listeners: Array<(event: FakeEvent) => Promise<void>> = [];
	root.querySelector = (selector) => {
		if (selector === 'script[type="markless/state"]') return { textContent: state };
		if (selector === 'script[type="markless/view"]')
			return { textContent: JSON.stringify(view) };
		return null;
	};
	root.addEventListener = (type, listener, options) => {
		const capture =
			options === true || (typeof options === 'object' && options.capture === true);
		if (type === 'click' && capture) listeners.push(listener);
	};
	const document = {
		currentScript: {
			closest(selector: string) {
				return selector === '[data-async-container]' ? root : null;
			},
		},
		createTreeWalker() {
			const nodes = [button];
			return {
				nextNode() {
					return nodes.shift() ?? null;
				},
			};
		},
	};
	const globalScope = globalThis as typeof globalThis & {
		document?: unknown;
		__asyncResumerSyncPolicyTest?: {
			order: string[];
		};
	};
	const previousDocument = globalScope.document;
	const previousTestState = globalScope.__asyncResumerSyncPolicyTest;
	globalScope.document = document;
	globalScope.__asyncResumerSyncPolicyTest = { order: [] };

	try {
		await import(`data:text/javascript,${encodeURIComponent(resumerSource)}`);

		await listeners[0]({
			type: 'click',
			target: button,
			defaultPrevented: false,
			propagationStopped: false,
			preventDefault() {
				globalScope.__asyncResumerSyncPolicyTest?.order.push('preventDefault');
				this.defaultPrevented = true;
			},
			stopPropagation() {
				globalScope.__asyncResumerSyncPolicyTest?.order.push('stopPropagation');
				this.propagationStopped = true;
			},
		} as FakeEvent);

		expect(globalScope.__asyncResumerSyncPolicyTest).toEqual({
			order: ['preventDefault', 'import', 'handler:true:false:true'],
		});
	} finally {
		if (previousDocument === undefined) {
			delete globalScope.document;
		} else {
			globalScope.document = previousDocument;
		}
		if (previousTestState === undefined) {
			delete globalScope.__asyncResumerSyncPolicyTest;
		} else {
			globalScope.__asyncResumerSyncPolicyTest = previousTestState;
		}
	}
});

function extractScriptText(html: string, type: 'markless/state' | 'markless/view'): string {
	const pattern = new RegExp(`<script type="${type}">([\\s\\S]*?)<\\/script>`);
	const match = pattern.exec(html);
	if (!match) throw new Error(`Expected ${type} script.`);
	return match[1]!;
}

function extractResumerSource(html: string): string {
	const match = /<script data-async-resumer\b[^>]*>([\s\S]*?)<\/script>/.exec(html);
	if (!match) throw new Error('Expected inline resumer script.');
	return match[1]!;
}

function extractAllResumerSources(html: string): string[] {
	return [...html.matchAll(/<script data-async-resumer\b[^>]*>([\s\S]*?)<\/script>/g)].map(
		(match) => match[1]!,
	);
}

function createResumeModuleUrl(cacheKey = 'default'): string {
	const source = `
// ${cacheKey}
globalThis.__asyncResumerTest.imports++;
export async function resumeContainerEvent({ root, event }) {
	globalThis.__asyncResumerTest.events.push(event.type + ':' + root.tagName);
}
`;
	return `data:text/javascript,${encodeURIComponent(source)}`;
}

function createQueuedResumeModuleUrl(cacheKey = 'global-queue'): string {
	const source = emitQueuedResumeContainerEvent(`
// ${cacheKey}
export async function resumeContainerEvent({ event }) {
	const state = globalThis.__marklessQueueTest;
	state.order.push('start:' + event.key);
	if (event.key === 'first') await new Promise((resolve) => { state.release = resolve; });
	state.order.push('end:' + event.key);
}
`);
	return `data:text/javascript,${encodeURIComponent(source)}`;
}

function createResumeRuntimeStartedModuleUrl(cacheKey = 'runtime-started'): string {
	const source = emitQueuedResumeContainerEvent(`
// ${cacheKey}
globalThis.__asyncResumerTest.imports++;
export async function resumeContainerEvent({ root, event }) {
	globalThis.__asyncResumerTest.events.push(event.type + ':' + root.tagName);
	root.__asyncResumeRuntimeStarted = true;
	root.__marklessRegisterDispatch?.(({ event: nextEvent }) => {
		globalThis.__asyncResumerTest.events.push('registered:' + nextEvent.type + ':' + root.tagName);
	});
}
`);
	return `data:text/javascript,${encodeURIComponent(source)}`;
}

function createSyncPolicyResumeModuleUrl(cacheKey = 'default'): string {
	const source = `
// ${cacheKey}
globalThis.__asyncResumerSyncPolicyTest.order.push('import');
export async function resumeContainerEvent({ event, syncPolicyAlreadyApplied }) {
	globalThis.__asyncResumerSyncPolicyTest.order.push(
		'handler:' + String(event.defaultPrevented) + ':' + String(event.propagationStopped) + ':' + String(syncPolicyAlreadyApplied),
	);
}
`;
	return `data:text/javascript,${encodeURIComponent(source)}`;
}

test('render self-wakes pending CSR async boundaries only after the render settlement', async () => {
	const startAnchor = {
		nodeType: 8 as const,
		textContent: 'markless:async:boundary:0',
	} as unknown as FakeElement;
	const pending = element('P');
	const endAnchor = {
		nodeType: 8 as const,
		textContent: '/markless:async:boundary:0',
	} as unknown as FakeElement;
	const root = element('MAIN', [startAnchor, pending, endAnchor]);
	const target = {
		children: [] as FakeElement[],
		replaceChildren(...children: FakeElement[]) {
			this.children = children;
		},
	};
	const state = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:userId', name: 'userId', valueKind: 'scalar', value: 'ada' }],
		computed: [
			{
				graphNodeId: 'computed:details',
				name: 'details',
				async: true,
				dependencies: [{ graphNodeId: 'state:userId', path: [] }],
			},
		],
	});
	const view: ProtocolViewPayload = {
		...viewWithAsyncBoundary(),
		locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'main' }],
		asyncBoundaries: viewWithAsyncBoundary().asyncBoundaries.map((boundary) => ({
			...boundary,
			updateSymbolId: 'symbol:boundary-update',
		})),
	};
	const loadedSymbols: string[] = [];
	const replacement = element('SPAN');

	const container = await render(
		() => ({
			root,
			state,
			view,
			loadSymbol(symbolId: string) {
				loadedSymbols.push(symbolId);
				if (symbolId === 'symbol:details-runner') {
					return async ({ key }) => ({ title: `User ${String(key)}` });
				}
				return ({ graph, status }) => ({
					arm: status === 'rejected' ? 1 : 0,
					html: `<span>${String(graph.read('computed:details', ['value', 'title']))}</span>`,
				});
			},
		}),
		{
			target,
			renderBranchHtml: () => [replacement as never],
		},
	);

	// Direct CSR no longer starts the legacy settle chain at render time.
	expect(loadedSymbols).toEqual([]);
	expect(
		root.childNodes.map((child) => (child.nodeType === 8 ? '#comment' : child.tagName)),
	).toEqual(['#comment', 'P', '#comment']);
	// Join the self-wake's single-flight start deterministically.
	await Promise.resolve();
	await container.runtime.start();
	await container.graph.flush?.();
	for (let index = 0; index < 6; index++) await Promise.resolve();

	expect(loadedSymbols).toEqual(['symbol:details-runner', 'symbol:boundary-update']);
	expect(
		root.childNodes.map((child) => (child.nodeType === 8 ? '#comment' : child.tagName)),
	).toEqual(['#comment', 'SPAN', '#comment']);
});

test('SSR renders module-const repeat rows beside a state-driven list', async () => {
	const filename = 'src/static-nav.tsrx';
	const source = `
import { state } from '@markless/core';

const nav = [{ href: '/docs', title: 'Docs' }, { href: '/blog', title: 'Blog' }];

export function StaticNav() @{
	let rows = state([{ id: 'a', label: 'Alpha' }]);
	<main>
		<ul>@for (const entry of nav; key entry.href) { <li>{entry.title}</li> }</ul>
		<ol>@for (const row of rows; key row.id) { <li>{row.label}</li> }</ol>
		<button onClick={() => rows = [...rows, { id: 'b', label: 'Beta' }]}>Add</button>
	</main>
}
`;
	const serverUrl = await captureDispatchModuleUrl(filename, source, [], 'server');
	const global = globalThis as { document?: unknown };
	const previousDocument = global.document;
	global.document = captureDispatchDocument();
	try {
		const serverModule = (await import(serverUrl)) as {
			readonly default: { readonly renderSsr: () => Promise<{ readonly html: string }> };
		};
		const serverOutput = await serverModule.default.renderSsr();
		const root = parseCaptureDispatchHtml(serverOutput.html)[0]!;
		expect(descendants(root, 'LI').map(renderedText)).toEqual(['Docs', 'Blog', 'Alpha']);
	} finally {
		global.document = previousDocument;
	}
});
