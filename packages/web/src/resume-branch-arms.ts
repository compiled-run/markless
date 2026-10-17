import type { ResumeBranchArmEntry, ResumeDomElement } from './resume-types.ts';

// The arm a branch or boundary shows, told to the rows that follow it; create false only updates.
export function showBranchArm(
	root: ResumeDomElement,
	id: string,
	arm: number | undefined,
	start: ResumeBranchArmEntry['start'],
	end: ResumeBranchArmEntry['end'],
	create = true,
): void {
	let shown = root.__marklessBranchArms?.get(id);
	if (!shown) {
		if (!create) return;
		(root.__marklessBranchArms ??= new Map()).set(id, (shown = { listeners: new Set() }));
	}
	Object.assign(shown, { arm, start, end });
	for (const paint of shown.listeners) paint();
}
