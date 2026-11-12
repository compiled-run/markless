import type { AsyncComputedPlane, RuntimeGraph } from '@markless/runtime';
import type { RuntimeAsyncComputedNode } from '@markless/runtime/graph-async-load';
import { currentDispatch, dispatchSpans, holdBusy, type DispatchSpan } from './event-current-target.ts';

// Re-asks the async values a container shows: on a back-forward cache restore, and after a handler's save succeeds.

// On a container shown again as it was left: true until its runtime wires, then the call that re-asks its async values.
export const CONTAINER_REASK_PROPERTY = '__mReask';

type Graph = {
	readonly asyncPlane?: () => AsyncComputedPlane | undefined;
	readonly subscribe?: RuntimeGraph['subscribe'];
};
type Boundary = { readonly asyncReads: ReadonlyArray<{ readonly graphNodeId: string }> };
type Boundaries = ReadonlyMap<string, Boundary>;
/** A wired container: its graph, and the @try blocks whose async values it shows. */
type Container = readonly [Graph, Boundaries];
type Reask = () => void;
type Host = { [CONTAINER_REASK_PROPERTY]?: true | Reask };

function shownIds(boundaries: Boundaries): Set<string> {
	const ids = new Set<string>();
	for (const boundary of boundaries.values()) for (const read of boundary.asyncReads) ids.add(read.graphNodeId);
	return ids;
}

// A back-forward cache restore re-asks here; the router and the page's inline script mark a page shown again before its runtime wires.
export function reaskOnReturn(root: object, graph: Graph, boundaries: Boundaries): () => void {
	const host = root as Host;
	const reask = () => {
		for (const id of shownIds(boundaries)) graph.asyncPlane?.()?.rerun(id, true);
	};
	const restored = (event: Event) => (event as PageTransitionEvent).persisted && reask();
	if (host[CONTAINER_REASK_PROPERTY] === true) reask();
	host[CONTAINER_REASK_PROPERTY] = reask;
	globalThis.addEventListener?.('pageshow', restored);
	return () => {
		globalThis.removeEventListener?.('pageshow', restored);
		if (host[CONTAINER_REASK_PROPERTY] === reask) delete host[CONTAINER_REASK_PROPERTY];
	};
}

declare const __MARKLESS_DEV_ENABLED__: boolean;

export const WRITE_IDLE = 0;
export const WRITE_WRITING = 1;
export const WRITE_WRITING_SUCCEEDED = 2;
// Every write settled and one succeeded; the refresh waits for the dispatches that sent them.
export const WRITE_OWED = 3;
export type WritePhase = typeof WRITE_IDLE | typeof WRITE_WRITING | typeof WRITE_WRITING_SUCCEEDED | typeof WRITE_OWED;

type Versions = ReadonlyMap<string, number>;
/** The values a round's writes hold busy, each with its graph. */
type Held = Map<RuntimeAsyncComputedNode, Graph>;
/** A round being written: the dispatches known to have sent its writes, which the refresh waits for and whose controls it marks, and what it holds. */
type Round = { readonly senders: Set<DispatchSpan>; readonly held: Held };
/** How a write ended: answered `ok`, failed, or answered by sending the page somewhere else. */
export type WriteOutcome = 'saved' | 'failed' | 'left';
// Each phase holds only what it means: writes in flight while writing, the versions owed once they settle.
type WriteState =
	| { readonly phase: typeof WRITE_IDLE }
	| (Round & { readonly phase: typeof WRITE_WRITING | typeof WRITE_WRITING_SUCCEEDED; readonly inFlight: number })
	| (Round & { readonly phase: typeof WRITE_OWED; readonly due: Map<Container, Versions> });
/** A round whose refresh runs: it ends, releasing its senders' controls, once none of the values it asked is pending. */
type Reload = {
	readonly senders: Set<DispatchSpan>;
	asked: RuntimeAsyncComputedNode[];
	/** Containers whose re-asked runs have not started yet. */
	readonly starting: Set<Container>;
	readonly stops: Array<(() => void) | undefined>;
};

/** Throws when the write watch could not move from `from` to `to`; a phase may stay put only while writes are in flight. */
export function assertWriteMove(from: WritePhase, to: WritePhase): void {
	let allowed: boolean;
	switch (to) {
		case WRITE_IDLE:
			allowed = from !== WRITE_IDLE;
			break;
		case WRITE_WRITING:
			allowed = from === WRITE_IDLE || from === WRITE_WRITING;
			break;
		case WRITE_WRITING_SUCCEEDED:
			allowed = from !== WRITE_IDLE;
			break;
		default:
			allowed = from === WRITE_WRITING || from === WRITE_WRITING_SUCCEEDED;
	}
	if (!allowed) throw new Error(`Markless write refresh: no move from ${from} to ${to}`);
}

