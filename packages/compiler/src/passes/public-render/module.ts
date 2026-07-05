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
import { firstComponentRoot, selectPublicRenderRoot } from './plan.ts';
import { itemPathReadSource } from './source-expressions.ts';

// Emits the optional direct-DOM module used by public render() after the plan proves
// the component shape can run through this specialized path.
export function emitPublicRenderModule(input: PublicRenderModuleInput): PublicRenderModuleArtifact {
	const ast = parseModule(input.source.source, input.source.filename) as unknown as AnyNode;
	if (input.semanticGraph.diagnostics.some((item) => item.code === 'MARKLESS_EVENT_SPREAD_UNSUPPORTED')) {
		return {
			passId: 'public-render-module', moduleSource: '', rootExportName: null, csrModuleSource: '',
			csrExportName: null, ssrModuleSource: '', ssrExportName: null, diagnostics: input.publicRenderPlan.diagnostics,
		};
	}
	const rootSelection = selectPublicRenderRoot(ast);
	const rootComponentName = rootSelection?.componentName;
	const componentCount = input.semanticGraph.components.length;
	const root = rootSelection
		? {
				component: rootSelection.component,
				componentName: rootSelection.componentName,
				root: rootSelection.root,
				propNames: componentPropNames(rootSelection.component),
			}
		: null;
	// Fragment roots use the standard CSR module (root = document fragment;
	// the web render() entry adopts the mount target as container root per the
	// ratified D3 decision). The direct module keeps its single-element shape.
	const isFragmentRoot = !!root && isFragmentNode(root.root);
	const canUseDirectCsrModule =
		!!root &&
		!isFragmentRoot &&
		!hasExecutableBodyStatements(root.component, root.root, input.source.source) &&
		root.propNames.length === 0 &&
		input.semanticGraph.componentEdges.length === 0 &&
		// The direct module has no async boundary handling; boundary-bearing
		// shapes take the standard runtime module.
		!input.publicRenderPlan.asyncBoundaryGates.some((gate) => gate.supported);
	const moduleSource = canUseDirectCsrModule
		? emitDirectPublicRenderModule({
				rootSelection,
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

	const references = componentReferences(input.semanticGraph.componentEdges, '__marklessCsrComponent');
	const valueImports = publicRenderValueImports(
		input.semanticGraph.moduleImports,
		input.semanticGraph.componentEdges,
	);
	const renderContext: CsrRenderContext = {
		mode: 'csr',
		childReplacements: [],
		componentEdges: componentEdgesFor(input, rootInfo.componentName),
		componentImports: new Map(references.map((item) => [item.componentName, item.localName])),
		callbackSymbols: callbackSymbolIds(input),
		nextComponentEdgeIndex: 0,
		keyedRepeats: input.semanticGraph.keyedRepeats,
		repeatGates: input.publicRenderPlan.repeatGates,
		nextRepeatIndex: 0,
		branchSites: input.semanticGraph.branchSites,
		branchReactivityGates: input.publicRenderPlan.branchReactivityGates,
		nextBranchSiteIndex: 0,
		asyncBoundaries: input.semanticGraph.asyncBoundaries,
		asyncBoundaryGates: input.publicRenderPlan.asyncBoundaryGates,
		nextAsyncBoundaryIndex: 0,
		hasChildrenProp: rootInfo.propNames.includes('children'),
		styleScopeClass: input.publicRenderPlan.styleScopes[0]?.scopeId ?? null,
		source: input.source.source,
	};
	const propEvents = collectCsrPropEvents(rootInfo.root, rootInfo.propNames, input.source.source);
	const hostLocators = staticHostLocators(input);

	return [
		...references.flatMap((reference) =>
			reference.importSource ? [emitComponentImport(reference)] : [],
		),
		...valueImports.map(emitValueImport),
		...moduleScopeLines(input.source.source, input.source.filename),
		...emitSameModuleCsrComponents(input, references, rootInfo.componentName),
		'',
		`const marklessCsrHostLocators = ${JSON.stringify(hostLocators)};`,
		'const marklessCsrStateValues = new Map([',
		stateEntries(input).join(',\n'),
		']);',
		'function marklessRenderCsr(props = {}) {',
		destructureProps(rootInfo.propNames),
		'	const marklessCsrPayloadState = marklessCloneState(payloadState);',
		'	const marklessCsrRenderStateValues = new Map(marklessCsrStateValues);',
		...renderBodyLines(input, rootInfo, 'marklessStateValue', 'marklessCsrRenderStateValues', 'marklessCsrPayloadState', [
			'const marklessCsrRuntimeState = { graph: null };',
			'const marklessCsrChildren = [];',
			`const root = ${isFragmentNode(rootInfo.root) ? 'marklessCsrFragmentFromHtml' : 'marklessCsrRootFromHtml'}(${emitHtmlNode(rootInfo.root, renderContext)});`,
		]),
		...renderContext.childReplacements,
		...propEvents.map(
			(event) =>
				`	marklessCsrAttachPropEvent(root, ${JSON.stringify(event.hostPath)}, ${JSON.stringify(event.eventName)}, ${event.propName});`,
		),
		'	const marklessCsrView = marklessCsrComposeView(root, payloadView, marklessCsrHostLocators, marklessCsrChildren);',
		'	const marklessCsrState = marklessComposeState(marklessCsrPayloadState, marklessCsrChildren);',
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
		'function marklessCsrFragmentFromHtml(html) { const template = document.createElement("template"); template.innerHTML = html; return template.content; }',
		'function marklessCsrRootFromHtml(html) { const template = document.createElement("template"); template.innerHTML = html; const root = template.content.firstElementChild; if (!root) throw new Error("Markless CSR template did not create a root element."); return root; }',
		'function marklessCsrRenderChild(component, props) { return component?.renderCsr?.(props); }',
		'function marklessCsrReplaceChild(root, index, child) { const placeholder = root.querySelector?.(`[data-markless-csr-child="${index}"]`); if (placeholder && child) placeholder.replaceWith(child); else placeholder?.remove?.(); }',
		'function marklessCsrAttachPropEvent(root, path, eventName, handler) { const element = marklessCsrNodeAtPath(root, path); if (handler && element?.addEventListener) element.addEventListener(eventName, handler); }',
		'function marklessComposeState(state, children) { const childStates = children.map((child) => child.output?.state).filter(Boolean); if (childStates.length === 0) return state; return { ...state, cells: [...(state.cells ?? []), ...childStates.flatMap((childState) => childState.cells ?? [])], computed: [...(state.computed ?? []), ...childStates.flatMap((childState) => childState.computed ?? [])], ...((state.sharedDefinitions || childStates.some((childState) => childState.sharedDefinitions?.length)) ? { sharedDefinitions: [...(state.sharedDefinitions ?? []), ...childStates.flatMap((childState) => childState.sharedDefinitions ?? [])] } : {}) }; }',
		'function marklessViewWithoutAnchors(view) { return { ...view, branches: [], asyncBoundaries: [] }; }',
		'function marklessCsrComposeView(root, view, hostLocators, children) { const elements = marklessCsrCollectElements(root); const indexByElement = new Map(elements.map((element, index) => [element, index])); const localHostIds = new Set(); const locators = []; const branches = [...(view.branches ?? [])]; const asyncBoundaries = [...(view.asyncBoundaries ?? [])]; for (const locator of hostLocators) { const element = marklessCsrNodeAtPath(root, locator.hostPath); const index = element ? indexByElement.get(element) : undefined; if (index === undefined) continue; localHostIds.add(locator.hostNodeId); locators.push({ hostNodeId: locator.hostNodeId, strategy: "dom-order", index, tagName: locator.tagName }); } const events = view.events.filter((event) => localHostIds.has(event.hostNodeId)); const domUpdates = view.domUpdates.filter((update) => localHostIds.has(update.hostNodeId)); const behaviors = view.behaviors.filter((behavior) => localHostIds.has(behavior.hostNodeId)); const elementHandles = view.elementHandles.filter((handle) => localHostIds.has(handle.hostNodeId)); for (const child of children) marklessCsrAppendChildView({ child, elements, indexByElement, locators, events, domUpdates, behaviors, elementHandles, branches, asyncBoundaries }); locators.sort((a, b) => a.index - b.index); return { ...view, locators, events, domUpdates, behaviors, elementHandles, branches: marklessCsrResolveAnchorRecords(root, "branch", branches), asyncBoundaries: marklessCsrResolveAnchorRecords(root, "async", asyncBoundaries) }; }',
		'function marklessCsrAppendChildView(context) { const childView = context.child.output?.view; const childRoot = context.child.output?.root; if (!childView || !childRoot) return; const childElements = marklessCsrCollectElements(childRoot); for (const locator of childView.locators) { const element = childElements[locator.index]; const index = element ? context.indexByElement.get(element) : undefined; if (index === undefined) continue; context.locators.push({ ...locator, hostNodeId: context.child.hostPrefix + locator.hostNodeId, index }); } for (const event of childView.events) context.events.push({ ...event, hostNodeId: context.child.hostPrefix + event.hostNodeId, symbolIds: event.symbolIds.map((symbolId) => context.child.symbolPrefix + symbolId) }); for (const update of childView.domUpdates) { const mapped = marklessCsrRemapChildGraph(update, context.child.graphProps); if (!mapped) continue; context.domUpdates.push({ ...update, hostNodeId: context.child.hostPrefix + update.hostNodeId, graphNodeId: mapped.graphNodeId, path: mapped.path, ...(update.symbolId ? { symbolId: context.child.symbolPrefix + update.symbolId } : {}) }); } for (const behavior of childView.behaviors) context.behaviors.push({ ...behavior, hostNodeId: context.child.hostPrefix + behavior.hostNodeId, ...(behavior.inputGraphReads ? { inputGraphReads: behavior.inputGraphReads.map((read) => { const mapped = marklessCsrRemapChildGraph(read, context.child.graphProps); return mapped ? { ...read, graphNodeId: mapped.graphNodeId, path: mapped.path } : read; }) } : {}), ...(behavior.symbolId ? { symbolId: context.child.symbolPrefix + behavior.symbolId } : {}) }); for (const handle of childView.elementHandles) context.elementHandles.push({ ...handle, hostNodeId: context.child.hostPrefix + handle.hostNodeId }); for (const branch of childView.branches ?? []) { const prefixedId = context.child.hostPrefix + branch.id; marklessCsrRenameAnchors(childRoot, "branch", branch.id, prefixedId); context.branches.push({ ...branch, id: prefixedId, testReads: marklessCsrRemapChildReads(branch.testReads, context.child.graphProps, prefixedId), ...(branch.symbolId ? { symbolId: context.child.symbolPrefix + branch.symbolId } : {}), ...(branch.armRecords ? { armRecords: branch.armRecords.map((arm) => marklessCsrPrefixArmRecord(arm, context.child)) } : {}) }); } for (const boundary of childView.asyncBoundaries ?? []) { const prefixedId = context.child.hostPrefix + boundary.id; marklessCsrRenameAnchors(childRoot, "async", boundary.id, prefixedId); context.asyncBoundaries.push({ ...boundary, id: prefixedId, asyncReads: marklessCsrRemapChildReads(boundary.asyncReads, context.child.graphProps, prefixedId).map((read) => ({ ...read, ...(read.runnerSymbolId ? { runnerSymbolId: context.child.symbolPrefix + read.runnerSymbolId } : {}) })), ...(boundary.updateSymbolId ? { updateSymbolId: context.child.symbolPrefix + boundary.updateSymbolId } : {}) }); } }',
		'function marklessCsrRemapChildGraph(record, graphProps) { if (record.graphNodeId === "prop:props") { const propName = record.path[0]; const binding = graphProps.find((prop) => prop.name === propName); return binding ? { graphNodeId: binding.graphNodeId, path: [...binding.path, ...record.path.slice(1)] } : null; } if (record.graphNodeId.startsWith?.("prop:")) { const propName = record.graphNodeId.slice(5); const binding = graphProps.find((prop) => prop.name === propName); return binding ? { graphNodeId: binding.graphNodeId, path: [...binding.path, ...record.path] } : null; } return { graphNodeId: record.graphNodeId, path: record.path }; }',
		'function marklessCsrRemapChildReads(reads, graphProps, recordId) { return (reads ?? []).map((read) => { const mapped = marklessCsrRemapChildGraph(read, graphProps); if (!mapped) throw new Error("MARKLESS_COMPOSED_READ_UNMAPPED: " + recordId); return { ...read, graphNodeId: mapped.graphNodeId, path: mapped.path }; }); }',
		'function marklessCsrPrefixArmRecord(arm, child) { return { ...arm, events: (arm.events ?? []).map((event) => ({ ...event, symbolIds: event.symbolIds.map((symbolId) => child.symbolPrefix + symbolId) })), domUpdates: (arm.domUpdates ?? []).map((update) => { const mapped = marklessCsrRemapChildGraph(update, child.graphProps); return mapped ? { ...update, graphNodeId: mapped.graphNodeId, path: mapped.path, ...(update.symbolId ? { symbolId: child.symbolPrefix + update.symbolId } : {}) } : update; }) }; }',
		'function marklessCsrRenameAnchors(root, kind, id, prefixedId) { const visit = (node) => { if (node?.nodeType === 8) { if (node.textContent === `markless:${kind}:${id}`) node.textContent = `markless:${kind}:${prefixedId}`; if (node.textContent === `/markless:${kind}:${id}`) node.textContent = `/markless:${kind}:${prefixedId}`; } for (const child of Array.from(node?.childNodes ?? [])) visit(child); }; visit(root); }',
		'function marklessCsrResolveAnchorRecords(root, kind, records) { if (records.length === 0) return records; const comments = []; const visit = (node) => { if (node?.nodeType === 8) comments.push(node); for (const child of Array.from(node?.childNodes ?? [])) visit(child); }; visit(root); const indexByText = new Map(); comments.forEach((comment, index) => { if (!indexByText.has(comment.textContent)) indexByText.set(comment.textContent, index); }); return records.map((record) => { const start = indexByText.get(`markless:${kind}:${record.id}`); const end = indexByText.get(`/markless:${kind}:${record.id}`); if (start === undefined || end === undefined) throw new Error(`MARKLESS_COMPOSED_ANCHOR_MISSING: ${kind}:${record.id}`); return { ...record, startAnchor: { ...record.startAnchor, index: start }, endAnchor: { ...record.endAnchor, index: end } }; }); }',
		'function marklessCsrCollectElements(root) { const elements = []; const visit = (node) => { if (node?.nodeType === 1) elements.push(node); for (const child of Array.from(node?.childNodes ?? [])) visit(child); }; visit(root); return elements; }',
		'function marklessCsrNodeAtPath(root, path) { let node = root; for (const index of path) { node = marklessCsrAuthoredChild(node, index); if (!node) return undefined; } return node; }',
		'function marklessCsrAuthoredChild(parent, index) { const children = parent?.childNodes; if (!children) return undefined; let slot = 0; for (let position = 0; position < children.length; position++) { const child = children[position]; if (child.nodeType === 8) { const text = child.textContent ?? ""; const range = /^markless:(branch|async)/.test(text); if (range) { const end = "/" + text; let close = position + 1; while (close < children.length && !(children[close].nodeType === 8 && children[close].textContent === end)) close++; if (slot === index) return child; slot++; position = close; continue; } continue; } if (slot === index) return child; slot++; } return undefined; }',
			'function marklessCsrIsThenable(value) { return value !== null && (typeof value === "object" || typeof value === "function") && typeof value.then === "function"; }',
			...stateRuntimeLines,
			'function marklessCsrText(value) { return marklessCsrEscape(value == null ? "" : String(value)); }',
		'function marklessCsrChildrenHtml(value) { return value == null ? "" : String(value); }',
		'function marklessCsrAttribute(name, value) { return ` ${name}="${marklessCsrEscape(value == null ? "" : String(value))}"`; }',
		'function marklessCsrRepeatRows(items, keyForRow, repeatId, itemName, keyPath, renderRow, renderEmpty) { const list = Array.isArray(items) ? items : Array.from(items ?? []); marklessAssertUniqueRepeatKeys(list, keyForRow, repeatId, itemName, keyPath); if (list.length === 0) return renderEmpty ? renderEmpty() : ""; return list.map(renderRow).join(""); }',
		'function marklessAssertUniqueRepeatKeys(items, keyForRow, repeatId, itemName, keyPath) { const seen = new Set(); for (const item of items) { const key = keyForRow(item); if (seen.has(key)) throw marklessRepeatDuplicateKeyError(repeatId, itemName, keyPath, key); seen.add(key); } }',
		'function marklessRepeatDuplicateKeyError(repeatId, itemName, keyPath, key) { const source = `${itemName}.${keyPath.join(".")}`; const keyText = JSON.stringify(key); const message = `MARKLESS_REPEAT_KEY_DUPLICATE: Two items produced the same key ${keyText} from ${source}. Rows with the same key cannot be told apart, so one of them would silently replace the other.`; const error = new Error(message); Object.defineProperty(error, "message", { value: message, enumerable: true, configurable: true }); error.name = "KeyedRepeatRuntimeError"; error.code = "MARKLESS_REPEAT_KEY_DUPLICATE"; error.severity = "error"; error.phase = "runtime"; error.title = "Two rows share the same @for key"; error.why = "The key is each row identity across reorder, insert, delete, and resume; duplicate identities make row state and DOM ownership ambiguous."; error.repeatId = repeatId; error.keyPath = keyPath; error.collidingValue = key; error.suggestions = [{ message: "Key by a field that is unique per item, or make the key compound where the data allows it. If the data has no unique field, key by position with index i; key i." }]; error.docsUrl = "https://markless.dev/errors/MARKLESS_REPEAT_KEY_DUPLICATE"; return error; }',
		'function readMarklessPublicPath(value, path) { let current = value; for (const key of path) current = current?.[key]; return current; }',
		'function marklessCsrDynamicTagName(value) { if (value === null || value === undefined || value === false || value === "") return null; const tag = String(value); if (!/^[a-zA-Z][a-zA-Z0-9:_.-]*$/.test(tag)) throw new Error("MARKLESS_DYNAMIC_TAG_INVALID: " + tag); return tag; }',
		'function marklessCsrSpreadAttributes(values, scopeClass) { let html = ""; let classSeen = false; for (const key of Object.keys(values ?? {})) { if (!/^[A-Za-z_][\\w.:-]*$/.test(key) || /^on[A-Z]/.test(key) || key === "attach" || key === "el" || key === "children") continue; const value = values[key]; if (value === null || value === undefined || value === false) continue; if (key === "class" && scopeClass) { classSeen = true; html += marklessCsrAttribute("class", (value === true ? "" : String(value)) + " " + scopeClass); continue; } html += value === true ? ` ${key}=""` : marklessCsrAttribute(key, value); } if (scopeClass && !classSeen) html += ` class="${scopeClass}"`; return html; }',
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

	const references = componentReferences(input.semanticGraph.componentEdges, '__marklessSsrComponent');
	const valueImports = publicRenderValueImports(
		input.semanticGraph.moduleImports,
		input.semanticGraph.componentEdges,
	);
	const renderContext: SsrRenderContext = {
		mode: 'ssr',
		componentEdges: componentEdgesFor(input, rootInfo.componentName),
		componentImports: new Map(references.map((item) => [item.componentName, item.localName])),
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
		asyncBoundaries: input.semanticGraph.asyncBoundaries,
		asyncBoundaryGates: input.publicRenderPlan.asyncBoundaryGates,
		nextAsyncBoundaryIndex: 0,
		asyncRunners: collectSsrAsyncRunners(input),
		hasChildrenProp: rootInfo.propNames.includes('children'),
		branchSites: input.semanticGraph.branchSites,
		branchReactivityGates: input.publicRenderPlan.branchReactivityGates,
		nextBranchSiteIndex: 0,
		styleScopeClass: input.publicRenderPlan.styleScopes[0]?.scopeId ?? null,
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
		...references.flatMap((reference) =>
			reference.importSource ? [emitComponentImport(reference)] : [],
		),
		...valueImports.map(emitValueImport),
		...moduleScopeLines(input.source.source, input.source.filename),
		...emitSameModuleSsrComponents(input, references, rootInfo.componentName),
		'',
		`const marklessSsrPropEvents = ${JSON.stringify(propEvents)};`,
		'const marklessSsrStateValues = new Map([',
		stateEntries(input).join(',\n'),
		']);',
		'async function marklessRenderSsr(props = {}) {',
		destructureProps(rootInfo.propNames),
		'	const marklessSsrPayloadState = marklessCloneState(payloadState);',
		'	const marklessSsrRenderStateValues = new Map(marklessSsrStateValues);',
		...renderBodyLines(input, rootInfo, 'marklessStateValue', 'marklessSsrRenderStateValues', 'marklessSsrPayloadState', [
			'const marklessSsrChildren = [];',
			'const marklessSsrBranches = [];',
			'const marklessSsrAsyncSnapshots = [];',
			'const marklessSsrHostLocators = [];',
			`const html = ${htmlExpression};`,
		]),
		'	const marklessSsrComposition = marklessSsrComposeView(html, payloadView, marklessSsrHostLocators, marklessSsrChildren);',
		'	const marklessSsrState = marklessComposeState(marklessSsrPayloadState, marklessSsrChildren);',
		'	return {',
		'		html,',
		'		state: marklessSsrAttachSnapshots(marklessSsrState, marklessSsrAsyncSnapshots),',
		'		view: { ...marklessSsrComposition.view, branches: marklessSsrMergeBranches(marklessSsrComposition.view.branches, marklessSsrBranches) },',
		'		elementCount: marklessSsrComposition.elementCount,',
		'		propEvents: marklessSsrPropEvents,',
		'		externalSymbolIds: marklessSsrComposition.externalSymbolIds,',
		'	};',
		'}',
		'async function marklessSsrRenderChild(children, component, props, child) { const output = await component?.renderSsr?.(props); if (!output) return ""; let html = output.html ?? ""; for (const branch of output.view?.branches ?? []) html = marklessSsrPrefixAnchorHtml(html, "branch", branch.id, child.hostPrefix + branch.id); for (const boundary of output.view?.asyncBoundaries ?? []) html = marklessSsrPrefixAnchorHtml(html, "async", boundary.id, child.hostPrefix + boundary.id); children.push({ ...child, output: { ...output, html }, callbackProps: props?.__marklessSsrCallbacks ?? {} }); return html; }',
		'function marklessSsrBranchArm(branches, id, takenArm) { branches.push({ id, takenArm }); return ""; }',
		'async function marklessSsrRunAsyncComputed(snapshots, graphNodeId, run) { const signal = new AbortController().signal; try { const value = await run({ key: null, signal }); const snapshot = { status: "fulfilled", version: 1, key: null, value }; snapshots.push({ graphNodeId, snapshot }); return snapshot; } catch (error) { const snapshot = { status: "rejected", version: 1, key: null, error }; snapshots.push({ graphNodeId, snapshot }); return snapshot; } }',
		'function marklessSsrAttachSnapshots(state, snapshots) { if (snapshots.length === 0) return state; const byId = new Map(snapshots.map((entry) => [entry.graphNodeId, entry.snapshot])); return { ...state, computed: (state.computed ?? []).map((computed) => byId.has(computed.graphNodeId) ? { ...computed, snapshot: byId.get(computed.graphNodeId) } : computed) }; }',
		'function marklessSsrMergeBranches(payloadBranches, runtimeBranches) { const takenById = new Map(runtimeBranches.map((branch) => [branch.id, branch.takenArm])); return (payloadBranches ?? []).map((branch) => takenById.has(branch.id) ? { ...branch, takenArm: takenById.get(branch.id) } : branch); }',
		'function marklessSsrArmHost(hostLocators) { hostLocators.marklessSsrExtraElements = (hostLocators.marklessSsrExtraElements ?? 0) + 1; return ""; }',
		'function marklessSsrHost(hostLocators, hostNodeId, tagName) { hostLocators.push({ hostNodeId, strategy: "dom-order", index: hostLocators.length + (hostLocators.marklessSsrExtraElements ?? 0), tagName }); return ""; }',
		'function marklessSsrDynamicTagName(value) { if (value === null || value === undefined || value === false || value === "") return null; const tag = String(value); if (!/^[a-zA-Z][a-zA-Z0-9:_.-]*$/.test(tag)) throw new Error("MARKLESS_DYNAMIC_TAG_INVALID: " + tag); return tag; }',
		'function marklessSsrRepeatRows(hostLocators, items, keyForRow, repeatId, itemName, keyPath, renderRow, elementsPerRow, renderEmpty) { const list = Array.isArray(items) ? items : Array.from(items ?? []); marklessAssertUniqueRepeatKeys(list, keyForRow, repeatId, itemName, keyPath); if (list.length === 0) return renderEmpty ? renderEmpty() : ""; const html = list.map(renderRow).join(""); hostLocators.marklessSsrExtraElements = (hostLocators.marklessSsrExtraElements ?? 0) + list.length * elementsPerRow; return html; }',
		'function marklessAssertUniqueRepeatKeys(items, keyForRow, repeatId, itemName, keyPath) { const seen = new Set(); for (const item of items) { const key = keyForRow(item); if (seen.has(key)) throw marklessRepeatDuplicateKeyError(repeatId, itemName, keyPath, key); seen.add(key); } }',
		'function marklessRepeatDuplicateKeyError(repeatId, itemName, keyPath, key) { const source = `${itemName}.${keyPath.join(".")}`; const keyText = JSON.stringify(key); const message = `MARKLESS_REPEAT_KEY_DUPLICATE: Two items produced the same key ${keyText} from ${source}. Rows with the same key cannot be told apart, so one of them would silently replace the other.`; const error = new Error(message); Object.defineProperty(error, "message", { value: message, enumerable: true, configurable: true }); error.name = "KeyedRepeatRuntimeError"; error.code = "MARKLESS_REPEAT_KEY_DUPLICATE"; error.severity = "error"; error.phase = "runtime"; error.title = "Two rows share the same @for key"; error.why = "The key is each row identity across reorder, insert, delete, and resume; duplicate identities make row state and DOM ownership ambiguous."; error.repeatId = repeatId; error.keyPath = keyPath; error.collidingValue = key; error.suggestions = [{ message: "Key by a field that is unique per item, or make the key compound where the data allows it. If the data has no unique field, key by position with index i; key i." }]; error.docsUrl = "https://markless.dev/errors/MARKLESS_REPEAT_KEY_DUPLICATE"; return error; }',
		'function readMarklessPublicPath(value, path) { let current = value; for (const key of path) current = current?.[key]; return current; }',
		'function marklessSsrCallbacks(callbacks) { const result = {}; for (const key of Object.keys(callbacks)) if (callbacks[key]) result[key] = callbacks[key]; return result; }',
		'function marklessSsrCallbackSymbol(props, path) { let value = props?.__marklessSsrCallbacks; for (const key of path) value = value?.[key]; return typeof value === "string" ? value : undefined; }',
		'function marklessComposeState(state, children) { const childStates = children.map((child) => child.output?.state).filter(Boolean); if (childStates.length === 0) return state; return { ...state, cells: [...(state.cells ?? []), ...childStates.flatMap((childState) => childState.cells ?? [])], computed: [...(state.computed ?? []), ...childStates.flatMap((childState) => childState.computed ?? [])], ...((state.sharedDefinitions || childStates.some((childState) => childState.sharedDefinitions?.length)) ? { sharedDefinitions: [...(state.sharedDefinitions ?? []), ...childStates.flatMap((childState) => childState.sharedDefinitions ?? [])] } : {}) }; }',
		'function marklessViewWithoutAnchors(view) { return { ...view, branches: [], asyncBoundaries: [] }; }',
		'function marklessSsrComposeView(html, view, hostLocators, children) { const localHostIds = new Set(hostLocators.map((locator) => locator.hostNodeId)); const childData = children.map((child) => ({ ...child, view: child.output?.view, hostCount: child.output?.elementCount ?? child.output?.view?.locators?.length ?? 0, externalSymbolIds: new Set(child.output?.externalSymbolIds ?? []) })).filter((child) => child.view); const offsetFor = (index) => childData.reduce((total, child) => total + (child.localIndex <= index ? child.hostCount : 0), 0); const locators = hostLocators.map((locator) => ({ ...locator, index: locator.index + offsetFor(locator.index) })); const events = view.events.filter((event) => localHostIds.has(event.hostNodeId)); const domUpdates = view.domUpdates.filter((update) => localHostIds.has(update.hostNodeId)); const behaviors = view.behaviors.filter((behavior) => localHostIds.has(behavior.hostNodeId)); const elementHandles = view.elementHandles.filter((handle) => localHostIds.has(handle.hostNodeId)); const branches = [...(view.branches ?? [])]; const asyncBoundaries = [...(view.asyncBoundaries ?? [])]; const externalSymbolIds = new Set(); let inserted = 0; for (const child of childData) { marklessSsrAppendChildView({ child, baseIndex: child.localIndex + inserted, locators, events, domUpdates, behaviors, elementHandles, branches, asyncBoundaries, externalSymbolIds }); inserted += child.hostCount; } locators.sort((a, b) => a.index - b.index); return { view: { ...view, locators, events, domUpdates, behaviors, elementHandles, branches: marklessSsrResolveAnchorRecords(html, "branch", branches), asyncBoundaries: marklessSsrResolveAnchorRecords(html, "async", asyncBoundaries) }, elementCount: hostLocators.length + (hostLocators.marklessSsrExtraElements ?? 0) + childData.reduce((total, child) => total + child.hostCount, 0), externalSymbolIds: [...externalSymbolIds] }; }',
		'function marklessSsrAppendChildView(context) { const childView = context.child.view; const propEvents = context.child.output?.propEvents ?? []; const callbackProps = context.child.callbackProps ?? {}; for (const locator of childView.locators) context.locators.push({ ...locator, hostNodeId: context.child.hostPrefix + locator.hostNodeId, index: context.baseIndex + locator.index }); for (const event of childView.events) { const propEvent = propEvents.find((item) => item.hostNodeId === event.hostNodeId && item.eventName === event.eventName); const callbackSymbolId = propEvent ? callbackProps[propEvent.propName] : undefined; const symbolIds = callbackSymbolId ? [callbackSymbolId] : event.symbolIds.map((symbolId) => context.child.externalSymbolIds.has(symbolId) ? symbolId : context.child.symbolPrefix + symbolId); for (const symbolId of symbolIds) if (callbackSymbolId || context.child.externalSymbolIds.has(symbolId)) context.externalSymbolIds.add(symbolId); context.events.push({ ...event, hostNodeId: context.child.hostPrefix + event.hostNodeId, symbolIds }); } for (const update of childView.domUpdates) { const mapped = marklessSsrRemapChildGraph(update, context.child.graphProps); if (!mapped) continue; context.domUpdates.push({ ...update, hostNodeId: context.child.hostPrefix + update.hostNodeId, graphNodeId: mapped.graphNodeId, path: mapped.path, ...(update.symbolId ? { symbolId: context.child.symbolPrefix + update.symbolId } : {}) }); } for (const behavior of childView.behaviors) context.behaviors.push({ ...behavior, hostNodeId: context.child.hostPrefix + behavior.hostNodeId, ...(behavior.inputGraphReads ? { inputGraphReads: behavior.inputGraphReads.map((read) => { const mapped = marklessSsrRemapChildGraph(read, context.child.graphProps); return mapped ? { ...read, graphNodeId: mapped.graphNodeId, path: mapped.path } : read; }) } : {}), ...(behavior.symbolId ? { symbolId: context.child.symbolPrefix + behavior.symbolId } : {}) }); for (const handle of childView.elementHandles) context.elementHandles.push({ ...handle, hostNodeId: context.child.hostPrefix + handle.hostNodeId }); for (const branch of childView.branches ?? []) context.branches.push({ ...branch, id: context.child.hostPrefix + branch.id, testReads: marklessSsrRemapChildReads(branch.testReads, context.child.graphProps, context.child.hostPrefix + branch.id), ...(branch.symbolId ? { symbolId: context.child.symbolPrefix + branch.symbolId } : {}), ...(branch.armRecords ? { armRecords: branch.armRecords.map((arm) => marklessSsrPrefixArmRecord(arm, context.child)) } : {}) }); for (const boundary of childView.asyncBoundaries ?? []) context.asyncBoundaries.push({ ...boundary, id: context.child.hostPrefix + boundary.id, asyncReads: marklessSsrRemapChildReads(boundary.asyncReads, context.child.graphProps, context.child.hostPrefix + boundary.id).map((read) => ({ ...read, ...(read.runnerSymbolId ? { runnerSymbolId: context.child.symbolPrefix + read.runnerSymbolId } : {}) })), ...(boundary.updateSymbolId ? { updateSymbolId: context.child.symbolPrefix + boundary.updateSymbolId } : {}) }); }',
		'function marklessSsrRemapChildGraph(record, graphProps) { if (record.graphNodeId === "prop:props") { const propName = record.path[0]; const binding = graphProps.find((prop) => prop.name === propName); return binding ? { graphNodeId: binding.graphNodeId, path: [...binding.path, ...record.path.slice(1)] } : null; } if (record.graphNodeId.startsWith?.("prop:")) { const propName = record.graphNodeId.slice(5); const binding = graphProps.find((prop) => prop.name === propName); return binding ? { graphNodeId: binding.graphNodeId, path: [...binding.path, ...record.path] } : null; } return { graphNodeId: record.graphNodeId, path: record.path }; }',
		'function marklessSsrPrefixAnchorHtml(html, kind, id, prefixedId) { return html.replaceAll(`<!--markless:${kind}:${id}-->`, `<!--markless:${kind}:${prefixedId}-->`).replaceAll(`<!--/markless:${kind}:${id}-->`, `<!--/markless:${kind}:${prefixedId}-->`); }',
			'function marklessSsrRemapChildReads(reads, graphProps, recordId) { return (reads ?? []).map((read) => { const mapped = marklessSsrRemapChildGraph(read, graphProps); if (!mapped) throw new Error("MARKLESS_COMPOSED_READ_UNMAPPED: " + recordId); return { ...read, graphNodeId: mapped.graphNodeId, path: mapped.path }; }); }',
			'function marklessSsrPrefixArmRecord(arm, child) { return { ...arm, events: (arm.events ?? []).map((event) => ({ ...event, symbolIds: event.symbolIds.map((symbolId) => child.symbolPrefix + symbolId) })), domUpdates: (arm.domUpdates ?? []).map((update) => { const mapped = marklessSsrRemapChildGraph(update, child.graphProps); return mapped ? { ...update, graphNodeId: mapped.graphNodeId, path: mapped.path, ...(update.symbolId ? { symbolId: child.symbolPrefix + update.symbolId } : {}) } : update; }) }; }',
			'function marklessSsrResolveAnchorRecords(html, kind, records) { if (records.length === 0) return records; const pattern = /<!--([\\s\\S]*?)-->/g; const indexByText = new Map(); let match; let index = 0; while ((match = pattern.exec(html)) !== null) { if (!indexByText.has(match[1])) indexByText.set(match[1], index); index++; } return records.map((record) => { const start = indexByText.get(`markless:${kind}:${record.id}`); const end = indexByText.get(`/markless:${kind}:${record.id}`); if (start === undefined || end === undefined) throw new Error(`MARKLESS_COMPOSED_ANCHOR_MISSING: ${kind}:${record.id}`); return { ...record, startAnchor: { ...record.startAnchor, index: start }, endAnchor: { ...record.endAnchor, index: end } }; }); }',
			...stateRuntimeLines,
			'function marklessSsrText(value) { return marklessSsrEscape(value == null ? "" : String(value)); }',
		'function marklessSsrChildrenHtml(value) { return value == null ? "" : String(value); }',
		'function marklessSsrAttribute(name, value) { return ` ${name}="${marklessSsrEscape(value == null ? "" : String(value))}"`; }',
		'function marklessSsrSpreadAttributes(values, scopeClass) { let html = ""; let classSeen = false; for (const key of Object.keys(values ?? {})) { if (!/^[A-Za-z_][\\w.:-]*$/.test(key) || /^on[A-Z]/.test(key) || key === "attach" || key === "el" || key === "children") continue; const value = values[key]; if (value === null || value === undefined || value === false) continue; if (key === "class" && scopeClass) { classSeen = true; html += marklessSsrAttribute("class", (value === true ? "" : String(value)) + " " + scopeClass); continue; } html += value === true ? ` ${key}=""` : marklessSsrAttribute(key, value); } if (scopeClass && !classSeen) html += ` class="${scopeClass}"`; return html; }',
		'function marklessSsrEscape(value) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\\"", "&quot;"); }',
		'',
	]
		.filter((part): part is string => part !== null && part !== '')
		.join('\n')
		.replaceAll('readMarklessPublicPath', 'marklessSsrReadPublicPath');
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
	readonly asyncBoundaries: PublicRenderModuleInput['semanticGraph']['asyncBoundaries'];
	readonly asyncBoundaryGates: PublicRenderModuleInput['publicRenderPlan']['asyncBoundaryGates'];
	nextAsyncBoundaryIndex: number;
	// boundaryId -> the async computed the SSR render awaits inline.
	readonly asyncRunners?: ReadonlyMap<
		string,
		{ readonly graphNodeId: string; readonly name: string; readonly source: string }
	>;
	readonly branchSites: PublicRenderModuleInput['semanticGraph']['branchSites'];
	readonly branchReactivityGates: PublicRenderModuleInput['publicRenderPlan']['branchReactivityGates'];
	nextBranchSiteIndex: number;
	// Inside a gate-supported branch arm, host elements skip the locator
	// stream (their records rewire via arm-relative host paths) but must
	// still shift later locator indexes — the repeat-row extras discipline.
	insideSupportedBranchArm?: boolean;
	readonly styleScopeClass: string | null;
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
	readonly branchSites?: PublicRenderModuleInput['semanticGraph']['branchSites'];
	readonly branchReactivityGates?: PublicRenderModuleInput['publicRenderPlan']['branchReactivityGates'];
	nextBranchSiteIndex?: number;
	readonly asyncBoundaries?: PublicRenderModuleInput['semanticGraph']['asyncBoundaries'];
	readonly asyncBoundaryGates?: PublicRenderModuleInput['publicRenderPlan']['asyncBoundaryGates'];
	nextAsyncBoundaryIndex?: number;
	readonly styleScopeClass?: string | null;
	readonly source: string;
};

type HtmlRenderContext = SsrRenderContext | CsrRenderContext;

type PublicRenderRoot = {
	readonly component: AnyNode;
	readonly componentName: string;
	readonly root: AnyNode;
	readonly propNames: ReadonlyArray<string>;
};

const stateRuntimeLines = [
	'function marklessCloneState(state) { return { ...state, cells: (state.cells ?? []).map((cell) => ({ ...cell })), computed: [...(state.computed ?? [])], ...(state.sharedDefinitions ? { sharedDefinitions: [...state.sharedDefinitions] } : {}) }; }',
	'function marklessStateValue(values, state, graphNodeId, value) { if (arguments.length > 3) { values.set(graphNodeId, value); marklessSetStatePayloadValue(state, graphNodeId, value); return value; } return values.get(graphNodeId); }',
	'function marklessSetStatePayloadValue(state, graphNodeId, value) { const cell = state.cells?.find((candidate) => candidate.graphNodeId === graphNodeId); if (cell) cell.value = marklessSerializeGraphValue(value); }',
	'function marklessSerializeGraphValue(value) { const records = []; const seen = new Map(); return { version: 1, root: marklessSerializeSlot(value, records, seen), records }; }',
	'function marklessSerializeSlot(value, records, seen) { if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value; if (value === undefined) return { $type: "undefined" }; if (typeof value === "bigint") return { $type: "bigint", value: String(value) }; if (typeof value === "function" || typeof value === "symbol") throw new Error("MARKLESS_SERIALIZE_UNSUPPORTED_VALUE"); if (seen.has(value)) return { $ref: seen.get(value) }; const id = records.length; seen.set(value, id); if (value instanceof Date) { records.push({ id, type: "date", value: value.toISOString() }); return { $ref: id }; } if (value instanceof RegExp) { records.push({ id, type: "regexp", source: value.source, flags: value.flags }); return { $ref: id }; } if (value instanceof URL) { records.push({ id, type: "url", value: value.toString() }); return { $ref: id }; } if (Array.isArray(value)) { const record = { id, type: "array", items: [] }; records.push(record); for (const item of value) record.items.push(marklessSerializeSlot(item, records, seen)); return { $ref: id }; } const prototype = Object.getPrototypeOf(value); if (prototype !== Object.prototype && prototype !== null) throw new Error("MARKLESS_SERIALIZE_UNSUPPORTED_VALUE"); const record = { id, type: "object", fields: [] }; records.push(record); for (const key of Object.keys(value)) record.fields.push([key, marklessSerializeSlot(value[key], records, seen)]); return { $ref: id }; }',
] as const;

type GraphBinding = PublicRenderModuleInput['semanticGraph']['graphBindings'][number];
type ComponentEdge = PublicRenderModuleInput['semanticGraph']['componentEdges'][number];
const loweredFrameworkCalls = new Set(['computed', 'element', 'handler']);

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

function renderBodyLines(
	input: PublicRenderModuleInput,
	rootInfo: PublicRenderRoot,
	stateValueFunctionName: string,
	stateValuesName: string,
	statePayloadName: string,
	rootLines: ReadonlyArray<string>,
): string[] {
	const body = rootInfo.component.body as AnyNode | undefined;
	if (!body) return indentLines(rootLines);

	const stateBindings = new Map<string, GraphBinding>(
		input.semanticGraph.graphBindings.flatMap((binding) =>
			binding.kind === 'state' ? [[binding.name, binding]] : [],
		),
	);
	const computedBindings = new Map<string, GraphBinding>(
		input.semanticGraph.graphBindings.flatMap((binding) =>
			binding.kind === 'computed' ? [[binding.name, binding]] : [],
		),
	);
	const lines: string[] = [];
	let emittedRoot = false;
	for (const statement of childNodes(body)) {
		if (isIgnorableTextNode(statement)) continue;
		if (statement === rootInfo.root || returnArgument(statement) === rootInfo.root) {
			lines.push(...rootLines);
			emittedRoot = true;
			continue;
		}

		const stateLine = stateDeclarationLine(
			statement,
			stateBindings,
			stateValueFunctionName,
			stateValuesName,
			statePayloadName,
		);
		if (stateLine) { lines.push(stateLine); continue; }
		const computedLine = computedDeclarationLine(statement, computedBindings);
		if (computedLine) { lines.push(computedLine); continue; }
		if (isLoweredFrameworkDeclaration(statement)) continue;

		const source = expressionSource(statement, input.source.source);
		if (source) lines.push(source);
	}
	if (!emittedRoot) lines.push(...rootLines);
	return indentLines(lines);
}

function moduleScopeLines(source: string, filename: string): string[] {
	const ast = parseModule(source, filename) as unknown as AnyNode;
	return asNodes(ast.body).flatMap((statement) => {
		if (statement.type === 'ImportDeclaration' || getComponentFunction(statement)) return [];
		const declaration = statement.type === 'ExportNamedDeclaration' ? (statement.declaration as AnyNode | undefined) : statement;
		if (!declaration) return [];
		if (declaration.type !== 'VariableDeclaration' && declaration.type !== 'FunctionDeclaration' && declaration.type !== 'ClassDeclaration') return [];
		const sourceText = expressionSource(declaration, source);
		return sourceText ? [sourceText] : [];
	});
}

function computedDeclarationLine(
	statement: AnyNode,
	computedBindings: ReadonlyMap<string, GraphBinding>,
): string | null {
	if (statement.type !== 'VariableDeclaration') return null;
	const declarations = asNodes(statement.declarations);
	if (declarations.length !== 1) return null;
	const declaration = declarations[0]!;
	const name = getIdentifierName(declaration.id as AnyNode | undefined);
	const binding = name ? computedBindings.get(name) : undefined;
	if (
		!binding ||
		binding.async === true ||
		!binding.functionSource ||
		!isFrameworkCall(declaration.init as AnyNode | undefined, 'computed')
	) {
		return null;
	}

	const declarationKind = binding.declarationKind ?? 'const';
	return `${declarationKind} ${binding.name} = (${binding.functionSource})();`;
}

function stateDeclarationLine(
	statement: AnyNode,
	stateBindings: ReadonlyMap<string, GraphBinding>,
	stateValueFunctionName: string,
	stateValuesName: string,
	statePayloadName: string,
): string | null {
	if (statement.type !== 'VariableDeclaration') return null;
	const declarations = asNodes(statement.declarations);
	if (declarations.length !== 1) return null;
	const declaration = declarations[0]!;
	const name = getIdentifierName(declaration.id as AnyNode | undefined);
	const binding = name ? stateBindings.get(name) : undefined;
	if (!binding || !isFrameworkCall(declaration.init as AnyNode | undefined, 'state')) return null;
	const initializerSource = (binding as GraphBinding & { readonly initializerSource?: string }).initializerSource;
	const args = [stateValuesName, statePayloadName, JSON.stringify(binding.id), initializerSource].filter(
		(arg): arg is string => arg !== undefined,
	);
	return `let ${binding.name} = ${stateValueFunctionName}(${args.join(', ')});`;
}

function isStateDeclaration(statement: AnyNode): boolean {
	return statement.type === 'VariableDeclaration' && asNodes(statement.declarations).some((declaration) => isFrameworkCall(declaration.init as AnyNode | undefined, 'state'));
}

function isLoweredFrameworkDeclaration(statement: AnyNode): boolean {
	if (statement.type !== 'VariableDeclaration') return false;
	return asNodes(statement.declarations).some((declaration) => {
		const init = declaration.init as AnyNode | undefined;
		return !!frameworkCallName(init) && loweredFrameworkCalls.has(frameworkCallName(init)!);
	});
}

function isFrameworkCall(node: AnyNode | null | undefined, name: string): boolean {
	return frameworkCallName(node) === name;
}

function frameworkCallName(node: AnyNode | null | undefined): string | null {
	return node?.type === 'CallExpression' ? getIdentifierName(node.callee as AnyNode | undefined) : null;
}

function returnArgument(statement: AnyNode): AnyNode | undefined {
	return statement.type === 'ReturnStatement' ? (statement.argument as AnyNode | undefined) : undefined;
}

function indentLines(lines: ReadonlyArray<string>): string[] {
	return lines.flatMap((line) => line.split('\n').map((part) => `	${part}`));
}

function hasExecutableBodyStatements(component: AnyNode, root: AnyNode, source: string): boolean {
	const body = component.body as AnyNode | undefined;
	if (!body) return false;
	for (const statement of childNodes(body)) {
		if (isIgnorableTextNode(statement)) continue;
		if (statement === root || returnArgument(statement) === root) continue;
		if (isStateDeclaration(statement) || isLoweredFrameworkDeclaration(statement)) continue;
		if (expressionSource(statement, source)) return true;
	}
	return false;
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

type ComponentReference = {
	readonly componentName: string;
	readonly importSource?: string;
	readonly importKind?: ComponentEdge['importKind'];
	readonly importedName?: string;
	readonly localName: string;
};

function componentReferences(
	componentEdges: PublicRenderModuleInput['semanticGraph']['componentEdges'],
	localPrefix: string,
): ComponentReference[] {
	const references: ComponentReference[] = [];

	for (const edge of componentEdges) {
		if (references.some((item) => item.componentName === edge.childComponentName)) continue;
		references.push({
			componentName: edge.childComponentName,
			...(edge.importSource ? { importSource: edge.importSource } : {}),
			importKind: edge.importKind,
			importedName: edge.importedName,
			localName: `${localPrefix}${references.length}`,
		});
	}

	return references;
}

function emitComponentImport(imported: ComponentReference & { readonly importSource: string }): string {
	if (imported.importKind === 'named' && !isTsrxComponentImport(imported.importSource)) {
		return `import { ${imported.importedName ?? imported.componentName} as ${imported.localName} } from ${JSON.stringify(imported.importSource)};`;
	}
	return `import ${imported.localName} from ${JSON.stringify(imported.importSource)};`;
}

function emitSameModuleCsrComponents(
	input: PublicRenderModuleInput,
	references: ReadonlyArray<ComponentReference>,
	rootComponentName: string,
): string[] {
	const ast = parseModule(input.source.source, input.source.filename) as unknown as AnyNode;
	const componentMap = sameModuleComponentMap(ast);
	const referenceMap = new Map(references.map((item) => [item.componentName, item.localName]));
	return references.flatMap((reference) => {
		if (reference.importSource || reference.componentName === rootComponentName) return [];
		const component = componentMap.get(reference.componentName);
		const root = firstComponentRoot(component);
		if (!component || !root) return [];
		const rootInfo = {
			component,
			componentName: reference.componentName,
			root,
			propNames: componentPropNames(component),
		};
		const renderContext: CsrRenderContext = {
			mode: 'csr',
			childReplacements: [],
			componentEdges: componentEdgesFor(input, reference.componentName),
			componentImports: referenceMap,
			callbackSymbols: callbackSymbolIds(input),
			nextComponentEdgeIndex: 0,
			keyedRepeats: [],
			repeatGates: [],
			nextRepeatIndex: 0,
			branchSites: [],
			branchReactivityGates: [],
			nextBranchSiteIndex: 0,
			asyncBoundaries: [],
			asyncBoundaryGates: [],
			nextAsyncBoundaryIndex: 0,
			hasChildrenProp: rootInfo.propNames.includes('children'),
			styleScopeClass: input.publicRenderPlan.styleScopes[0]?.scopeId ?? null,
			source: input.source.source,
		};
		const functionName = `marklessRenderCsr${reference.componentName}`;
		return [
			`const ${reference.localName} = { renderCsr: ${functionName} };`,
			`function ${functionName}(props = {}) {`,
			destructureProps(rootInfo.propNames),
			'	const marklessCsrPayloadState = { ...marklessCloneState(payloadState), cells: [], computed: [] };',
			'	const marklessCsrRenderStateValues = new Map(marklessCsrStateValues);',
			...renderBodyLines(input, rootInfo, 'marklessStateValue', 'marklessCsrRenderStateValues', 'marklessCsrPayloadState', [
				'const marklessCsrRuntimeState = { graph: null };',
				'const marklessCsrChildren = [];',
				`const root = ${isFragmentNode(rootInfo.root) ? 'marklessCsrFragmentFromHtml' : 'marklessCsrRootFromHtml'}(${emitHtmlNode(rootInfo.root, renderContext)});`,
			]),
			...renderContext.childReplacements,
			'	const marklessCsrView = marklessCsrComposeView(root, marklessViewWithoutAnchors(payloadView), [], marklessCsrChildren);',
			'	const marklessCsrState = marklessComposeState(marklessCsrPayloadState, marklessCsrChildren);',
			'	return { root, state: marklessCsrState, view: marklessCsrView, loadSymbol, connectRuntime(context) { marklessCsrRuntimeState.graph = context.graph; for (const child of marklessCsrChildren) child.output?.connectRuntime?.(context); } };',
			'}',
		].filter((line): line is string => line !== null);
	});
}

function emitSameModuleSsrComponents(
	input: PublicRenderModuleInput,
	references: ReadonlyArray<ComponentReference>,
	rootComponentName: string,
): string[] {
	const ast = parseModule(input.source.source, input.source.filename) as unknown as AnyNode;
	const componentMap = sameModuleComponentMap(ast);
	const referenceMap = new Map(references.map((item) => [item.componentName, item.localName]));
	const hostIdByNode = assignSsrHostIds(
		ast,
		input.semanticGraph.hostNodes.map((host) => host.id),
	);
	return references.flatMap((reference) => {
		if (reference.importSource || reference.componentName === rootComponentName) return [];
		const component = componentMap.get(reference.componentName);
		const root = firstComponentRoot(component);
		if (!component || !root) return [];
		const rootInfo = {
			component,
			componentName: reference.componentName,
			root,
			propNames: componentPropNames(component),
		};
		const renderContext: SsrRenderContext = {
			mode: 'ssr',
			componentEdges: componentEdgesFor(input, reference.componentName),
			componentImports: referenceMap,
			callbackSymbols: callbackSymbolIds(input),
			nextComponentEdgeIndex: 0,
			nextChildIndex: 0,
			hostIdByNode,
			keyedRepeats: [],
			repeatGates: [],
			nextRepeatIndex: 0,
			insideRepeatRow: false,
			asyncBoundaries: [],
			asyncBoundaryGates: [],
			nextAsyncBoundaryIndex: 0,
			asyncRunners: new Map(),
			hasChildrenProp: rootInfo.propNames.includes('children'),
			branchSites: [],
			branchReactivityGates: [],
			nextBranchSiteIndex: 0,
			styleScopeClass: input.publicRenderPlan.styleScopes[0]?.scopeId ?? null,
			source: input.source.source,
		};
		const functionName = `marklessRenderSsr${reference.componentName}`;
		return [
			`const ${reference.localName} = { renderSsr: ${functionName} };`,
			`async function ${functionName}(props = {}) {`,
			destructureProps(rootInfo.propNames),
			'	const marklessSsrPayloadState = { ...marklessCloneState(payloadState), cells: [], computed: [] };',
			'	const marklessSsrRenderStateValues = new Map(marklessSsrStateValues);',
			...renderBodyLines(input, rootInfo, 'marklessStateValue', 'marklessSsrRenderStateValues', 'marklessSsrPayloadState', [
				'const marklessSsrChildren = [];',
				'const marklessSsrBranches = [];',
				'const marklessSsrAsyncSnapshots = [];',
				'const marklessSsrHostLocators = [];',
				`const html = ${emitHtmlNode(rootInfo.root, renderContext)};`,
			]),
			'	const marklessSsrComposition = marklessSsrComposeView(html, marklessViewWithoutAnchors(payloadView), marklessSsrHostLocators, marklessSsrChildren);',
			'	const marklessSsrState = marklessComposeState(marklessSsrPayloadState, marklessSsrChildren);',
			'	return { html, state: marklessSsrAttachSnapshots(marklessSsrState, marklessSsrAsyncSnapshots), view: { ...marklessSsrComposition.view, branches: marklessSsrMergeBranches(marklessSsrComposition.view.branches, marklessSsrBranches) }, elementCount: marklessSsrComposition.elementCount, propEvents: [], externalSymbolIds: marklessSsrComposition.externalSymbolIds };',
			'}',
		].filter((line): line is string => line !== null);
	});
}

function sameModuleComponentMap(ast: AnyNode): ReadonlyMap<string, AnyNode> {
	const components = new Map<string, AnyNode>();
	for (const statement of asNodes(ast.body)) {
		const component = getComponentFunction(statement);
		if (component) components.set(component.name, component.node);
	}
	return components;
}

function componentEdgesFor(
	input: PublicRenderModuleInput,
	componentName: string,
): PublicRenderModuleInput['semanticGraph']['componentEdges'] {
	return input.semanticGraph.componentEdges.filter(
		(edge) => edge.parentComponentName === componentName,
	);
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
			const isHost = tagName ? isHostTagName(tagName) : !!getDynamicTagExpression(node);
			if (isHost) {
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
		if (cell.value === undefined) return [];
		const value = deserializeGraphValue(cell.value as SerializedGraphPayload);
		return `	[${JSON.stringify(cell.graphNodeId)}, ${JSON.stringify(value)}]`;
	});
}

function emitHtmlNode(node: AnyNode, context: HtmlRenderContext): string {
	if (isStaticTextNode(node)) return JSON.stringify(staticTextValue(node));

	if (node.type === 'JSXExpressionContainer' || node.type === 'TSRXExpression') {
		const expression = node.expression as AnyNode | undefined;
		if (!expression) return '""';
		// Children placement is an opaque template projection: the prop carries
		// compiler-rendered HTML from the parent edge, so it interpolates raw.
		// Escaping it would turn projected markup into visible text.
		if (
			context.hasChildrenProp &&
			expressionSource(expression, context.source) === 'children'
		) {
			return `${renderHelper(context, 'ChildrenHtml')}(children)`;
		}
		return `${renderHelper(context, 'Text')}(${expressionSource(expression, context.source)})`;
	}

	if (node.type === 'JSXIfExpression') {
		const test = node.test as AnyNode | undefined;
		const testSource = `(${test ? expressionSource(test, context.source) : 'false'})`;
		if (context.mode === 'csr') {
			const csrSite = context.branchSites?.[context.nextBranchSiteIndex ?? 0];
			if (context.branchSites) {
				context.nextBranchSiteIndex = (context.nextBranchSiteIndex ?? 0) + 1;
			}
			const csrGate = csrSite
				? context.branchReactivityGates?.find((item) => item.branchSiteId === csrSite.id)
				: undefined;
			const ternary = `(${testSource} ? ${emitHtmlBranch(node.consequent as AnyNode | undefined, context)} : ${emitHtmlBranch(node.alternate as AnyNode | undefined, context)})`;
			if (csrSite && csrGate?.supported) {
				// The CSR-built DOM carries the same anchors, so the same resume
				// runtime flips the range on the live graph (arm seeds from reads).
				return joinSsrExpressions([
					JSON.stringify(`<!--markless:branch:${csrSite.id}-->`),
					ternary,
					JSON.stringify(`<!--/markless:branch:${csrSite.id}-->`),
				]);
			}
			return ternary;
		}

		const site = context.branchSites[context.nextBranchSiteIndex++];
		const gate = site
			? context.branchReactivityGates.find((item) => item.branchSiteId === site.id)
			: undefined;
		const before = {
			nextChildIndex: context.nextChildIndex,
			nextComponentEdgeIndex: context.nextComponentEdgeIndex,
		};
		const consequentContext: SsrRenderContext = {
			...context,
			insideSupportedBranchArm: context.insideSupportedBranchArm || !!gate?.supported,
		};
		const consequent = emitHtmlBranch(
			node.consequent as AnyNode | undefined,
			consequentContext,
		);
		// Child/component counters reset per arm (one arm renders at runtime);
		// semantic-order counters continue sequentially across arms so nested
		// sites keep their document-order alignment.
		const alternateContext = {
			...consequentContext,
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
		context.nextRepeatIndex = alternateContext.nextRepeatIndex;
		context.nextAsyncBoundaryIndex = alternateContext.nextAsyncBoundaryIndex;
		context.nextBranchSiteIndex = alternateContext.nextBranchSiteIndex;

		if (site && gate?.supported) {
			// Anchors always materialize; only the taken arm renders between them.
			return joinSsrExpressions([
				JSON.stringify(`<!--markless:branch:${site.id}-->`),
				`(${testSource} ? ${joinSsrExpressions([
					`marklessSsrBranchArm(marklessSsrBranches, ${JSON.stringify(site.id)}, 0)`,
					consequent,
				])} : ${joinSsrExpressions([
					`marklessSsrBranchArm(marklessSsrBranches, ${JSON.stringify(site.id)}, 1)`,
					alternate,
				])})`,
				JSON.stringify(`<!--/markless:branch:${site.id}-->`),
			]);
		}
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

	if (node.type === 'JSXTryExpression') {
		// CSR mount is a local demand: the same anchors + @pending emit
		// synchronously and the runner settles the range after creation.
		return emitAsyncBoundaryHtml(node, context);
	}

	if (node.type === 'JSXStyleElement') return '""';

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

	const scopeClass = context.styleScopeClass ?? null;

	if (getElementAttributes(node).some(isSpreadAttribute)) {
		return joinSsrExpressions([
			hostLocator,
			JSON.stringify(`<${tagName}`),
			`${renderHelper(context, 'SpreadAttributes')}({ ${mergedAttributeEntries(node, context.source).join(', ')} }, ${JSON.stringify(scopeClass)})`,
			JSON.stringify('>'),
			emitHtmlChildren(node, context),
			JSON.stringify(`</${tagName}>`),
		]);
	}

	const open = [`<${tagName}`];
	const dynamicAttributes: string[] = [];
	let scopeClassHandled = scopeClass === null;
	for (const attribute of getElementAttributes(node)) {
		const name = getIdentifierName(attribute.name as AnyNode | undefined);
		if (!name || isEventAttribute(name) || name === 'attach' || name === 'el') continue;
		const value = attribute.value as AnyNode | undefined;
		const expression = unwrapExpressionContainer(value);
		const scopeSuffix = name === 'class' && scopeClass ? ` ${scopeClass}` : '';
		if (scopeSuffix) scopeClassHandled = true;
		if (!value) {
			open.push(` ${name}="${scopeSuffix.trim()}"`);
		} else if (value.type === 'Literal' && typeof value.value !== 'object') {
			open.push(` ${name}="${escapeAttribute(String(value.value))}${scopeSuffix}"`);
		} else if (expression?.type === 'Literal' && typeof expression.value !== 'object') {
			open.push(` ${name}="${escapeAttribute(String(expression.value))}${scopeSuffix}"`);
		} else if (expression) {
			const valueSource = scopeSuffix
				? `((marklessClassValue) => (marklessClassValue == null ? "" : String(marklessClassValue)) + ${JSON.stringify(scopeSuffix)})(${expressionSource(expression, context.source)})`
				: expressionSource(expression, context.source);
			dynamicAttributes.push(
				`${renderHelper(context, 'Attribute')}(${JSON.stringify(name)}, ${valueSource})`,
			);
		}
	}
	if (!scopeClassHandled && scopeClass) open.push(` class="${scopeClass}"`);

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
	if (context.insideSupportedBranchArm) {
		return 'marklessSsrArmHost(marklessSsrHostLocators)';
	}
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
	return `marklessSsrRepeatRows(marklessSsrHostLocators, ${repeat.collectionSource}, ${repeat.itemName} => ${itemPathReadSource(repeat.itemName, repeat.keyPath)}, ${JSON.stringify(repeat.id)}, ${JSON.stringify(repeat.itemName)}, ${JSON.stringify(repeat.keyPath)}, ${rowParams} => ${rowHtml}, ${countRowElements(row)}, ${emptyThunk})`;
}

// Supported async boundaries emit their payload-planned comment anchors.
// SSR awaits the demanded async computed inline (renderSsr is async) and
// renders the resolved @try or @catch arm between the anchors; boundaries
// without a runner, and the CSR string path, render @pending — the browser
// runtime settles that range after creation.
function emitAsyncBoundaryHtml(node: AnyNode, context: HtmlRenderContext): string {
	if (!context.asyncBoundaries || context.nextAsyncBoundaryIndex === undefined) return '""';
	const boundary = context.asyncBoundaries[context.nextAsyncBoundaryIndex++];
	// Nested boundaries never render, but their indexes must stay consumed so
	// later boundaries keep matching the payload arena's document order.
	context.nextAsyncBoundaryIndex += countDescendantBoundaries(node);
	if (!boundary) return '""';
	const gate = context.asyncBoundaryGates?.find((item) => item.boundaryId === boundary.id);
	if (!gate?.supported) return '""';

	const pendingChildren = asNodes((node.pending as AnyNode | undefined)?.body).filter(
		(child) => !isIgnorableTextNode(child),
	);
	const pendingHtml = joinSsrExpressions(
		pendingChildren.map((child) => emitHtmlNode(child, context)),
	);
	const runner = context.mode === 'ssr' ? context.asyncRunners?.get(boundary.id) : undefined;
	if (context.mode === 'ssr' && runner) {
		// v1 initial render awaits demanded async nodes and serves the settled
		// arm; the payload snapshot lets resume start zero runners (spec 03/06).
		const tryChildren = asNodes((node.block as AnyNode | undefined)?.body).filter(
			(child) => !isIgnorableTextNode(child),
		);
		const tryHtml = joinSsrExpressions(
			tryChildren.map((child) => emitHtmlNode(child, context)),
		);
		const handler = node.handler as AnyNode | undefined;
		const catchChildren = asNodes((handler?.body as AnyNode | undefined)?.body).filter(
			(child) => !isIgnorableTextNode(child),
		);
		const catchHtml = joinSsrExpressions(
			catchChildren.map((child) => emitHtmlNode(child, context)),
		);
		const catchParam =
			getIdentifierName(handler?.param as AnyNode | undefined) ?? 'marklessSsrAsyncError';
		return joinSsrExpressions([
			JSON.stringify(`<!--markless:async:${boundary.id}-->`),
			`(((marklessSsrAsyncSnapshot) => marklessSsrAsyncSnapshot.status === "fulfilled" ? ((${runner.name}) => ${tryHtml})(marklessSsrAsyncSnapshot.value) : ((${catchParam}) => ${catchHtml})(marklessSsrAsyncSnapshot.error))(await marklessSsrRunAsyncComputed(marklessSsrAsyncSnapshots, ${JSON.stringify(runner.graphNodeId)}, ${runner.source})))`,
			JSON.stringify(`<!--/markless:async:${boundary.id}-->`),
		]);
	}
	return joinSsrExpressions([
		JSON.stringify(`<!--markless:async:${boundary.id}-->`),
		pendingHtml,
		JSON.stringify(`<!--/markless:async:${boundary.id}-->`),
	]);
}

// The runner's authored async function, keyed by the boundary that demands
// it. SSR awaits it inline; state locals put its free reads in scope.
function collectSsrAsyncRunners(
	input: PublicRenderModuleInput,
): ReadonlyMap<
	string,
	{ readonly graphNodeId: string; readonly name: string; readonly source: string }
> {
	const runnersByGraphNode = new Map(
		input.symbolResolver.symbols.flatMap((symbol) =>
			symbol.kind === 'async-computed-runner'
				? [[symbol.graphNodeId, { name: symbol.name, source: symbol.source }] as const]
				: [],
		),
	);
	const byBoundary = new Map<
		string,
		{ readonly graphNodeId: string; readonly name: string; readonly source: string }
	>();
	for (const boundary of input.protocolView.asyncBoundaries) {
		const read = boundary.asyncReads[0];
		const runner = read ? runnersByGraphNode.get(read.graphNodeId) : undefined;
		if (read && runner) {
			byBoundary.set(boundary.id, { graphNodeId: read.graphNodeId, ...runner });
		}
	}
	return byBoundary;
}

function countDescendantBoundaries(node: AnyNode): number {
	return childNodes(node).reduce(
		(total, child) =>
			total + (child.type === 'JSXTryExpression' ? 1 : 0) + countDescendantBoundaries(child),
		0,
	);
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
	return `marklessCsrRepeatRows(${repeat.collectionSource}, ${repeat.itemName} => ${itemPathReadSource(repeat.itemName, repeat.keyPath)}, ${JSON.stringify(repeat.id)}, ${JSON.stringify(repeat.itemName)}, ${JSON.stringify(repeat.keyPath)}, ${rowParams} => ${rowHtml}, ${emptyThunk})`;
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
	const dynamicScopeClass = context.styleScopeClass ?? null;
	const attributesExpression =
		attributeEntries.length > 0 || dynamicScopeClass
			? `${renderHelper(context, 'SpreadAttributes')}({ ${attributeEntries.join(', ')} }, ${JSON.stringify(dynamicScopeClass)})`
			: '""';
	const tagValueExpression =
		context.mode === 'ssr'
			? `marklessSsrDynamicTagName(${expressionSource(tagExpression, context.source)})`
			: `marklessCsrDynamicTagName(${expressionSource(tagExpression, context.source)})`;
	// Rendered dynamic elements claim a real dom-order locator carrying the
	// runtime tag, so events/attach/el on them resolve like any host element.
	const dynamicHostId = context.mode === 'ssr' ? context.hostIdByNode.get(node) : undefined;
	const dynamicHostLocator =
		context.mode === 'ssr' && dynamicHostId && !context.insideRepeatRow
			? `marklessSsrHost(marklessSsrHostLocators, ${JSON.stringify(dynamicHostId)}, marklessDynamicTag)`
			: '""';

	return `((marklessDynamicTag) => marklessDynamicTag ? ${joinSsrExpressions([
		dynamicHostLocator,
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
	const site = context.branchSites?.[context.nextBranchSiteIndex ?? 0];
	if (context.branchSites) {
		context.nextBranchSiteIndex = (context.nextBranchSiteIndex ?? 0) + 1;
	}
	const siteGate = site
		? context.branchReactivityGates?.find((item) => item.branchSiteId === site.id)
		: undefined;
	const discriminant = node.discriminant as AnyNode | undefined;
	const discriminantSource = `(${discriminant ? expressionSource(discriminant, context.source) : 'undefined'})`;

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
		const caseContext: SsrRenderContext = {
			...context,
			...before,
			insideSupportedBranchArm:
				(context as SsrRenderContext).insideSupportedBranchArm || !!siteGate?.supported,
		};
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
	const chain = `((marklessSwitchValue) => ${expression})(${discriminantSource})`;
	if (site && siteGate?.supported) {
		return joinSsrExpressions([
			JSON.stringify(`<!--markless:branch:${site.id}-->`),
			chain,
			JSON.stringify(`<!--/markless:branch:${site.id}-->`),
		]);
	}
	return chain;
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
	helper: 'Attribute' | 'ChildrenHtml' | 'SpreadAttributes' | 'Text',
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

	return `(await marklessSsrRenderChild(marklessSsrChildren, ${localName}, { ${props.join(', ')} }, { hostPrefix: ${JSON.stringify(placement.hostPrefix)}, symbolPrefix: ${JSON.stringify(placement.symbolPrefix)}, localIndex: marklessSsrHostLocators.length, graphProps: ${JSON.stringify(placement.graphProps)} }))`;
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
		if (
			node.type !== 'Element' &&
			node.type !== 'JSXElement' &&
			node.type !== 'Fragment' &&
			node.type !== 'JSXFragment'
		) {
			return;
		}

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

function isFragmentNode(node: AnyNode | undefined): boolean {
	return node?.type === 'Fragment' || node?.type === 'JSXFragment';
}
