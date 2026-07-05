import type { PublicRenderModuleInput } from '../../artifacts.ts';
import { emitHtmlNode } from './html.ts';
import { renderBodyLines } from './render-body.ts';
import { stateRuntimeLines } from './runtime-helpers.ts';
import { emitSameModuleCsrComponents } from './same-module.ts';
import { callbackSymbolIds, componentEdgesFor, componentReferences, destructureProps, emitComponentImport, emitValueImport, isFragmentNode, publicRenderValueImports, stateEntries, staticHostLocators, joinSsrExpressions, moduleScopeLines } from './shared.ts';
import { collectCsrPropEvents } from './component-wiring.ts';
import type { CsrRenderContext, PublicRenderRoot } from './types.ts';

export function emitPublicCsrRenderModule(
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
