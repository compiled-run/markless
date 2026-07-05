import type {
	PublicRenderModuleInput,
	PublicRenderPlanArtifact,
	SymbolResolverPlan,
} from '../../artifacts.ts';
import { emitComponentFactory, emitPublicLoadSymbolFunction } from './component-factories.ts';
import { canEmitPublicRenderModule, canUseDirectPublicRuntime } from './eligibility.ts';
import { emitCreatePublicGraph, publicGraphMethods } from './graph-runtime.ts';
import {
	emitRepeatCalls,
	emitRepeatFunctions,
	emitRepeatSupportFunctions,
	publicRepeatSyncCall,
} from './keyed-repeats.ts';
import type { PublicRenderRootSelection } from './plan.ts';
import { emitPublicStaticEvents, emitStaticTextSyncFunction } from './static-bindings.ts';
import { emitDirectPublicStateEntries } from './state-entries.ts';
import { createPublicProtocolView } from './view-filter.ts';

// Emits the specialized direct-DOM CSR path for simple single-component modules.
export function emitDirectPublicRenderModule(input: {
	readonly rootSelection: PublicRenderRootSelection | null;
	readonly componentCount: number;
	readonly publicRenderPlan: PublicRenderPlanArtifact;
	readonly protocolState: PublicRenderModuleInput['protocolState'];
	readonly protocolView: PublicRenderModuleInput['protocolView'];
	readonly symbolResolver: SymbolResolverPlan;
}) {
	const componentName = input.rootSelection?.componentName;
	if (
		!input.publicRenderPlan.directRenderTemplateHtml ||
		!componentName ||
		input.componentCount !== 1 ||
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
	const componentFactory = emitComponentFactory(componentName, {
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
		hasStaticTextWrites,
	});
	const graphMethods = publicGraphMethods(input.symbolResolver);
	const repeatCalls = emitRepeatCalls(input.publicRenderPlan);
	const repeatFunctions = emitRepeatFunctions(input.publicRenderPlan, { hasSingleRepeat });

	return [
		'',
		`const marklessPublicRootTemplate = ${JSON.stringify(input.publicRenderPlan.directRenderTemplateHtml)};`,
		hasRepeats && !hasSingleRepeat ? 'const marklessPublicRepeatStates = new WeakMap();' : null,
		`const marklessPublicStaticEvents = ${publicStaticEvents};`,
		'',
		componentFactory,
		'',
		'function createMarklessPublicRoot() {\n\tconst template = document.createElement("template");\n\ttemplate.innerHTML = marklessPublicRootTemplate;\n\tconst root = template.content.firstElementChild;\n\tif (!root) throw new Error("Missing render root.");\n\treturn root;\n}',
		'',
		emitPublicLoadSymbolFunction({
			repeatSyncCall: publicRepeatSyncCall(
				input.publicRenderPlan,
				'context.graph',
				'loadMarklessPublicSymbol',
				repeatStateName,
			),
			repeatStateName,
			hasStaticTextWrites,
		}),
		'',
		'function isMarklessPublicThenable(value) { return value !== null && (typeof value === "object" || typeof value === "function") && typeof value.then === "function"; }',
		'',
		emitCreatePublicGraph(graphMethods, directPublicStateEntries, {
			trackArrayIndexes: hasRepeats,
		}),
		'',
		emitStaticTextSyncFunction(input.publicRenderPlan),
		hasStaticTextWrites ? '' : null,
		'function attachMarklessPublicStaticEvents(root, graph, loadSymbolForEvent) {\n\tfor (const [path, eventName, symbolIds] of marklessPublicStaticEvents) {\n\t\tconst element = nodeAtPath(root, path);\n\t\tif (!element?.addEventListener) continue;\n\t\telement.addEventListener(eventName, async (event) => {\n\t\t\tfor (const symbolId of symbolIds) {\n\t\t\t\tconst loaded = loadSymbolForEvent(symbolId);\n\t\t\t\tconst symbol = isMarklessPublicThenable(loaded) ? await loaded : loaded;\n\t\t\t\tconst value = symbol({ graph, event, element, getElementHandle: () => undefined });\n\t\t\t\tif (isMarklessPublicThenable(value)) await value;\n\t\t\t}\n\t\t\tgraph.flush();\n\t\t});\n\t}\n}',
		'',
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
		'function readMarklessPublicPath(value, path) {\n\tlet current = value;\n\tfor (const key of path) current = current?.[key];\n\treturn current;\n}',
		'',
		'function writeMarklessPublicPath(value, path, nextValue) {\n\tif (path.length === 0) return nextValue;\n\tconst root = value && typeof value === "object" ? value : {};\n\tlet current = root;\n\tfor (const key of path.slice(0, -1)) { if (!current[key] || typeof current[key] !== "object") current[key] = {}; current = current[key]; }\n\tcurrent[path[path.length - 1]] = nextValue;\n\treturn root;\n}',
		'',
		hasRepeats
			? 'function writeMarklessPublicDirtyArrayIndexes(dirtyArrayIndexes, graphNodeId, previousValue, nextValue, path) {\n\tif (path.length !== 0 || !Array.isArray(previousValue) || !Array.isArray(nextValue) || previousValue.length !== nextValue.length) { dirtyArrayIndexes.delete(graphNodeId); return; }\n\tconst indexes = [];\n\tfor (let index = 0; index < nextValue.length; index++) if (previousValue[index] !== nextValue[index]) indexes.push(index);\n\tdirtyArrayIndexes.set(graphNodeId, indexes);\n}'
			: null,
		hasRepeats ? '' : null,
		'function stringifyMarklessPublicValue(value) { return value == null ? "" : String(value); }',
		'',
	]
		.filter((part): part is string => part !== null && part !== '')
		.join('\n');
}