const READS = new Set(['GET', 'HEAD', 'OPTIONS']);
const containers = new Set<Container>();
// Values whose latest run sent a write itself: a refresh would send it again.
const writerRuns = new WeakSet<RuntimeAsyncComputedNode>();
// Development only: per container, the runs the last refresh started and their versions.
const refreshed = new Map<Container, Map<RuntimeAsyncComputedNode, number>>();
let state: WriteState = { phase: WRITE_IDLE };
const reloads = new Set<Reload>();
// Each sending dispatch's open round: settles its `refreshed` when the round ends.
const rounds = new WeakMap<DispatchSpan, () => void>();
let reloadCount = 0;
let recipe: RuntimeAsyncComputedNode | undefined;

function move(next: WriteState): void {
	if (typeof __MARKLESS_DEV_ENABLED__ === 'undefined' || __MARKLESS_DEV_ENABLED__) {
		assertWriteMove(state.phase, next.phase);
		if ('inFlight' in next && next.inFlight < 1) throw new Error('Markless write refresh: writing with no write in flight');
	}
	state = next;
}

// Shown values and every async value they read, inputs first, so a value never re-runs on an input's old answer.
function shown([graph, boundaries]: Container): RuntimeAsyncComputedNode[] {
	return graph.asyncPlane?.()?.withInputs(shownIds(boundaries)) ?? [];
}

// Ends each sender's round: its control's mark, and the `refreshed` a form's hold waits on.
function roundDone(senders: Iterable<DispatchSpan>): void {
	for (const sender of senders) {
		const done = rounds.get(sender);
		if (!done) continue;
		rounds.delete(sender);
		done();
		if (sender.control) holdBusy(sender.control, sender, false);
	}
}

function endHolds(held: Held, outcome: WriteOutcome, graph?: Graph): void {
	for (const [node, owner] of held)
		if (!graph || owner === graph) {
			held.delete(node);
			owner.asyncPlane?.()?.endEntry(node.graphNodeId, outcome);
		}
}

function reloading(): boolean {
	for (const reload of reloads) for (const node of reload.asked) if (node.snapshot.status === 'pending') return true;
	return false;
}

// Heard in the flush pass that publishes the last answer, after the older subscriptions that clear the content's marks.
function settleReload(reload: Reload): void {
	if (!reloads.has(reload) || reload.starting.size > 0) return;
	for (const node of reload.asked) if (node.snapshot.status === 'pending') return;
	reloads.delete(reload);
	for (const stop of reload.stops.splice(0)) stop?.();
	roundDone(reload.senders);
}

function refreshIfOwed(): void {
	if (state.phase !== WRITE_OWED) return;
	for (const sender of state.senders) if (dispatchSpans().has(sender)) return;
	const { due, senders, held } = state;
	move({ phase: WRITE_IDLE });
	const reload: Reload = { senders, asked: [...held.keys()], starting: new Set(due.keys()), stops: [] };
	reloads.add(reload);
	const id = `markless:reload:${++reloadCount}`;
	for (const [node, graph] of held)
		reload.stops.push(graph.subscribe?.({ id, graphNodeId: node.graphNodeId, path: ['status'], run: () => settleReload(reload) }));
	const landed = [...due].map((entry) => {
		const [container, versions] = entry;
		const started = () => {
			reload.starting.delete(container);
			settleReload(reload);
		};
		const plane = container[0].asyncPlane?.();
		if (!plane) return void reload.starting.delete(container);
		return plane.refreshAfterWrite(versions, started);
	});
	// The re-asked runs show the marks now; a value one of them did not start gives its mark back.
	endHolds(held, 'saved');
	void Promise.all(landed).then(() => settleReload(reload));
	settleReload(reload);
	if (typeof __MARKLESS_DEV_ENABLED__ === 'undefined' || __MARKLESS_DEV_ENABLED__)
		for (const [container, versions] of due)
			refreshed.set(
				container,
				new Map(shown(container).flatMap((node) => (versions.has(node.graphNodeId) ? [[node, node.version]] : []))),
			);
}

// A write sent in a dispatch's own synchronous run is that dispatch's; one sent after an await is no one's the browser can name.
function begin(open: ReadonlySet<DispatchSpan>): void {
	const current = currentDispatch();
	const senders = current && open.has(current) ? [current] : [];
	for (const span of senders) {
		span.closed = refreshIfOwed;
		if (!rounds.has(span)) {
			span.refreshed = new Promise((done) => rounds.set(span, done));
			if (span.control) holdBusy(span.control, span, true);
		}
	}
	const now: WriteState = state;
	const held: Held = now.phase === WRITE_IDLE ? new Map() : now.held;
	for (const container of containers)
		for (const node of shown(container))
			if (!writerRuns.has(node) && !held.has(node) && node.snapshot.status !== 'idle') {
				held.set(node, container[0]);
				container[0].asyncPlane?.()?.markEntry(node.graphNodeId, true);
			}
	if (now.phase === WRITE_IDLE) return move({ phase: WRITE_WRITING, inFlight: 1, senders: new Set(senders), held });
	const round = { senders: new Set([...now.senders, ...senders]), held };
	if (now.phase === WRITE_OWED) return move({ phase: WRITE_WRITING_SUCCEEDED, inFlight: 1, ...round });
	move({ phase: now.phase, inFlight: now.inFlight + 1, ...round });
}

