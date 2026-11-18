import {
	protocolBoundSymbolBase,
	protocolBoundSymbolBaseEnd,
} from '../../../serializer/src/protocol-constants.ts';

type BoundChild = {
	readonly symbolPrefix?: string;
	readonly boundSymbols?: Readonly<Record<string, string>>;
	/** Where the module whose edge owns `boundSymbols` is rooted, in the same space as `symbolPrefix`. */
	readonly boundSymbolPrefix?: string;
};

export function marklessBoundSymbolId(child: BoundChild, symbolId: string): string {
	const rebound = marklessReboundSymbolId(child.boundSymbols, symbolId);
	return rebound
		? (child.boundSymbolPrefix ?? '') + rebound
		: `${child.symbolPrefix ?? ''}${symbolId}`;
}

/** The row an edge binds a symbol id to, whether the id is the child's own or a bound id the child already chose. */
export function marklessReboundSymbolId(
	boundSymbols: Readonly<Record<string, string>> | undefined,
	symbolId: string,
): string | undefined {
	const direct = boundSymbols?.[symbolId];
	if (direct) return direct;
	// A nested composed view can already carry the bound ID selected by its
	// immediate parent. Rebind that symbol through the outer instance row when
	// one exists; prefixing the inner bound ID would route it back to the child
	// resolver and lose the outer instance's capture adapter.
	// Keyed by the bound id's prefix: a bare key is the child's own id, and the
	// nested id's base is a grandchild's, which can spell the same `symbol:N`.
	return protocolBoundSymbolBase(symbolId)
		? boundSymbols?.[symbolId.slice(0, protocolBoundSymbolBaseEnd(symbolId))]
		: undefined;
}

// A composed DOM update receives its current value from the remapped graph
// record. If an inner component already bound the update symbol, keep that
// complete ID in the inner resolver's namespace instead of rebinding its bare
// `symbol:N` segment through an unrelated outer symbol with the same local ID.
export function marklessDomUpdateSymbolId(child: BoundChild, symbolId: string): string {
	const direct = child.boundSymbols?.[symbolId];
	if (direct) return (child.boundSymbolPrefix ?? '') + direct;
	return protocolBoundSymbolBase(symbolId)
		? `${child.symbolPrefix ?? ''}${symbolId}`
		: marklessBoundSymbolId(child, symbolId);
}

export function marklessLiveBoundGraphRoute(binding: {
	readonly kind?: string;
	readonly graphNodeId?: unknown;
	readonly path?: unknown;
} | null | undefined):
	| { readonly graphNodeId: string; readonly path: ReadonlyArray<string> }
	| undefined {
	if (
		!binding ||
		(binding.kind !== undefined && binding.kind !== 'graph-reference') ||
		typeof binding.graphNodeId !== 'string'
	) {
		return undefined;
	}
	return {
		graphNodeId: binding.graphNodeId,
		path: Array.isArray(binding.path) ? binding.path : [],
	};
}

export { protocolBoundSymbolBase as marklessBaseSymbolId };
