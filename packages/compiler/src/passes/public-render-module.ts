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

	const publicStaticEvents = emitPublicStaticEvents(input.publicRenderPlan);
	const hasRepeats = input.publicRenderPlan.keyedRepeats.length > 0;
	const hasSingleRepeat = input.publicRenderPlan.keyedRepeats.length === 1;
	const useSingleRepeatClassValue =
		hasSingleRepeat && input.publicRenderPlan.keyedRepeats[0]?.classWrites.length === 1;
	const repeatStateName = hasSingleRepeat ? 'repeatState0' : null;
	const hasStaticEvents = input.publicRenderPlan.staticEventControls.length > 0;
	const hasStaticTextWrites = input.publicRenderPlan.staticTextWrites.length > 0;
	const componentFactories = input.componentNames.map((name) =>
		emitComponentFactory(name, {
			repeatSyncCall: publicRepeatSyncCall(
				input.publicRenderPlan,
				'graph',
				'componentLoadSymbol',
				repeatStateName,
			),
			repeatStateName,
			repeatStateInitializer: useSingleRepeatClassValue
				? '{ rows: new Map(), keys: [], classValue: undefined }'
				: '{ rows: new Map(), keys: [], classValues: [] }',
			hasStaticEvents,
			hasStaticTextWrites,
		}),
	);
	const graphMethods = publicGraphMethods(input.symbolResolver);
	const repeatCalls = input.publicRenderPlan.keyedRepeats.map(
		(_repeat, index) => `	syncArcadePublicRepeat${index}(root, graph, loadSymbolForRepeat);`,
	);
	const repeatFunctions = input.publicRenderPlan.keyedRepeats.flatMap((repeat, index) => [
		emitRepeatRecordFunction(repeat, index),
		emitRepeatSyncFunction(repeat, index, { hasSingleRepeat }),
		emitRepeatPatchFunction(repeat, index),
		emitRepeatWriteFunction(repeat, index),
		emitRepeatEventFunction(repeat, index),
	]);

	return [
		'',
		`const arcadePublicRootTemplate = ${JSON.stringify(input.publicRenderPlan.rootTemplateHtml)};`,
		hasRepeats && !hasSingleRepeat ? 'const arcadePublicRepeatStates = new WeakMap();' : null,
		hasRepeats ? 'const arcadePublicRowTemplates = new Map();' : null,
		`const arcadePublicStaticEvents = ${publicStaticEvents};`,
		'',
		...componentFactories,
		'',
		'function createArcadePublicRoot() {\n\tconst template = document.createElement("template");\n\ttemplate.innerHTML = arcadePublicRootTemplate;\n\tconst root = template.content.firstElementChild;\n\tif (!root) throw new Error("Arcade public render template did not create a root element.");\n\treturn root;\n}',
		'',
		emitPublicLoadSymbolFunction({
			repeatSyncCall: publicRepeatSyncCall(
				input.publicRenderPlan,
				'context.graph',
				'loadArcadePublicSymbol',
				repeatStateName,
			),
			repeatStateName,
			hasStaticTextWrites,
		}),
		'',
		'function isArcadePublicThenable(value) { return value !== null && (typeof value === "object" || typeof value === "function") && typeof value.then === "function"; }',
		'',
		emitCreatePublicGraph(graphMethods, directPublicStateEntries, {
			trackArrayIndexes: hasRepeats,
		}),
		'',
		emitStaticTextSyncFunction(input.publicRenderPlan),
		hasStaticTextWrites ? '' : null,
		'function attachArcadePublicStaticEvents(root, graph, loadSymbolForEvent) {\n\tfor (const [path, eventName, symbolIds] of arcadePublicStaticEvents) {\n\t\tconst element = nodeAtPath(root, path);\n\t\tif (!element?.addEventListener) continue;\n\t\telement.addEventListener(eventName, async (event) => {\n\t\t\tfor (const symbolId of symbolIds) {\n\t\t\t\tconst loaded = loadSymbolForEvent(symbolId);\n\t\t\t\tconst symbol = isArcadePublicThenable(loaded) ? await loaded : loaded;\n\t\t\t\tconst value = symbol({ graph, event, element, getElementHandle: () => undefined });\n\t\t\t\tif (isArcadePublicThenable(value)) await value;\n\t\t\t}\n\t\t\tgraph.flush();\n\t\t});\n\t}\n}',
		'',
		hasStaticEvents
			? 'function warmArcadePublicStaticEventSymbols(loadSymbolForEvent) {\n\tfor (const [, , symbolIds] of arcadePublicStaticEvents) {\n\t\tfor (const symbolId of symbolIds) loadSymbolForEvent(symbolId);\n\t}\n}'
			: null,
		hasStaticEvents ? '' : null,
		...emitRepeatSupportFunctions({
			hasRepeats,
			hasSingleRepeat,
			useSingleRepeatClassValue,
			repeatCalls,
			repeatFunctions,
		}),
		hasStaticTextWrites || hasStaticEvents
			? 'function nodeAtPath(root, path) {\n\tlet node = root;\n\tfor (const index of path) { node = node?.childNodes?.[index]; if (!node) return undefined; }\n\treturn node;\n}'
			: null,
		hasStaticTextWrites || hasStaticEvents ? '' : null,
		'function readArcadePublicPath(value, path) {\n\tlet current = value;\n\tfor (const key of path) current = current?.[key];\n\treturn current;\n}',
		'',
		'function writeArcadePublicPath(value, path, nextValue) {\n\tif (path.length === 0) return nextValue;\n\tconst root = value && typeof value === "object" ? value : {};\n\tlet current = root;\n\tfor (const key of path.slice(0, -1)) { if (!current[key] || typeof current[key] !== "object") current[key] = {}; current = current[key]; }\n\tcurrent[path[path.length - 1]] = nextValue;\n\treturn root;\n}',
		'',
		hasRepeats
			? 'function writeArcadePublicDirtyArrayIndexes(dirtyArrayIndexes, graphNodeId, previousValue, nextValue, path) {\n\tif (path.length !== 0 || !Array.isArray(previousValue) || !Array.isArray(nextValue) || previousValue.length !== nextValue.length) { dirtyArrayIndexes.delete(graphNodeId); return; }\n\tconst indexes = [];\n\tfor (let index = 0; index < nextValue.length; index++) if (previousValue[index] !== nextValue[index]) indexes.push(index);\n\tdirtyArrayIndexes.set(graphNodeId, indexes);\n}'
			: null,
		hasRepeats ? '' : null,
		'function stringifyArcadePublicValue(value) { return value == null ? "" : String(value); }',
		'',
	]
		.filter((part): part is string => part !== null && part !== '')
		.join('\n');
}

