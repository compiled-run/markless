import { RuntimeResumeError, runtimeResumeError } from './inline/resume-errors.ts';
import { isArmBranchAnchorComment } from './resume-anchor-census.ts';
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
	ResumeDomNode,
	ResumeRuntime,
	ResumeRuntimeInput,
} from './resume-types.ts';
import type { CsrCoordinateSettler } from './resume-csr-coordinate.ts';

export {
	RuntimeResumeError,
	mismatchedElementLocatorError,
	missingElementLocatorError,
} from './inline/resume-errors.ts';
export type { RuntimeResumeDiagnostic, RuntimeResumeErrorCode } from './inline/resume-errors.ts';
export type * from './resume-types.ts';

export function createResumeRuntime(runtimeInput: ResumeRuntimeInput): ResumeRuntime {
	const boundaries = runtimeInput.view.asyncBoundaries;
	const asyncBoundariesById = materializeAsyncBoundaryLocators(runtimeInput.root, boundaries);
	let input = runtimeInput;
	const elementsByHostId = input.liveHostNodes
		? new Map(input.liveHostNodes)
		: materializeDomLocators(input.root, input.view.locators);
	const elementHandles = materializeElementHandles(
		input.root,
		elementsByHostId,
		input.view.elementHandles,
	);
	const prepared = { elementsByHostId, elementHandles, asyncBoundariesById };
	let runtime: ResumeRuntime | undefined;
	let starting: Promise<ResumeRuntime> | undefined;
	let coordinateSettler: CsrCoordinateSettler | undefined;

	async function loadRuntime(): Promise<ResumeRuntime> {
		if (runtime) return runtime;
		if (!starting) {
			starting = import('./resume-runtime.ts').then((module) => {
				runtime = module.createResumeRuntime(input, prepared);
				return runtime;
			});
		}
		return starting;
	}

	return {
		async start() {
			if (boundaries[0]?.renderArm && !coordinateSettler) {
				const { tryStartCsrCoordinateSettler } = await import('./resume-csr-coordinate.ts');
				coordinateSettler = tryStartCsrCoordinateSettler(
					input,
					prepared,
					loadRuntime,
					(next) => {
						input = next;
					},
				);
				if (coordinateSettler) return;
			}
			await (await loadRuntime()).start();
		},
		async dispatch(event: ResumeDomEvent, options?: ResumeDispatchOptions) {
			if (!event) return;
			if (coordinateSettler) return coordinateSettler.dispatch(event, options);
			await (await loadRuntime()).dispatch(event, options);
		},
		async activateBehaviors(hostNodeId: string) {
			await (await loadRuntime()).activateBehaviors(hostNodeId);
		},
		getElement(hostNodeId: string) {
			return (
				runtime?.getElement(hostNodeId) ??
				connectedElement(input.root, elementsByHostId.get(hostNodeId))
			);
		},
		getAsyncBoundary(boundaryId: string) {
			return runtime?.getAsyncBoundary(boundaryId) ?? asyncBoundariesById.get(boundaryId);
		},
		getBranch(branchId: string) {
			return runtime?.getBranch(branchId);
		},
		disposeHost(hostNodeId: string) {
			runtime?.disposeHost(hostNodeId);
			elementsByHostId.delete(hostNodeId);
			elementHandles.deleteHost(hostNodeId);
		},
		dispose() {
			coordinateSettler?.dispose();
			runtime?.dispose();
			elementsByHostId.clear();
		},
		whenAsyncBoundariesSettled: async () =>
			coordinateSettler?.whenSettled() ??
			(await loadRuntime()).whenAsyncBoundariesSettled?.(),
		holdPendingSettleCommits: async (ms: number) =>
			coordinateSettler?.holdCommitsFor(ms) ??
			(coordinateSettler ? undefined : (await loadRuntime()).holdPendingSettleCommits?.(ms)),
	};
}

function materializeAsyncBoundaryLocators(
	root: ResumeDomElement,
	boundaries: ResumeRuntimeInput['view']['asyncBoundaries'],
): Map<string, ResumeAsyncBoundaryRecord> {
	const byId = new Map<string, ResumeAsyncBoundaryRecord>();
	if (boundaries.length === 0) return byId;
	const comments = walkComments(root);
	for (const boundary of boundaries) {
		const live = boundary.startAnchor?.nodeType === 8 && boundary.endAnchor?.nodeType === 8;
		const startAnchor = live ? boundary.startAnchor : comments[boundary.startAnchor.index],
			endAnchor = live ? boundary.endAnchor : comments[boundary.endAnchor.index];
		if (!startAnchor)
			throw missingCommentAnchorError(boundary.id, 'startAnchor', boundary.startAnchor.index);
		if (!endAnchor)
			throw missingCommentAnchorError(boundary.id, 'endAnchor', boundary.endAnchor.index);
		byId.set(boundary.id, { ...boundary, startAnchor, endAnchor });
	}
	return byId;
}

function walkComments(root: ResumeDomElement): ResumeDomComment[] {
	const comments: ResumeDomComment[] = [];
	(function visit(node: ResumeDomNode): void {
		if (node.nodeType === 8 && !isArmBranchAnchorComment(node as ResumeDomComment))
			comments.push(node as ResumeDomComment);
		for (const child of node.childNodes ?? []) visit(child);
	})(root);
	return comments;
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
