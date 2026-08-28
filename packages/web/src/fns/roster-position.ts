import {
	marklessRosterPositions,
	marklessRosterPositionSeeds,
	marklessRosterRenderContext,
} from '../prerender/shared-seed-slot.ts';

// The render half of a roster's two questions. Resolving a count is in
// fns/roster-resume.ts with the resume half, reached through the same loader,
// because it is gated on the same fact: a payload with no computed node can
// hold no roster derivation.

type RosterRenderContext = {
	readonly sharedSeeds?: ReadonlyMap<string, unknown>;
	readonly rosterPosition?: (rosterGraphNodeId: string, handleGraphNodeId: string) => number;
};

type RosterResumeHost = {
	readonly __marklessRosterResume?: () => Promise<typeof import('./roster-resume.ts')>;
};

/**
 * The server render context with the roster channels on it. One counter per
 * render, held by the closure rather than by a module, so two page renders in
 * one process never share a count.
 */
export function marklessSsrRosterPositionContext(renderContext: unknown): unknown {
	const context = (renderContext ?? {}) as Record<string, unknown> & RosterRenderContext;
	if (typeof context.rosterPosition === 'function') return renderContext;
	const sharedSeeds = marklessRosterPositionSeeds(context.sharedSeeds);
	return {
		...context,
		sharedSeeds,
		...marklessRosterRenderContext(marklessRosterPositions(sharedSeeds), undefined),
	};
}

/**
 * The counts this render minted, answered from the page it produced. A count is
 * asked before the members it counts have rendered, so this is where it becomes
 * a number — after composition, off the served view's own roster.
 */
export async function marklessSsrRosterCounted<
	Surface extends {
		readonly html: string;
		readonly state?: unknown;
		readonly view?: { readonly elementHandles?: ReadonlyArray<{ readonly handleId: string }> };
	},
>(renderContext: unknown, surface: Surface): Promise<Surface> {
	const context = (renderContext ?? {}) as RosterRenderContext;
	if (!marklessRosterPositions(context.sharedSeeds)?.counted) return surface;
	const roster = await (globalThis as RosterResumeHost).__marklessRosterResume?.();
	if (!roster) throw new Error('MARKLESS_ROSTER_COUNT_UNRESOLVED');
	return roster.marklessResolveRosterCounts(surface);
}