function canEmitPublicRenderModule(publicRenderPlan: PublicRenderPlanArtifact): boolean {
	return (
		(!publicRenderPlan.repeatGates.some((gate) => !gate.supported) &&
			publicRenderPlan.keyedRepeats.length === publicRenderPlan.repeatGates.length) ||
		publicRenderPlan.repeatGates.length === 0
	);
}

function publicRepeatSyncCall(
	publicRenderPlan: PublicRenderPlanArtifact,
	graphSource: string,
	loadSymbolSource: string,
	repeatStateSource: string | null = null,
): string | null {
	if (publicRenderPlan.keyedRepeats.length === 0) return null;
	if (publicRenderPlan.keyedRepeats.length === 1) {
		const stateArgument = repeatStateSource ? `, ${repeatStateSource}` : '';
		return `syncArcadePublicRepeat0(root, ${graphSource}, ${loadSymbolSource}${stateArgument});`;
	}

	return `syncArcadePublicRepeats(root, ${graphSource}, ${loadSymbolSource});`;
}

function emitPublicLoadSymbolFunction(input: {
	readonly repeatSyncCall: string | null;
	readonly repeatStateName: string | null;
	readonly hasStaticTextWrites: boolean;
}) {
	const parameters = input.repeatStateName ? `root, ${input.repeatStateName}` : 'root';
	const syncStaticText = input.hasStaticTextWrites
		? '\n\t\t\t\tsyncArcadePublicStaticText(root, context.graph);'
		: '';
	const syncRepeats = input.repeatSyncCall ? `\n\t\t\t\t${input.repeatSyncCall}` : '';
	return `function createArcadePublicLoadSymbol(${parameters}) {\n\tconst symbols = new Map();\n\tconst createLoadedSymbol = (loaded) => function runArcadePublicSymbol(context) {\n\t\tconst value = loaded(context);${syncStaticText}${syncRepeats}\n\t\treturn value;\n\t};\n\tfunction loadArcadePublicSymbol(symbolId) {\n\t\tconst cached = symbols.get(symbolId);\n\t\tif (cached) return cached;\n\t\tconst loaded = loadSymbol(symbolId);\n\t\tif (isArcadePublicThenable(loaded)) {\n\t\t\tconst pending = loaded.then((resolved) => { const symbol = createLoadedSymbol(resolved); symbols.set(symbolId, symbol); return symbol; });\n\t\t\tsymbols.set(symbolId, pending);\n\t\t\treturn pending;\n\t\t}\n\t\tconst symbol = createLoadedSymbol(loaded);\n\t\tsymbols.set(symbolId, symbol);\n\t\treturn symbol;\n\t}\n\treturn loadArcadePublicSymbol;\n}`;
}

