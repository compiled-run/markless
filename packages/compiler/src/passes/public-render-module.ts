import { deserializeGraphValue } from '@arcade/serializer';
import type { SerializedGraphPayload } from '@arcade/serializer';
import type {
	PublicRenderModuleArtifact,
	PublicRenderModuleInput,
	PublicRenderPlanArtifact,
	SymbolResolverPlan,
} from '../artifacts.ts';

type KeyedRepeatPlan = PublicRenderPlanArtifact['keyedRepeats'][number];
type ProtocolState = PublicRenderModuleInput['protocolState'];
type ProtocolView = PublicRenderModuleInput['protocolView'];
type PublicGraphMethod = 'call' | 'delete';

export function emitPublicRenderModule(input: PublicRenderModuleInput): PublicRenderModuleArtifact {
	return {
		passId: 'public-render-module',
		moduleSource: emitPublicRenderComponents({
			componentNames: input.semanticGraph.components.map((component) => component.name),
			publicRenderPlan: input.publicRenderPlan,
			protocolState: input.protocolState,
			protocolView: input.protocolView,
			symbolResolver: input.symbolResolver,
		}),
		diagnostics: input.publicRenderPlan.diagnostics,
	};
}

function emitPublicRenderComponents(input: {
	readonly componentNames: ReadonlyArray<string>;
	readonly publicRenderPlan: PublicRenderPlanArtifact;
	readonly protocolState: ProtocolState;
	readonly protocolView: ProtocolView;
	readonly symbolResolver: SymbolResolverPlan;
}) {
	if (
		!input.publicRenderPlan.rootTemplateHtml ||
		input.componentNames.length !== 1 ||
		!canEmitPublicRenderModule(input.publicRenderPlan)
	) {
		return '';
	}

	const publicView = createPublicProtocolView(input.protocolView, input.publicRenderPlan);
	const directPublicStateEntries = emitDirectPublicStateEntries(input.protocolState);
	if (
		directPublicStateEntries === null ||
		!canUseDirectPublicRuntime(input.protocolState, publicView)
	) {
		return '';
	}

	const publicStaticEvents = emitPublicStaticEvents(publicView);
	const componentFactories = input.componentNames.map((name) => emitComponentFactory(name));
	const graphMethods = publicGraphMethods(input.symbolResolver);
	const repeatCalls = input.publicRenderPlan.keyedRepeats.map(
		(_repeat, index) => `	syncArcadePublicRepeat${index}(root, graph, loadSymbolForRepeat);`,
	);
	const repeatFunctions = input.publicRenderPlan.keyedRepeats.flatMap((repeat, index) => [
		emitRepeatSyncFunction(repeat, index),
		emitRepeatWriteFunction(repeat, index),
		emitRepeatEventFunction(repeat, index),
	]);

	return [
		'',
		`const arcadePublicRootTemplate = ${JSON.stringify(input.publicRenderPlan.rootTemplateHtml)};`,
		'const arcadePublicRepeatStates = new WeakMap();',
		'const arcadePublicRowTemplates = new Map();',
		`const arcadePublicStateEntries = ${directPublicStateEntries};`,
		`const arcadePublicStaticEvents = ${publicStaticEvents};`,
		'',
		...componentFactories,
		'',
		'function createArcadePublicRoot() {\n\tconst template = document.createElement("template");\n\ttemplate.innerHTML = arcadePublicRootTemplate;\n\tconst root = template.content.firstElementChild;\n\tif (!root) throw new Error("Arcade public render template did not create a root element.");\n\treturn root;\n}',
		'',
		'function createArcadePublicLoadSymbol(root) {\n\treturn async function loadArcadePublicSymbol(symbolId) {\n\t\tconst symbol = await loadSymbol(symbolId);\n\t\treturn async function runArcadePublicSymbol(context) {\n\t\t\tconst value = await symbol(context);\n\t\t\tsyncArcadePublicRepeats(root, context.graph, loadArcadePublicSymbol);\n\t\t\treturn value;\n\t\t};\n\t};\n}',
		'',
		'function createArcadePublicRuntime(graph) {\n\treturn {\n\t\tgraph,\n\t\tview: { version: 1, locators: [], events: [], domUpdates: [], behaviors: [], elementHandles: [], asyncBoundaries: [] },\n\t\tasync dispatch() {},\n\t};\n}',
		'',
		emitCreatePublicGraph(graphMethods),
		'',
		'function attachArcadePublicStaticEvents(root, graph, loadSymbolForEvent) {\n\tfor (const [index, eventName, symbolIds] of arcadePublicStaticEvents) {\n\t\tconst element = elementAtDomOrder(root, index);\n\t\tif (!element?.addEventListener) continue;\n\t\telement.addEventListener(eventName, async (event) => {\n\t\t\tfor (const symbolId of symbolIds) {\n\t\t\t\tconst symbol = await loadSymbolForEvent(symbolId);\n\t\t\t\tawait symbol({ graph, event, element, getElementHandle: () => undefined });\n\t\t\t}\n\t\t\tawait graph.flush();\n\t\t});\n\t}\n}',
		'',
		'function syncArcadePublicRepeats(root, graph, loadSymbolForRepeat) {',
		...repeatCalls,
		'}',
		'',
		'function repeatState(root, planIndex) {\n\tlet states = arcadePublicRepeatStates.get(root);\n\tif (!states) { states = []; arcadePublicRepeatStates.set(root, states); }\n\tif (!states[planIndex]) states[planIndex] = { rows: new Map(), keys: [], classValues: [] };\n\treturn states[planIndex];\n}',
		'',
		'function createArcadePublicRow(html) {\n\tlet template = arcadePublicRowTemplates.get(html);\n\tif (!template) { template = document.createElement("template"); template.innerHTML = html; arcadePublicRowTemplates.set(html, template); }\n\tconst row = template.content.firstElementChild?.cloneNode(true);\n\tif (!row) throw new Error("Arcade repeat template did not create a row element.");\n\treturn row;\n}',
		'',
		...repeatFunctions,
		'function sameArcadePublicKeys(previous, next) {\n\tif (previous.length !== next.length) return false;\n\tfor (let index = 0; index < next.length; index++) if (previous[index] !== next[index]) return false;\n\treturn true;\n}',
		'',
		'function appendArcadePublicRows(parent, state, nextKeys) {\n\tconst start = state.keys.length;\n\tif (start >= nextKeys.length) return false;\n\tfor (let index = 0; index < start; index++) if (state.keys[index] !== nextKeys[index]) return false;\n\tfor (let index = start; index < nextKeys.length; index++) { const record = state.rows.get(nextKeys[index]); if (!record) return false; parent.appendChild?.(record.root); }\n\treturn true;\n}',
		'',
		'function clearArcadePublicRows(parent, state) {\n\tif (parent.textContent !== undefined) parent.textContent = ""; else parent.replaceChildren?.();\n\tstate.rows.clear();\n\tstate.keys = [];\n\tstate.classValues = [];\n}',
		'function removeArcadePublicMissingKey(parent, state, nextKeys) {\n\tif (state.keys.length !== nextKeys.length + 1) return false;\n\tlet missingKey;\n\tlet nextIndex = 0;\n\tfor (const key of state.keys) {\n\t\tif (nextKeys[nextIndex] === key) { nextIndex++; continue; }\n\t\tif (missingKey !== undefined) return false;\n\t\tmissingKey = key;\n\t}\n\tif (missingKey === undefined || nextIndex !== nextKeys.length) return false;\n\tconst record = state.rows.get(missingKey);\n\tif (!record) return false;\n\tif (record.root.remove) record.root.remove(); else parent.removeChild?.(record.root);\n\treturn true;\n}',
		'',
		'function swapArcadePublicRows(parent, state, nextKeys) {\n\tif (state.keys.length !== nextKeys.length) return false;\n\tconst mismatch = [];\n\tfor (let index = 0; index < nextKeys.length; index++) if (state.keys[index] !== nextKeys[index]) mismatch.push(index);\n\tif (mismatch.length !== 2) return false;\n\tconst firstIndex = mismatch[0];\n\tconst secondIndex = mismatch[1];\n\tif (state.keys[firstIndex] !== nextKeys[secondIndex] || state.keys[secondIndex] !== nextKeys[firstIndex]) return false;\n\tconst first = state.rows.get(state.keys[firstIndex]);\n\tconst second = state.rows.get(state.keys[secondIndex]);\n\tif (!first || !second || !parent.insertBefore) return false;\n\tconst afterSecond = second.root.nextSibling;\n\tparent.insertBefore(second.root, first.root);\n\tif (afterSecond) parent.insertBefore(first.root, afterSecond); else parent.appendChild?.(first.root);\n\treturn true;\n}',
		'',
		'function elementAtDomOrder(root, index) {\n\tlet seen = -1;\n\tlet found;\n\tconst visit = (node) => { if (found || !node) return; if (node.nodeType === 1 && ++seen === index) { found = node; return; } const children = node.childNodes; for (let childIndex = 0; !found && childIndex < (children?.length ?? 0); childIndex++) visit(children[childIndex]); };\n\tvisit(root);\n\treturn found;\n}',
		'',
		'function nodeAtPath(root, path) {\n\tlet node = root;\n\tfor (const index of path) { node = node?.childNodes?.[index]; if (!node) return undefined; }\n\treturn node;\n}',
		'',
		'function readArcadePublicPath(value, path) {\n\tlet current = value;\n\tfor (const key of path) current = current?.[key];\n\treturn current;\n}',
		'',
		'function writeArcadePublicPath(value, path, nextValue) {\n\tif (path.length === 0) return nextValue;\n\tconst root = value && typeof value === "object" ? value : {};\n\tlet current = root;\n\tfor (const key of path.slice(0, -1)) { if (!current[key] || typeof current[key] !== "object") current[key] = {}; current = current[key]; }\n\tcurrent[path[path.length - 1]] = nextValue;\n\treturn root;\n}',
		'',
		'function cloneArcadePublicValue(value) {\n\tif (Array.isArray(value)) return value.map(cloneArcadePublicValue);\n\tif (value && typeof value === "object") { const clone = {}; for (const key of Object.keys(value)) clone[key] = cloneArcadePublicValue(value[key]); return clone; }\n\treturn value;\n}',
		'',
		'function stringifyArcadePublicValue(value) { return value == null ? "" : String(value); }',
		'',
	].join('\n');
}

