import type { RuntimeGraph } from '@markless/runtime';
import {
	mismatchedElementLocatorError,
	missingElementLocatorError,
	runtimeResumeError,
} from './inline/resume-errors.ts';
import { isArmBranchAnchorComment } from './resume-anchor-census.ts';
import type {
	ResumeArmBranchRecord,
	ResumeArmRecordSet,
	ResumeAsyncBoundaryPayload,
	ResumeDomComment,
	ResumeDomElement,
	ResumeDomNode,
} from './resume-types.ts';

export function boundaryArmRecordSet(value: unknown): ResumeArmRecordSet | null {
	if (!value || Array.isArray(value)) return null;
	const set = value as ResumeArmRecordSet;
	return Array.isArray(set.locators) ? set : null;
}

// CSR mount registers the served arm's event records before the deferred
// runtime starts: the delegated capture listener is already live and fails
// closed, so a synchronous first click inside the served arm must find a record.
export function registerServedArmEventRecords(
	root: ResumeDomElement,
	boundaries: ReadonlyArray<ResumeAsyncBoundaryPayload>,
	register: (element: object, record: ResumeArmRecordSet['events'][number]) => void,
	// An escalating branch open at first render serves its arm the same way, so
	// its records need the same pre-runtime pass or its first click is dropped.
	branches: ReadonlyArray<{
		readonly startAnchor: ResumeAsyncBoundaryPayload['startAnchor'];
		readonly endAnchor: ResumeAsyncBoundaryPayload['endAnchor'];
		readonly servedArmRecords?: unknown;
	}> = [],
): void {
	let comments: ReadonlyArray<ResumeDomComment> | undefined;
	const ranges: Array<{
		readonly startAnchor: ResumeAsyncBoundaryPayload['startAnchor'];
		readonly endAnchor: ResumeAsyncBoundaryPayload['endAnchor'];
		readonly armRecords: ResumeArmRecordSet;
	}> = [];
	for (const boundary of boundaries) {
		const armRecords = boundaryArmRecordSet(boundary.armRecords);
		if (armRecords?.events.length)
			ranges.push({
				startAnchor: boundary.startAnchor,
				endAnchor: boundary.endAnchor,
				armRecords,
			});
	}
	for (const branch of branches) {
		const armRecords = boundaryArmRecordSet(branch.servedArmRecords);
		if (armRecords?.events.length)
			ranges.push({
				startAnchor: branch.startAnchor,
				endAnchor: branch.endAnchor,
				armRecords,
			});
	}
	for (const range of ranges) {
		comments ??= pageCommentCensus(root);
		const startAnchor = comments[range.startAnchor.index];
		if (!startAnchor) continue;
		const arm = materializeArmRecords({
			root,
			startAnchor,
			endAnchor: comments[range.endAnchor.index],
			armRecords: range.armRecords,
		});
		for (const record of arm.events) {
			const element = arm.elementsByHostId.get(record.hostNodeId);
			if (element) register(element, record);
		}
	}
}

function pageCommentCensus(root: ResumeDomElement): ReadonlyArray<ResumeDomComment> {
	// Arm-branch anchors index in their boundary's own census, never here.
	const comments: ResumeDomComment[] = [];
	(function visit(node: ResumeDomNode): void {
		if (node.nodeType === 8 && !isArmBranchAnchorComment(node as ResumeDomComment))
			comments.push(node as ResumeDomComment);
		for (const child of node.childNodes ?? []) visit(child);
	})(root);
	return comments;
}

type ArmMaterializeInput = {
	readonly root: ResumeDomElement;
	readonly startAnchor: ResumeDomComment;
	readonly endAnchor?: ResumeDomComment;
	readonly armRecords: ResumeArmRecordSet;
	readonly elementsByHostId?: ReadonlyMap<string, ResumeDomElement>;
};

// Registers one arm record set against the live DOM at (anchor offset +
// arm-relative index); records whose host did not render in this arm are
// skipped; arm-scoped branches resolve anchors in the arm's own census.
export function materializeArmRecords(input: ArmMaterializeInput) {
	const exhaustive = {
		locators: true,
		events: true,
		domUpdates: true,
		behaviors: true,
		elementHandles: true,
		keyedRepeats: true,
		branches: true,
	} satisfies Record<keyof ResumeArmRecordSet, true>;
	void exhaustive;
	const byHostId = new Map<string, ResumeDomElement>(input.elementsByHostId);
	if (input.armRecords.locators.length) {
		const { elements, offset } = elementsAndAnchorOffset(input.root, input.startAnchor);
		for (const locator of input.armRecords.locators) {
			const element = elements[offset + locator.index];
			if (!element) throw missingElementLocatorError(locator);
			const expected = locator.tagName.toLowerCase();
			const actual = element.tagName.toLowerCase();
			if (expected !== '*' && actual !== expected) {
				throw mismatchedElementLocatorError(locator, actual);
			}
			byHostId.set(locator.hostNodeId, element);
		}
	}
	// Records whose host did not render in this arm are skipped.
	const rendered = (record: { readonly hostNodeId: string }) => byHostId.has(record.hostNodeId);
	return {
		elementsByHostId: byHostId,
		events: input.armRecords.events.filter(rendered),
		domUpdates: (input.armRecords.domUpdates ?? []).filter(rendered),
		behaviors: input.armRecords.behaviors.filter(rendered),
		elementHandles: input.armRecords.elementHandles.filter(rendered),
		keyedRepeats: (input.armRecords.keyedRepeats ?? []).filter((repeat) =>
			byHostId.has(repeat.parentHostNodeId),
		),
		branches: materializeArmBranchRecords(input),
	};
}

