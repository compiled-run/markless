export function marklessBoundSymbolId(
	child: {
		readonly symbolPrefix?: string;
		readonly boundSymbols?: Readonly<Record<string, string>>;
	},
	symbolId: string,
): string {
	const direct = child.boundSymbols?.[symbolId];
	if (direct) return direct;

	// A nested composed view can already carry the bound ID selected by its
	// immediate parent. Rebind that symbol through the outer instance row when
	// one exists; prefixing the inner bound ID would route it back to the child
	// resolver and lose the outer instance's capture adapter.
	const baseSymbolId = marklessBaseSymbolId(symbolId);
	const rebound = baseSymbolId ? child.boundSymbols?.[baseSymbolId] : undefined;
	return rebound ?? `${child.symbolPrefix ?? ''}${symbolId}`;
}

export function marklessLiveBoundGraphRoute(binding: {
	readonly kind?: string;
	readonly graphNodeId?: unknown;
	readonly path?: unknown;
} | undefined):
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

function marklessBaseSymbolId(symbolId: string): string | undefined {
	if (!symbolId.startsWith('bound:')) return undefined;
	const separator = symbolId.indexOf(':', 'bound:'.length);
	if (separator < 0) return undefined;
	try {
		return decodeURIComponent(symbolId.slice('bound:'.length, separator));
	} catch {
		return undefined;
	}
}