function canEmitPublicRenderModule(publicRenderPlan: PublicRenderPlanArtifact): boolean {
	return (
		(!publicRenderPlan.repeatGates.some((gate) => !gate.supported) &&
			publicRenderPlan.keyedRepeats.length === publicRenderPlan.repeatGates.length) ||
		publicRenderPlan.repeatGates.length === 0
	);
}

function emitComponentFactory(name: string) {
	return [
		`export function ${name}() {`,
		'	const root = createArcadePublicRoot();',
		'	const graph = createArcadePublicGraph();',
		'	const componentLoadSymbol = createArcadePublicLoadSymbol(root);',
		'	attachArcadePublicStaticEvents(root, graph, componentLoadSymbol);',
		'	syncArcadePublicRepeats(root, graph, componentLoadSymbol);',
		'	return {',
		'		root,',
		'		graph,',
		'		runtime: createArcadePublicRuntime(graph),',
		'	};',
		'}',
	].join('\n');
}

function canUseDirectPublicRuntime(
	protocolState: ProtocolState,
	publicView: ProtocolView,
): boolean {
	if ((protocolState.sharedDefinitions?.length ?? 0) > 0) return false;
	if (protocolState.computed.length > 0) return false;
	if (publicView.domUpdates.length > 0) return false;
	if (publicView.behaviors.length > 0) return false;
	if (publicView.elementHandles.length > 0) return false;
	if (publicView.asyncBoundaries.length > 0) return false;
	return publicView.events.every((event) => !event.syncPolicy);
}