// Resolves each flip record's anchor pair by position in the arm-local census.
// A missing anchor is a corrupt census — fail loud (D2), never register half a
// flip. A record with no index left to read passes through: an escalated record
// carries no anchors, and a caller that owns its own census — a client-minted
// row, counting its comments in its own fragment — hands over live ones.
function materializeArmBranchRecords(
	input: ArmMaterializeInput,
): ReadonlyArray<ResumeArmBranchRecord> {
	const records = input.armRecords.branches ?? [];
	if (!records.length) return [];
	const indexOf = (anchor: ResumeArmBranchRecord['startAnchor']): number | undefined =>
		(anchor as { readonly index?: number } | undefined)?.index;
	const census = records.some((record) => indexOf(record.startAnchor) !== undefined)
		? armBranchCommentCensus(input.root, input.startAnchor, input.endAnchor)
		: [];
	return records.map((record) => {
		const startIndex = indexOf(record.startAnchor);
		const endIndex = indexOf(record.endAnchor);
		if (startIndex === undefined || endIndex === undefined) return record;
		const startAnchor = census[startIndex];
		const endAnchor = census[endIndex];
		if (!startAnchor || !endAnchor) throw missingArmBranchAnchorError(record.id, startIndex);
		return { ...record, startAnchor, endAnchor };
	});
}

function armBranchCommentCensus(
	root: ResumeDomElement,
	startAnchor: ResumeDomComment,
	endAnchor: ResumeDomComment | undefined,
): ReadonlyArray<ResumeDomComment> {
	const census: ResumeDomComment[] = [];
	let within = false;
	let done = false;
	(function visit(node: ResumeDomNode): void {
		if (done) return;
		if (node === startAnchor) {
			within = true;
			return;
		}
		if (endAnchor && node === endAnchor) {
			done = true;
			return;
		}
		if (within && node.nodeType === 8 && isArmBranchAnchorComment(node as ResumeDomComment)) {
			census.push(node as ResumeDomComment);
		}
		for (const child of node.childNodes ?? []) visit(child);
	})(root);
	return census;
}

function missingArmBranchAnchorError(id: string, index: number): Error {
	return runtimeResumeError(
		'MARKLESS_RESUME_LOCATOR_MISSING',
		`Arm-scoped branch ${id} expected an arm-branch comment anchor at arm-local index ${index}.`,
	);
}

// Pre-order element walk (root included, matching dom-order locators) that
// also reports how many elements precede the anchor — the arm's offset.
function elementsAndAnchorOffset(
	root: ResumeDomElement,
	anchor: ResumeDomComment,
): { readonly elements: ReadonlyArray<ResumeDomElement>; readonly offset: number } {
	const elements: ResumeDomElement[] = [];
	let offset = -1;
	(function visit(node: ResumeDomNode): void {
		if (node === anchor && offset === -1) offset = elements.length;
		if (node.nodeType === 1) elements.push(node as ResumeDomElement);
		for (const child of node.childNodes ?? []) visit(child);
	})(root);
	// Missing anchor: past-the-end offset makes locator lookups fail loud.
	return { elements, offset: offset === -1 ? elements.length : offset };
}

// A composed child's arm records are minted in the child module's own id space,
// so the settle commit has to re-spell them in page space before registration.
// Only a page with component edges can hold such a boundary, so the table that
// does the re-spelling lives in fns/composition.ts and the bundler emits its
// install call for those pages alone; a non-composing page leaves this slot
// empty and its settle path registers arm records untouched.
export type ComposedArmRecordQualifier = (
	boundaryId: string,
	set: ResumeArmRecordSet,
	// The settling page's own graph: widget-scoped ids in a composed arm belong to
	// a rendered widget of THIS container, and the registry that names them is
	// filed against this graph.
	graph?: RuntimeGraph,
) => ResumeArmRecordSet;

let installedQualifier: ComposedArmRecordQualifier | undefined;

export function installComposedArmRecordQualifier(qualifier: ComposedArmRecordQualifier): void {
	installedQualifier = qualifier;
}

export function composedArmRecordQualifier(): ComposedArmRecordQualifier | undefined {
	return installedQualifier;
}