function emitComponentFactory(
	name: string,
	options: {
		readonly repeatSyncCall: string | null;
		readonly repeatStateName: string | null;
		readonly repeatStateInitializer: string;
		readonly hasStaticEvents: boolean;
		readonly hasStaticTextWrites: boolean;
	},
) {
	const repeatStateDeclaration = options.repeatStateName
		? [`	const ${options.repeatStateName} = ${options.repeatStateInitializer};`]
		: [];
	const loadSymbolArguments = options.repeatStateName
		? `root, ${options.repeatStateName}`
		: 'root';
	const syncStaticText = options.hasStaticTextWrites
		? ['	syncArcadePublicStaticText(root, graph);']
		: [];
	const warmStaticEvents = options.hasStaticEvents
		? ['	warmArcadePublicStaticEventSymbols(componentLoadSymbol);']
		: [];
	const syncRepeats = options.repeatSyncCall ? [`	${options.repeatSyncCall}`] : [];
	return [
		`export function ${name}() {`,
		'	const root = createArcadePublicRoot();',
		'	const graph = createArcadePublicGraph();',
		...repeatStateDeclaration,
		`	const componentLoadSymbol = createArcadePublicLoadSymbol(${loadSymbolArguments});`,
		...syncStaticText,
		'	attachArcadePublicStaticEvents(root, graph, componentLoadSymbol);',
		...warmStaticEvents,
		...syncRepeats,
		'	return {',
		'		root,',
		'		graph,',
		'		runtime: { async dispatch() {} },',
		'	};',
		'}',
	].join('\n');
}

function emitStaticTextSyncFunction(publicRenderPlan: PublicRenderPlanArtifact): string {
	const writes = publicRenderPlan.staticTextWrites.flatMap((write, index) => [
		`	const textTarget${index} = nodeAtPath(root, ${JSON.stringify(write.nodePath)});`,
		`	if (textTarget${index}) textTarget${index}.textContent = stringifyArcadePublicValue(${graphReadExpression(write.graphNodeId, write.path)});`,
	]);
	if (writes.length === 0) return '';

	return ['function syncArcadePublicStaticText(root, graph) {', ...writes, '}'].join('\n');
}

