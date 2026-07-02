import { isEventAttribute, normalizeEventName, parseModule } from '@tsrx/core';
import { deserializeGraphValue, type SerializedGraphPayload } from '@markless/serializer';
import type {
	PublicRenderModuleArtifact,
	PublicRenderModuleInput,
	SemanticModuleImport,
} from '../../artifacts.ts';
import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import {
	escapeAttribute,
	getComponentFunction,
	getDynamicTagExpression,
	getElementAttributes,
	getElementTagName,
	isHostTagName,
	isIgnorableJsxTextNode as isIgnorableTextNode,
	isPlainHostTemplateNode,
	isSpreadAttribute,
	isStaticTextNode,
	staticTextValue,
	unwrapExpressionContainer,
} from '../../ast/tsrx.ts';
import { emitDirectPublicRenderModule } from './direct-module.ts';

// Emits the optional direct-DOM module used by public render() after the plan proves
// the component shape can run through this specialized path.
export function emitPublicRenderModule(input: PublicRenderModuleInput): PublicRenderModuleArtifact {
	const rootComponentName = input.semanticGraph.components[0]?.name;
	const componentCount = input.semanticGraph.components.length;
	const root = publicRenderRoot(input, rootComponentName);
	const canUseDirectCsrModule =
		!!root && root.propNames.length === 0 && input.semanticGraph.componentEdges.length === 0;
	const moduleSource = canUseDirectCsrModule
		? emitDirectPublicRenderModule({
				componentName: rootComponentName,
				componentCount,
				publicRenderPlan: input.publicRenderPlan,
				protocolState: input.protocolState,
				protocolView: input.protocolView,
				symbolResolver: input.symbolResolver,
			})
		: '';
	const ssrModuleSource = root ? emitPublicSsrRenderModule(input, root) : '';
	const csrModuleSource = !moduleSource && root ? emitPublicCsrRenderModule(input, root) : '';
	return {
		passId: 'public-render-module',
		moduleSource,
		rootExportName: moduleSource ? (rootComponentName ?? null) : null,
		csrModuleSource,
		csrExportName: csrModuleSource ? 'marklessRenderCsr' : null,
		ssrModuleSource,
		ssrExportName: ssrModuleSource ? 'marklessRenderSsr' : null,
		diagnostics: input.publicRenderPlan.diagnostics,
	};
}

