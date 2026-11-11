import type { AsyncComputedPlane, RuntimeGraph } from '@markless/runtime';
import { NODE_IDLE, type RuntimeAsyncComputedNode } from '@markless/runtime/graph-async-load';
import { dispatchSpans, holdBusy, type DispatchSpan } from './event-current-target.ts';

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
// Every write of a round failed after it marked what it would reload: the marks clearing announce a failure, once.
export const WRITE_FAILED = 4;
export type WritePhase =
	| typeof WRITE_IDLE
	| typeof WRITE_WRITING
	| typeof WRITE_WRITING_SUCCEEDED
	| typeof WRITE_OWED
	| typeof WRITE_FAILED;

type Versions = ReadonlyMap<string, number>;
/** The values a round's writes marked busy when they were sent, each with its graph. */
type Held = Map<RuntimeAsyncComputedNode, Graph>;
// Each phase holds only what it means: writes in flight while writing, the versions owed once they settle.
type WriteState =
	| { readonly phase: typeof WRITE_IDLE }
	| { readonly phase: typeof WRITE_FAILED }
	| {
			readonly phase: typeof WRITE_WRITING | typeof WRITE_WRITING_SUCCEEDED;
			readonly inFlight: number;
			readonly writers: Set<DispatchSpan>;
			readonly held: Held;
	  }
	| {
			readonly phase: typeof WRITE_OWED;
			readonly writers: Set<DispatchSpan>;
			readonly due: Map<Container, Versions>;
			readonly held: Held;
	  };

