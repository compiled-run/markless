import {
	mismatchedElementLocatorError,
	missingElementLocatorError,
	runtimeResumeError,
} from './inline/resume-errors.ts';
import { isArmBranchAnchorComment } from './resume-anchor-census.ts';
import type {
	ResumeArmBranchRecord,
	ResumeArmRecordSet,
	ResumeAsyncBoundaryRecord,
	ResumeDomComment,
	ResumeDomElement,
	ResumeDomNode,
	ResumeViewRecord,
} from './resume-types.ts';

export function boundaryArmRecordSet(value: unknown): ResumeArmRecordSet | null {
	if (!value || Array.isArray(value)) return null;
	const set = value as ResumeArmRecordSet;
	return Array.isArray(set.locators) ? set : null;
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
	const byHostId = new Map<string, ResumeDomElement>(input.elementsByHostId);
	if (input.armRecords.locators.length > 0) {
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
// flip. Escalated records (no anchors) pass through untouched.
function materializeArmBranchRecords(
	input: ArmMaterializeInput,
): ReadonlyArray<ResumeArmBranchRecord> {
	const records = input.armRecords.branches ?? [];
	if (records.length === 0) return [];
	const census = records.some((record) => record.startAnchor)
		? armBranchCommentCensus(input.root, input.startAnchor, input.endAnchor)
		: [];
	return records.map((record) => {
		if (!record.startAnchor || !record.endAnchor) return record;
		const startIndex = (record.startAnchor as { readonly index: number }).index;
		const endIndex = (record.endAnchor as { readonly index: number }).index;
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

// Expands every boundary's armized record set into flat runtime records so
// the existing event/behavior/handle wiring sees them like any other record.
export function expandBoundaryArmRecords(
	root: ResumeDomElement,
	view: ResumeViewRecord,
	boundariesById: ReadonlyMap<string, ResumeAsyncBoundaryRecord>,
): {
	readonly view: ResumeViewRecord;
	readonly elementsByHostId: Map<string, ResumeDomElement>;
} | null {
	const registrable = view.asyncBoundaries.flatMap((boundary) => {
		const armRecords = boundaryArmRecordSet(boundary.armRecords);
		const live = boundariesById.get(boundary.id);
		return armRecords && live
			? [
					{
						armRecords,
						boundaryId: boundary.id,
						startAnchor: live.startAnchor,
						endAnchor: live.endAnchor,
					},
				]
			: [];
	});
	if (registrable.length === 0) return null;

	const elementsByHostId = new Map<string, ResumeDomElement>();
	const events = [...view.events];
	const behaviors = [...view.behaviors];
	const elementHandles = [...view.elementHandles];
	const branches = [...(view.branches ?? [])];
	for (const { armRecords, boundaryId, startAnchor, endAnchor } of registrable) {
		const materialized = materializeArmRecords({ root, startAnchor, endAnchor, armRecords });
		for (const [hostNodeId, element] of materialized.elementsByHostId) {
			elementsByHostId.set(hostNodeId, element);
		}
		events.push(...materialized.events);
		behaviors.push(...materialized.behaviors);
		elementHandles.push(...materialized.elementHandles);
		// Arm-scoped branches join the stream with LIVE anchors + boundary id.
		branches.push(
			...(materialized.branches.map((record) => ({
				...record,
				armBoundaryId: boundaryId,
			})) as unknown as NonNullable<ResumeViewRecord['branches']>),
		);
	}
	return {
		view: {
			...view,
			events,
			behaviors,
			elementHandles,
			...(branches.length > 0 ? { branches } : {}),
		},
		elementsByHostId,
	};
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