function emitPublicCsrRenderModule(
	input: PublicRenderModuleInput,
	rootInfo: PublicRenderRoot,
): string {
	if (!input.publicRenderPlan.rootTemplateHtml) return '';

	const imports = componentImports(input.semanticGraph.componentEdges, '__marklessCsrComponent');
	const valueImports = publicRenderValueImports(
		input.semanticGraph.moduleImports,
		input.semanticGraph.componentEdges,
	);
	const renderContext: CsrRenderContext = {
		mode: 'csr',
		childReplacements: [],
		componentEdges: input.semanticGraph.componentEdges,
		componentImports: new Map(imports.map((item) => [item.componentName, item.localName])),
		callbackSymbols: callbackSymbolIds(input),
		nextComponentEdgeIndex: 0,
		keyedRepeats: input.semanticGraph.keyedRepeats,
		repeatGates: input.publicRenderPlan.repeatGates,
		nextRepeatIndex: 0,
		source: input.source.source,
	};
	const propEvents = collectCsrPropEvents(rootInfo.root, rootInfo.propNames, input.source.source);
	const hostLocators = staticHostLocators(input);

	return [
		...imports.map(emitComponentImport),
		...valueImports.map(emitValueImport),
		'',
		`const marklessCsrHostLocators = ${JSON.stringify(hostLocators)};`,
		'const marklessCsrStateValues = new Map([',
		stateEntries(input).join(',\n'),
		']);',
		'function marklessRenderCsr(props = {}) {',
		destructureProps(rootInfo.propNames),
		...stateLocalLines(input, 'marklessCsrStateValue'),
		'	const marklessCsrRuntimeState = { graph: null };',
		'	const marklessCsrChildren = [];',
		`	const root = marklessCsrRootFromHtml(${emitHtmlNode(rootInfo.root, renderContext)});`,
		...renderContext.childReplacements,
		...propEvents.map(
			(event) =>
				`	marklessCsrAttachPropEvent(root, ${JSON.stringify(event.hostPath)}, ${JSON.stringify(event.eventName)}, ${event.propName});`,
		),
		'	const marklessCsrView = marklessCsrComposeView(root, payloadView, marklessCsrHostLocators, marklessCsrChildren);',
		'	const marklessCsrState = marklessComposeState(payloadState, marklessCsrChildren);',
		'	return {',
		'		root,',
		'		state: marklessCsrState,',
		'		view: marklessCsrView,',
		'		loadSymbol: marklessCsrLoadSymbol,',
		'		connectRuntime(context) { marklessCsrRuntimeState.graph = context.graph; for (const child of marklessCsrChildren) child.output?.connectRuntime?.(context); },',
		'	};',
		'	function marklessCsrCallback(symbolId) {',
		'		return async function marklessCsrCallbackHandler(event) {',
		'			const graph = marklessCsrRuntimeState.graph;',
		'			if (!graph) return;',
		'			const loaded = marklessCsrLoadSymbol(symbolId);',
		'			const symbol = marklessCsrIsThenable(loaded) ? await loaded : loaded;',
		'			const result = symbol({ graph, event, element: root, getElementHandle: () => undefined });',
		'			if (marklessCsrIsThenable(result)) await result;',
		'			await graph.flush?.();',
		'		};',
		'	}',
		'	function marklessCsrLoadSymbol(symbolId) {',
		'		for (const child of marklessCsrChildren) {',
		'			if (symbolId.startsWith(child.symbolPrefix) && child.output?.loadSymbol) {',
		'				return child.output.loadSymbol(symbolId.slice(child.symbolPrefix.length));',
		'			}',
		'		}',
		'		return loadSymbol(symbolId);',
		'	}',
		'}',
		'function marklessCsrStateValue(graphNodeId) { return marklessCsrStateValues.get(graphNodeId); }',
		'function marklessCsrRootFromHtml(html) { const template = document.createElement("template"); template.innerHTML = html; const root = template.content.firstElementChild; if (!root) throw new Error("Markless CSR template did not create a root element."); return root; }',
		'function marklessCsrRenderChild(component, props) { return component?.renderCsr?.(props); }',
		'function marklessCsrReplaceChild(root, index, child) { const placeholder = root.querySelector?.(`[data-markless-csr-child="${index}"]`); if (placeholder && child) placeholder.replaceWith(child); else placeholder?.remove?.(); }',
		'function marklessCsrAttachPropEvent(root, path, eventName, handler) { const element = marklessCsrNodeAtPath(root, path); if (handler && element?.addEventListener) element.addEventListener(eventName, handler); }',
		'function marklessComposeState(state, children) { const childStates = children.map((child) => child.output?.state).filter(Boolean); if (childStates.length === 0) return state; return { ...state, cells: [...(state.cells ?? []), ...childStates.flatMap((childState) => childState.cells ?? [])], computed: [...(state.computed ?? []), ...childStates.flatMap((childState) => childState.computed ?? [])], ...((state.sharedDefinitions || childStates.some((childState) => childState.sharedDefinitions?.length)) ? { sharedDefinitions: [...(state.sharedDefinitions ?? []), ...childStates.flatMap((childState) => childState.sharedDefinitions ?? [])] } : {}) }; }',
		'function marklessCsrComposeView(root, view, hostLocators, children) { const elements = marklessCsrCollectElements(root); const indexByElement = new Map(elements.map((element, index) => [element, index])); const localHostIds = new Set(); const locators = []; for (const locator of hostLocators) { const element = marklessCsrNodeAtPath(root, locator.hostPath); const index = element ? indexByElement.get(element) : undefined; if (index === undefined) continue; localHostIds.add(locator.hostNodeId); locators.push({ hostNodeId: locator.hostNodeId, strategy: "dom-order", index, tagName: locator.tagName }); } const events = view.events.filter((event) => localHostIds.has(event.hostNodeId)); const domUpdates = view.domUpdates.filter((update) => localHostIds.has(update.hostNodeId)); const behaviors = view.behaviors.filter((behavior) => localHostIds.has(behavior.hostNodeId)); const elementHandles = view.elementHandles.filter((handle) => localHostIds.has(handle.hostNodeId)); for (const child of children) marklessCsrAppendChildView({ child, elements, indexByElement, locators, events, domUpdates, behaviors, elementHandles }); locators.sort((a, b) => a.index - b.index); return { ...view, locators, events, domUpdates, behaviors, elementHandles }; }',
		'function marklessCsrAppendChildView(context) { const childView = context.child.output?.view; const childRoot = context.child.output?.root; if (!childView || !childRoot) return; const childElements = marklessCsrCollectElements(childRoot); for (const locator of childView.locators) { const element = childElements[locator.index]; const index = element ? context.indexByElement.get(element) : undefined; if (index === undefined) continue; context.locators.push({ ...locator, hostNodeId: context.child.hostPrefix + locator.hostNodeId, index }); } for (const event of childView.events) context.events.push({ ...event, hostNodeId: context.child.hostPrefix + event.hostNodeId, symbolIds: event.symbolIds.map((symbolId) => context.child.symbolPrefix + symbolId) }); for (const update of childView.domUpdates) { const mapped = marklessCsrRemapChildGraph(update, context.child.graphProps); if (!mapped) continue; context.domUpdates.push({ ...update, hostNodeId: context.child.hostPrefix + update.hostNodeId, graphNodeId: mapped.graphNodeId, path: mapped.path, ...(update.symbolId ? { symbolId: context.child.symbolPrefix + update.symbolId } : {}) }); } for (const behavior of childView.behaviors) context.behaviors.push({ ...behavior, hostNodeId: context.child.hostPrefix + behavior.hostNodeId, ...(behavior.symbolId ? { symbolId: context.child.symbolPrefix + behavior.symbolId } : {}) }); for (const handle of childView.elementHandles) context.elementHandles.push({ ...handle, hostNodeId: context.child.hostPrefix + handle.hostNodeId }); }',
		'function marklessCsrRemapChildGraph(record, graphProps) { if (record.graphNodeId === "prop:props") { const propName = record.path[0]; const binding = graphProps.find((prop) => prop.name === propName); return binding ? { graphNodeId: binding.graphNodeId, path: [...binding.path, ...record.path.slice(1)] } : null; } if (record.graphNodeId.startsWith?.("prop:")) { const propName = record.graphNodeId.slice(5); const binding = graphProps.find((prop) => prop.name === propName); return binding ? { graphNodeId: binding.graphNodeId, path: [...binding.path, ...record.path] } : null; } return { graphNodeId: record.graphNodeId, path: record.path }; }',
		'function marklessCsrCollectElements(root) { const elements = []; const visit = (node) => { if (node?.nodeType === 1) elements.push(node); for (const child of Array.from(node?.childNodes ?? [])) visit(child); }; visit(root); return elements; }',
		'function marklessCsrNodeAtPath(root, path) { let node = root; for (const index of path) { node = node?.childNodes?.[index]; if (!node) return undefined; } return node; }',
		'function marklessCsrIsThenable(value) { return value !== null && (typeof value === "object" || typeof value === "function") && typeof value.then === "function"; }',
		'function marklessCsrText(value) { return marklessCsrEscape(value == null ? "" : String(value)); }',
		'function marklessCsrAttribute(name, value) { return ` ${name}="${marklessCsrEscape(value == null ? "" : String(value))}"`; }',
		'function marklessCsrRepeatRows(items, renderRow, renderEmpty) { const list = Array.isArray(items) ? items : Array.from(items ?? []); if (list.length === 0) return renderEmpty ? renderEmpty() : ""; return list.map(renderRow).join(""); }',
		'function marklessCsrDynamicTagName(value) { if (value === null || value === undefined || value === false || value === "") return null; const tag = String(value); if (!/^[a-zA-Z][a-zA-Z0-9:_.-]*$/.test(tag)) throw new Error("MARKLESS_DYNAMIC_TAG_INVALID: " + tag); return tag; }',
		'function marklessCsrSpreadAttributes(values) { let html = ""; for (const key of Object.keys(values ?? {})) { if (!/^[A-Za-z_][\\w.:-]*$/.test(key) || /^on[A-Z]/.test(key) || key === "attach" || key === "el" || key === "children") continue; const value = values[key]; if (value === null || value === undefined || value === false) continue; html += value === true ? ` ${key}=""` : marklessCsrAttribute(key, value); } return html; }',
		'function marklessCsrEscape(value) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\\"", "&quot;"); }',
		'',
	]
		.filter((part): part is string => part !== null && part !== '')
		.join('\n');
}

