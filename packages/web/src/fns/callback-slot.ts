import { marklessComposedGraphNodeId, marklessInstancePath } from './instance-scope.ts';

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
): unknown {
	const slotSymbolId = context.graph.read(graphNodeId, []);
	if (typeof slotSymbolId !== 'string') return undefined;
	if (typeof context.invokeSymbol !== 'function')
		throw new Error('Bound callback invocation is unavailable');
	const slotPath = marklessComposedGraphNodeId(
		graphNodeId,
		context.graph.marklessInstancePath ?? '',
	);
	const rootPath = slotPath.slice(0, slotPath.length - graphNodeId.length);
	const composerPath = marklessInstancePath(slotSymbolId)
		? ''
		: rootPath.slice(0, rootPath.lastIndexOf(':', rootPath.length - 2) + 1);
	return context.invokeSymbol(composerPath + slotSymbolId, {
		...context,
		graph: context.graph.marklessPageGraph ?? context.graph,
		event: context.event,
		args,
	});
}
