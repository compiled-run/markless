import { expect, test } from 'vitest';
import {
	attachPrerenderBoundaryAuthority,
	beginPrerenderBoundaryArmCommit,
	claimPrerenderBoundaryArmRegistration,
	completePrerenderBoundaryArmRegistration,
	resolvePrerenderBoundaryAuthority,
} from '../src/prerender/staged-boundary-authority.ts';
import type { ResumeArmRecordSet, ResumeAsyncBoundaryRecord } from '../src/resume-types.ts';

const emptyArm = (): ResumeArmRecordSet => ({
	locators: [],
	events: [],
	domUpdates: [],
	behaviors: [],
	elementHandles: [],
	keyedRepeats: [],
	branches: [],
});

function boundary(armRecords: ResumeArmRecordSet): ResumeAsyncBoundaryRecord {
	return {
		id: 'async:feed',
		runnerGraphNodeId: 'computed:feed',
		initiallyServedArm: 1,
		startAnchor: { nodeType: 8, data: 'start' },
		endAnchor: { nodeType: 8, data: 'end' },
		asyncReads: [],
		armRecords,
	};
}

test('a trigger group starting after settle observes the settled arm from the sole boundary authority', async () => {
	const root = {} as never;
	attachPrerenderBoundaryAuthority(root);
	const pending = emptyArm();
	const canonical = resolvePrerenderBoundaryAuthority(root, boundary(pending));
	const pendingClaim = await claimPrerenderBoundaryArmRegistration(root, canonical);
	expect(pendingClaim).toEqual({ boundaryId: 'async:feed', revision: 0 });
	completePrerenderBoundaryArmRegistration(root, pendingClaim!, true);

	const settled = {
		...emptyArm(),
		events: [{ hostNodeId: 'h:row', eventName: 'click', symbolIds: ['symbol:row'] }],
	};
	const settleClaim = beginPrerenderBoundaryArmCommit(root, canonical, settled);
	expect(canonical.armRecords).toBe(settled);
	completePrerenderBoundaryArmRegistration(root, settleClaim!, true);

	const staleLaterGroup = resolvePrerenderBoundaryAuthority(root, boundary(pending));
	expect(staleLaterGroup).toBe(canonical);
	expect(staleLaterGroup.armRecords).toBe(settled);
	expect(await claimPrerenderBoundaryArmRegistration(root, staleLaterGroup)).toBeUndefined();
});