function emitPublicSsrRenderModule(
	input: PublicRenderModuleInput,
	rootInfo: PublicRenderRoot,
): string {
	if (!input.publicRenderPlan.rootTemplateHtml && !isComponentRoot(rootInfo.root)) return '';

	const imports = componentImports(input.semanticGraph.componentEdges, '__marklessSsrComponent');
	const valueImports = publicRenderValueImports(
		input.semanticGraph.moduleImports,
		input.semanticGraph.componentEdges,
	);
	const renderContext: SsrRenderContext = {
		mode: 'ssr',
		componentEdges: input.semanticGraph.componentEdges,
		componentImports: new Map(imports.map((item) => [item.componentName, item.localName])),
		callbackSymbols: callbackSymbolIds(input),
		nextComponentEdgeIndex: 0,
		nextChildIndex: 0,
		hostIdByNode: assignSsrHostIds(
			rootInfo.root,
			input.semanticGraph.hostNodes.map((host) => host.id),
		),
		keyedRepeats: input.semanticGraph.keyedRepeats,
		repeatGates: input.publicRenderPlan.repeatGates,
		nextRepeatIndex: 0,
		insideRepeatRow: false,
		source: input.source.source,
	};
	const hostLocators = staticHostLocators(input);
	const propEvents = collectSsrPropEvents(
		rootInfo.root,
		rootInfo.propNames,
		input.source.source,
		hostLocators,
	);
	const htmlExpression = emitHtmlNode(rootInfo.root, renderContext);

	return [
		...imports.map(emitComponentImport),
		...valueImports.map(emitValueImport),
		'',
		`const marklessSsrPropEvents = ${JSON.stringify(propEvents)};`,
		'const marklessSsrStateValues = new Map([',
		stateEntries(input).join(',\n'),
		']);',
		'function marklessRenderSsr(props = {}) {',
		destructureProps(rootInfo.propNames),
		...stateLocalLines(input, 'marklessSsrStateValue'),
		'	const marklessSsrChildren = [];',
		'	const marklessSsrHostLocators = [];',
		`	const html = ${htmlExpression};`,
		'	const marklessSsrComposition = marklessSsrComposeView(payloadView, marklessSsrHostLocators, marklessSsrChildren);',
		'	const marklessSsrState = marklessComposeState(payloadState, marklessSsrChildren);',
		'	return {',
		'		html,',
		'		state: marklessSsrState,',
		'		view: marklessSsrComposition.view,',
		'		propEvents: marklessSsrPropEvents,',
		'		externalSymbolIds: marklessSsrComposition.externalSymbolIds,',
		'	};',
		'}',
		'function marklessSsrStateValue(graphNodeId) { return marklessSsrStateValues.get(graphNodeId); }',
		'function marklessSsrRenderChild(children, component, props, child) { const output = component?.renderSsr?.(props); if (output) children.push({ ...child, output, callbackProps: props?.__marklessSsrCallbacks ?? {} }); return output?.html ?? ""; }',
		'function marklessSsrHost(hostLocators, hostNodeId, tagName) { hostLocators.push({ hostNodeId, strategy: "dom-order", index: hostLocators.length + (hostLocators.marklessSsrExtraElements ?? 0), tagName }); return ""; }',
		'function marklessSsrDynamicTagName(hostLocators, value) { if (value === null || value === undefined || value === false || value === "") return null; const tag = String(value); if (!/^[a-zA-Z][a-zA-Z0-9:_.-]*$/.test(tag)) throw new Error("MARKLESS_DYNAMIC_TAG_INVALID: " + tag); hostLocators.marklessSsrExtraElements = (hostLocators.marklessSsrExtraElements ?? 0) + 1; return tag; }',
		'function marklessSsrRepeatRows(hostLocators, items, renderRow, elementsPerRow, renderEmpty) { const list = Array.isArray(items) ? items : Array.from(items ?? []); if (list.length === 0) return renderEmpty ? renderEmpty() : ""; const html = list.map(renderRow).join(""); hostLocators.marklessSsrExtraElements = (hostLocators.marklessSsrExtraElements ?? 0) + list.length * elementsPerRow; return html; }',
		'function marklessSsrCallbacks(callbacks) { const result = {}; for (const key of Object.keys(callbacks)) if (callbacks[key]) result[key] = callbacks[key]; return result; }',
		'function marklessSsrCallbackSymbol(props, path) { let value = props?.__marklessSsrCallbacks; for (const key of path) value = value?.[key]; return typeof value === "string" ? value : undefined; }',
		'function marklessComposeState(state, children) { const childStates = children.map((child) => child.output?.state).filter(Boolean); if (childStates.length === 0) return state; return { ...state, cells: [...(state.cells ?? []), ...childStates.flatMap((childState) => childState.cells ?? [])], computed: [...(state.computed ?? []), ...childStates.flatMap((childState) => childState.computed ?? [])], ...((state.sharedDefinitions || childStates.some((childState) => childState.sharedDefinitions?.length)) ? { sharedDefinitions: [...(state.sharedDefinitions ?? []), ...childStates.flatMap((childState) => childState.sharedDefinitions ?? [])] } : {}) }; }',
		'function marklessSsrComposeView(view, hostLocators, children) { const localHostIds = new Set(hostLocators.map((locator) => locator.hostNodeId)); const childData = children.map((child) => ({ ...child, view: child.output?.view, hostCount: child.output?.view?.locators?.length ?? 0, externalSymbolIds: new Set(child.output?.externalSymbolIds ?? []) })).filter((child) => child.view); const offsetFor = (index) => childData.reduce((total, child) => total + (child.localIndex <= index ? child.hostCount : 0), 0); const locators = hostLocators.map((locator) => ({ ...locator, index: locator.index + offsetFor(locator.index) })); const events = view.events.filter((event) => localHostIds.has(event.hostNodeId)); const domUpdates = view.domUpdates.filter((update) => localHostIds.has(update.hostNodeId)); const behaviors = view.behaviors.filter((behavior) => localHostIds.has(behavior.hostNodeId)); const elementHandles = view.elementHandles.filter((handle) => localHostIds.has(handle.hostNodeId)); const externalSymbolIds = new Set(); let inserted = 0; for (const child of childData) { marklessSsrAppendChildView({ child, baseIndex: child.localIndex + inserted, locators, events, domUpdates, behaviors, elementHandles, externalSymbolIds }); inserted += child.hostCount; } locators.sort((a, b) => a.index - b.index); return { view: { ...view, locators, events, domUpdates, behaviors, elementHandles }, externalSymbolIds: [...externalSymbolIds] }; }',
		'function marklessSsrAppendChildView(context) { const childView = context.child.view; const propEvents = context.child.output?.propEvents ?? []; const callbackProps = context.child.callbackProps ?? {}; for (const locator of childView.locators) context.locators.push({ ...locator, hostNodeId: context.child.hostPrefix + locator.hostNodeId, index: context.baseIndex + locator.index }); for (const event of childView.events) { const propEvent = propEvents.find((item) => item.hostNodeId === event.hostNodeId && item.eventName === event.eventName); const callbackSymbolId = propEvent ? callbackProps[propEvent.propName] : undefined; const symbolIds = callbackSymbolId ? [callbackSymbolId] : event.symbolIds.map((symbolId) => context.child.externalSymbolIds.has(symbolId) ? symbolId : context.child.symbolPrefix + symbolId); for (const symbolId of symbolIds) if (callbackSymbolId || context.child.externalSymbolIds.has(symbolId)) context.externalSymbolIds.add(symbolId); context.events.push({ ...event, hostNodeId: context.child.hostPrefix + event.hostNodeId, symbolIds }); } for (const update of childView.domUpdates) { const mapped = marklessSsrRemapChildGraph(update, context.child.graphProps); if (!mapped) continue; context.domUpdates.push({ ...update, hostNodeId: context.child.hostPrefix + update.hostNodeId, graphNodeId: mapped.graphNodeId, path: mapped.path, ...(update.symbolId ? { symbolId: context.child.symbolPrefix + update.symbolId } : {}) }); } for (const behavior of childView.behaviors) context.behaviors.push({ ...behavior, hostNodeId: context.child.hostPrefix + behavior.hostNodeId, ...(behavior.symbolId ? { symbolId: context.child.symbolPrefix + behavior.symbolId } : {}) }); for (const handle of childView.elementHandles) context.elementHandles.push({ ...handle, hostNodeId: context.child.hostPrefix + handle.hostNodeId }); }',
		'function marklessSsrRemapChildGraph(record, graphProps) { if (record.graphNodeId === "prop:props") { const propName = record.path[0]; const binding = graphProps.find((prop) => prop.name === propName); return binding ? { graphNodeId: binding.graphNodeId, path: [...binding.path, ...record.path.slice(1)] } : null; } if (record.graphNodeId.startsWith?.("prop:")) { const propName = record.graphNodeId.slice(5); const binding = graphProps.find((prop) => prop.name === propName); return binding ? { graphNodeId: binding.graphNodeId, path: [...binding.path, ...record.path] } : null; } return { graphNodeId: record.graphNodeId, path: record.path }; }',
		'function marklessSsrText(value) { return marklessSsrEscape(value == null ? "" : String(value)); }',
		'function marklessSsrAttribute(name, value) { return ` ${name}="${marklessSsrEscape(value == null ? "" : String(value))}"`; }',
		'function marklessSsrSpreadAttributes(values) { let html = ""; for (const key of Object.keys(values ?? {})) { if (!/^[A-Za-z_][\\w.:-]*$/.test(key) || /^on[A-Z]/.test(key) || key === "attach" || key === "el" || key === "children") continue; const value = values[key]; if (value === null || value === undefined || value === false) continue; html += value === true ? ` ${key}=""` : marklessSsrAttribute(key, value); } return html; }',
		'function marklessSsrEscape(value) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\\"", "&quot;"); }',
		'',
	]
		.filter((part): part is string => part !== null && part !== '')
		.join('\n');
}

