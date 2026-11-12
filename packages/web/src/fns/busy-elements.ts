import type { ArmRowsAnchor } from '../resume-repeat-branch-arm.ts';
import { holdBusy } from '../event-current-target.ts';
import { boundaryBusyHosts, type BusyNode } from '../resume-refresh-busy.ts';
import type {
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
	/** What the clearing of these marks says instead of "Updated": a failure, or nothing because the page went elsewhere. */
	closing?: 'failed' | 'silent';
};

// The shown arm's bindings as its records name them: each DOM update and keyed list host with the graph node it reads.
function armBindings(startAnchor: object | undefined): Array<readonly [BusyNode, string]> {
	const anchor = startAnchor as ({ __marklessArmRecords?: ArmRecords } & ArmRowsAnchor) | undefined;
	const bindings: Array<readonly [BusyNode, string]> = [];
	// Rows written straight into the arm have their parent outside it, so each row is marked.
	for (const source of anchor?.__marklessArmRows ?? [])
		if (source.graphNodeId)
			for (const row of source.rows()) bindings.push([row as BusyNode, source.graphNodeId]);
	const materialized = anchor?.__marklessArmRecords;
	if (!materialized) return bindings;
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

// Marks follow reads still running under settled content; a first load or a quiet refresh marks nothing.
function note(
	boundary: BusyBoundary,
	graphNodeId: string,
	snapshot: unknown,
	showsSettledContent: boolean,
): void {
	const { status, quiet, writeFailed, pageLeft } =
		(snapshot as {
			readonly status?: unknown;
			readonly quiet?: unknown;
			readonly writeFailed?: unknown;
			readonly pageLeft?: unknown;
		} | null) ?? {};
	const busy = busyOf(boundary);
	const wasPending = busy.pending.has(graphNodeId);
	// A failed refresh, or a failed save whose hold ends here: the clearing these marks announce says the update failed.
	if ((status === 'rejected' || writeFailed === true) && wasPending && busy.closing !== 'silent') busy.closing = 'failed';
	// A save's hold ended because the page went elsewhere: its clearing says nothing.
	if (pageLeft === true && wasPending) busy.closing = 'silent';
	if (status === 'pending' && showsSettledContent) {
		if (quiet === true) return;
		busy.pending.add(graphNodeId);
	} else if (status !== 'fulfilled' && status !== 'rejected') return;
	else if (status === 'rejected' && quiet === true && !wasPending) return announceQuietFailure(boundary);
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
	const owner = (boundary.startAnchor as object | undefined) ?? boundary;
	for (const host of busy.marked) if (!hosts.has(host)) holdBusy(host, owner, false);
	for (const host of hosts) holdBusy(host, owner, true);
	if (hosts.size > 0 !== busy.marked.size > 0) announce(busy, hosts.size > 0 ? hosts : busy.marked);
	busy.marked = hosts;
}

let announcer: Promise<typeof import('./refresh-announcer.ts')> | undefined;
function loadAnnouncer(): Promise<typeof import('./refresh-announcer.ts')> {
	return (announcer ??= import('./refresh-announcer.ts'));
}

function announce(busy: BoundaryBusy, hosts: Set<BusyNode>): void {
	const nowBusy = busy.marked.size === 0;
	const closing = nowBusy ? undefined : busy.closing;
	busy.closing = undefined;
	const key = busy.pending;
	const alive = busy.boundary?.startAnchor as { readonly isConnected?: boolean } | undefined;
	void loadAnnouncer().then((module) => module.refreshChanged(key, nowBusy, closing, hosts, alive));
}

// A quiet refresh never joined `busy`, so its failure has no transition to ride; it speaks on its own.
function announceQuietFailure(boundary: BusyBoundary): void {
	void loadAnnouncer().then((module) => module.announceQuietFailure(boundaryBusyHosts(boundary)));
}

export const busyElements = { note, set, apply };
export type { BusyBoundary };
