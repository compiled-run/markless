import type { RuntimeGraph } from '@markless/runtime';
import type { ResumeBranchRecord } from '../resume-types.ts';
import { marklessInstancePath } from './instance-scope.ts';

// Loaded by a branch whose arms hold components that own values: those run only while their arm shows.
type Registration = { readonly branch: ResumeBranchRecord; readonly shows: (arm: number) => boolean };
const registrations = new WeakMap<RuntimeGraph, Map<string, Registration>>();

// Whether a node belongs to a component arm `arm` holds: its instance path runs through one of the arm's segments, past any rows.
function armOwns(branch: ResumeBranchRecord, arm: number, graphNodeId: string): boolean {
	// The update symbol runs as the owner; past one level the branch id carries the host prefix instead.
	const owner = marklessInstancePath(branch.symbolId);
	const path = marklessInstancePath(graphNodeId);
	if (!path.startsWith(owner)) return false;
	let rest = path.slice(owner.length);
	while (rest.startsWith('r:')) rest = rest.slice(rest.indexOf(':', 2) + 1);
	return !!branch.armComponents?.[arm]?.some((segment) => rest.startsWith(segment));
}

// A value is owned by every arm holding its component; it may run only while each of them shows.
function armShown(byBranch: Map<string, Registration>, graphNodeId: string): boolean | undefined {
	let owned: boolean | undefined;
	for (const { branch, shows } of byBranch.values())
		for (let arm = 0; arm < (branch.armComponents?.length ?? 0); arm++)
			if (armOwns(branch, arm, graphNodeId)) {
				if (!shows(arm)) return false;
				owned = true;
			}
	return owned;
}

/** Called each time the branch paints an arm: gates its arms once, and drops what the arm it `left` owned. */
export function gateBranchArms(
	graph: RuntimeGraph,
	branch: ResumeBranchRecord,
	left: number | undefined,
	paintedArms: ReadonlyMap<string, number>,
	wired: () => boolean,
	pickedArm: (graph: RuntimeGraph, branch: ResumeBranchRecord) => number,
	release: (release: () => void) => void,
): void {
	let byBranch = registrations.get(graph);
	if (!byBranch) {
		const held = (byBranch = new Map());
		registrations.set(graph, held);
		graph.gateArms?.((graphNodeId) => armShown(held, graphNodeId));
	}
	if (byBranch.get(branch.id)?.branch === branch) {
		// The leaving arm's components are gone: a run still in flight lands nothing, and a reopen starts fresh.
		if (left !== undefined && left !== paintedArms.get(branch.id))
			graph.asyncPlane?.()?.drop((id) => armOwns(branch, left, id));
		return;
	}
	const test = branch.testReads[0];
	const registration: Registration = {
		branch,
		// Painted and still picked; a branch with no test never flips, and a test nothing has derived since the
		// served render only has the painted arm to go by.
		shows: (arm) =>
			wired() &&
			paintedArms.get(branch.id) === arm &&
			(!test ||
				pickedArm(graph, branch) === arm ||
				(branch.takenArm !== undefined && graph.read(test.graphNodeId, test.path) === undefined)),
	};
	byBranch.set(branch.id, registration);
	release(() => {
		if (byBranch.get(branch.id) === registration) byBranch.delete(branch.id);
	});
}