type SsrRenderContext = {
	readonly mode: 'ssr';
	readonly componentEdges: PublicRenderModuleInput['semanticGraph']['componentEdges'];
	readonly componentImports: ReadonlyMap<string, string>;
	readonly callbackSymbols: ReadonlyMap<string, string>;
	nextComponentEdgeIndex: number;
	nextChildIndex: number;
	readonly hostIdByNode: ReadonlyMap<AnyNode, string>;
	readonly keyedRepeats: PublicRenderModuleInput['semanticGraph']['keyedRepeats'];
	readonly repeatGates: PublicRenderModuleInput['publicRenderPlan']['repeatGates'];
	nextRepeatIndex: number;
	readonly insideRepeatRow: boolean;
	readonly source: string;
};

type CsrRenderContext = {
	readonly mode: 'csr';
	readonly childReplacements: string[];
	readonly componentEdges: PublicRenderModuleInput['semanticGraph']['componentEdges'];
	readonly componentImports: ReadonlyMap<string, string>;
	readonly callbackSymbols: ReadonlyMap<string, string>;
	nextComponentEdgeIndex: number;
	// Optional because component-children emission builds a partial context;
	// repeats inside projected children keep the prior render-nothing behavior.
	readonly keyedRepeats?: PublicRenderModuleInput['semanticGraph']['keyedRepeats'];
	readonly repeatGates?: PublicRenderModuleInput['publicRenderPlan']['repeatGates'];
	nextRepeatIndex?: number;
	readonly source: string;
};

type HtmlRenderContext = SsrRenderContext | CsrRenderContext;

type PublicRenderRoot = {
	readonly root: AnyNode;
	readonly propNames: ReadonlyArray<string>;
};

type ComponentEdge = PublicRenderModuleInput['semanticGraph']['componentEdges'][number];

function publicRenderRoot(
	input: PublicRenderModuleInput,
	componentName: string | undefined,
): PublicRenderRoot | null {
	const ast = parseModule(input.source.source, input.source.filename) as unknown as AnyNode;
	const component = findComponent(ast, componentName);
	const root = firstComponentRoot(component);
	return component && root ? { root, propNames: componentPropNames(component) } : null;
}

function isComponentRoot(root: AnyNode): boolean {
	const tagName = getElementTagName(root);
	return !!tagName && !isHostTagName(tagName);
}

function callbackSymbolIds(input: PublicRenderModuleInput): ReadonlyMap<string, string> {
	return new Map(
		input.symbolResolver.symbols.flatMap((symbol) =>
			symbol.kind === 'callback-prop'
				? [[`${symbol.componentEdgeId}:${symbol.propName}`, symbol.id]]
				: [],
		),
	);
}

function stateLocalLines(input: PublicRenderModuleInput, readStateFunctionName: string): string[] {
	return input.semanticGraph.graphBindings.flatMap((binding) =>
		binding.kind === 'state'
			? [`	let ${binding.name} = ${readStateFunctionName}(${JSON.stringify(binding.id)});`]
			: [],
	);
}

function destructureProps(propNames: ReadonlyArray<string>): string | null {
	return propNames.length > 0 ? `	const { ${propNames.join(', ')} } = props ?? {};` : null;
}

function staticHostLocators(input: PublicRenderModuleInput) {
	return input.publicRenderPlan.staticHostLocators.map((locator) => ({
		hostNodeId: locator.hostNodeId,
		tagName: locator.tagName,
		hostPath: locator.hostPath,
	}));
}

function componentImports(
	componentEdges: PublicRenderModuleInput['semanticGraph']['componentEdges'],
	localPrefix: string,
) {
	const imports: {
		readonly componentName: string;
		readonly importSource: string;
		readonly importKind?: ComponentEdge['importKind'];
		readonly importedName?: string;
		readonly localName: string;
	}[] = [];

	for (const edge of componentEdges) {
		if (!edge.importSource) continue;
		if (imports.some((item) => item.componentName === edge.childComponentName)) continue;
		imports.push({
			componentName: edge.childComponentName,
			importSource: edge.importSource,
			importKind: edge.importKind,
			importedName: edge.importedName,
			localName: `${localPrefix}${imports.length}`,
		});
	}

	return imports;
}

