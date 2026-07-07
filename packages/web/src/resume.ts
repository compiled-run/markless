import { RuntimeResumeError, mismatchedElementLocatorError, missingElementLocatorError } from './inline/resume-errors.ts';
import { isArmBranchAnchorComment } from './resume-anchor-census.ts';
import { expandBoundaryArmRecords } from './resume-arm-records.ts';
import type { ElementHandleRegistry, ResumeAsyncBoundaryRecord, ResumeDispatchOptions, ResumeDomComment, ResumeDomElement, ResumeDomEvent, ResumeDomNode, ResumeRuntime, ResumeRuntimeInput } from './resume-types.ts';

export { RuntimeResumeError, mismatchedElementLocatorError, missingElementLocatorError } from './inline/resume-errors.ts';
export type { RuntimeResumeDiagnostic, RuntimeResumeErrorCode } from './inline/resume-errors.ts';
export type * from './resume-types.ts';

export function createResumeRuntime(runtimeInput: ResumeRuntimeInput): ResumeRuntime {
	const asyncBoundariesById = materializeAsyncBoundaryLocators(runtimeInput.root, runtimeInput.view.asyncBoundaries);
	// D3: in-arm records register at (start anchor's live element offset +
	// arm-relative index) and expand into the flat view, so every downstream
	// wiring path sees them like any other record.
	const armExpansion = expandBoundaryArmRecords(runtimeInput.root, runtimeInput.view, asyncBoundariesById);
	const input = armExpansion ? { ...runtimeInput, view: armExpansion.view } : runtimeInput;
	const elementsByHostId = materializeDomLocators(input.root, input.view.locators);
	for (const [hostNodeId, element] of armExpansion?.elementsByHostId ?? []) {
		elementsByHostId.set(hostNodeId, element);
	}
	const elementHandles = materializeElementHandles(input.root, elementsByHostId, input.view.elementHandles);
	let runtime: ResumeRuntime | undefined;
	let starting: Promise<ResumeRuntime> | undefined;

	async function loadRuntime(): Promise<ResumeRuntime> {
		if (runtime) return runtime;
		if (!starting) {
			starting = import('./resume-runtime.ts').then((module) => {
				runtime = module.createResumeRuntime(input, { elementsByHostId, elementHandles, asyncBoundariesById });
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
			await (await loadRuntime()).dispatch(event, options);
		},
		async activateBehaviors(hostNodeId: string) {
			await (await loadRuntime()).activateBehaviors(hostNodeId);
		},
		getElement(hostNodeId: string) {
			return runtime?.getElement(hostNodeId) ?? connectedElement(input.root, elementsByHostId.get(hostNodeId));
		},
		getAsyncBoundary(boundaryId: string) {
			return runtime?.getAsyncBoundary(boundaryId) ?? asyncBoundariesById.get(boundaryId);
		},
		getBranch(branchId: string) {
			return runtime?.getBranch(branchId);
		},
		disposeHost(hostNodeId: string) {
			runtime?.disposeHost(hostNodeId); elementsByHostId.delete(hostNodeId); elementHandles.deleteHost(hostNodeId);
		},
		dispose() {
			runtime?.dispose(); elementsByHostId.clear();
		},
	};
}

function materializeElementHandles(root: ResumeDomElement, elementsByHostId: Map<string, ResumeDomElement>, handles: ResumeRuntimeInput['view']['elementHandles']): ElementHandleRegistry {
	const byHandleId = new Map<string, ResumeDomElement>(), byName = new Map<string, ResumeDomElement>(), keysByHostId = new Map<string, { readonly handleId: string; readonly name: string }>();
	function register(hostNodeId: string, handle: { readonly handleId: string; readonly name: string }, element: ResumeDomElement): void {
		byHandleId.set(handle.handleId, element); byName.set(handle.name, element); keysByHostId.set(hostNodeId, { handleId: handle.handleId, name: handle.name });
	}
	for (const handle of handles) { const element = elementsByHostId.get(handle.hostNodeId); if (element) register(handle.hostNodeId, handle, element); }
	return {
		get: (id) => connectedElement(root, byHandleId.get(id) ?? byName.get(id)),
		register,
		deleteHost(hostNodeId) { const keys = keysByHostId.get(hostNodeId); if (!keys) return; byHandleId.delete(keys.handleId); byName.delete(keys.name); keysByHostId.delete(hostNodeId); },
	};
}

function materializeDomLocators(root: ResumeDomElement, locators: ResumeRuntimeInput['view']['locators']): Map<string, ResumeDomElement> {
	const elements = walkElements(root), byHostId = new Map<string, ResumeDomElement>();
	for (const locator of locators) {
		const element = elements[locator.index];
		if (!element) throw missingElementLocatorError(locator);
		const expected = locator.tagName.toLowerCase(), actual = element.tagName.toLowerCase();
		if (expected !== '*' && actual !== expected) throw mismatchedElementLocatorError(locator, actual);
		byHostId.set(locator.hostNodeId, element);
	}
	return byHostId;
}

function materializeAsyncBoundaryLocators(root: ResumeDomElement, boundaries: ResumeRuntimeInput['view']['asyncBoundaries']): Map<string, ResumeAsyncBoundaryRecord> {
	const byId = new Map<string, ResumeAsyncBoundaryRecord>();
	if (boundaries.length === 0) return byId;
	const comments = walkComments(root);
	for (const boundary of boundaries) {
		const startAnchor = comments[boundary.startAnchor.index], endAnchor = comments[boundary.endAnchor.index];
		if (!startAnchor) throw missingCommentAnchorError(boundary.id, 'startAnchor', boundary.startAnchor.index);
		if (!endAnchor) throw missingCommentAnchorError(boundary.id, 'endAnchor', boundary.endAnchor.index);
		byId.set(boundary.id, { id: boundary.id, updateSymbolId: boundary.updateSymbolId, startAnchor, endAnchor, asyncReads: boundary.asyncReads });
	}
	return byId;
}

function connectedElement(root: ResumeDomElement, element: ResumeDomElement | undefined): ResumeDomElement | undefined {
	return element && containsElement(root, element) ? element : undefined;
}
function containsElement(root: ResumeDomElement, target: ResumeDomElement): boolean {
	if (root === target) return true;
	for (const child of root.childNodes ?? []) if (child.nodeType === 1 && containsElement(child as ResumeDomElement, target)) return true;
	return false;
}
function walkElements(root: ResumeDomElement): ResumeDomElement[] {
	const elements: ResumeDomElement[] = [];
	(function visit(node: ResumeDomNode): void { if (node.nodeType === 1) elements.push(node as ResumeDomElement); for (const child of node.childNodes ?? []) visit(child); })(root);
	return elements;
}
function walkComments(root: ResumeDomElement): ResumeDomComment[] {
	// Arm-branch anchors index in their boundary's own census, never here.
	const comments: ResumeDomComment[] = [];
	(function visit(node: ResumeDomNode): void { if (node.nodeType === 8 && !isArmBranchAnchorComment(node as ResumeDomComment)) comments.push(node as ResumeDomComment); for (const child of node.childNodes ?? []) visit(child); })(root);
	return comments;
}
function missingCommentAnchorError(id: string, name: 'startAnchor' | 'endAnchor', index: number): RuntimeResumeError {
	return new RuntimeResumeError({ code: 'MARKLESS_RESUME_LOCATOR_MISSING', message: `Resume locator ${id} ${name} expected a comment at DOM order index ${String(index)}.`, docsUrl: 'https://markless.dev/errors/MARKLESS_RESUME_LOCATOR_MISSING' });
}
