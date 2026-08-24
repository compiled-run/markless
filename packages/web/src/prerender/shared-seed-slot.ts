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
 * The seed-map key prefix under which a widget's seed phase files one entry per
 * element() handle some part of this instance binds, restating
 * MARKLESS_ELEMENT_BOUND_KEY_PREFIX in @markless/compiler so the browser never
 * imports the compiler. A handle with no entry has no element in this widget, so
 * an IDREF naming it writes no attribute at all rather than an id naming nothing.
 */
export const MARKLESS_ELEMENT_BOUND_KEY_PREFIX = 'markless:element-bound|';

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
	componentEdgeId: string,
	read: PrerenderRead,
	inherited: ReadonlyMap<string, unknown> | undefined,
) => Promise<ReadonlyMap<string, unknown> | undefined>);

let installedPass: SharedSeedPass | undefined;

export function installSharedSeedPass(pass: SharedSeedPass): void {
	installedPass = pass;
}

export function sharedSeedPass(): SharedSeedPass | undefined {
	return installedPass;
}