function emitComponentImport(imported: {
	readonly importSource: string;
	readonly importKind?: ComponentEdge['importKind'];
	readonly importedName?: string;
	readonly localName: string;
	readonly componentName: string;
}): string {
	if (imported.importKind === 'named' && !isTsrxComponentImport(imported.importSource)) {
		return `import { ${imported.importedName ?? imported.componentName} as ${imported.localName} } from ${JSON.stringify(imported.importSource)};`;
	}
	return `import ${imported.localName} from ${JSON.stringify(imported.importSource)};`;
}

function isTsrxComponentImport(importSource: string): boolean {
	return /\.tsrx(?:[?#].*)?$/.test(importSource);
}

function publicRenderValueImports(
	moduleImports: ReadonlyArray<SemanticModuleImport>,
	componentEdges: PublicRenderModuleInput['semanticGraph']['componentEdges'],
): ReadonlyArray<SemanticModuleImport> {
	const componentLocalNames = new Set(componentEdges.map((edge) => edge.childComponentName));
	return moduleImports.filter((moduleImport) => !componentLocalNames.has(moduleImport.localName));
}

function emitValueImport(moduleImport: SemanticModuleImport): string {
	const source = JSON.stringify(moduleImport.source);
	if (moduleImport.kind === 'named') {
		const importedName = moduleImport.importedName ?? moduleImport.localName;
		return importedName === moduleImport.localName
			? `import { ${importedName} } from ${source};`
			: `import { ${importedName} as ${moduleImport.localName} } from ${source};`;
	}
	if (moduleImport.kind === 'namespace') {
		return `import * as ${moduleImport.localName} from ${source};`;
	}
	return `import ${moduleImport.localName} from ${source};`;
}

function assignSsrHostIds(
	root: AnyNode,
	hostNodeIds: ReadonlyArray<string>,
): ReadonlyMap<AnyNode, string> {
	const hostIdByNode = new Map<AnyNode, string>();
	let index = 0;

	const visit = (node: AnyNode | null | undefined): void => {
		if (!node || typeof node !== 'object') return;

		if (node.type === 'Element' || node.type === 'JSXElement') {
			const tagName = getElementTagName(node);
			if (tagName && isHostTagName(tagName)) {
				const hostNodeId = hostNodeIds[index++];
				if (hostNodeId) hostIdByNode.set(node, hostNodeId);
			}
		}

		for (const child of childNodes(node)) visit(child);
	};

	visit(root);
	return hostIdByNode;
}

function stateEntries(input: PublicRenderModuleInput): string[] {
	return input.protocolState.cells.flatMap((cell) => {
		if (cell.value === undefined || cell.valueKind === 'unknown') return [];
		const value = deserializeGraphValue(cell.value as SerializedGraphPayload);
		return `	[${JSON.stringify(cell.graphNodeId)}, ${JSON.stringify(value)}]`;
	});
}

function emitHtmlNode(node: AnyNode, context: HtmlRenderContext): string {
	if (isStaticTextNode(node)) return JSON.stringify(staticTextValue(node));

	if (node.type === 'JSXExpressionContainer' || node.type === 'TSRXExpression') {
		const expression = node.expression as AnyNode | undefined;
		return expression
			? `${renderHelper(context, 'Text')}(${expressionSource(expression, context.source)})`
			: '""';
	}

	if (node.type === 'JSXIfExpression') {
		const test = node.test as AnyNode | undefined;
		const testSource = test ? expressionSource(test, context.source) : 'false';
		if (context.mode === 'csr') {
			return `(${testSource} ? ${emitHtmlBranch(node.consequent as AnyNode | undefined, context)} : ${emitHtmlBranch(node.alternate as AnyNode | undefined, context)})`;
		}

		const before = {
			nextChildIndex: context.nextChildIndex,
			nextComponentEdgeIndex: context.nextComponentEdgeIndex,
		};
		const consequentContext: SsrRenderContext = { ...context };
		const consequent = emitHtmlBranch(
			node.consequent as AnyNode | undefined,
			consequentContext,
		);
		const alternateContext = {
			...context,
			nextChildIndex: before.nextChildIndex,
			nextComponentEdgeIndex: before.nextComponentEdgeIndex,
		};
		const alternate = emitHtmlBranch(node.alternate as AnyNode | undefined, alternateContext);
		context.nextChildIndex = Math.max(
			consequentContext.nextChildIndex,
			alternateContext.nextChildIndex,
		);
		context.nextComponentEdgeIndex = Math.max(
			consequentContext.nextComponentEdgeIndex,
			alternateContext.nextComponentEdgeIndex,
		);
		return `(${testSource} ? ${consequent} : ${alternate})`;
	}

	if (node.type === 'JSXSwitchExpression') {
		return emitSwitchHtml(node, context);
	}

	if (node.type === 'JSXForExpression') {
		return context.mode === 'ssr'
			? emitSsrRepeatRows(node, context)
			: emitCsrRepeatRows(node, context);
	}

	if (node.type === 'ExpressionStatement') {
		const expression = node.expression as AnyNode | undefined;
		return expression ? emitHtmlNode(expression, context) : '""';
	}

	if (node.type !== 'Element' && node.type !== 'JSXElement') {
		return emitHtmlChildren(node, context);
	}

	const tagName = getElementTagName(node);
	if (!tagName) return emitDynamicTagHtml(node, context);
	if (!isHostTagName(tagName)) {
		return context.mode === 'ssr'
			? emitSsrComponent(node, tagName, context)
			: emitCsrComponent(node, tagName, context);
	}
	const hostLocator = context.mode === 'ssr' ? ssrHostLocator(node, tagName, context) : '""';

	if (getElementAttributes(node).some(isSpreadAttribute)) {
		return joinSsrExpressions([
			hostLocator,
			JSON.stringify(`<${tagName}`),
			`${renderHelper(context, 'SpreadAttributes')}({ ${mergedAttributeEntries(node, context.source).join(', ')} })`,
			JSON.stringify('>'),
			emitHtmlChildren(node, context),
			JSON.stringify(`</${tagName}>`),
		]);
	}

	const open = [`<${tagName}`];
	const dynamicAttributes: string[] = [];
	for (const attribute of getElementAttributes(node)) {
		const name = getIdentifierName(attribute.name as AnyNode | undefined);
		if (!name || isEventAttribute(name) || name === 'attach' || name === 'el') continue;
		const value = attribute.value as AnyNode | undefined;
		const expression = unwrapExpressionContainer(value);
		if (!value) {
			open.push(` ${name}=""`);
		} else if (value.type === 'Literal' && typeof value.value !== 'object') {
			open.push(` ${name}="${escapeAttribute(String(value.value))}"`);
		} else if (expression?.type === 'Literal' && typeof expression.value !== 'object') {
			open.push(` ${name}="${escapeAttribute(String(expression.value))}"`);
		} else if (expression) {
			dynamicAttributes.push(
				`${renderHelper(context, 'Attribute')}(${JSON.stringify(name)}, ${expressionSource(expression, context.source)})`,
			);
		}
	}

	const openExpression =
		dynamicAttributes.length === 0
			? [JSON.stringify(`${open.join('')}>`)]
			: [JSON.stringify(open.join('')), ...dynamicAttributes, JSON.stringify('>')];

	return joinSsrExpressions([
		hostLocator,
		...openExpression,
		emitHtmlChildren(node, context),
		JSON.stringify(`</${tagName}>`),
	]);
}

function ssrHostLocator(node: AnyNode, tagName: string, context: SsrRenderContext): string {
	// Row instances repeat per item, so a single dom-order locator cannot name
	// them yet; branch/list locator streams own that later. Rows render without
	// locators and marklessSsrRepeatRows shifts the indexes of later hosts.
	if (context.insideRepeatRow) return '""';
	const hostNodeId = context.hostIdByNode.get(node);
	return hostNodeId
		? `marklessSsrHost(marklessSsrHostLocators, ${JSON.stringify(hostNodeId)}, ${JSON.stringify(tagName)})`
		: '""';
}

// Emits SSR html for a supported keyed repeat by mapping the live collection
// through the authored row template. Bails to the empty string (the prior
// behavior) whenever the row shape is not a single all-host-element subtree.
function emitSsrRepeatRows(node: AnyNode, context: SsrRenderContext): string {
	const repeat = context.keyedRepeats[context.nextRepeatIndex++];
	if (!repeat) return '""';
	const gate = context.repeatGates.find((item) => item.repeatId === repeat.id);
	if (!gate?.supported) return '""';
	if (context.componentEdges.length > 0) return '""';

	const row = singleRepeatRowElement(node);
	if (!row || !isPlainHostTemplateNode(row)) return '""';

	// The @empty branch renders at most once, so it emits with the normal
	// context: its locators push only when the branch is actually taken.
	const emptyBlock = node.empty as AnyNode | undefined;
	const emptyChildren = emptyBlock
		? asNodes(emptyBlock.body).filter((child) => !isIgnorableTextNode(child))
		: [];
	if (emptyChildren.some((child) => !isPlainHostTemplateNode(child))) return '""';

	const rowContext: SsrRenderContext = { ...context, insideRepeatRow: true };
	const rowHtml = emitHtmlNode(row, rowContext);
	const rowParams = repeat.indexName
		? `(${repeat.itemName}, ${repeat.indexName})`
		: `(${repeat.itemName})`;
	const emptyThunk =
		emptyChildren.length > 0
			? `() => ${joinSsrExpressions(emptyChildren.map((child) => emitHtmlNode(child, context)))}`
			: 'null';
	return `marklessSsrRepeatRows(marklessSsrHostLocators, ${repeat.collectionSource}, ${rowParams} => ${rowHtml}, ${countRowElements(row)}, ${emptyThunk})`;
}

// CSR string emission for supported keyed repeats. Unlike SSR there is no
// locator-index bookkeeping: CSR composition resolves hosts through authored
// child paths, and supported repeat parents contain only the repeat, so row
// insertion cannot shift any sibling path.
function emitCsrRepeatRows(node: AnyNode, context: CsrRenderContext): string {
	if (!context.keyedRepeats || !context.repeatGates) return '""';
	const repeat = context.keyedRepeats[context.nextRepeatIndex ?? 0];
	context.nextRepeatIndex = (context.nextRepeatIndex ?? 0) + 1;
	if (!repeat) return '""';
	const gate = context.repeatGates.find((item) => item.repeatId === repeat.id);
	if (!gate?.supported) return '""';

	const row = singleRepeatRowElement(node);
	if (!row || !isPlainHostTemplateNode(row)) return '""';

	const emptyBlock = node.empty as AnyNode | undefined;
	const emptyChildren = emptyBlock
		? asNodes(emptyBlock.body).filter((child) => !isIgnorableTextNode(child))
		: [];
	if (emptyChildren.some((child) => !isPlainHostTemplateNode(child))) return '""';

	const rowHtml = emitHtmlNode(row, context);
	const rowParams = repeat.indexName
		? `(${repeat.itemName}, ${repeat.indexName})`
		: `(${repeat.itemName})`;
	const emptyThunk =
		emptyChildren.length > 0
			? `() => ${joinSsrExpressions(emptyChildren.map((child) => emitHtmlNode(child, context)))}`
			: 'null';
	return `marklessCsrRepeatRows(${repeat.collectionSource}, ${rowParams} => ${rowHtml}, ${emptyThunk})`;
}

function singleRepeatRowElement(node: AnyNode): AnyNode | null {
	const children = asNodes((node.body as AnyNode | undefined)?.body).filter(
		(child) => !isIgnorableTextNode(child),
	);
	const [row] = children;
	if (children.length !== 1 || !row) return null;
	return row.type === 'Element' || row.type === 'JSXElement' ? row : null;
}

function countRowElements(node: AnyNode): number {
	const isElement = node.type === 'Element' || node.type === 'JSXElement' ? 1 : 0;
	return asNodes(node.children).reduce(
		(total, child) => total + countRowElements(child),
		isElement,
	);
}

// Dynamic <{expr}> tags resolve the tag value at render time. The runtime
// helper is the XSS gate: it rejects non-tag-name strings before any string
// concatenation, renders nothing for nullish/false/empty values, and (SSR)
// counts the rendered element so later dom-order locators stay correct.
function emitDynamicTagHtml(node: AnyNode, context: HtmlRenderContext): string {
	const tagExpression = getDynamicTagExpression(node);
	if (!tagExpression) return '""';

	const attributeEntries = mergedAttributeEntries(node, context.source);
	const attributesExpression =
		attributeEntries.length > 0
			? `${renderHelper(context, 'SpreadAttributes')}({ ${attributeEntries.join(', ')} })`
			: '""';
	const tagValueExpression =
		context.mode === 'ssr'
			? `marklessSsrDynamicTagName(marklessSsrHostLocators, ${expressionSource(tagExpression, context.source)})`
			: `marklessCsrDynamicTagName(${expressionSource(tagExpression, context.source)})`;

	return `((marklessDynamicTag) => marklessDynamicTag ? ${joinSsrExpressions([
		'("<" + marklessDynamicTag)',
		attributesExpression,
		JSON.stringify('>'),
		emitHtmlChildren(node, context),
		'("</" + marklessDynamicTag + ">")',
	])} : "")(${tagValueExpression})`;
}

// @switch renders as one IIFE binding the discriminant once (so getters and
// calls are not re-evaluated per case) around a strict-equality ternary chain.
// No matching case and no @default renders nothing, matching @if's untaken
// branch behavior.
function emitSwitchHtml(node: AnyNode, context: HtmlRenderContext): string {
	const discriminant = node.discriminant as AnyNode | undefined;
	const discriminantSource = discriminant
		? expressionSource(discriminant, context.source)
		: 'undefined';

	const before =
		context.mode === 'ssr'
			? {
					nextChildIndex: context.nextChildIndex,
					nextComponentEdgeIndex: context.nextComponentEdgeIndex,
				}
			: null;
	let maxChildIndex = before?.nextChildIndex ?? 0;
	let maxComponentEdgeIndex = before?.nextComponentEdgeIndex ?? 0;

	const emitCaseBody = (switchCase: AnyNode): string => {
		const children = asNodes(switchCase.consequent);
		if (context.mode === 'csr' || !before) {
			return joinSsrExpressions(children.map((child) => emitHtmlNode(child, context)));
		}
		const caseContext: SsrRenderContext = { ...context, ...before };
		const body = joinSsrExpressions(children.map((child) => emitHtmlNode(child, caseContext)));
		maxChildIndex = Math.max(maxChildIndex, caseContext.nextChildIndex);
		maxComponentEdgeIndex = Math.max(maxComponentEdgeIndex, caseContext.nextComponentEdgeIndex);
		return body;
	};

	let defaultBody = '""';
	const testedCases: Array<{ readonly testSource: string; readonly body: string }> = [];
	for (const switchCase of asNodes(node.cases)) {
		const test = switchCase.test as AnyNode | undefined;
		const body = emitCaseBody(switchCase);
		if (!test) {
			defaultBody = body;
			continue;
		}
		testedCases.push({ testSource: expressionSource(test, context.source), body });
	}

	if (context.mode === 'ssr' && before) {
		context.nextChildIndex = maxChildIndex;
		context.nextComponentEdgeIndex = maxComponentEdgeIndex;
	}

	let expression = defaultBody;
	for (const testedCase of [...testedCases].reverse()) {
		expression = `(marklessSwitchValue === (${testedCase.testSource}) ? ${testedCase.body} : ${expression})`;
	}
	return `((marklessSwitchValue) => ${expression})(${discriminantSource})`;
}

function emitHtmlBranch(node: AnyNode | undefined, context: HtmlRenderContext): string {
	if (!node) return '""';
	if (node.type === 'BlockStatement') {
		return joinSsrExpressions(asNodes(node.body).map((child) => emitHtmlNode(child, context)));
	}
	return emitHtmlNode(node, context);
}

function emitHtmlChildren(node: AnyNode, context: HtmlRenderContext): string {
	return joinSsrExpressions(
		asNodes(node.children ?? node.body).map((child) => emitHtmlNode(child, context)),
	);
}

function renderHelper(
	context: HtmlRenderContext,
	helper: 'Attribute' | 'SpreadAttributes' | 'Text',
): string {
	return `markless${context.mode === 'ssr' ? 'Ssr' : 'Csr'}${helper}`;
}

// Elements with a spread merge every attribute into one object so JS object
// semantics decide override order; the runtime helper renders the merged entries.
function mergedAttributeEntries(node: AnyNode, source: string): string[] {
	return getElementAttributes(node).flatMap((attribute) => {
		if (isSpreadAttribute(attribute)) {
			const argument = attribute.argument as AnyNode | undefined;
			return argument ? [`...(${expressionSource(argument, source)})`] : [];
		}
		const name = getIdentifierName(attribute.name as AnyNode | undefined);
		if (!name || isEventAttribute(name) || name === 'attach' || name === 'el') return [];
		const value = attribute.value as AnyNode | undefined;
		const expression = unwrapExpressionContainer(value);
		if (!value) return [`${objectPropertyName(name)}: true`];
		if (value.type === 'Literal') {
			return [`${objectPropertyName(name)}: ${JSON.stringify(value.value)}`];
		}
		if (expression)
			return [`${objectPropertyName(name)}: ${expressionSource(expression, source)}`];
		return [];
	});
}

function emitSsrComponent(node: AnyNode, componentName: string, context: SsrRenderContext): string {
	const localName = context.componentImports.get(componentName);
	if (!localName) return '""';
	const edge = context.componentEdges[context.nextComponentEdgeIndex++];
	const childIndex = context.nextChildIndex++;
	const props = ssrComponentPropsSource(node, context, edge, context.callbackSymbols);
	const placement = {
		hostPrefix: `c${childIndex}:`,
		symbolPrefix: `c${childIndex}:`,
		graphProps: graphReferenceProps(edge),
	};

	return `marklessSsrRenderChild(marklessSsrChildren, ${localName}, { ${props.join(', ')} }, { hostPrefix: ${JSON.stringify(placement.hostPrefix)}, symbolPrefix: ${JSON.stringify(placement.symbolPrefix)}, localIndex: marklessSsrHostLocators.length, graphProps: ${JSON.stringify(placement.graphProps)} })`;
}

function emitCsrComponent(node: AnyNode, componentName: string, context: CsrRenderContext): string {
	const localName = context.componentImports.get(componentName);
	if (!localName) return '""';
	const index = context.childReplacements.length;
	const edge = context.componentEdges[context.nextComponentEdgeIndex++];
	const props = componentPropsSource(node, context.source, edge, context.callbackSymbols);
	const childName = `marklessCsrChild${index}`;
	context.childReplacements.push(
		`	const ${childName} = marklessCsrRenderChild(${localName}, { ${props.join(', ')} });`,
		`	marklessCsrReplaceChild(root, ${index}, ${childName}?.root);`,
		`	marklessCsrChildren.push({ hostPrefix: ${JSON.stringify(`c${index}:`)}, symbolPrefix: ${JSON.stringify(`c${index}:`)}, output: ${childName}, graphProps: ${JSON.stringify(graphReferenceProps(edge))} });`,
	);
	return JSON.stringify(`<span data-markless-csr-child="${index}"></span>`);
}

function componentPropsSource(
	node: AnyNode,
	source: string,
	edge: ComponentEdge | undefined,
	callbackSymbols: ReadonlyMap<string, string>,
): string[] {
	const props = getElementAttributes(node).flatMap((attribute) => {
		const name = getIdentifierName(attribute.name as AnyNode | undefined);
		if (!name) return [];
		const callbackSymbolId = edge ? callbackSymbols.get(`${edge.id}:${name}`) : undefined;
		if (callbackSymbolId) {
			return `${objectPropertyName(name)}: marklessCsrCallback(${JSON.stringify(callbackSymbolId)})`;
		}
		return componentAttributePropSource(attribute, source);
	});
	const children = emitHtmlChildren(node, { mode: 'csr', source });
	if (children !== '""') {
		props.push(`children: ${children}`);
	}
	return props;
}

function ssrComponentPropsSource(
	node: AnyNode,
	context: SsrRenderContext,
	edge: ComponentEdge | undefined,
	callbackSymbols: ReadonlyMap<string, string>,
): string[] {
	const props = getElementAttributes(node).flatMap((attribute) =>
		componentAttributePropSource(attribute, context.source),
	);
	const children = emitHtmlChildren(node, context);
	if (children !== '""') {
		props.push(`children: ${children}`);
	}
	const callbackEntries = (edge?.props ?? []).flatMap((prop) => {
		const callbackSymbolId = edge ? callbackSymbols.get(`${edge.id}:${prop.name}`) : undefined;
		if (callbackSymbolId) {
			return `${JSON.stringify(prop.name)}: ${JSON.stringify(callbackSymbolId)}`;
		}
		if (prop.kind !== 'graph-reference') return [];
		if (prop.graphNodeId === 'prop:props') {
			return `${JSON.stringify(prop.name)}: marklessSsrCallbackSymbol(props, ${JSON.stringify(prop.path)})`;
		}
		if (prop.graphNodeId.startsWith('prop:')) {
			return `${JSON.stringify(prop.name)}: marklessSsrCallbackSymbol(props, ${JSON.stringify([prop.graphNodeId.slice(5), ...prop.path])})`;
		}
		return [];
	});

	if (callbackEntries.length > 0) {
		props.push(
			`__marklessSsrCallbacks: marklessSsrCallbacks({ ${callbackEntries.join(', ')} })`,
		);
	}
	return props;
}

function graphReferenceProps(edge: ComponentEdge | undefined) {
	return (edge?.props ?? []).flatMap((prop) =>
		prop.kind === 'graph-reference'
			? [{ name: prop.name, graphNodeId: prop.graphNodeId, path: prop.path }]
			: [],
	);
}

function componentAttributePropSource(attribute: AnyNode, source: string): string[] {
	if (isSpreadAttribute(attribute)) {
		const argument = attribute.argument as AnyNode | undefined;
		return argument ? [`...(${expressionSource(argument, source)})`] : [];
	}
	const name = getIdentifierName(attribute.name as AnyNode | undefined);
	if (!name) return [];
	const propertyName = objectPropertyName(name);
	const value = attribute.value as AnyNode | undefined;
	const expression = unwrapExpressionContainer(value);
	if (!value) return [`${propertyName}: true`];
	if (expression) return [`${propertyName}: ${expressionSource(expression, source)}`];
	if (value.type === 'Literal') return [`${propertyName}: ${JSON.stringify(value.value)}`];
	return [];
}

function collectSsrPropEvents(
	root: AnyNode,
	propNames: ReadonlyArray<string>,
	source: string,
	hostLocators: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly hostPath: ReadonlyArray<number>;
	}>,
) {
	const hostNodeIdByPath = new Map(
		hostLocators.map((locator) => [JSON.stringify(locator.hostPath), locator.hostNodeId]),
	);
	return collectCsrPropEvents(root, propNames, source).flatMap((event) => {
		const hostNodeId = hostNodeIdByPath.get(JSON.stringify(event.hostPath));
		return hostNodeId
			? [{ hostNodeId, eventName: event.eventName, propName: event.propName }]
			: [];
	});
}

function collectCsrPropEvents(
	root: AnyNode,
	propNames: ReadonlyArray<string>,
	source: string,
): ReadonlyArray<{
	readonly eventName: string;
	readonly hostPath: ReadonlyArray<number>;
	readonly propName: string;
}> {
	const propNameSet = new Set(propNames);
	const events: Array<{
		readonly eventName: string;
		readonly hostPath: ReadonlyArray<number>;
		readonly propName: string;
	}> = [];

	const visit = (node: AnyNode, path: ReadonlyArray<number>): void => {
		if (node.type !== 'Element' && node.type !== 'JSXElement') return;

		const tagName = getElementTagName(node);
		if (tagName && isHostTagName(tagName)) {
			for (const attribute of getElementAttributes(node)) {
				const name = getIdentifierName(attribute.name as AnyNode | undefined);
				if (!name || !isEventAttribute(name)) continue;

				const expression = unwrapExpressionContainer(
					attribute.value as AnyNode | undefined,
				);
				const propName = expression ? expressionSource(expression, source) : '';
				if (!propNameSet.has(propName)) continue;

				events.push({
					eventName: normalizeEventName(name),
					hostPath: path,
					propName,
				});
			}
		}

		let childDomIndex = 0;
		for (const child of asNodes(node.children)) {
			if (isIgnorableTextNode(child)) continue;
			if (child.type === 'Element' || child.type === 'JSXElement') {
				visit(child, [...path, childDomIndex]);
			}
			childDomIndex++;
		}
	};

	visit(root, []);
	return events;
}

function objectPropertyName(name: string): string {
	return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

function joinSsrExpressions(parts: ReadonlyArray<string>): string {
	const filtered = parts.filter((part) => part !== '""' && part !== JSON.stringify(''));
	if (filtered.length === 0) return '""';
	return filtered.join(' + ');
}

function componentPropNames(component: AnyNode): string[] {
	const param = asNodes(component.params)[0];
	if (!param) return [];
	if (param.type === 'Identifier') {
		const name = getIdentifierName(param);
		return name ? [name] : [];
	}
	if (param.type !== 'ObjectPattern') return [];

	return asNodes(param.properties).flatMap((property) => {
		const value = property.value as AnyNode | undefined;
		const key = property.key as AnyNode | undefined;
		const name = getIdentifierName(value) ?? getIdentifierName(key);
		return name ? [name] : [];
	});
}

function firstComponentRoot(component: AnyNode | undefined): AnyNode | null {
	const body = component?.body as AnyNode | undefined;
	if (!body) return null;

	for (const child of childNodes(body)) {
		if (child.type === 'Element' || child.type === 'JSXElement') return child;
		// TSRX allows `return <element>;` at the function-body level of @{...}.
		if (child.type === 'ReturnStatement') {
			const argument = child.argument as AnyNode | undefined;
			if (argument && (argument.type === 'Element' || argument.type === 'JSXElement')) {
				return argument;
			}
		}
	}

	return null;
}

function findComponent(ast: AnyNode, name: string | undefined): AnyNode | undefined {
	for (const statement of asNodes(ast.body)) {
		const componentFunction = getComponentFunction(statement);
		if (!componentFunction) continue;
		if (!name || componentFunction.name === name) return componentFunction.node;
	}

	return undefined;
}
