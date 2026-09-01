import { marklessRosterPositions } from './shared-seed-slot.ts';

/**
 * The roster half a page composed of several independently rendered islands
 * needs, which a single-component page gets from renderSsrOutput.
 *
 * A count is minted as a placeholder naming the roster's registration key and
 * answered by tallying that key's element-handle registrations. Composition
 * qualifies each island's handles with the island's own prefix AFTER the island
 * has rendered, so the only surface a key still matches is the island's own
 * output: answering page-wide would tally two embeds of one component as one
 * roster, and answering not at all leaves the compiled guard unanswered.
 */

type RosterResumeHost = {
	readonly __marklessRosterResume?: () => Promise<typeof import('../fns/roster-resume.ts')>;
};

export type IslandRosterSurface = {
	readonly html: string;
	readonly state?: unknown;
	readonly view?: { readonly elementHandles?: ReadonlyArray<{ readonly handleId: string }> };
};

/** The counts and count-spending expressions one island minted, made numbers. */
export async function marklessSsrIslandRosterAnswered<Surface extends IslandRosterSurface>(
	renderContext: unknown,
	surface: Surface,
): Promise<Surface> {
	const positions = marklessRosterPositions(
		(renderContext as { readonly sharedSeeds?: ReadonlyMap<string, unknown> } | null)?.sharedSeeds,
	);
	if (!positions?.counted) return surface;
	const roster = await (globalThis as RosterResumeHost).__marklessRosterResume?.();
	if (!roster) throw new Error('MARKLESS_ROSTER_COUNT_UNRESOLVED');
	// Spent expressions first: what the placeholder resolver then sees is only
	// the counts that were printed as they stood.
	return roster.marklessResolveRosterCounts(
		roster.marklessResolveDeferredCounts(surface, positions.deferred ?? []),
	);
}
