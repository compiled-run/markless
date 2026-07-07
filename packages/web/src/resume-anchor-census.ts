import type { ResumeDomComment } from './resume-types.ts';

// Arm-branch anchors (`<!--markless:arm-branch:...-->`) index in their owning
// boundary's own census (T104): every page-level comment walk must skip them.
// Kept in its own module so lean on-demand closures do not pull the full
// arm-record materializer in statically.
export function isArmBranchAnchorComment(comment: ResumeDomComment): boolean {
	const text = comment.data ?? (comment as { readonly textContent?: string }).textContent ?? '';
	return text.startsWith('markless:arm-branch:') || text.startsWith('/markless:arm-branch:');
}
