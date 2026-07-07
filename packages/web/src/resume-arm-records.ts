import { mismatchedElementLocatorError, missingElementLocatorError } from './inline/resume-errors.ts';
import type {
	ResumeArmRecordSet,
	ResumeAsyncBoundaryRecord,
	ResumeDomComment,
	ResumeDomElement,
	ResumeDomNode,
	ResumeViewRecord,
} from './resume-types.ts';

// D3 arm-relative registration: an arm record set indexes from its boundary's
// start anchor. This module adds the anchor's LIVE element-walk offset at
// materialization time, so the same API serves the initial SSR load and the
// re-registration after an arm's DOM range is replaced (commitArm, T103).

// Narrow unknown armRecords payloads to the registrable single-set shape.
// CSR-composed pages still ship the compile-time per-arm array — that plan is
// not positionally trustworthy, so it is deliberately not registrable here.
export function boundaryArmRecordSet(value: unknown): ResumeArmRecordSet | null {
	if (!value || Array.isArray(value)) return null;
	const set = value as ResumeArmRecordSet;
	return Array.isArray(set.locators) ? set : null;
}

// Registers one arm record set against the live DOM. Locators resolve to
// elements at (anchor offset + arm-relative index); records whose host did
// not render in this arm (the untaken side of an in-arm ternary) are skipped.
export function materializeArmRecords(input: {
	readonly root: ResumeDomElement;
	readonly startAnchor: ResumeDomComment;
	readonly armRecords: ResumeArmRecordSet;
}): {
	readonly elementsByHostId: Map<string, ResumeDomElement>;
	readonly events: ResumeArmRecordSet['events'];
	readonly behaviors: ResumeArmRecordSet['behaviors'];
	readonly elementHandles: ResumeArmRecordSet['elementHandles'];
} {
	const byHostId = new Map<string, ResumeDomElement>();
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
	return {
		elementsByHostId: byHostId,
		events: input.armRecords.events.filter((event) => byHostId.has(event.hostNodeId)),
		behaviors: input.armRecords.behaviors.filter((behavior) => byHostId.has(behavior.hostNodeId)),
		elementHandles: input.armRecords.elementHandles.filter((handle) => byHostId.has(handle.hostNodeId)),
	};
}

// Expands every boundary's armized record set into flat runtime records so
// the existing event/behavior/handle wiring sees them like any other record.
export function expandBoundaryArmRecords(
	root: ResumeDomElement,
	view: ResumeViewRecord,
	boundariesById: ReadonlyMap<string, ResumeAsyncBoundaryRecord>,
): { readonly view: ResumeViewRecord; readonly elementsByHostId: Map<string, ResumeDomElement> } | null {
	const registrable = view.asyncBoundaries.flatMap((boundary) => {
		const armRecords = boundaryArmRecordSet(boundary.armRecords);
		const live = boundariesById.get(boundary.id);
		return armRecords && live ? [{ armRecords, startAnchor: live.startAnchor }] : [];
	});
	if (registrable.length === 0) return null;

	const elementsByHostId = new Map<string, ResumeDomElement>();
	const events = [...view.events];
	const behaviors = [...view.behaviors];
	const elementHandles = [...view.elementHandles];
	for (const { armRecords, startAnchor } of registrable) {
		const materialized = materializeArmRecords({ root, startAnchor, armRecords });
		for (const [hostNodeId, element] of materialized.elementsByHostId) {
			elementsByHostId.set(hostNodeId, element);
		}
		events.push(...materialized.events);
		behaviors.push(...materialized.behaviors);
		elementHandles.push(...materialized.elementHandles);
	}
	return { view: { ...view, events, behaviors, elementHandles }, elementsByHostId };
}

// Pre-order element walk (root included, matching dom-order locators) that
// also reports how many elements precede the anchor comment in document
// order — the arm's element-walk offset.
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
	// A missing anchor cannot happen when the caller found it by census; the
	// past-the-end offset makes any locator lookup fail loud, not silently.
	return { elements, offset: offset === -1 ? elements.length : offset };
}
