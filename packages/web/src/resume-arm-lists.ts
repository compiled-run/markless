import { marklessElementAt } from './resume-anchor-census.ts';
import { armHostId } from './resume-branches.ts';
import type { ResumeBranchRecord, ResumeDomNode, ResumeKeyedRepeatRecord } from './resume-types.ts';

// The lists whose parent element a showing arm renders, each filed and wired under an arm-scoped id page wiring never looks up.
export async function wireArmLists(
	input: any,
	branch: ResumeBranchRecord & { readonly armLists?: ReadonlyArray<ResumeKeyedRepeatRecord> },
	armIndex: number,
	lists: NonNullable<NonNullable<ResumeBranchRecord['armRecords']>[number]['repeatParents']>,
	armNodes: ReadonlyArray<ResumeDomNode>,
	committed: ReadonlyArray<{ readonly id: string }> = [],
): Promise<void> {
	const records: ResumeKeyedRepeatRecord[] = [];
	for (const { repeatId, parentHostPath } of lists) {
		const record = [...(branch.armLists ?? []), ...(input.view.keyedRepeats ?? [])].find(
			(candidate: ResumeKeyedRepeatRecord) => candidate.id === repeatId,
		);
		const parent = record && marklessElementAt({ childNodes: armNodes }, parentHostPath);
		// Its own id: the arm's events may file the same element under the plain arm host id.
		const hostNodeId = `${armHostId(branch, armIndex, parentHostPath)}:list`;
		const shown = input.elementsByHostId.get(hostNodeId);
		// Already wired on this element or by the arm's own commit: a second wiring adds every new row twice.
		if (!parent || shown === parent || committed.some((each) => each.id === repeatId)) continue;
		// The arm's last showing wired it on an element this one replaced.
		if (shown) input.disposeHost(hostNodeId);
		input.fileHost(hostNodeId, parent);
		records.push({ ...record, parentHostNodeId: hostNodeId });
	}
	if (records.length)
		await (await input.armRegistrationDeps({ events: [], behaviors: [] })).registerKeyedRepeats(records);
}
