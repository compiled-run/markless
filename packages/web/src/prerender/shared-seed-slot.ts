import type { Awaitable } from '../ssr-data/awaitable.ts';
import type {
	PrerenderDataDefinition,
	PrerenderDataSurface,
	PrerenderRead,
} from './evaluator.ts';

/**
 * The seed-map key a widget root's instance token travels under, restating
 * MARKLESS_WIDGET_INSTANCE_KEY in @markless/compiler (public-render's
 * residue-reader) so the browser never imports the compiler. It is not a graph
 * node id: it names WHICH rendered widget the parts seeded from this map belong
 * to, which is what a shared() element() handle's minted id has to carry.
 * shared-seed-widget.test.ts pins this spelling; element-handle-idref.test.ts
 * proves the two sides agree end to end.
 */
export const MARKLESS_WIDGET_INSTANCE_KEY = 'markless:widget-instance';

/**
 * The same token, filed PER shared definition.
 *
 * One element can carry handles declared by two different widget families - a
 * radio item's own field handle and the group's set, a tree label's item handle
 * and the root's - so "which rendered widget am I inside" has no single answer
 * on that element. It has one answer per DEFINITION, which is what the reading
 * handle names: a handle's graph node id is `<definitionId>/element:<name>`, so
 * the mint asks for its own family's token and gets the instance the handle was
 * DECLARED in, never whichever family last seeded this scope.
 *
 * The plain key above stays filed too: a page with one widget family reads it
 * exactly as before, and it is the fallback when no per-definition token exists.
 */
export function marklessWidgetInstanceKey(definitionId: string): string {
	return `${MARKLESS_WIDGET_INSTANCE_KEY}|${definitionId}`;
}

/**
 * A projecting component's shared-instance seeds, which the components
 * projected into it must read before they render. Answering means running the
 * projected-into child's seed symbols from its props, so the answer is
 * pay-per-use: the bundler emits the install only in the render-data module of a
 * .tsrx whose compiler planned a shared-seed symbol, and a page with no widget
 * seeds leaves this slot empty and never loads the module that fills it.
 */
export type SharedSeedPass = {
	/**
	 * Where a placed child's own composition puts the children written into it,
	 * read off the same declared chain the seed pass descends. It rides the seed
	 * pass because it answers for the same widget the seed pass is seeding, and
	 * because that keeps a page with no widget seeds from loading either.
	 */
	childrenWidgetRoot?: (surface: PrerenderDataSurface, componentName: string) => string;
} & ((
	context: {
		readonly surface: PrerenderDataSurface;
		readonly symbolPrefix: string;
		readonly idPrefix: string;
		readonly loadSymbol: (symbolId: string) => unknown | Promise<unknown>;
		// The keyed `@for` row this phase seeds for; empty outside a repeat.
		readonly rowSegment?: string;
		// Answers a root prop left as an authored expression, with this row in scope.
		readonly readEdgeProp?: (prop: { readonly source?: string }) => unknown;
	},
	definition: PrerenderDataDefinition,
	// The whole slot, not just its edge id: the pass also files this widget's
	// element()-handle roster, which is read off the projection the slot names.
	slot: { readonly componentEdgeId: string; readonly projectionChunkId?: string },
	read: PrerenderRead,
	inherited: ReadonlyMap<string, unknown> | undefined,
) => Awaitable<ReadonlyMap<string, unknown> | undefined>);

let installedPass: SharedSeedPass | undefined;

export function installSharedSeedPass(pass: SharedSeedPass): void {
	installedPass = pass;
}

export function sharedSeedPass(): SharedSeedPass | undefined {
	return installedPass;
}

/**
 * Where a part stands in its family's roster, answered for the two regimes that
 * ask it: at render there is no DOM, so the answer is the order this widget
 * instance EMITS its members; after resume the roster is live, so the answer is
 * its document order. The compiler lowers `roster.indexOf(mine)` to one call in
 * each regime with the same two node ids, so the two cannot disagree.
 */

/**
 * The seed-map key this render's position counter travels under. The seed map
 * is the one channel that reaches both the compiled SSR child render and the
 * CSR component evaluation, and it already carries the widget-instance token a
 * position counts within.
 */
export const MARKLESS_ROSTER_POSITIONS_KEY = 'markless:roster-positions';

export type MarklessRosterPositions = {
	/**
	 * The seed map of the part now rendering. Server render asks with two ids and
	 * nothing else — the compiled call is `(ctx?.rosterPosition ?? throw)(a, b)`,
	 * which loses the context — so the renderer publishes each child's seeds here
	 * as it hands the child over. CSR passes its seeds directly and never reads it.
	 */
	seeds?: ReadonlyMap<string, unknown>;
	readonly taken: Map<string, number>;
};

export function marklessRosterPositions(
	seeds: ReadonlyMap<string, unknown> | undefined,
): MarklessRosterPositions | undefined {
	const held = seeds?.get(MARKLESS_ROSTER_POSITIONS_KEY);
	return held && typeof held === 'object' ? (held as MarklessRosterPositions) : undefined;
}

/** The render's seed map with a counter filed on it, minted once per render. */
export function marklessRosterPositionSeeds(
	seeds?: ReadonlyMap<string, unknown>,
): ReadonlyMap<string, unknown> {
	const held = marklessRosterPositions(seeds);
	if (held) return seeds as ReadonlyMap<string, unknown>;
	const filed = new Map<string, unknown>(seeds ?? []);
	filed.set(MARKLESS_ROSTER_POSITIONS_KEY, { taken: new Map<string, number>() });
	return filed;
}

/**
 * The nth member of this instance's roster to ask is the nth in it.
 *
 * Render walks a widget instance in document order, so counting the asks IS
 * that order — there is no DOM yet to compare against. The count is per widget
 * instance, which is what keeps a second collection on the page starting at
 * zero; the token is asked per family, exactly as a minted handle id asks it.
 */
export function marklessRenderRosterPosition(
	positions: MarklessRosterPositions,
	seeds: ReadonlyMap<string, unknown> | undefined,
	rosterGraphNodeId: string,
	handleGraphNodeId: string,
): number {
	const scope = seeds ?? positions.seeds;
	const family = rosterGraphNodeId.slice(0, rosterGraphNodeId.lastIndexOf('/'));
	const instance =
		scope?.get(marklessWidgetInstanceKey(family)) ?? scope?.get(MARKLESS_WIDGET_INSTANCE_KEY);
	const key = `${String(instance)}|${rosterGraphNodeId}|${handleGraphNodeId}`;
	const taken = positions.taken.get(key) ?? 0;
	positions.taken.set(key, taken + 1);
	return taken;
}