function emitRepeatSupportFunctions(input: {
	readonly hasRepeats: boolean;
	readonly hasSingleRepeat: boolean;
	readonly useSingleRepeatClassValue: boolean;
	readonly repeatCalls: ReadonlyArray<string>;
	readonly repeatFunctions: ReadonlyArray<string>;
}): string[] {
	if (!input.hasRepeats) return [];

	return [
		...(input.hasSingleRepeat
			? []
			: [
					'function syncArcadePublicRepeats(root, graph, loadSymbolForRepeat) {',
					...input.repeatCalls,
					'}',
					'',
					'function repeatState(root, planIndex) {\n\tlet states = arcadePublicRepeatStates.get(root);\n\tif (!states) { states = []; arcadePublicRepeatStates.set(root, states); }\n\tif (!states[planIndex]) states[planIndex] = { rows: new Map(), keys: [], classValues: [] };\n\treturn states[planIndex];\n}',
					'',
				]),
		'',
		'function createArcadePublicRow(html) {\n\tlet template = arcadePublicRowTemplates.get(html);\n\tif (!template) { template = document.createElement("template"); template.innerHTML = html; arcadePublicRowTemplates.set(html, template); }\n\tconst row = template.content.firstElementChild?.cloneNode(true);\n\tif (!row) throw new Error("Arcade repeat template did not create a row element.");\n\treturn row;\n}',
		'',
		...input.repeatFunctions,
		'function sameArcadePublicKeys(previous, next) {\n\tif (previous.length !== next.length) return false;\n\tfor (let index = 0; index < next.length; index++) if (previous[index] !== next[index]) return false;\n\treturn true;\n}',
		'',
		'function replaceArcadePublicRows(parent, state, keys) {\n\tconst fragment = document.createDocumentFragment();\n\tfor (const key of keys) { const record = state.rows.get(key); if (record) fragment.appendChild(record.root); }\n\tparent.replaceChildren(fragment);\n}',
		'',
		'function pruneArcadePublicRows(state, keys) {\n\tconst retainedKeys = new Set(keys);\n\tfor (const key of Array.from(state.rows.keys())) if (!retainedKeys.has(key)) state.rows.delete(key);\n}',
		'',
		`function clearArcadePublicRows(parent, state) {\n\tif (parent.textContent !== undefined) parent.textContent = ""; else parent.replaceChildren?.();\n\tstate.rows.clear();\n\tstate.keys = [];\n\t${input.useSingleRepeatClassValue ? 'state.classValue = undefined;' : 'state.classValues = [];'}\n}`,
		'function removeArcadePublicMissingKey(parent, state, nextKeys) {\n\tif (state.keys.length !== nextKeys.length + 1) return false;\n\tlet missingKey;\n\tlet nextIndex = 0;\n\tfor (const key of state.keys) {\n\t\tif (nextKeys[nextIndex] === key) { nextIndex++; continue; }\n\t\tif (missingKey !== undefined) return false;\n\t\tmissingKey = key;\n\t}\n\tif (missingKey === undefined || nextIndex !== nextKeys.length) return false;\n\tconst record = state.rows.get(missingKey);\n\tif (!record) return false;\n\tif (record.root.remove) record.root.remove(); else parent.removeChild?.(record.root);\n\tstate.rows.delete(missingKey);\n\treturn true;\n}',
		'',
		'function swapArcadePublicRows(parent, state, nextKeys) {\n\tif (state.keys.length !== nextKeys.length) return false;\n\tlet firstIndex = -1;\n\tlet secondIndex = -1;\n\tfor (let index = 0; index < nextKeys.length; index++) {\n\t\tif (state.keys[index] === nextKeys[index]) continue;\n\t\tif (firstIndex < 0) { firstIndex = index; continue; }\n\t\tif (secondIndex >= 0) return false;\n\t\tsecondIndex = index;\n\t}\n\tif (secondIndex < 0) return false;\n\tif (state.keys[firstIndex] !== nextKeys[secondIndex] || state.keys[secondIndex] !== nextKeys[firstIndex]) return false;\n\tconst first = state.rows.get(state.keys[firstIndex]);\n\tconst second = state.rows.get(state.keys[secondIndex]);\n\tif (!first || !second || !parent.insertBefore) return false;\n\tconst afterSecond = second.root.nextSibling;\n\tparent.insertBefore(second.root, first.root);\n\tif (afterSecond) parent.insertBefore(first.root, afterSecond); else parent.appendChild?.(first.root);\n\treturn true;\n}',
		'',
	].filter((part): part is string => part !== null);
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

function emitPublicStaticEvents(publicRenderPlan: PublicRenderPlanArtifact): string {
	return `[${publicRenderPlan.staticEventControls
		.map(
			(event) =>
				`[${JSON.stringify(event.hostPath)},${JSON.stringify(event.eventName)},${JSON.stringify(event.symbolIds)}]`,
		)
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

function emitCreatePublicGraph(
	methods: ReadonlySet<PublicGraphMethod>,
	stateEntries: string,
	options: { readonly trackArrayIndexes: boolean },
): string {
	const trackDirtyArrayIndexes = options.trackArrayIndexes;
	const optionalMethods = [
		methods.has('call')
			? `\t\tcall(call) { const target = readArcadePublicPath(cells.get(call.graphNodeId), call.path ?? []); const method = target?.[call.method]; if (typeof method !== "function") throw new TypeError("Unsupported Arcade public graph call."); dirtyGraphNodeIds.add(call.graphNodeId); ${trackDirtyArrayIndexes ? 'dirtyArrayIndexes.delete(call.graphNodeId); ' : ''}return method.apply(target, call.args ?? []); },`
			: null,
		methods.has('delete')
			? `\t\tdelete(deletion) { const path = deletion.path ?? []; if (path.length === 0) return false; const parent = readArcadePublicPath(cells.get(deletion.graphNodeId), path.slice(0, -1)); if (!parent || typeof parent !== "object") return true; dirtyGraphNodeIds.add(deletion.graphNodeId); ${trackDirtyArrayIndexes ? 'dirtyArrayIndexes.delete(deletion.graphNodeId); ' : ''}return delete parent[path[path.length - 1]]; },`
			: null,
	].filter((method): method is string => method !== null);
	const trackDirtyArrayIndexesDeclaration = trackDirtyArrayIndexes
		? ['\tconst dirtyArrayIndexes = new Map();']
		: [];
	const trackDirtyArrayIndexesWrite = trackDirtyArrayIndexes
		? 'writeArcadePublicDirtyArrayIndexes(dirtyArrayIndexes, write.graphNodeId, previousValue, write.value, path); '
		: '';
	const trackDirtyArrayIndexesUpdate = trackDirtyArrayIndexes
		? 'writeArcadePublicDirtyArrayIndexes(dirtyArrayIndexes, update.graphNodeId, previousValue, nextValue, path); '
		: '';
	const trackDirtyArrayIndexesMethods = trackDirtyArrayIndexes
		? ['\t\tdirtyIndexes(graphNodeId) { return dirtyArrayIndexes.get(graphNodeId); },']
		: [];
	const trackDirtyArrayIndexesFlush = trackDirtyArrayIndexes ? ' dirtyArrayIndexes.clear();' : '';

	return [
		'function createArcadePublicGraph() {',
		`\tconst cells = new Map(${stateEntries});`,
		'\tconst dirtyGraphNodeIds = new Set();',
		...trackDirtyArrayIndexesDeclaration,
		'\treturn {',
		'\t\tread(graphNodeId, path = []) { return readArcadePublicPath(cells.get(graphNodeId), path); },',
		`\t\twrite(write) { const path = write.path ?? []; const previousValue = cells.get(write.graphNodeId); dirtyGraphNodeIds.add(write.graphNodeId); ${trackDirtyArrayIndexesWrite}cells.set(write.graphNodeId, writeArcadePublicPath(previousValue, path, write.value)); },`,
		`\t\tupdate(update) { const path = update.path ?? []; const previousValue = cells.get(update.graphNodeId); const currentValue = readArcadePublicPath(previousValue, path); const nextValue = update.update(currentValue); dirtyGraphNodeIds.add(update.graphNodeId); ${trackDirtyArrayIndexesUpdate}cells.set(update.graphNodeId, writeArcadePublicPath(previousValue, path, nextValue)); if (update.returnValue === "previous") return currentValue; if (update.returnValue === "next") return nextValue; },`,
		...optionalMethods,
		'\t\tisDirty(graphNodeId) { return dirtyGraphNodeIds.has(graphNodeId); },',
		...trackDirtyArrayIndexesMethods,
		`\t\tflush() { dirtyGraphNodeIds.clear();${trackDirtyArrayIndexesFlush} },`,
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
	const handledStaticTextUpdates = publicRenderPlan.staticTextWrites.map((write) => ({
		graphNodeId: write.graphNodeId,
		path: write.path,
		source: write.source,
	}));

	return {
		...protocolView,
		locators: protocolView.locators
			.filter((locator) => hostNodeIds.has(locator.hostNodeId))
			.map((locator) => ({
				...locator,
				index: hostNodeIndexes.get(locator.hostNodeId) ?? locator.index,
			})),
		events: protocolView.events.filter((event) => hostNodeIds.has(event.hostNodeId)),
		domUpdates: protocolView.domUpdates.filter(
			(update) =>
				hostNodeIds.has(update.hostNodeId) &&
				!(
					update.target.kind === 'text' &&
					handledStaticTextUpdates.some(
						(write) =>
							write.graphNodeId === update.graphNodeId &&
							write.source === update.source &&
							samePath(write.path, update.path),
					)
				),
		),
	};
}

function emitRepeatSyncFunction(
	repeat: KeyedRepeatPlan,
	index: number,
	options: { readonly hasSingleRepeat: boolean },
) {
	const useSingleClassValue = repeat.classWrites.length === 1;
	const classValueName = useSingleClassValue ? 'classValue' : 'classValues';
	const classStateName = useSingleClassValue ? 'classValue' : 'classValues';
	const attachEventsCall =
		repeat.eventControls.length > 0
			? `\n\t\t\tattachArcadePublicRepeat${index}Events(record, graph, loadSymbolForRepeat);`
			: '';
	const delegateEventsCall =
		repeat.eventControls.length > 0
			? `\n\tdelegateArcadePublicRepeat${index}Events(parent, graph, loadSymbolForRepeat);`
			: '';
	const stateParameter = options.hasSingleRepeat ? ', state' : '';
	const stateDeclaration = options.hasSingleRepeat
		? ''
		: `\n\tconst state = repeatState(root, ${index});`;

	return [
		`function syncArcadePublicRepeat${index}(root, graph, loadSymbolForRepeat${stateParameter}) {\n\tconst parent = ${domNodePathExpression('root', repeat.parentPath)};\n\tif (!parent?.replaceChildren) return;${stateDeclaration}${delegateEventsCall}\n\tconst collectionDirty = graph.isDirty?.(${JSON.stringify(repeat.collectionGraphNodeId)}) ?? true;\n\tconst classDirty = ${classDirtyExpression(repeat)};\n\tif (!collectionDirty && state.keys.length > 0) {\n\t\tif (classDirty) {\n\t\t\tconst ${classValueName} = readArcadePublicRepeat${index}ClassValues(graph);\n\t\t\tupdateArcadePublicRepeat${index}Classes(state, ${classValueName});\n\t\t\tstate.${classStateName} = ${classValueName};\n\t\t}\n\t\treturn;\n\t}\n\tconst items = ${graphReadExpression(repeat.collectionGraphNodeId, repeat.collectionPath)};\n\tif (!Array.isArray(items)) return;\n\tif (items.length === 0) { clearArcadePublicRows(parent, state); return; }\n\tconst ${classValueName} = readArcadePublicRepeat${index}ClassValues(graph);\n\tconst hadRows = state.keys.length > 0;\n\tconst dirtyIndexes = graph.dirtyIndexes?.(${JSON.stringify(repeat.collectionGraphNodeId)});\n\tif (hadRows && dirtyIndexes && dirtyIndexes.length < items.length && patchArcadePublicRepeat${index}DirtyRows(state, items, dirtyIndexes, ${classValueName})) {\n\t\tif (classDirty) updateArcadePublicRepeat${index}Classes(state, ${classValueName});\n\t\tstate.${classStateName} = ${classValueName};\n\t\treturn;\n\t}\n\tlet canAppend = hadRows && state.keys.length < items.length;\n\tconst newRows = document.createDocumentFragment();\n\tconst nextKeys = [];`,
		`	for (let index = 0; index < items.length; index++) {\n\t\tconst item = items[index];\n\t\tconst key = ${itemPathReadSource('item', repeat.keyPath)};\n\t\tif (canAppend && index < state.keys.length && state.keys[index] !== key) canAppend = false;\n\t\tnextKeys.push(key);\n\t\tlet record = state.rows.get(key);\n\t\tif (!record) {\n\t\t\tconst rowRoot = createArcadePublicRow(${JSON.stringify(repeat.rowTemplateHtml)});\n\t\t\trecord = createArcadePublicRepeat${index}Record(rowRoot, item);\n\t\t\tstate.rows.set(key, record);\n\t\t\twriteArcadePublicRepeat${index}Row(record, item, ${classValueName});${attachEventsCall}\n\t\t\tif (!hadRows || canAppend) newRows.appendChild(record.root);\n\t\t} else if (record.item !== item) {\n\t\t\trecord.item = item;\n\t\t\twriteArcadePublicRepeat${index}Row(record, item, ${classValueName});\n\t\t} else {\n\t\t\trecord.item = item;\n\t\t}\n\t}`,
		`	if (!hadRows) {\n\t\tparent.replaceChildren(newRows);\n\t} else if (parent.childNodes?.length === 0) {\n\t\treplaceArcadePublicRows(parent, state, nextKeys);\n\t} else if (canAppend) {\n\t\tparent.appendChild?.(newRows);\n\t} else if (!sameArcadePublicKeys(state.keys, nextKeys) &&\n\t\t!removeArcadePublicMissingKey(parent, state, nextKeys) &&\n\t\t!swapArcadePublicRows(parent, state, nextKeys)) {\n\t\treplaceArcadePublicRows(parent, state, nextKeys);\n\t}\n\tif (state.rows.size !== nextKeys.length) pruneArcadePublicRows(state, nextKeys);\n\tif (hadRows) updateArcadePublicRepeat${index}Classes(state, ${classValueName});\n\tstate.${classStateName} = ${classValueName};\n\tstate.keys = nextKeys;\n}`,
		'',
	].join('\n');
}

function emitRepeatPatchFunction(repeat: KeyedRepeatPlan, index: number) {
	const useSingleClassValue = repeat.classWrites.length === 1;
	const classParameter = useSingleClassValue ? 'classValue' : 'classValues';
	return [
		`function patchArcadePublicRepeat${index}DirtyRows(state, items, dirtyIndexes, ${classParameter}) {`,
		'\tfor (const index of dirtyIndexes) {',
		'\t\tconst item = items[index];',
		`\t\tconst key = ${itemPathReadSource('item', repeat.keyPath)};`,
		'\t\tif (state.keys[index] !== key) return false;',
		'\t\tconst record = state.rows.get(key);',
		'\t\tif (!record) return false;',
		'\t\trecord.item = item;',
		`\t\twriteArcadePublicRepeat${index}Row(record, item, ${classParameter});`,
		'\t}',
		'\treturn true;',
		'}',
		'',
	].join('\n');
}

function emitRepeatRecordFunction(repeat: KeyedRepeatPlan, index: number) {
	const targetEntries = [
		'\t\troot: row,',
		'\t\titem,',
		...repeat.textWrites.map(
			(write, writeIndex) =>
				`\t\ttext${writeIndex}: ${domNodePathExpression('row', write.nodePath)},`,
		),
		...repeat.classWrites.map(
			(write, writeIndex) =>
				`\t\tclass${writeIndex}: ${domNodePathExpression('row', write.hostPath)},`,
		),
	];

	return [
		`function createArcadePublicRepeat${index}Record(row, item) {`,
		'\treturn {',
		...targetEntries,
		'\t};',
		'}',
		'',
	].join('\n');
}

function emitRepeatWriteFunction(repeat: KeyedRepeatPlan, index: number) {
	const useSingleClassValue = repeat.classWrites.length === 1;
	const classParameter = useSingleClassValue ? 'classValue' : 'classValues';
	const textWrites = repeat.textWrites.flatMap((write, writeIndex) => [
		`	const textTarget${writeIndex} = record.text${writeIndex};`,
		`	if (textTarget${writeIndex}) textTarget${writeIndex}.textContent = stringifyArcadePublicValue(${itemPathReadSource('item', write.itemPath)});`,
	]);
	const classWrites = repeat.classWrites.flatMap((write, writeIndex) => [
		`	const classTarget${writeIndex} = record.class${writeIndex};`,
		`	if (classTarget${writeIndex}?.setAttribute) {`,
		`		const stateValue${writeIndex} = ${useSingleClassValue ? classParameter : `${classParameter}[${writeIndex}]`};`,
		`		const itemValue${writeIndex} = ${itemPathReadSource('item', write.itemPath)};`,
		`		classTarget${writeIndex}.setAttribute("class", stateValue${writeIndex} === itemValue${writeIndex} ? ${JSON.stringify(write.trueClass)} : ${JSON.stringify(write.falseClass)});`,
		'	}',
	]);

	return [
		emitRepeatClassValuesFunction(repeat, index),
		`function writeArcadePublicRepeat${index}Row(record, item, ${classParameter}) {`,
		...textWrites,
		...classWrites,
		'}',
		'',
		emitRepeatClassStateFunction(repeat, index),
	].join('\n');
}

function classDirtyExpression(repeat: KeyedRepeatPlan): string {
	const dirtyChecks = repeat.classWrites.map(
		(write) => `graph.isDirty?.(${JSON.stringify(write.stateGraphNodeId)})`,
	);
	return dirtyChecks.length > 0 ? dirtyChecks.join(' || ') : 'false';
}

function emitRepeatClassValuesFunction(repeat: KeyedRepeatPlan, index: number) {
	const classReads = repeat.classWrites.map((write) =>
		graphReadExpression(write.stateGraphNodeId, write.statePath),
	);
	const returnSource = classReads.length === 1 ? classReads[0] : `[${classReads.join(', ')}]`;

	return [
		`function readArcadePublicRepeat${index}ClassValues(graph) {`,
		`\treturn ${returnSource};`,
		'}',
		'',
	].join('\n');
}

function emitRepeatClassStateFunction(repeat: KeyedRepeatPlan, index: number) {
	const useSingleClassValue = repeat.classWrites.length === 1;
	const classParameter = useSingleClassValue ? 'classValue' : 'classValues';
	const stateChecks = repeat.classWrites.flatMap((write, writeIndex) => [
		`	const stateValue${writeIndex} = ${useSingleClassValue ? classParameter : `${classParameter}[${writeIndex}]`};`,
		`	if (${useSingleClassValue ? 'state.classValue' : `state.classValues[${writeIndex}]`} !== stateValue${writeIndex}) {`,
		`		updateArcadePublicRepeat${index}Class${writeIndex}(state, ${useSingleClassValue ? 'state.classValue' : `state.classValues[${writeIndex}]`}, stateValue${writeIndex});`,
		`		updateArcadePublicRepeat${index}Class${writeIndex}(state, stateValue${writeIndex}, stateValue${writeIndex});`,
		'	}',
	]);
	const classUpdaters = repeat.classWrites.flatMap((write, writeIndex) =>
		samePath(write.itemPath, repeat.keyPath)
			? [
					`function updateArcadePublicRepeat${index}Class${writeIndex}(state, matchValue, stateValue${writeIndex}) {`,
					'	const record = state.rows.get(matchValue);',
					'	if (!record) return;',
					`	const classTarget${writeIndex} = record.class${writeIndex};`,
					`	if (classTarget${writeIndex}?.setAttribute) classTarget${writeIndex}.setAttribute("class", stateValue${writeIndex} === matchValue ? ${JSON.stringify(write.trueClass)} : ${JSON.stringify(write.falseClass)});`,
					'}',
					'',
				]
			: [
					`function updateArcadePublicRepeat${index}Class${writeIndex}(state, matchValue, stateValue${writeIndex}) {`,
					'	for (const record of state.rows.values()) {',
					`		const itemValue${writeIndex} = ${itemPathReadSource('record.item', write.itemPath)};`,
					`		if (itemValue${writeIndex} !== matchValue) continue;`,
					`		const classTarget${writeIndex} = record.class${writeIndex};`,
					`		if (classTarget${writeIndex}?.setAttribute) classTarget${writeIndex}.setAttribute("class", stateValue${writeIndex} === itemValue${writeIndex} ? ${JSON.stringify(write.trueClass)} : ${JSON.stringify(write.falseClass)});`,
					'	}',
					'}',
					'',
				],
	);

	return [
		`function updateArcadePublicRepeat${index}Classes(state, ${classParameter}) {`,
		...stateChecks,
		'}',
		'',
		...classUpdaters,
	].join('\n');
}

function emitRepeatEventFunction(repeat: KeyedRepeatPlan, index: number) {
	const eventGroups = new Map<
		string,
		Array<{ readonly eventControl: KeyedRepeatPlan['eventControls'][number]; readonly eventIndex: number }>
	>();
	repeat.eventControls.forEach((eventControl, eventIndex) => {
		const controls = eventGroups.get(eventControl.eventName) ?? [];
		controls.push({ eventControl, eventIndex });
		eventGroups.set(eventControl.eventName, controls);
	});
	const eventMarkers = repeat.eventControls.flatMap((eventControl, eventIndex) => [
		`		const element${eventIndex} = ${domNodePathExpression('record.root', eventControl.hostPath)};`,
		`	if (element${eventIndex}) element${eventIndex}.__arcadePublicRepeat${index}Event${eventIndex} = record;`,
	]);
	const delegates = [...eventGroups].flatMap(([eventName, controls]) => [
		`	parent.addEventListener(${JSON.stringify(eventName)}, async (event) => {`,
		'		let eventTarget = event.target;',
		'		while (eventTarget && eventTarget !== parent) {',
		...controls.flatMap(({ eventControl, eventIndex }) => [
			'			{',
			`				const record = eventTarget?.__arcadePublicRepeat${index}Event${eventIndex};`,
			'				if (record) {',
			`					const loaded = loadSymbolForRepeat(${JSON.stringify(eventControl.symbolId)});`,
			'					const symbol = isArcadePublicThenable(loaded) ? await loaded : loaded;',
			`					const value = symbol({ graph, event, element: eventTarget, getElementHandle: () => undefined, locals: { ${JSON.stringify(eventControl.itemContext.itemName)}: record.item } });`,
			'					if (isArcadePublicThenable(value)) await value;',
			'					graph.flush();',
			'					return;',
			'				}',
			'			}',
		]),
		'			eventTarget = eventTarget.parentElement || eventTarget.parentNode;',
		'		}',
		'	});',
	]);

	return [
		`function delegateArcadePublicRepeat${index}Events(parent, graph, loadSymbolForRepeat) {`,
		`\tif (parent.__arcadePublicRepeat${index}DelegatedEvents || !parent.addEventListener) return;`,
		`\tparent.__arcadePublicRepeat${index}DelegatedEvents = true;`,
		...delegates,
		'}',
		'',
		`function attachArcadePublicRepeat${index}Events(record, graph, loadSymbolForRepeat) {`,
		...eventMarkers,
		'}',
		'',
	].join('\n');
}

function itemPathReadSource(base: string, path: readonly string[]): string {
	const key = path[0];
	if (path.length === 1 && key && isSafePropertyName(key)) return `${base}.${key}`;
	return `readArcadePublicPath(${base}, ${JSON.stringify(path)})`;
}

function graphReadExpression(graphNodeId: string, path: readonly string[]): string {
	return path.length === 0
		? `graph.read(${JSON.stringify(graphNodeId)})`
		: `graph.read(${JSON.stringify(graphNodeId)}, ${JSON.stringify(path)})`;
}

function domNodePathExpression(base: string, path: readonly number[]): string {
	return path.reduce(
		(source, index, pathIndex) =>
			`${source}${pathIndex === 0 ? '.childNodes' : '?.childNodes'}?.[${JSON.stringify(index)}]`,
		base,
	);
}

function isSafePropertyName(key: string): boolean {
	return /^[$A-Z_a-z][$\w]*$/.test(key);
}

function samePath(left: readonly string[], right: readonly string[]): boolean {
	if (left.length !== right.length) return false;
	return left.every((segment, index) => segment === right[index]);
}
