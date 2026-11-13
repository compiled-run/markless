import type { AsyncComputedPlane, RuntimeGraph } from '@markless/runtime';
import type { RuntimeAsyncComputedNode } from '@markless/runtime/graph-async-load';
import { currentDispatch, dispatchSpans, holdBusy, type DispatchSpan } from './event-current-target.ts';
import { IN_PLACE_LOCATION_HEADER, IN_PLACE_REQUEST_HEADER } from './fns/in-place-headers.ts';

// Re-asks the async values a container shows: on a back-forward cache restore, and after a handler's save succeeds.

// On a container shown again as it was left: true until its runtime wires, then the call that re-asks its async values.
export const CONTAINER_REASK_PROPERTY = '__mReask';

type Graph = {
	readonly asyncPlane?: () => AsyncComputedPlane | undefined;
	readonly subscribe?: RuntimeGraph['subscribe'];
	readonly changed?: RuntimeGraph['changed'];
	readonly holdPaint?: RuntimeGraph['holdPaint'];
};
type Boundary = { readonly asyncReads: ReadonlyArray<{ readonly graphNodeId: string }> };
type Boundaries = ReadonlyMap<string, Boundary>;
/** A wired container: its graph, and the @try blocks whose async values it shows. */
type Container = readonly [Graph, Boundaries];
type Reask = () => void;
type Release = (graphNodeId: string) => void;
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
export const ROUND_SENDING = 0;
export const ROUND_SENDING_SAVED = 1;
// Every save the dispatch sent has answered and one succeeded; the state it set keeps its earlier look until its reload lands.
export const ROUND_HOLDING = 2;
export type RoundPhase = typeof ROUND_SENDING | typeof ROUND_SENDING_SAVED | typeof ROUND_HOLDING;
/** A sending dispatch's open round: `out` saves still unanswered, `done` settles its `refreshed`, `held` the states it keeps on their earlier look. */
type OpenRound = { phase: RoundPhase; out: number; readonly done: () => void; readonly held: Map<Graph, Set<string>> };
const rounds = new Map<DispatchSpan, OpenRound>();
const releases = new Map<Graph, Release>();

/** Throws when a round could not move from `from` to `to`; holding means no save of its own is out. */
export function assertRoundMove(from: RoundPhase, to: RoundPhase, out: number): void {
	const allowed =
		to === ROUND_HOLDING
			? from !== ROUND_HOLDING && out === 0
			: out > 0 && (to === ROUND_SENDING_SAVED || from === ROUND_SENDING);
	if (!allowed) throw new Error(`Markless write refresh: no round move from ${from} to ${to} with ${out} out`);
}

function moveRound(round: OpenRound, phase: RoundPhase, out: number): void {
	if (typeof __MARKLESS_DEV_ENABLED__ === 'undefined' || __MARKLESS_DEV_ENABLED__) assertRoundMove(round.phase, phase, out);
	round.phase = phase;
	round.out = out;
}
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

// A sender's save answered and the reload it owes has not landed.
function reloadOwed(sender: DispatchSpan): boolean {
	if (state.phase === WRITE_OWED && state.senders.has(sender)) return true;
	for (const reload of reloads) if (reload.senders.has(sender)) return true;
	return false;
}

// Ends a round: the states it held show what was written unless another open round still holds them, then its mark and `refreshed`.
function closeRound(sender: DispatchSpan, round: OpenRound): void {
	rounds.delete(sender);
	for (const [graph, ids] of round.held)
		for (const id of ids) if (![...rounds.values()].some((other) => other.held.get(graph)?.has(id))) releases.get(graph)?.(id);
	round.done();
	if (sender.control) holdBusy(sender.control, sender, false);
}

// Ends each holding sender's round once no reload it is owed is still to land; a page left behind ends them all.
function roundDone(senders: Iterable<DispatchSpan>, left = false): void {
	for (const sender of senders) {
		const round = rounds.get(sender);
		if (round && (left || (round.phase === ROUND_HOLDING && !reloadOwed(sender)))) closeRound(sender, round);
	}
}

// A write outside any dispatch's own run, to state a holding round's sender set in its own run, keeps its earlier look until that round ends.
function holdPaint(graph: Graph) {
	return (graphNodeId: string): boolean => {
		const current = currentDispatch();
		if (current) {
			const wrote = (current.wrote ??= new Map());
			wrote.set(graph, (wrote.get(graph) ?? new Set()).add(graphNodeId));
			return false;
		}
		let held = false;
		for (const [sender, round] of rounds)
			if (round.phase === ROUND_HOLDING && sender.wrote?.get(graph)?.has(graphNodeId)) {
				round.held.set(graph, (round.held.get(graph) ?? new Set()).add(graphNodeId));
				if (state.phase === WRITE_OWED) queueMicrotask(() => refreshIfOwed(sender));
				held = true;
			}
		return held;
	};
}

function endHolds(held: Held, outcome: WriteOutcome, graph?: Graph): void {
	for (const [node, owner] of held)
		if (!graph || owner === graph) {
			held.delete(node);
			owner.asyncPlane?.()?.endEntry(node.graphNodeId, outcome);
		}
}