function emitDirectPublicStateEntries(protocolState: ProtocolState): string | null {
	const entries: string[] = [];

	for (const cell of protocolState.cells) {
		if (cell.valueKind === 'unknown') return null;
		if (cell.value === undefined) return null;

		const value = deserializeGraphValue(cell.value as SerializedGraphPayload);
		if (!isDirectPublicLiteralValue(value)) return null;
		entries.push(`[${JSON.stringify(cell.graphNodeId)}, ${literalExpression(value)}]`);
	}

	return `[${entries.join(',')}]`;
}

function emitPublicStaticEvents(publicView: ProtocolView): string {
	return `[${publicView.events
		.map((event) => {
			const locator = publicView.locators.find(
				(locator) => locator.hostNodeId === event.hostNodeId,
			);
			return locator
				? `[${locator.index}, ${JSON.stringify(event.eventName)}, ${JSON.stringify(event.symbolIds)}]`
				: null;
		})
		.filter((entry): entry is string => entry !== null)
		.join(',')}]`;
}

function publicGraphMethods(symbolResolver: SymbolResolverPlan): ReadonlySet<PublicGraphMethod> {
	const methods = new Set<PublicGraphMethod>();
	for (const symbol of symbolResolver.symbols) {
		if (symbol.kind !== 'event-handler') continue;
		for (const write of symbol.writes ?? []) {
			if (write.operation === 'call') methods.add('call');
			if (write.operation === 'delete') methods.add('delete');
		}
	}
	return methods;
}

