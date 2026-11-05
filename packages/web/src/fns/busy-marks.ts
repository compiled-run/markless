import { ASYNC_BOUNDARY_ARM } from '@markless/serializer/async-boundary-arm';
import type {
	ResumeArmRange,
	ResumeAsyncBoundaryRecord,
	ResumeDomComment,
} from '../resume-types.ts';
import type { BusyBoundary, busyElements } from './busy-elements.ts';

type Marks = typeof busyElements;
type AfterAnchor = { __marklessAfter?: ResumeDomComment };

let marks: Marks | undefined;
let queued: Array<(marks: Marks) => void> | undefined;
// The per-element marks load with the first refresh over shown content; until then nothing is marked, so other calls wait or drop.
function withMarks(start: boolean, run: (marks: Marks) => void): void {
	if (marks) return run(marks);
	if (!queued) {
		if (!start) return;
		queued = [];
		void import('./busy-elements.ts').then((module) => {
			marks = module.busyElements;
			for (const each of queued!) each(marks);
		});
	}
	queued.push(run);
}

const note = (
	boundary: BusyBoundary,
	graphNodeId: string,
	snapshot: unknown,
	showsSettledContent: boolean,
): void =>
	withMarks(
		showsSettledContent && (snapshot as { readonly status?: unknown } | null)?.status === 'pending',
		(loaded) => loaded.note(boundary, graphNodeId, snapshot, showsSettledContent),
	);
const set = (boundary: BusyBoundary, busy: boolean): void =>
	withMarks(busy, (loaded) => loaded.set(boundary, busy));
const apply = (boundary: BusyBoundary): void => withMarks(false, (loaded) => loaded.apply(boundary));

type ShownArm = { __marklessShownArm?: number };
const shown = (boundary: ResumeAsyncBoundaryRecord, arm: number) =>
	void ((boundary.endAnchor as ShownArm).__marklessShownArm = arm);

// A failed refresh over shown @try content keeps it and draws the @catch in a range opened after it.
function settleRange(boundary: ResumeAsyncBoundaryRecord, arm: number): ResumeArmRange | undefined {
	const after =
		arm === ASYNC_BOUNDARY_ARM.catch &&
		((boundary.endAnchor as ShownArm).__marklessShownArm ?? boundary.initiallyServedArm) ===
			ASYNC_BOUNDARY_ARM.try;
	shown(boundary, after ? ASYNC_BOUNDARY_ARM.try : arm);
	if (!after) return;
	const end = boundary.endAnchor as unknown as ChildNode & AfterAnchor;
	let start = end.__marklessAfter as unknown as ChildNode | undefined;
	if (start?.parentNode !== end.parentNode) {
		// The arm-branch prefix keeps page-level comment walks from counting it.
		start = end.ownerDocument!.createComment('markless:arm-branch:after');
		end.before(start);
		end.__marklessAfter = start as unknown as ResumeDomComment;
	}
	return { id: `${boundary.id}:after`, startAnchor: end.__marklessAfter!, endAnchor: boundary.endAnchor };
}

export const busyMarks = { note, set, apply, settleRange, shown };
