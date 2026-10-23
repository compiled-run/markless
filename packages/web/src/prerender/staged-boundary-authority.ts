import type {
	ResumeArmRecordSet,
	ResumeAsyncBoundaryPayload,
	ResumeAsyncBoundaryRecord,
	ResumeDomElement,
} from '../resume-types.ts';

// The authority only keys off the boundary id, so it holds either the decoded
// payload form (index anchors) or the materialized record (live comments).
type BoundaryLike = ResumeAsyncBoundaryRecord | ResumeAsyncBoundaryPayload;

export type PrerenderBoundaryArmRegistration = {
	readonly boundaryId: string;
	readonly revision: number;
};

type PendingRegistration = {
	readonly revision: number;
	readonly done: Promise<void>;
	readonly finish: () => void;
};

type BoundaryAuthorityState = {
	readonly boundary: BoundaryLike;
	revision: number;
	registeredRevision: number;
	registering?: PendingRegistration;
};

type BoundaryAuthority = Map<string, BoundaryAuthorityState>;

const authorities = new WeakMap<ResumeDomElement, BoundaryAuthority>();

export function attachPrerenderBoundaryAuthority(root: ResumeDomElement): void {
	authorities.set(root, new Map());
}

export function resolvePrerenderBoundaryAuthority<T extends BoundaryLike>(
	root: ResumeDomElement,
	boundary: T,
): T {
	const authority = authorities.get(root);
	if (!authority) return boundary;
	const current = authority.get(boundary.id);
	if (current) return current.boundary as T;
	authority.set(boundary.id, {
		boundary,
		revision: 0,
		registeredRevision: -1,
	});
	return boundary;
}

export async function claimPrerenderBoundaryArmRegistration(
	root: ResumeDomElement,
	boundary: BoundaryLike,
): Promise<PrerenderBoundaryArmRegistration | undefined> {
	const state = authorities.get(root)?.get(boundary.id);
	if (!state) return { boundaryId: boundary.id, revision: -1 };
	for (;;) {
		if (state.registeredRevision === state.revision) return undefined;
		if (state.registering) {
			await state.registering.done;
			continue;
		}
		const claim = { boundaryId: boundary.id, revision: state.revision };
		state.registering = pendingRegistration(state.revision);
		return claim;
	}
}

export function beginPrerenderBoundaryArmCommit(
	root: ResumeDomElement,
	boundary: BoundaryLike,
	armRecords: ResumeArmRecordSet,
): PrerenderBoundaryArmRegistration | undefined {
	const state = authorities.get(root)?.get(boundary.id);
	if (!state) return undefined;
	state.revision += 1;
	(state.boundary as { armRecords?: ResumeArmRecordSet }).armRecords = armRecords;
	state.registering = pendingRegistration(state.revision);
	return { boundaryId: boundary.id, revision: state.revision };
}

export function completePrerenderBoundaryArmRegistration(
	root: ResumeDomElement,
	claim: PrerenderBoundaryArmRegistration,
	succeeded: boolean,
): void {
	const state = authorities.get(root)?.get(claim.boundaryId);
	if (!state || state.registering?.revision !== claim.revision) return;
	if (succeeded) state.registeredRevision = claim.revision;
	const pending = state.registering;
	state.registering = undefined;
	pending.finish();
}

function pendingRegistration(revision: number): PendingRegistration {
	let finish!: () => void;
	const done = new Promise<void>((resolve) => {
		finish = resolve;
	});
	return { revision, done, finish };
}
