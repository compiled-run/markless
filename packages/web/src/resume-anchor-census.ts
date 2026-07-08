import type { ResumeDomComment } from './resume-types.ts';

// Arm-branch anchors index in their owning boundary's census (T104): every
// page-level comment walk must skip them. Own module: lean closures stay lean.
export function isArmBranchAnchorComment(comment: ResumeDomComment): boolean {
	const text = comment.data ?? (comment as { readonly textContent?: string }).textContent ?? '';
	return text.startsWith('markless:arm-branch:') || text.startsWith('/markless:arm-branch:');
}