function emitCreatePublicGraph(methods: ReadonlySet<PublicGraphMethod>): string {
	const optionalMethods = [
		methods.has('call')
			? '\t\tcall(call) { const target = readArcadePublicPath(cells.get(call.graphNodeId), call.path ?? []); const method = target?.[call.method]; if (typeof method !== "function") throw new TypeError("Unsupported Arcade public graph call."); return method.apply(target, call.args ?? []); },'
			: null,
		methods.has('delete')
			? '\t\tdelete(deletion) { const path = deletion.path ?? []; if (path.length === 0) return false; const parent = readArcadePublicPath(cells.get(deletion.graphNodeId), path.slice(0, -1)); if (!parent || typeof parent !== "object") return true; return delete parent[path[path.length - 1]]; },'
			: null,
	].filter((method): method is string => method !== null);

	return [
		'function createArcadePublicGraph() {',
		'\tconst cells = new Map(arcadePublicStateEntries.map(([id, value]) => [id, cloneArcadePublicValue(value)]));',
		'\treturn {',
		'\t\tread(graphNodeId, path = []) { return readArcadePublicPath(cells.get(graphNodeId), path); },',
		'\t\twrite(write) { const path = write.path ?? []; cells.set(write.graphNodeId, writeArcadePublicPath(cells.get(write.graphNodeId), path, write.value)); },',
		'\t\tupdate(update) { const path = update.path ?? []; const currentValue = readArcadePublicPath(cells.get(update.graphNodeId), path); const nextValue = update.update(currentValue); cells.set(update.graphNodeId, writeArcadePublicPath(cells.get(update.graphNodeId), path, nextValue)); if (update.returnValue === "previous") return currentValue; if (update.returnValue === "next") return nextValue; },',
		...optionalMethods,
		'\t\tflush() {},',
		'\t};',
		'}',
	].join('\n');
}

function literalExpression(value: unknown): string {
	if (value === undefined) return 'undefined';
	return JSON.stringify(value);
}

function isDirectPublicLiteralValue(value: unknown, seen = new Set<object>()): boolean {
	if (value === null) return true;
	if (typeof value === 'string' || typeof value === 'boolean') return true;
	if (typeof value === 'number') return Number.isFinite(value);

	if (Array.isArray(value)) {
		if (seen.has(value)) return false;
		seen.add(value);
		return value.every((item) => isDirectPublicLiteralValue(item, seen));
	}

	if (value && typeof value === 'object') {
		if (seen.has(value)) return false;
		if (!isDirectPublicPlainObject(value)) return false;

		seen.add(value);
		return Object.values(value).every((item) => isDirectPublicLiteralValue(item, seen));
	}

	return false;
}