// A reload that no named dispatch started (it came from a write sent after an await) is still loading.
function reloadingUnattributed(): boolean {
	for (const reload of reloads)
		if (reload.senders.size === 0) for (const node of reload.asked) if (node.snapshot.status === 'pending') return true;
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

// `wentOn` is a sender that went on past its save, so the reload need not wait for it to return.
function refreshIfOwed(wentOn?: DispatchSpan): void {
	if (state.phase !== WRITE_OWED) return;
	for (const sender of state.senders) if (sender !== wentOn && dispatchSpans().has(sender)) return;
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
function begin(open: ReadonlySet<DispatchSpan>): DispatchSpan | undefined {
	const current = currentDispatch();
	const senders = current && open.has(current) ? [current] : [];
	for (const span of senders) {
		span.closed = refreshIfOwed;
		const round = rounds.get(span);
		if (round) moveRound(round, round.phase === ROUND_SENDING ? ROUND_SENDING : ROUND_SENDING_SAVED, round.out + 1);
		else {
			span.refreshed = new Promise(
				(done) => void rounds.set(span, { phase: ROUND_SENDING, out: 1, done, held: new Map() }),
			);
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
	if (now.phase === WRITE_IDLE) move({ phase: WRITE_WRITING, inFlight: 1, senders: new Set(senders), held });
	else {
		const round = { senders: new Set([...now.senders, ...senders]), held };
		if (now.phase === WRITE_OWED) move({ phase: WRITE_WRITING_SUCCEEDED, inFlight: 1, ...round });
		else move({ phase: now.phase, inFlight: now.inFlight + 1, ...round });
	}
	return senders[0];
}

// The sender's own part: holding once all its saves answered and one succeeded, ended at once when every one failed.
function senderEnded(sender: DispatchSpan | undefined, saved: boolean): void {
	const round = sender && rounds.get(sender);
	if (!round || round.phase === ROUND_HOLDING) return;
	const out = round.out - 1;
	const phase = saved || round.phase === ROUND_SENDING_SAVED ? ROUND_SENDING_SAVED : ROUND_SENDING;
	if (out > 0) moveRound(round, phase, out);
	else if (phase === ROUND_SENDING_SAVED) {
		moveRound(round, ROUND_HOLDING, 0);
		// No round still collecting this sender means no reload is coming for it.
		if (state.phase === WRITE_IDLE || !state.senders.has(sender)) roundDone([sender]);
	} else closeRound(sender, round);
}

/** One write in flight ended, sent by `sender` when one was named; a page left behind ends the whole round at once, silently. */
export function end(outcome: WriteOutcome, sender?: DispatchSpan): void {
	// A save whose round a page left already ended counts toward no later round.
	if (sender && !rounds.has(sender)) return;
	if (outcome !== 'left') senderEnded(sender, outcome === 'saved');
	if (state.phase !== WRITE_WRITING && state.phase !== WRITE_WRITING_SUCCEEDED) return;
	const { senders, held } = state;
	if (outcome === 'left') {
		move({ phase: WRITE_IDLE });
		endHolds(held, 'left');
		return roundDone(rounds.keys(), true);
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
				`Markless: a ${method} to ${url} was sent outside any event handler's own run while async values loaded again after a save, ` +
					'so it did not count as a save and nothing loaded again for it. An async value that sends a write after an await sends it ' +
					'again on every reload; a handler that saves after an await in that moment is not reloaded. Send writes from event handlers, before their first await.',
			);
			return;
		}
}

// A form sent in place whose answer points at another page leaves this one, so nothing shown here is asked again.
function leavesPage(answer: Response, inPlace: boolean): boolean {
	// A form sent in place also follows a redirect fetch already took, which a handler's own request never does.
	const pointed = answer.headers.get(IN_PLACE_LOCATION_HEADER) ?? (inPlace && answer.redirected ? answer.url : null);
	if (pointed === null) return false;
	const landed = new URL(pointed, answer.url || location.href);
	return landed.origin !== location.origin || landed.pathname + landed.search !== location.pathname + location.search;
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
		// A write no dispatch can be named for, sent while a reload that no named dispatch started is loading, may be what a
		// recipe that reload re-ran sends after an await; counting it could loop, so the reload chain stops there.
		if (open.size === 0 || (!(current && open.has(current)) && reloadingUnattributed())) {
			if (!recipe && (typeof __MARKLESS_DEV_ENABLED__ === 'undefined' || __MARKLESS_DEV_ENABLED__))
				warnIfResent(method, url);
			return response;
		}
		const sender = begin(open);
		const inPlace = new Headers(init?.headers ?? request?.headers).has(IN_PLACE_REQUEST_HEADER);
		response.then(
			(answer) => end(leavesPage(answer, inPlace) ? 'left' : answer.ok ? 'saved' : 'failed', sender),
			() => end('failed', sender),
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
	const release = graph.holdPaint?.(holdPaint(graph));
	if (release) releases.set(graph, release);
	return () => {
		graph.holdPaint?.(undefined);
		releases.delete(graph);
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
