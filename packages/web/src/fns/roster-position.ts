import {
	marklessRenderRosterPosition,
	marklessRosterPositions,
	marklessRosterPositionSeeds,
} from '../prerender/shared-seed-slot.ts';

// The two halves of a roster position no eagerly loaded module reaches: the
// served page's counter, and the live roster's revision after resume.

type RosterPositionContext = {
	readonly sharedSeeds?: ReadonlyMap<string, unknown>;
	readonly rosterPosition?: (rosterGraphNodeId: string, handleGraphNodeId: string) => number;
};

/**
 * The server render context with a position channel on it. One counter per
 * render, held by the closure rather than by a module, so two page renders in
 * one process never share a count.
 */
export function marklessSsrRosterPositionContext(renderContext: unknown): unknown {
	const context = (renderContext ?? {}) as Record<string, unknown> & RosterPositionContext;
	if (typeof context.rosterPosition === 'function') return renderContext;
	const sharedSeeds = marklessRosterPositionSeeds(context.sharedSeeds);
	const positions = marklessRosterPositions(sharedSeeds)!;
	return {
		...context,
		sharedSeeds,
		rosterPosition: (rosterGraphNodeId: string, handleGraphNodeId: string) =>
			marklessRenderRosterPosition(positions, undefined, rosterGraphNodeId, handleGraphNodeId),
	};
}

type RosterRevisionGraph = {
	readonly read: (graphNodeId: string, path?: ReadonlyArray<string>) => unknown;
	readonly write: (write: { readonly graphNodeId: string; readonly value: unknown }) => void;
	readonly subscribe: (subscription: {
		readonly id: string;
		readonly graphNodeId: string;
		readonly path: ReadonlyArray<string>;
		readonly run: () => void;
	}) => () => void;
};

// An element() binding's graph node id, restating the compiler's spelling for
// the reason element-handle-roster.ts restates the seed keys.
const ELEMENT_BINDING_SEGMENT = '/element:';

/**
 * After resume the roster is live, and a part's place in it changes when a row
 * arrives, leaves or moves. Nothing else writes an element() binding node and
 * every reader of one answers from the handle registry, so the binding's cell
 * carries a revision: bumping it is how the parts deriving a place in that
 * roster are told to derive it again.
 */
export function wireRosterRevisions(input: {
	readonly graph: RosterRevisionGraph;
	readonly computed: ReadonlyArray<{
		readonly dependencies?: ReadonlyArray<{ readonly graphNodeId: string }>;
	}>;
	readonly keyedRepeats: ReadonlyArray<{
		readonly id: string;
		readonly collectionGraphNodeId?: string;
		readonly collectionPath: ReadonlyArray<string>;
	}>;
	readonly storeContainerSubscription: (release: () => void) => void;
}): void {
	const rosters = new Set<string>();
	for (const record of input.computed)
		for (const dependency of record.dependencies ?? [])
			if (dependency.graphNodeId.includes(ELEMENT_BINDING_SEGMENT))
				rosters.add(dependency.graphNodeId);
	if (rosters.size === 0) return;
	for (const repeat of input.keyedRepeats) {
		const collection = repeat.collectionGraphNodeId;
		if (!collection) continue;
		input.storeContainerSubscription(
			input.graph.subscribe({
				// Wired after the repeat's own row application, so the rows are placed
				// before the parts standing in them are asked where they stand.
				id: `roster-revision:${repeat.id}:${collection}`,
				graphNodeId: collection,
				path: repeat.collectionPath,
				run: () => {
					for (const roster of rosters) {
						const revision = input.graph.read(roster, []);
						input.graph.write({
							graphNodeId: roster,
							value: (typeof revision === 'number' ? revision : 0) + 1,
						});
					}
				},
			}),
		);
	}
}
