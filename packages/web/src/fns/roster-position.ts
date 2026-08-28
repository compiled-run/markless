import {
	marklessRenderRosterPosition,
	marklessRosterPositions,
	marklessRosterPositionSeeds,
} from '../prerender/shared-seed-slot.ts';

// The render half of a roster position. The resume half is fns/roster-resume.ts,
// which nothing eagerly loaded may name.

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
