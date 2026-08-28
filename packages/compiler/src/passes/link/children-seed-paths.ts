import type { SymbolResolverPlan } from '../../artifacts.ts';
import type { ProtocolStatePayload } from '@markless/serializer';
import { PROJECTION_PROP_NAME } from '../public-render/shared-seed-pass.ts';

export type ChildrenSeedPathsInput = {
	readonly symbolResolver: SymbolResolverPlan;
	readonly protocolState: ProtocolStatePayload;
};

/**
 * Which components in this module seed a shared cell from their own `children`,
 * and the state path each one writes. Read from the published seed routes rather
 * than the seed's expression text: the route already names the prop the seed
 * follows, which is the same question asked precisely.
 *
 * Both the module that compiles the part and the module that places it need this
 * answer - the composing module reads it back off the part's published
 * interface - so it is computed once here.
 */
export function childrenSeedPathsByComponent(
	input: ChildrenSeedPathsInput,
): ReadonlyMap<string, string> {
	const seedSymbols = new Map(
		input.symbolResolver.symbols.flatMap((symbol) =>
			symbol.kind === 'shared-seed' && symbol.componentName
				? [[symbol.id, symbol] as const]
				: [],
		),
	);
	const paths = new Map<string, string>();
	for (const seed of input.protocolState.sharedSeeds ?? []) {
		const symbol = seedSymbols.get(seed.deriveSymbolId);
		if (!symbol?.componentName || paths.has(symbol.componentName)) continue;
		if (!seed.dependencies.some((dependency) => readsProjectionProp(dependency.reads))) continue;
		paths.set(symbol.componentName, symbol.name ?? symbol.graphNodeId);
	}
	return paths;
}

function readsProjectionProp(reads: {
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
}): boolean {
	if (reads.graphNodeId === `prop:${PROJECTION_PROP_NAME}`) return true;
	return reads.graphNodeId === 'prop:props' && reads.path[0] === PROJECTION_PROP_NAME;
}
