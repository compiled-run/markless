import { ASYNC_BOUNDARY_ARM } from '@markless/serializer/async-boundary-arm';
import { boundaryBusyHosts, type BusyNode } from '../resume-refresh-busy.ts';
import type {
	ResumeArmRange,
	ResumeArmRecordSet,
	ResumeAsyncBoundaryRecord,
	ResumeDomComment,
	ResumeDomElement,
} from '../resume-types.ts';

// Per-element busy marks: a refresh marks only the elements that read a value still running.
type ArmRecords = {
	readonly elementsByHostId: ReadonlyMap<string, ResumeDomElement>;
	readonly domUpdates: NonNullable<ResumeArmRecordSet['domUpdates']>;
	readonly keyedRepeats: NonNullable<ResumeArmRecordSet['keyedRepeats']>;
};
type BusyBoundary = Pick<ResumeAsyncBoundaryRecord, 'startAnchor' | 'endAnchor' | 'asyncSources'>;
type BoundaryBusy = {
	boundary?: BusyBoundary;
	readonly pending: Set<string>;
	marked: Set<BusyNode>;
};
type AfterAnchor = { __marklessAfter?: ResumeDomComment };

// The shown arm's bindings as its records name them: each DOM update and keyed list host with the graph node it reads.
function armBindings(startAnchor: object | undefined): Array<readonly [BusyNode, string]> {
	const materialized = (startAnchor as { __marklessArmRecords?: ArmRecords } | undefined)
		?.__marklessArmRecords;
	if (!materialized) return [];
	const bindings: Array<readonly [BusyNode, string]> = [];
	for (const [hostNodeId, graphNodeId] of [
		...materialized.domUpdates.map((update) => [update.hostNodeId, update.graphNodeId]),
		...materialized.keyedRepeats.map((repeat) => [
			repeat.parentHostNodeId,
			repeat.collectionGraphNodeId,
		]),
	]) {
		const host = materialized.elementsByHostId.get(hostNodeId!);
		if (host && graphNodeId) bindings.push([host as BusyNode, graphNodeId]);
	}
	return bindings;
}

const busyByRange = new WeakMap<object, BoundaryBusy>();

// Marks follow the reads still running while the block shows settled content; a first load marks nothing.
function note(
	boundary: BusyBoundary,
	graphNodeId: string,
	snapshot: unknown,
	showsSettledContent: boolean,
): void {
	const status = (snapshot as { readonly status?: unknown } | null)?.status;
	const busy = busyOf(boundary);
	if (status === 'pending' && showsSettledContent) busy.pending.add(graphNodeId);
	else if (status !== 'fulfilled' && status !== 'rejected') return;
	// The last read to settle clears with the settle commit that shows it, not before.
	else if (!busy.pending.delete(graphNodeId) || busy.pending.size === 0) return;
	apply(boundary);
}

function set(boundary: BusyBoundary, busy: boolean): void {
	if (!busy) busyOf(boundary).pending.clear();
	apply(boundary);
}

function busyOf(boundary: BusyBoundary): BoundaryBusy {
	const key = (boundary.startAnchor as object | undefined) ?? boundary;
	let busy = busyByRange.get(key);
	if (!busy) busyByRange.set(key, (busy = { pending: new Set(), marked: new Set() }));
	busy.boundary = boundary;
	return busy;
}

function apply(boundary: BusyBoundary): void {
	const busy = busyOf(boundary);
	const hosts = new Set<BusyNode>();
	const bindings = armBindings(boundary.startAnchor);
	let unbound = false;
	for (const graphNodeId of busy.pending) {
		let bound = false;
		for (const [host, read] of bindings)
			if (
				host.isConnected !== false &&
				(read === graphNodeId || boundary.asyncSources?.[read]?.includes(graphNodeId))
			)
				bound = !!hosts.add(host);
		unbound ||= !bound;
	}
	if (unbound) for (const host of boundaryBusyHosts(boundary)) hosts.add(host);
	const after = (boundary.endAnchor as { __marklessAfter?: BusyNode } | undefined)?.__marklessAfter;
	if (after?.isConnected && busy.pending.size > 0) {
		const range = {
			startAnchor: after as unknown as ResumeDomComment,
			endAnchor: boundary.endAnchor,
		};
		for (const host of boundaryBusyHosts(range)) hosts.add(host);
	}
	for (const host of busy.marked) if (!hosts.has(host)) host.removeAttribute?.('aria-busy');
	for (const host of hosts) host.setAttribute?.('aria-busy', 'true');
	busy.marked = hosts;
}


type ShownArm = { __marklessShownArm?: number };
const shown = (boundary: ResumeAsyncBoundaryRecord, arm: number) =>
	void ((boundary.endAnchor as ShownArm).__marklessShownArm = arm);

// A failed refresh over shown @try content keeps it and draws the @catch in a range opened after it.
function settleRange(boundary: ResumeAsyncBoundaryRecord, arm: number): ResumeArmRange | undefined {
	const after =
		arm === ASYNC_BOUNDARY_ARM.catch &&
		((boundary.endAnchor as ShownArm).__marklessShownArm ?? boundary.initiallyServedArm) ===
			ASYNC_BOUNDARY_ARM.try;
	shown(boundary, after ? ASYNC_BOUNDARY_ARM.try : arm);
	if (!after) return;
	const end = boundary.endAnchor as unknown as ChildNode & AfterAnchor;
	let start = end.__marklessAfter as unknown as ChildNode | undefined;
	if (start?.parentNode !== end.parentNode) {
		// The arm-branch prefix keeps page-level comment walks from counting it.
		start = end.ownerDocument!.createComment('markless:arm-branch:after');
		end.before(start);
		end.__marklessAfter = start as unknown as ResumeDomComment;
	}
	return { id: `${boundary.id}:after`, startAnchor: end.__marklessAfter!, endAnchor: boundary.endAnchor };
}

export const busyMarks = { note, set, apply, settleRange, shown };