/** Throws when the write watch could not move from `from` to `to`; a phase may stay put only while writes are in flight. */
export function assertWriteMove(from: WritePhase, to: WritePhase): void {
	let allowed: boolean;
	switch (to) {
		case WRITE_IDLE:
			allowed = from === WRITE_WRITING || from === WRITE_OWED || from === WRITE_FAILED;
			break;
		case WRITE_WRITING:
			allowed = from === WRITE_IDLE || from === WRITE_WRITING || from === WRITE_FAILED;
			break;
		case WRITE_WRITING_SUCCEEDED:
			allowed = from === WRITE_WRITING || from === WRITE_WRITING_SUCCEEDED || from === WRITE_OWED;
			break;
		case WRITE_OWED:
			allowed = from === WRITE_WRITING || from === WRITE_WRITING_SUCCEEDED;
			break;
		default:
			allowed = from === WRITE_WRITING;
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
// Each writing dispatch's `refreshed`, settled when its round ends: after the reload it caused lands, or at once when none follows.
const rounds = new WeakMap<DispatchSpan, () => void>();
// A round's end releases each dispatch's own control, so another round still loading keeps its marks.
function roundDone(writers: Iterable<DispatchSpan>): void {
	for (const writer of writers) {
		const done = rounds.get(writer);
		if (!done) continue;
		rounds.delete(writer);
		done();
		if (writer.control) holdBusy(writer.control, writer, false);
	}
}
let roundCount = 0;
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

function endHolds(held: Held): void {
	for (const [node, graph] of held) graph.asyncPlane?.()?.endEntry(node.graphNodeId, true);
}

/** True once for a round whose writes all failed after marking: the busy marks' announcement then says the update failed. */
export function takeWriteFailure(): boolean {
	if (state.phase !== WRITE_FAILED) return false;
	move({ phase: WRITE_IDLE });
	return true;
}

function refreshIfOwed(): void {
	if (state.phase !== WRITE_OWED) return;
	for (const writer of state.writers) if (dispatchSpans().has(writer)) return;
	const { due, writers, held } = state;
	move({ phase: WRITE_IDLE });
	const landed = [...due].map(([[graph], versions]) => graph.asyncPlane?.()?.refreshAfterWrite(versions));
	// The re-asked runs took over the marks the writes placed; one that did not start gives its mark back.
	endHolds(held);
	const asked = [...due].flatMap(([[graph], versions]) =>
		[...versions.keys()].flatMap((graphNodeId) => {
			const node = graph.asyncPlane?.()?.nodes.get(graphNodeId);
			return node ? [[graph, node] as const] : [];
		}),
	);
	const stops: Array<(() => void) | undefined> = [];
	// Heard in the flush pass that publishes the last answer, after the older subscriptions that clear the content's marks.
	const settle = () => {
		for (const [, node] of asked) if (node.snapshot.status === 'pending') return;
		for (const stop of stops.splice(0)) stop?.();
		roundDone(writers);
	};
	const id = `markless:round:${++roundCount}`;
	for (const [graph, node] of asked)
		stops.push(graph.subscribe?.({ id, graphNodeId: node.graphNodeId, path: ['status'], run: settle }));
	void Promise.all(landed).then(settle);
	if (typeof __MARKLESS_DEV_ENABLED__ === 'undefined' || __MARKLESS_DEV_ENABLED__)
		for (const [container, versions] of due)
			refreshed.set(
				container,
				new Map(shown(container).flatMap((node) => (versions.has(node.graphNodeId) ? [[node, node.version]] : []))),
			);
}

// Marked at the send: the values the refresh will re-ask, and each dispatch's control, until the round ends.
function begin(open: ReadonlySet<DispatchSpan>): void {
	for (const span of open) {
		span.closed = refreshIfOwed;
		if (!span.refreshed) {
			span.refreshed = new Promise((done) => rounds.set(span, done));
			if (span.control) holdBusy(span.control, span, true);
		}
	}
	const held: Held = 'held' in state ? state.held : new Map();
	for (const container of containers)
		for (const node of shown(container))
			if (
				!writerRuns.has(node) &&
				!held.has(node) &&
				(node.entryHold || (node.phase !== NODE_IDLE && node.snapshot.status !== 'pending'))
			) {
				held.set(node, container[0]);
				container[0].asyncPlane?.()?.markEntry(node.graphNodeId);
			}
	const now: WriteState = state;
	if (now.phase === WRITE_IDLE || now.phase === WRITE_FAILED)
		return move({ phase: WRITE_WRITING, inFlight: 1, writers: new Set(open), held });
	const writers = new Set([...now.writers, ...open]);
	if (now.phase === WRITE_OWED) return move({ phase: WRITE_WRITING_SUCCEEDED, inFlight: 1, writers, held });
	move({ phase: now.phase, inFlight: now.inFlight + 1, writers, held });
}

function end(ok: boolean): void {
	if (state.phase !== WRITE_WRITING && state.phase !== WRITE_WRITING_SUCCEEDED) return;
	const phase = ok ? WRITE_WRITING_SUCCEEDED : state.phase;
	const inFlight = state.inFlight - 1;
	const { writers, held } = state;
	if (inFlight > 0) return move({ phase, inFlight, writers, held });
	if (phase === WRITE_WRITING) {
		move({ phase: held.size > 0 ? WRITE_FAILED : WRITE_IDLE });
		endHolds(held);
		return roundDone(writers);
	}
	const due = new Map<Container, Versions>();
	for (const container of containers) {
		const versions = new Map<string, number>();
		for (const node of shown(container)) if (!writerRuns.has(node)) versions.set(node.graphNodeId, node.version);
		due.set(container, versions);
	}
	move({ phase: WRITE_OWED, writers, due, held });
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
				`Markless: a ${method} to ${url} was sent outside any event handler while async values loaded again after a save. ` +
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
		if (open.size === 0) {
			if (!recipe && (typeof __MARKLESS_DEV_ENABLED__ === 'undefined' || __MARKLESS_DEV_ENABLED__))
				warnIfResent(method, url);
			return response;
		}
		begin(open);
		response.then(
			(answer) => end(answer.ok),
			() => end(false),
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
		if (state.phase === WRITE_OWED) state.due.delete(container);
	};
}
