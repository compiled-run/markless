import type { ResumeArmRecordSet } from '../resume-types.ts';

// A flip whose arm holds a component that has to run cannot be rebuilt from
// compiled markup, so it re-renders the whole page and keeps only the branch's
// own range. That range comes back page-absolute; every record inside it moves
// to arm-relative coordinates here, which is the one shape `commitArm` can
// register against freshly inserted DOM.

type HostedRecord = { readonly hostNodeId: string };
type LocatorRecord = {
	readonly hostNodeId: string;
	readonly index: number;
	readonly tagName: string;
};

// Only the render-data surface publishes element ranges per anchor; the coarse
// built-page structure carries markup alone, and an arm cannot be addressed
// from that.
type BranchRangeAnchor = {
	readonly kind: 'branch' | 'async';
	readonly id: string;
	readonly html: string;
	readonly elementStart?: number;
	readonly elementEnd?: number;
};

type BranchRangeInput = {
	readonly structure: { readonly anchors: ReadonlyArray<BranchRangeAnchor> } | undefined;
	readonly branchSiteId: string;
	readonly view: {
		readonly locators: ReadonlyArray<LocatorRecord>;
		readonly events: ReadonlyArray<HostedRecord>;
		readonly domUpdates?: ReadonlyArray<HostedRecord>;
		readonly behaviors: ReadonlyArray<HostedRecord>;
		readonly elementHandles: ReadonlyArray<HostedRecord>;
		readonly keyedRepeats?: ReadonlyArray<{ readonly parentHostNodeId: string }>;
	};
};

/**
 * The arm-relative record set and markup for one branch of a freshly evaluated
 * render. Throws when the render produced no such branch: a flip that cannot
 * name its own range must fail loud rather than commit an empty arm.
 */
export function prerenderBranchArm(input: BranchRangeInput): {
	readonly html: string;
	readonly armRecords: ResumeArmRecordSet;
} {
	const anchor = input.structure?.anchors.find(
		(candidate) => candidate.kind === 'branch' && candidate.id === input.branchSiteId,
	);
	if (!anchor || anchor.elementStart === undefined || anchor.elementEnd === undefined)
		throw new Error(`MARKLESS_PRERENDER_BRANCH_MISSING: ${input.branchSiteId}`);
	const { elementStart, elementEnd } = anchor;
	const locators = input.view.locators
		.filter((locator) => locator.index >= elementStart && locator.index < elementEnd)
		.map((locator) => ({
			...locator,
			strategy: 'arm-relative' as const,
			index: locator.index - elementStart,
		}))
		.sort((left, right) => left.index - right.index);
	const armHostIds = new Set(locators.map((locator) => locator.hostNodeId));
	const inRange = <T extends HostedRecord>(records: ReadonlyArray<T> | undefined) =>
		(records ?? []).filter((record) => armHostIds.has(record.hostNodeId));
	const keyedRepeats = (input.view.keyedRepeats ?? []).filter((record) =>
		armHostIds.has(record.parentHostNodeId),
	);
	return {
		html: anchor.html,
		armRecords: {
			locators,
			events: inRange(input.view.events),
			domUpdates: inRange(input.view.domUpdates),
			behaviors: inRange(input.view.behaviors),
			elementHandles: inRange(input.view.elementHandles),
			...(keyedRepeats.length > 0 ? { keyedRepeats } : {}),
			branches: [],
		} as unknown as ResumeArmRecordSet,
	};
}
