import {
	marklessComposedGraphNodeId,
	marklessGraphWidgetRegistry,
	marklessInstancePath,
	marklessInstanceScopedGraph,
} from './instance-scope.ts';
import type { RuntimeGraph } from '@markless/runtime';

type CallbackSlotContext = {
	readonly graph: {
		read(graphNodeId: string, path?: ReadonlyArray<string>): unknown;
		readonly marklessInstancePath?: string;
		readonly marklessPageGraph?: unknown;
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
	if (typeof slotSymbolId !== 'string') return undefined;
	if (typeof context.invokeSymbol !== 'function')
		throw new Error('Bound callback invocation is unavailable');
	const slotPath = marklessComposedGraphNodeId(
		graphNodeId,
		graph.marklessInstancePath ?? '',
		marklessGraphWidgetRegistry(graph as unknown as RuntimeGraph),
	);
	const rootPath = slotPath.slice(0, slotPath.length - graphNodeId.length);
	const composerPath = marklessInstancePath(slotSymbolId)
		? ''
		: rootPath.slice(0, rootPath.lastIndexOf(':', rootPath.length - 2) + 1);
	return context.invokeSymbol(composerPath + slotSymbolId, {
		...context,
		graph: graph.marklessPageGraph ?? graph,
		event: context.event,
		args,
	});
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
