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
	ResumeBranchRecord,
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
	const planned = (anchor: ResumeArmBranchRecord['startAnchor']) =>
		anchor as { readonly strategy?: string; readonly index?: number } | undefined;
	// A composed child's own branch arrives still spelling the index it counted in
	// its OWN module's census, which names nothing here; its anchors carry its
	// instance-prefixed id, so the anchor text is the exact page-wide address.
	const composed = (record: ResumeArmBranchRecord) =>
		planned(record.startAnchor)?.strategy === 'dom-order-comment';
	const census = records.some(
		(record) => !composed(record) && planned(record.startAnchor)?.index !== undefined,
	)
		? armBranchCommentCensus(input.root, input.startAnchor, input.endAnchor)
		: [];
	let pageComments: ReadonlyArray<ResumeDomComment> | undefined;
	const anchorNamed = (text: string): ResumeDomComment | undefined => {
		pageComments ??= pageCommentCensus(input.root);
		return pageComments.find((comment) => commentText(comment) === text);
	};
	return records.map((record) => {
		if (composed(record)) {
			const startAnchor = anchorNamed(`markless:branch:${record.id}`);
			const endAnchor = anchorNamed(`/markless:branch:${record.id}`);
			if (!startAnchor || !endAnchor) throw missingComposedArmBranchAnchorError(record.id);
			return { ...record, startAnchor, endAnchor };
		}
		const startIndex = planned(record.startAnchor)?.index;
		const endIndex = planned(record.endAnchor)?.index;
		if (startIndex === undefined || endIndex === undefined) return record;
		const startAnchor = census[startIndex];
		const endAnchor = census[endIndex];
		if (!startAnchor || !endAnchor) throw missingArmBranchAnchorError(record.id, startIndex);
		return { ...record, startAnchor, endAnchor };
	});
}

function commentText(comment: ResumeDomComment): string {
	return comment.data ?? (comment as { readonly textContent?: string }).textContent ?? '';
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

function missingComposedArmBranchAnchorError(id: string): Error {
	return runtimeResumeError(
		'MARKLESS_RESUME_LOCATOR_MISSING',
		`Composed arm-scoped branch ${id} expected its own comment anchor pair inside this arm.`,
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

/**
 * Re-spells a handle id in the rendered widget's own key space, given the id of
 * the record that filed it — a branch id, whose instance path names the widget.
 *
 * Composition qualifies every handle the served payload carries; a handle bound
 * inside a flippable `@if` arm is filed at resume instead, from an arm record the
 * serializer left in module space. It lives beside the composed-record fold above
 * for one reason that is a shipped-bytes constraint, not tidiness: the dispatch
 * core statically imports fns/instance-scope.ts, so a slot instance-scope has to
 * reach must never sit in a module the locator registry owns — that edge drags
 * the whole locator chunk into the always-loaded dispatch chunk.
 */
export type ElementHandleQualifier = (
	handleId: string,
	ownerRecordId: string,
	graph?: unknown,
) => string;

let elementHandleQualifier: ElementHandleQualifier | undefined;

export function installElementHandleQualifier(qualifier: ElementHandleQualifier): void {
	elementHandleQualifier = qualifier;
}

export function qualifiedElementHandleId(
	handleId: string,
	ownerRecordId: string | undefined,
	graph: unknown,
): string {
	return ownerRecordId && elementHandleQualifier
		? elementHandleQualifier(handleId, ownerRecordId, graph)
		: handleId;
}

/**
 * An IDREF outside the arms names a handle one arm binds, so the attribute is
 * earned exactly while that arm is the painted one. Keyed on the PAINTED arm,
 * never on what a materialization filed: the arm the render served is never
 * re-materialized, and a refresh repainting the same arm files no handle records
 * of its own. `handleReadId` keys both the site and the record's minted ids.
 */
export function syncBranchIdrefSites(
	elementsByHostId: ReadonlyMap<string, ResumeDomElement>,
	branch: ResumeBranchRecord,
	arm: number | undefined,
): void {
	for (const site of branch.idrefSites ?? []) {
		const host = elementsByHostId.get(site.hostNodeId);
		if (!host) continue;
		const id = branch.elementHandleIds?.[site.handleReadId];
		if (id !== undefined && arm === site.armIndex) host.setAttribute?.(site.attributeName, id);
		else host.removeAttribute?.(site.attributeName);
	}
}

/**
 * The one channel a flip has to a minted element() id: the id belongs to the
 * rendered widget and its instance token is a seed-map value no flip can reach,
 * so the render that served the arm resolved it onto the record. A composed
 * symbol's reads arrive with the instance path PREPENDED, which is why the
 * record's key is a SUFFIX of the id the symbol asks under rather than all of it.
 */
export function armElementHandleIdGraph(
	graph: RuntimeGraph,
	branch: ResumeBranchRecord,
): RuntimeGraph {
	const ids = branch.elementHandleIds;
	if (!ids) return graph;
	return {
		...graph,
		read(id: string, path: ReadonlyArray<string> = []) {
			for (const key in ids) if (id.endsWith(key)) return ids[key];
			return graph.read(id, path);
		},
	};
}
