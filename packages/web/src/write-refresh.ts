import type { AsyncComputedPlane } from '@markless/runtime';
import type { RuntimeAsyncComputedNode } from '@markless/runtime/graph-async-load';

// After an event handler's same-origin write succeeds, every wired container re-asks the async values it shows,
// once every overlapping write and every handler open when one was sent have finished. Nothing aborts a write.

type Graph = { readonly asyncPlane?: () => AsyncComputedPlane | undefined };
type Boundary = { readonly asyncReads: ReadonlyArray<{ readonly graphNodeId: string }> };
/** A wired container: its graph, and the @try blocks whose async values it shows. */
type Container = readonly [Graph, ReadonlyMap<string, Boundary>];

/** A DOM dispatch in flight: resume-events adds one to `__mOpen` per dispatch and calls `closed` when it ends. */
type DispatchSpan = { closed?: () => void };

declare const __MARKLESS_DEV_ENABLED__: boolean;

const IDLE = 0;
const WRITING = 1;
const WRITING_SUCCEEDED = 2;
// Every write settled and one succeeded; the refresh waits for the handlers that sent them.
const OWED = 3;
type Phase = typeof IDLE | typeof WRITING | typeof WRITING_SUCCEEDED | typeof OWED;

// Shared through the window so the dispatch path loads nothing for it.
const host = globalThis as { __mOpen?: Set<DispatchSpan> };
const READS = new Set(['GET', 'HEAD', 'OPTIONS']);
const containers = new Set<Container>();
const owed = new Map<Container, ReadonlyMap<string, number>>();
const writers = new Set<DispatchSpan>();
// Values whose latest run sent a write itself: a refresh would send it again.
const writerRuns = new WeakSet<RuntimeAsyncComputedNode>();
let phase: Phase = IDLE;
let inFlight = 0;
let recipe: RuntimeAsyncComputedNode | undefined;
let refreshing: RuntimeAsyncComputedNode[] = [];

function move(to: Phase): void {
	if (typeof __MARKLESS_DEV_ENABLED__ === 'undefined' || __MARKLESS_DEV_ENABLED__) {
		let allowed: boolean;
		switch (to) {
			case IDLE:
				allowed = phase === WRITING || phase === OWED;
				break;
			case WRITING:
				allowed = phase === IDLE;
				break;
			case WRITING_SUCCEEDED:
				allowed = phase === WRITING || phase === OWED;
				break;
			default:
				allowed = phase === WRITING_SUCCEEDED;
		}
		if (!allowed) throw new Error(`Markless write refresh: no move from ${phase} to ${to}`);
	}
	phase = to;
}

function shown([graph, boundaries]: Container): Set<RuntimeAsyncComputedNode> {
	const nodes = graph.asyncPlane?.()?.nodes;
	const found = new Set<RuntimeAsyncComputedNode>();
	for (const boundary of boundaries.values())
		for (const { graphNodeId } of boundary.asyncReads) {
			const node = nodes?.get(graphNodeId);
			if (node) found.add(node);
		}
	return found;
}

function refreshIfOwed(): void {
	if (phase !== OWED) return;
	for (const writer of writers) if (host.__mOpen?.has(writer)) return;
	writers.clear();
	move(IDLE);
	const due = [...owed];
	owed.clear();
	if (typeof __MARKLESS_DEV_ENABLED__ === 'undefined' || __MARKLESS_DEV_ENABLED__)
		refreshing = due.flatMap(([container, versions]) =>
			[...shown(container)].filter((node) => versions.has(node.graphNodeId)),
		);
	for (const [[graph], versions] of due) graph.asyncPlane?.()?.refreshAfterWrite(versions);
}

function begin(): void {
	inFlight++;
	if (phase === IDLE) move(WRITING);
	else if (phase === OWED) move(WRITING_SUCCEEDED);
}

function end(ok: boolean): void {
	inFlight--;
	if (ok && phase === WRITING) move(WRITING_SUCCEEDED);
	if (inFlight > 0) return;
	if (phase === WRITING) {
		writers.clear();
		return move(IDLE);
	}
	for (const container of containers) {
		const versions = new Map<string, number>();
		for (const node of shown(container))
			if (!writerRuns.has(node)) versions.set(node.graphNodeId, node.version);
		owed.set(container, versions);
	}
	move(OWED);
	refreshIfOwed();
}

function sameOrigin(url: string): boolean {
	try {
		return new URL(url, location.href).origin === location.origin;
	} catch {
		return false;
	}
}

function warnIfResent(method: string, url: string): void {
	if (!refreshing.some((node) => node.snapshot.status === 'pending')) return;
	console.warn(
		`Markless: a ${method} to ${url} was sent outside any event handler while async values loaded again after a save. ` +
			'If an async value sends it after an await, that reload sent it again. Send writes from event handlers.',
	);
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
		const open = host.__mOpen;
		if (!open || open.size === 0) {
			if (!recipe && (typeof __MARKLESS_DEV_ENABLED__ === 'undefined' || __MARKLESS_DEV_ENABLED__))
				warnIfResent(method, url);
			return response;
		}
		for (const span of open) {
			writers.add(span);
			span.closed = refreshIfOwed;
		}
		begin();
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
		owed.delete(container);
	};
}
