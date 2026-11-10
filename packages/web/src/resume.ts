import { RuntimeResumeError, runtimeResumeError } from './inline/resume-errors.ts';
import { pageCommentCensus } from './resume-anchor-census.ts';
import {
	connectedElement,
	materializeDomLocators,
	materializeElementHandles,
} from './resume-locators.ts';
import type {
	ResumeAsyncBoundaryRecord,
	ResumeDispatchOptions,
	ResumeDomComment,
	ResumeDomElement,
	ResumeDomEvent,
	ResumeRuntime,
	ResumeRuntimeInput,
} from './resume-types.ts';
import type { ProtocolStatePayload } from '@markless/serializer';

export {
	RuntimeResumeError,
	mismatchedElementLocatorError,
	missingElementLocatorError,
} from './inline/resume-errors.ts';
export type { RuntimeResumeDiagnostic, RuntimeResumeErrorCode } from './inline/resume-errors.ts';
export type * from './resume-types.ts';

const LOADING = 1,
	LIVE = 2,
	DISPOSED = 3;
/** The facade's one lifecycle, unset until the runtime module is first asked for; `p` is the phase, `r` its runtime or the load of it. A dispose in any phase is final. */
type FacadeState =
	| { readonly p: typeof LOADING; readonly r: Promise<ResumeRuntime | undefined> }
	| { readonly p: typeof LIVE; readonly r: ResumeRuntime }
	| { readonly p: typeof DISPOSED; readonly r?: undefined };

export function createResumeRuntime(
	input: ResumeRuntimeInput,
	onRegisterComputedRefreshes?: (
		register: (records: ProtocolStatePayload['computed']) => Promise<void>,
	) => void,
): ResumeRuntime {
	const asyncBoundariesById = materializeAsyncBoundaryLocators(
		input.root,
		input.view.asyncBoundaries,
	);
	const elementsByHostId = input.liveHostNodes
		? new Map(input.liveHostNodes)
		: materializeDomLocators(input.root, input.view.locators);
	const elementHandles = materializeElementHandles(
		input.root,
		elementsByHostId,
		input.view.elementHandles,
		input.view.keyedRepeats,
	);
	const prepared = { elementsByHostId, elementHandles, asyncBoundariesById };
	let state: FacadeState | undefined;
	const live = () => (state?.p === LIVE ? state.r : undefined);

	function loadRuntime() {
		state ??= {
			p: LOADING,
			r: import('./resume-runtime.ts').then((module) =>
				state?.p === LOADING
					? (state = {
							p: LIVE,
							r: module.createResumeRuntime(
								input,
								prepared,
								onRegisterComputedRefreshes,
							),
						}).r
					: undefined,
			),
		};
		return state.r;
	}

	const facade: ResumeRuntime = {
		async start() {
			await (await loadRuntime())?.start();
		},
		async dispatch(event: ResumeDomEvent, options?: ResumeDispatchOptions) {
			if (!event) return;
			await (await loadRuntime())?.dispatch(event, options);
		},
		async activateBehaviors(hostNodeId: string) {
			await (await loadRuntime())?.activateBehaviors(hostNodeId);
		},
		getElement(hostNodeId: string) {
			return (
				live()?.getElement(hostNodeId) ??
				connectedElement(input.root, elementsByHostId.get(hostNodeId))
			);
		},
		getAsyncBoundary(boundaryId: string) {
			return live()?.getAsyncBoundary(boundaryId) ?? asyncBoundariesById.get(boundaryId);
		},
		getBranch(branchId: string) {
			return live()?.getBranch(branchId);
		},
		disposeHost(hostNodeId: string) {
			live()?.disposeHost(hostNodeId);
			elementsByHostId.delete(hostNodeId);
			elementHandles.deleteHost(hostNodeId);
		},
		hostElements: elementsByHostId,
		armBranches: () => live()?.armBranches?.(),
		dispose() {
			live()?.dispose();
			state = { p: DISPOSED };
			elementsByHostId.clear();
		},
		whenAsyncBoundariesSettled: async () =>
			(await loadRuntime())?.whenAsyncBoundariesSettled?.(),
		holdPendingSettleCommits: async (ms: number) =>
			(await loadRuntime())?.holdPendingSettleCommits?.(ms),
	};
	return facade;
}

function materializeAsyncBoundaryLocators(
	root: ResumeDomElement,
	boundaries: ResumeRuntimeInput['view']['asyncBoundaries'],
): Map<string, ResumeAsyncBoundaryRecord> {
	const byId = new Map<string, ResumeAsyncBoundaryRecord>();
	if (boundaries.length === 0) return byId;
	const comments = pageCommentCensus(root);
	for (const boundary of boundaries) {
		const start = boundary.startAnchor as typeof boundary.startAnchor & ResumeDomComment;
		const end = boundary.endAnchor as typeof boundary.endAnchor & ResumeDomComment;
		const live = start?.nodeType === 8 && end?.nodeType === 8;
		const startAnchor = live ? start : comments[start.index],
			endAnchor = live ? end : comments[end.index];
		if (!startAnchor) throw missingCommentAnchorError(boundary.id, 'startAnchor', start.index);
		if (!endAnchor) throw missingCommentAnchorError(boundary.id, 'endAnchor', end.index);
		byId.set(boundary.id, { ...boundary, startAnchor, endAnchor });
	}
	return byId;
}

function missingCommentAnchorError(
	id: string,
	name: 'startAnchor' | 'endAnchor',
	index: number,
): RuntimeResumeError {
	return runtimeResumeError(
		'MARKLESS_RESUME_LOCATOR_MISSING',
		`Resume locator ${id} ${name} expected a comment at DOM order index ${index}.`,
	);
}