/** One write in flight ended; a page left behind ends the whole round at once, silently. */
export function end(outcome: WriteOutcome): void {
	if (state.phase !== WRITE_WRITING && state.phase !== WRITE_WRITING_SUCCEEDED) return;
	const { senders, held } = state;
	if (outcome === 'left') {
		move({ phase: WRITE_IDLE });
		endHolds(held, 'left');
		return roundDone(senders);
	}
	const phase = outcome === 'saved' ? WRITE_WRITING_SUCCEEDED : state.phase;
	const inFlight = state.inFlight - 1;
	if (inFlight > 0) return move({ phase, inFlight, senders, held });
	if (phase === WRITE_WRITING) {
		move({ phase: WRITE_IDLE });
		endHolds(held, 'failed');
		return roundDone(senders);
	}
	const due = new Map<Container, Versions>();
	for (const container of containers) {
		const versions = new Map<string, number>();
		for (const node of shown(container)) if (!writerRuns.has(node)) versions.set(node.graphNodeId, node.version);
		due.set(container, versions);
	}
	move({ phase: WRITE_OWED, senders, due, held });
	refreshIfOwed();
}

function sameOrigin(url: string): boolean {
	try {
		return new URL(url, location.href).origin === location.origin;
	} catch {
		return false;
	}
}

// Blames only a run a refresh started that is still in flight, so an unrelated reload or a later timer is not named.
function warnIfResent(method: string, url: string): void {
	for (const runs of refreshed.values())
		for (const [node, version] of runs) {
			if (node.version !== version || node.snapshot.status !== 'pending') {
				runs.delete(node);
				continue;
			}
			console.warn(
				`Markless: a ${method} to ${url} was sent outside any event handler's own run while async values loaded again after a save. ` +
					'If an async value sends it after an await, that reload sent it again. Send writes from event handlers.',
			);
			return;
		}
}

let patched = false;
function patchFetch(): void {
	if (patched || typeof globalThis.fetch !== 'function' || typeof location === 'undefined') return;
	patched = true;
	const send = globalThis.fetch;
	globalThis.fetch = function fetch(input: RequestInfo | URL, init?: RequestInit) {
		const response = send.call(globalThis, input, init);
		const request = input instanceof Request ? input : undefined;
		const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
		const url = request?.url ?? String(input);
		if (READS.has(method) || !sameOrigin(url)) return response;
		if (recipe) writerRuns.add(recipe);
		const open = dispatchSpans();
		const current = currentDispatch();
		// A write no dispatch can be named for, sent while a reload is loading, is what a recipe that reload re-ran sends after an await.
		if (open.size === 0 || (!(current && open.has(current)) && reloading())) {
			if (!recipe && (typeof __MARKLESS_DEV_ENABLED__ === 'undefined' || __MARKLESS_DEV_ENABLED__))
				warnIfResent(method, url);
			return response;
		}
		begin(open);
		response.then(
			(answer) => end(answer.ok ? 'saved' : 'failed'),
			() => end('failed'),
		);
		return response;
	};
}

/** Runs the synchronous start of an async value's recipe, so a write it sends there marks the value as a writer. */
export function runRecipe<T>(node: RuntimeAsyncComputedNode | undefined, run: () => T): T {
	if (node) writerRuns.delete(node);
	const outer = recipe;
	recipe = node;
	try {
		return run();
	} finally {
		recipe = outer;
	}
}

/** Registers a wired container; the call it returns forgets it. */
export function registerWriteRefresh(graph: Container[0], boundaries: Container[1]): () => void {
	const container: Container = [graph, boundaries];
	patchFetch();
	containers.add(container);
	return () => {
		containers.delete(container);
		refreshed.delete(container);
		if (state.phase !== WRITE_IDLE) endHolds(state.held, 'saved', graph);
		if (state.phase === WRITE_OWED) state.due.delete(container);
		// A page that goes mid-refresh ends its part of each round, so no control or form stays marked by it.
		const nodes = graph.asyncPlane?.()?.nodes;
		for (const reload of reloads) {
			reload.starting.delete(container);
			reload.asked = reload.asked.filter((node) => nodes?.get(node.graphNodeId) !== node);
			settleReload(reload);
		}
	};
}
