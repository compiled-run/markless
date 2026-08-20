import type {
	PrerenderDataDefinition,
	PrerenderDataSurface,
	PrerenderRead,
} from './evaluator.ts';

/**
 * A projecting component's shared-instance seeds, which the components
 * projected into it must read before they render. Answering means running the
 * projected-into child's seed symbols from its props, so the answer is
 * pay-per-use: the bundler emits the install only in the render-data module of a
 * .tsrx whose compiler planned a shared-seed symbol, and a page with no widget
 * seeds leaves this slot empty and never loads the module that fills it.
 */
export type SharedSeedPass = (
	context: {
		readonly surface: PrerenderDataSurface;
		readonly symbolPrefix: string;
		readonly loadSymbol: (symbolId: string) => unknown | Promise<unknown>;
	},
	definition: PrerenderDataDefinition,
	componentEdgeId: string,
	read: PrerenderRead,
	inherited: ReadonlyMap<string, unknown> | undefined,
) => Promise<ReadonlyMap<string, unknown> | undefined>;

let installedPass: SharedSeedPass | undefined;

export function installSharedSeedPass(pass: SharedSeedPass): void {
	installedPass = pass;
}

export function sharedSeedPass(): SharedSeedPass | undefined {
	return installedPass;
}