function isDirectPublicPlainObject(value: object): value is Record<string, unknown> {
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function createPublicProtocolView(
	protocolView: ProtocolView,
	publicRenderPlan: PublicRenderPlanArtifact,
): ProtocolView {
	const hostNodeIds = new Set(publicRenderPlan.staticHostNodeIds);
	const hostNodeIndexes = new Map(
		publicRenderPlan.staticHostNodeIds.map((hostNodeId, index) => [hostNodeId, index]),
	);

	return {
		...protocolView,
		locators: protocolView.locators
			.filter((locator) => hostNodeIds.has(locator.hostNodeId))
			.map((locator) => ({
				...locator,
				index: hostNodeIndexes.get(locator.hostNodeId) ?? locator.index,
			})),
		events: protocolView.events.filter((event) => hostNodeIds.has(event.hostNodeId)),
		domUpdates: protocolView.domUpdates.filter((update) => hostNodeIds.has(update.hostNodeId)),
	};
}

function emitRepeatSyncFunction(repeat: KeyedRepeatPlan, index: number) {
	return [
		`function syncArcadePublicRepeat${index}(root, graph, loadSymbolForRepeat) {\n\tconst parent = elementAtDomOrder(root, ${repeat.parentLocator.index});\n\tif (!parent?.replaceChildren) return;\n\tconst items = graph.read(${JSON.stringify(repeat.collectionGraphNodeId)}, ${JSON.stringify(repeat.collectionPath)});\n\tif (!Array.isArray(items)) return;\n\tconst state = repeatState(root, ${index});\n\tif (items.length === 0) { clearArcadePublicRows(parent, state); return; }\n\tconst liveKeys = new Set();\n\tconst nodes = [];\n\tconst nextKeys = [];`,
		`	for (const item of items) {\n\t\tconst key = readArcadePublicPath(item, ${JSON.stringify(repeat.keyPath)});\n\t\tliveKeys.add(key);\n\t\tnextKeys.push(key);\n\t\tlet record = state.rows.get(key);\n\t\tif (!record) {\n\t\t\trecord = { root: createArcadePublicRow(${JSON.stringify(repeat.rowTemplateHtml)}), item, events: new Set() };\n\t\t\tstate.rows.set(key, record);\n\t\t\twriteArcadePublicRepeat${index}Row(record.root, graph, item);\n\t\t\tattachArcadePublicRepeat${index}Events(record, graph, loadSymbolForRepeat);\n\t\t} else if (record.item !== item) {\n\t\t\trecord.item = item;\n\t\t\twriteArcadePublicRepeat${index}Row(record.root, graph, item);\n\t\t} else {\n\t\t\trecord.item = item;\n\t\t}\n\t\tnodes.push(record.root);\n\t}`,
		`	if (state.keys.length === 0 || parent.childNodes?.length === 0) {\n\t\tparent.replaceChildren(...nodes);\n\t} else if (!sameArcadePublicKeys(state.keys, nextKeys) &&\n\t\t!appendArcadePublicRows(parent, state, nextKeys) &&\n\t\t!removeArcadePublicMissingKey(parent, state, nextKeys) &&\n\t\t!swapArcadePublicRows(parent, state, nextKeys)) {\n\t\tparent.replaceChildren(...nodes);\n\t}\n\tfor (const key of Array.from(state.rows.keys())) if (!liveKeys.has(key)) state.rows.delete(key);\n\tupdateArcadePublicRepeat${index}Classes(state, graph);\n\tstate.keys = nextKeys;\n}`,
		'',
	].join('\n');
}

function emitRepeatWriteFunction(repeat: KeyedRepeatPlan, index: number) {
	const textWrites = repeat.textWrites.flatMap((write, writeIndex) => [
		`	const textTarget${writeIndex} = nodeAtPath(row, ${JSON.stringify(write.nodePath)});`,
		`	if (textTarget${writeIndex}) textTarget${writeIndex}.textContent = stringifyArcadePublicValue(readArcadePublicPath(item, ${JSON.stringify(write.itemPath)}));`,
	]);
	const classWrites = repeat.classWrites.flatMap((write, writeIndex) => [
		`	const classTarget${writeIndex} = nodeAtPath(row, ${JSON.stringify(write.hostPath)});`,
		`	if (classTarget${writeIndex}?.setAttribute) {`,
		`		const stateValue${writeIndex} = graph.read(${JSON.stringify(write.stateGraphNodeId)}, ${JSON.stringify(write.statePath)});`,
		`		const itemValue${writeIndex} = readArcadePublicPath(item, ${JSON.stringify(write.itemPath)});`,
		`		classTarget${writeIndex}.setAttribute("class", stateValue${writeIndex} === itemValue${writeIndex} ? ${JSON.stringify(write.trueClass)} : ${JSON.stringify(write.falseClass)});`,
		'	}',
	]);

	return [
		`function writeArcadePublicRepeat${index}Row(row, graph, item) {`,
		...textWrites,
		...classWrites,
		'}',
		'',
		emitRepeatClassStateFunction(repeat, index),
	].join('\n');
}

function emitRepeatClassStateFunction(repeat: KeyedRepeatPlan, index: number) {
	const stateChecks = repeat.classWrites.flatMap((write, writeIndex) => [
		`	const stateValue${writeIndex} = graph.read(${JSON.stringify(write.stateGraphNodeId)}, ${JSON.stringify(write.statePath)});`,
		`	if (state.classValues[${writeIndex}] !== stateValue${writeIndex}) {`,
		`		updateArcadePublicRepeat${index}Class${writeIndex}(state, graph, state.classValues[${writeIndex}]);`,
		`		updateArcadePublicRepeat${index}Class${writeIndex}(state, graph, stateValue${writeIndex});`,
		`		state.classValues[${writeIndex}] = stateValue${writeIndex};`,
		'	}',
	]);
	const classUpdaters = repeat.classWrites.flatMap((write, writeIndex) => [
		`function updateArcadePublicRepeat${index}Class${writeIndex}(state, graph, matchValue) {`,
		`	const stateValue${writeIndex} = graph.read(${JSON.stringify(write.stateGraphNodeId)}, ${JSON.stringify(write.statePath)});`,
		'	for (const record of state.rows.values()) {',
		`		const itemValue${writeIndex} = readArcadePublicPath(record.item, ${JSON.stringify(write.itemPath)});`,
		`		if (itemValue${writeIndex} !== matchValue) continue;`,
		`		const classTarget${writeIndex} = nodeAtPath(record.root, ${JSON.stringify(write.hostPath)});`,
		`		if (classTarget${writeIndex}?.setAttribute) classTarget${writeIndex}.setAttribute("class", stateValue${writeIndex} === itemValue${writeIndex} ? ${JSON.stringify(write.trueClass)} : ${JSON.stringify(write.falseClass)});`,
		'	}',
		'}',
		'',
	]);

	return [
		`function updateArcadePublicRepeat${index}Classes(state, graph) {`,
		...stateChecks,
		'}',
		'',
		...classUpdaters,
	].join('\n');
}

function emitRepeatEventFunction(repeat: KeyedRepeatPlan, index: number) {
	const eventControls = repeat.eventControls.flatMap((eventControl, eventIndex) => [
		`	const element${eventIndex} = nodeAtPath(record.root, ${JSON.stringify(eventControl.hostPath)});\n\tif (element${eventIndex}?.addEventListener) {\n\t\tconst eventKey${eventIndex} = ${JSON.stringify(`${eventControl.eventName}\n${eventControl.symbolId}`)};\n\t\tif (!record.events.has(eventKey${eventIndex})) {\n\t\t\trecord.events.add(eventKey${eventIndex});\n\t\t\telement${eventIndex}.addEventListener(${JSON.stringify(eventControl.eventName)}, async (event) => {\n\t\t\t\tconst symbol = await loadSymbolForRepeat(${JSON.stringify(eventControl.symbolId)});\n\t\t\t\tawait symbol({ graph, event, element: element${eventIndex}, getElementHandle: () => undefined, locals: { ${JSON.stringify(eventControl.itemContext.itemName)}: record.item } });\n\t\t\t\tawait graph.flush();\n\t\t\t});\n\t\t}\n\t}`,
	]);

	return [
		`function attachArcadePublicRepeat${index}Events(record, graph, loadSymbolForRepeat) {`,
		...eventControls,
		'}',
		'',
	].join('\n');
}
