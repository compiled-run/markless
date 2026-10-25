import type { ResumeArmRecordSet } from './resume-types.ts';

type AnchoredBoundary = {
	readonly startAnchor: { readonly index: number };
	readonly endAnchor: { readonly index: number };
	readonly armRecords?: unknown;
};

// The boundaries a rendered arm holds inside itself, anchor indexes counted from the arm start.
export function armNestedBoundaries(
	boundaries: ReadonlyArray<AnchoredBoundary>,
	around: AnchoredBoundary,
): NonNullable<ResumeArmRecordSet['asyncBoundaries']> {
	const armIndex = <A extends { readonly index: number }>(anchor: A): A => ({
		...anchor,
		index: anchor.index - around.startAnchor.index - 1,
	});
	return boundaries
		.filter(
			(candidate) =>
				candidate.startAnchor.index > around.startAnchor.index &&
				candidate.endAnchor.index < around.endAnchor.index,
		)
		.map((candidate) => ({
			...(candidate as AnchoredBoundary),
			armRecords: Array.isArray(candidate.armRecords) ? undefined : candidate.armRecords,
			startAnchor: armIndex(candidate.startAnchor),
			endAnchor: armIndex(candidate.endAnchor),
		})) as unknown as NonNullable<ResumeArmRecordSet['asyncBoundaries']>;
}
