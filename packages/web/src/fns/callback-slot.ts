import {
	marklessComposedGraphNodeId,
	marklessComposerInstancePath,
	marklessGraphWidgetRegistry,
	marklessInstancePath,
	marklessInstanceScopedGraph,
} from './instance-scope.ts';
import type { RuntimeGraph } from '@markless/runtime';

type CallbackSlotContext = {
	readonly graph: {
		read(graphNodeId: string, path?: ReadonlyArray<string>): unknown;
		getSharedDefinition?: RuntimeGraph['getSharedDefinition'];
		listSharedDefinitions?: RuntimeGraph['listSharedDefinitions'];
		readonly marklessInstancePath?: string;
		readonly marklessPageGraph?: unknown;
		readonly marklessQualifyGraphNodeId?: (graphNodeId: string) => string;
	};
	readonly event?: unknown;
	readonly invokeSymbol?: (symbolId: string, context: unknown) => unknown;
};

/**
 * Dispatch through a widget's callback slot.
 *
 * The widget root wrote the answering symbol id into the slot's own graph node,
 * so the dispatching side resolves it exactly as it resolves its other reads: no
 * registry keyed by a path the invoking side never sees, and no tree walked. The
 * answering symbol belongs to the instance that COMPOSED this widget root, which
 * is the root's own resolved path less the segment that composed it. A value
 * already carrying a path was written by a render that knew its own place and is
 * used as it stands; either way the page graph goes with it, because that
 * instance's path rides its symbol id and this scope would qualify it twice.
 *
 * Both callers reach the same answer: the emitted symbol-resolver module's
 * `callback-slot-route` branch, for a part whose claim a consumer bound, and a
 * symbol module's own inlined dispatch, for a callback prop that answers a slot
 * its own module declares.
 */
export function marklessInvokeCallbackSlot(
	context: CallbackSlotContext,
	graphNodeId: string,
	args: ReadonlyArray<unknown>,
	instancePath = '',
): unknown {
	const graph = slotGraph(context, graphNodeId, instancePath);
	const slotSymbolId = graph.read(graphNodeId, []);
	if (typeof slotSymbolId !== 'string') {
		assertSlotInstanceRendered(context, graph, graphNodeId);
		return undefined;
	}
	if (typeof context.invokeSymbol !== 'function')
		throw new Error('Bound callback invocation is unavailable');
	const rootPath = marklessInstancePath(slotNodeId(graph, graphNodeId));
	const composerPath = marklessInstancePath(slotSymbolId)
		? ''
		: marklessComposerInstancePath(rootPath);
	return context.invokeSymbol(composerPath + slotSymbolId, {
		...context,
		graph: graph.marklessPageGraph ?? graph,
		event: context.event,
		args,
	});
}

/**
 * Where this slot's node really lives, as the dispatching side's own reads land.
 *
 * One adapter's instance path is a partial answer: adapters chain, and each one
 * qualifies what the one before it handed on. A payload whose resolver predates
 * the composed qualifier still answers with its own path alone.
 */
function slotNodeId(graph: CallbackSlotContext['graph'], graphNodeId: string): string {
	const qualify = graph.marklessQualifyGraphNodeId;
	if (typeof qualify === 'function') return qualify(graphNodeId);
	return marklessComposedGraphNodeId(
		graphNodeId,
		graph.marklessInstancePath ?? '',
		marklessGraphWidgetRegistry(graph as unknown as RuntimeGraph),
	);
}

/**
 * Which graph answers this slot node.
 *
 * A dispatching part reaches here on a graph that already resolves the node —
 * either the page graph carries it or the part's own scope was applied upstream
 * — and that reading is used as it stands. A widget root answering its OWN slot
 * does not: its handler spells the node module-level, and the node lives under
 * the instance path the row was composed through, so nothing is there to read.
 * Qualifying by that path is therefore tried only when the plain read is empty,
 * which can add the dispatch that was missing but never move one that worked.
 */
function slotGraph(
	context: CallbackSlotContext,
	graphNodeId: string,
	instancePath: string,
): CallbackSlotContext['graph'] {
	if (!instancePath || typeof context.graph.read(graphNodeId, []) === 'string')
		return context.graph;
	return marklessInstanceScopedGraph(
		context.graph as unknown as RuntimeGraph,
		instancePath,
	) as unknown as CallbackSlotContext['graph'];
}

/**
 * Refuse a dispatch that reached no widget instance at all.
 *
 * An empty slot has two readings, and only one of them is a framework gap. A
 * consumer that passed no callback leaves a rendered instance whose slot cell is
 * empty, and the authored `slot?.(...)` must no-op exactly as written. A slot id
 * that resolved onto no instance is the other one: the handler still runs to its
 * end, the state still moves, and the consumer is simply never told - which is
 * invisible from the outside and was how a part projected through a page-local
 * component lost its dispatch. The rendered definition tells them apart: the id
 * the read used names a shared definition this page holds, or it names nothing.
 *
 * Which means the accusation must be priced off the SAME id the read landed on -
 * `slotNodeId`, the composed answer - and never off one adapter's own path. A
 * widget composed inside another widget is reached through chained adapters, and
 * the innermost path alone leaves the definition in page space, where the page
 * holds nothing: a rendered widget accused of never having rendered.
 */
function assertSlotInstanceRendered(
	context: CallbackSlotContext,
	graph: CallbackSlotContext['graph'],
	graphNodeId: string,
): void {
	const page = (graph.marklessPageGraph ?? context.graph) as RuntimeGraph;
	// A payload carrying no shared definition cannot answer the question, and a
	// graph reached before its definitions were installed must not be accused.
	if (typeof page.getSharedDefinition !== 'function') return;
	if ((page.listSharedDefinitions?.() ?? []).length === 0) return;
	const resolvedNodeId = slotNodeId(graph, graphNodeId);
	const slash = resolvedNodeId.lastIndexOf('/');
	if (slash <= 0) return;
	const definitionId = resolvedNodeId.slice(0, slash);
	if (page.getSharedDefinition(definitionId) !== undefined) return;
	const error = new Error(
		`MARKLESS_CALLBACK_SLOT_UNRESOLVED: ${graphNodeId} was dispatched from a part whose widget instance no rendered widget owns, so the consumer's callback could never be reached.`,
	) as Error & Record<string, unknown>;
	error.name = 'CallbackSlotRuntimeError';
	error.code = 'MARKLESS_CALLBACK_SLOT_UNRESOLVED';
	error.severity = 'error';
	error.phase = 'runtime';
	error.graphNodeId = graphNodeId;
	error.definitionId = definitionId;
	error.docsUrl = 'https://markless.dev/errors/MARKLESS_CALLBACK_SLOT_UNRESOLVED';
	throw error;
}
