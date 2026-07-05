import type { PublicRenderModuleInput } from '../../artifacts.ts';
import { emitHtmlNode, collectSsrAsyncRunners } from './html.ts';
import { renderBodyLines } from './render-body.ts';
import { stateRuntimeLines } from './runtime-helpers.ts';
import { emitSameModuleSsrComponents } from './same-module.ts';
import { assignSsrHostIds, callbackSymbolIds, componentEdgesFor, componentReferences, destructureProps, emitComponentImport, emitValueImport, isComponentRoot, publicRenderValueImports, stateEntries, staticHostLocators, moduleScopeLines } from './shared.ts';
import { collectSsrPropEvents } from './component-wiring.ts';
import type { PublicRenderRoot, SsrRenderContext } from './types.ts';

export function emitPublicSsrRenderModule(
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
