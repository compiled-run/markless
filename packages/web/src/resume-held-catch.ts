import type { ResumeArmRange, ResumeDomComment } from './resume-types.ts';

type Anchor = ResumeDomComment & {
	readonly parentNode?: { insertBefore: (node: unknown, before: unknown) => unknown } | null;
	readonly ownerDocument?: { createComment: (data: string) => ResumeDomComment } | null;
};

const heldCatchByStart = new WeakMap<object, ResumeArmRange>();

// Spec D8 failed refresh: a @catch over held @try content commits after it, between its own comment pair.
export function heldCatchRange(boundary: ResumeArmRange): ResumeArmRange {
	const end = boundary.endAnchor as Anchor;
	const prior = heldCatchByStart.get(boundary.startAnchor);
	if (prior && (prior.endAnchor as Anchor).parentNode === end.parentNode) return prior;
	const document = end.ownerDocument!;
	const range: ResumeArmRange = {
		id: `${boundary.id}:held-catch`,
		startAnchor: document.createComment(''),
		endAnchor: document.createComment(''),
	};
	end.parentNode!.insertBefore(range.startAnchor, end);
	end.parentNode!.insertBefore(range.endAnchor, end);
	heldCatchByStart.set(boundary.startAnchor, range);
	return range;
}
