import { RuntimeResumeError } from './inline/resume-errors.ts';
import { isArmBranchAnchorComment } from './resume-anchor-census.ts';
import { expandBoundaryArmRecords } from './resume-arm-records.ts';
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

export {
	RuntimeResumeError,
	mismatchedElementLocatorError,
	missingElementLocatorError,
} from './inline/resume-errors.ts';
export type { RuntimeResumeDiagnostic, RuntimeResumeErrorCode } from './inline/resume-errors.ts';
export type * from './resume-types.ts';

export function createResumeRuntime(runtimeInput: ResumeRuntimeInput): ResumeRuntime {
	const asyncBoundariesById = materializeAsyncBoundaryLocators(
		runtimeInput.root,
		runtimeInput.view.asyncBoundaries,
	);
	// D3: in-arm records register at anchor offset + arm-relative index.
	const armExpansion = expandBoundaryArmRecords(
		runtimeInput.root,
		runtimeInput.view,
		asyncBoundariesById,
	);
	const input = armExpansion ? { ...runtimeInput, view: armExpansion.view } : runtimeInput;
	const elementsByHostId = materializeDomLocators(input.root, input.view.locators);
	for (const [hostNodeId, element] of armExpansion?.elementsByHostId ?? []) {
		elementsByHostId.set(hostNodeId, element);
	}
	const elementHandles = materializeElementHandles(
		input.root,
		elementsByHostId,
		input.view.elementHandles,
	);
	let runtime: ResumeRuntime | undefined;
	let starting: Promise<ResumeRuntime> | undefined;

	async function loadRuntime(): Promise<ResumeRuntime> {
		if (runtime) return runtime;
		if (!starting) {
			starting = import('./resume-runtime.ts').then((module) => {
				runtime = module.createResumeRuntime(input, {
					elementsByHostId,
					elementHandles,
					asyncBoundariesById,
				});
				return runtime;
			});
		}
		return starting;
	}

	return {
		async start() {
			await (await loadRuntime()).start();
		},
		async dispatch(event: ResumeDomEvent, options?: ResumeDispatchOptions) {
			if (!event) return;
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
			runtime?.dispose();
			elementsByHostId.clear();
		},
		whenAsyncBoundariesSettled: async () =>
			(await loadRuntime()).whenAsyncBoundariesSettled?.(),
		holdPendingSettleCommits: async (ms: number) =>
			(await loadRuntime()).holdPendingSettleCommits?.(ms),
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
		const startAnchor = comments[boundary.startAnchor.index],
			endAnchor = comments[boundary.endAnchor.index];
		if (!startAnchor)
			throw missingCommentAnchorError(boundary.id, 'startAnchor', boundary.startAnchor.index);
		if (!endAnchor)
			throw missingCommentAnchorError(boundary.id, 'endAnchor', boundary.endAnchor.index);
		byId.set(boundary.id, {
			id: boundary.id,
			updateSymbolId: boundary.updateSymbolId,
			startAnchor,
			endAnchor,
			asyncReads: boundary.asyncReads,
		});
	}
	return byId;
}

function walkComments(root: ResumeDomElement): ResumeDomComment[] {
	// Arm-branch anchors index in their boundary's own census, never here.
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
	return new RuntimeResumeError({
		code: 'MARKLESS_RESUME_LOCATOR_MISSING',
		message: `Resume locator ${id} ${name} expected a comment at DOM order index ${String(index)}.`,
		docsUrl: 'https://markless.dev/errors/MARKLESS_RESUME_LOCATOR_MISSING',
	});
}
