import { ASYNC_BOUNDARY_ARM, serializeRuntimeAsyncSnapshots } from '@markless/serializer';
import {
	MARKLESS_PENDING_MIN_VISIBLE_MS,
	MARKLESS_REVEAL_TRAIN_CADENCE_MS,
} from './pending-timing.ts';
import {
	artifactResumeModuleUrl,
	assembleSsrContainer,
	renderSsrOutput,
	type RenderToStringOptions,
	type SsrRenderable,
	type SsrRenderOutput,
} from './render-to-string.ts';
import { __marklessDebugBootstrapSource } from './debug-channel.ts';

// D5/D6 out-of-order streaming (T107, owner-ratified three-layer semantics):
// the shell flushes with @pending arms in place of unsettled boundaries and
// the response stays open; each settling boundary appends an inert
// <template m:arm> + its arm records + an incremental state patch + a tiny
// executor call, all committed by real range replacement between the
// boundary's existing comment anchors. No reveal dance, no result-parent
// indirection, no ref tables, no backpatch maps (D5).
//
// Show-then-adopt split: the inline __mArm executor swaps the settled
// content into the anchor range — a page that never loads the runtime still
// SHOWS settled content. The records and state-patch scripts stay in the
// document; the resume runtime adopts them at wake (resume-stream-patches),
// which makes the settled content INTERACTIVE. If the runtime woke first,
// the pending snapshot re-demands the computed client-side and the client
// settle path (commitArm) owns the boundary — a late template no-ops.

// Per-request first-flush deadline: computeds that settle within it render
// inline with zero streaming bytes; only still-pending boundaries stream.
// Implementation-defined and deliberately not user-configurable (owner
// ruling 2026-07-07). One shared timer bounds the whole first flush.
export const MARKLESS_STREAM_FIRST_FLUSH_DEADLINE_MS = 10;

export type RenderToStreamOptions = RenderToStringOptions;

export type MarklessSsrStream = {
	// The complete container shell (pending arms in place). Hosts flush this
	// first, keep the response open while appends() yields, then close.
	readonly shell: string;
	readonly pendingArmCount: number;
	readonly appends: () => AsyncGenerator<string, void, void>;
};

type StreamRunEntry = {
	readonly promise: Promise<unknown>;
	readonly async?: boolean;
	settled?: { readonly status: 'fulfilled' | 'rejected' };
};

type StreamRenderContext = {
	readonly streaming: {
		readonly runs: Map<string, StreamRunEntry>;
		readonly deadline?: Promise<void>;
		readonly prestart?: boolean;
	};
};

type PendingArm = {
	readonly boundaryId: string;
	readonly graphNodeId: string;
	readonly entry: StreamRunEntry;
	// Streamed boundaries this boundary's computed reads (compiler-known
	// read-set edges): the client executor reveals them first (G1/C3 trains).
	readonly revealDependencyIds: ReadonlyArray<string>;
};

type StreamedBoundary = SsrRenderOutput['view'] extends infer V
	? V extends { readonly asyncBoundaries: ReadonlyArray<infer B> }
		? B
		: never
	: never;

export async function renderToStream(
	component: SsrRenderable,
	options: RenderToStreamOptions = {},
): Promise<MarklessSsrStream> {
	const runs = new Map<string, StreamRunEntry>();
	const deadline = new Promise<void>((resolve) =>
		setTimeout(resolve, MARKLESS_STREAM_FIRST_FLUSH_DEADLINE_MS),
	);
	// C1 parallel runner starts: a discovery pass starts EVERY boundary runner
	// at request start (compiler-known read sets mean no fetch-on-reach
	// waterfall — the render-pure contract makes the extra body execution
	// safe, exactly like the per-settle-wave re-render passes). A slow early
	// boundary can no longer consume the shared deadline on behalf of later,
	// faster boundaries; the shell flushes at the deadline, not at the sum of
	// sequential waits.
	const discoveryOutput = await renderSsrOutput(component, options.props, {
		streaming: { runs, prestart: true },
	} satisfies StreamRenderContext);
	const renderContext: StreamRenderContext = { streaming: { runs, deadline } };
	let output = discoveryOutput;
	if (runs.size > 0) {
		// Fast pages settle before the deadline and never stream; slow pages
		// hit the deadline with every runner already in flight.
		await Promise.race([
			Promise.all([...runs.values()].map((entry) => entry.promise)),
			deadline,
		]);
		output = await renderSsrOutput(component, options.props, renderContext);
	}
	const shell = await assembleSsrContainer(component, output, options);
	const pendingArms = pendingStreamArms(output, renderContext);
	const resumeModuleUrl = options.resumeModuleUrl ?? artifactResumeModuleUrl(component);
	return {
		shell,
		pendingArmCount: pendingArms.length,
		appends: () =>
			streamArmAppends({ component, options, renderContext, pendingArms, resumeModuleUrl }),
	};
}

// Boundaries whose runner was still pending when the shell rendered: their
// settled arms stream. Held boundaries (no @pending arm) and deadline
// winners already carry settled snapshots and never appear here.
function pendingStreamArms(
	output: SsrRenderOutput,
	renderContext: StreamRenderContext,
): PendingArm[] {
	const arms = (output.view?.asyncBoundaries ?? []).flatMap((boundary) => {
		const graphNodeId = boundary.runnerGraphNodeId;
		const entry = graphNodeId ? renderContext.streaming.runs.get(graphNodeId) : undefined;
		return graphNodeId && entry && boundary.initiallyServedArm === ASYNC_BOUNDARY_ARM.pending
			? [{ boundaryId: boundary.id, graphNodeId, entry, revealDependencyIds: [] as string[] }]
			: [];
	});
	// Reveal dependencies (G1/C3): the computed's compiler-known read set,
	// restricted to OTHER streamed boundaries. Inline-settled dependencies
	// are already visible — never a reveal gate.
	const streamedBoundaryByGraphNode = new Map(
		arms.map((arm) => [arm.graphNodeId, arm.boundaryId]),
	);
	const dependenciesByGraphNode = new Map(
		(output.state?.computed ?? []).map((computed) => [
			computed.graphNodeId,
			(
				computed as {
					readonly dependencies?: ReadonlyArray<{ readonly graphNodeId: string }>;
				}
			).dependencies ?? [],
		]),
	);
	for (const arm of arms) {
		for (const dependency of dependenciesByGraphNode.get(arm.graphNodeId) ?? []) {
			const dependencyBoundaryId = streamedBoundaryByGraphNode.get(dependency.graphNodeId);
			if (
				dependencyBoundaryId &&
				dependencyBoundaryId !== arm.boundaryId &&
				!arm.revealDependencyIds.includes(dependencyBoundaryId)
			) {
				arm.revealDependencyIds.push(dependencyBoundaryId);
			}
		}
	}
	return arms;
}

async function* streamArmAppends(input: {
	readonly component: SsrRenderable;
	readonly options: RenderToStreamOptions;
	readonly renderContext: StreamRenderContext;
	readonly pendingArms: ReadonlyArray<PendingArm>;
	readonly resumeModuleUrl: string | undefined;
}): AsyncGenerator<string, void, void> {
	const remaining = new Map(input.pendingArms.map((arm) => [arm.graphNodeId, arm]));
	let executorEmitted = false;
	while (remaining.size > 0) {
		await Promise.race([...remaining.values()].map((arm) => arm.entry.promise));
		// One re-render pass per settle wave: settled runners resolve from the
		// per-request registry (no run() re-execution), so the pass renders the
		// settled arm html + armized records for every boundary that just
		// settled; still-pending boundaries render @pending again and wait.
		const output = await renderSsrOutput(
			input.component,
			input.options.props,
			input.renderContext,
		);
		// The wave's own render output is the settled truth (request-versioning
		// discipline, Ripple prior art): a runner that settles WHILE this pass
		// renders was captured by it as @pending, so it streams in the NEXT
		// wave. Checking the live registry here would stream the pending arm
		// as if it were the settled content.
		const settledInWave = new Set(
			(output.state?.computed ?? []).flatMap((computed) => {
				const status = (computed as { readonly snapshot?: { readonly status?: string } })
					.snapshot?.status;
				return status === 'fulfilled' || status === 'rejected'
					? [computed.graphNodeId]
					: [];
			}),
		);
		const parts: string[] = [];
		// Deleting the visited entry during Map iteration is safe in JS.
		for (const arm of remaining.values()) {
			if (!settledInWave.has(arm.graphNodeId)) continue;
			remaining.delete(arm.graphNodeId);
			if (!executorEmitted) {
				parts.push(armExecutorScript(input.resumeModuleUrl, input.options.nonce));
				executorEmitted = true;
			}
			parts.push(renderArmAppend(output, arm, input.options.nonce));
		}
		if (parts.length > 0) yield parts.join('');
	}
}

function renderArmAppend(
	output: SsrRenderOutput,
	arm: PendingArm,
	nonce: string | undefined,
): string {
	const startAnchor = `<!--markless:async:${arm.boundaryId}-->`;
	const endAnchor = `<!--/markless:async:${arm.boundaryId}-->`;
	const html = output.html;
	const start = html.indexOf(startAnchor);
	const end = html.indexOf(endAnchor);
	if (start === -1 || end < start) throw streamArmError(arm.boundaryId, 'anchor pair', 'html');
	const armHtml = html.slice(start + startAnchor.length, end);

	const boundary = (output.view?.asyncBoundaries ?? []).find(
		(candidate) => candidate.id === arm.boundaryId,
	) as StreamedBoundary & { readonly armRecords?: unknown };
	const armRecords = boundary?.armRecords;
	if (!armRecords || Array.isArray(armRecords)) {
		throw streamArmError(arm.boundaryId, 'an armized record set', 'view payload');
	}
	const computed = (output.state?.computed ?? []).find(
		(candidate) => candidate.graphNodeId === arm.graphNodeId,
	);
	if (!computed) throw streamArmError(arm.boundaryId, 'a settled snapshot', 'state payload');
	const [serialized] = serializeRuntimeAsyncSnapshots([computed]);
	const patch = { graphNodeId: arm.graphNodeId, snapshot: serialized?.snapshot };
	const nonceAttribute = nonce ? ` nonce="${escapeAttribute(nonce)}"` : '';

	const revealArguments = arm.revealDependencyIds.length
		? `${JSON.stringify(arm.boundaryId)},${JSON.stringify(arm.revealDependencyIds)}`
		: JSON.stringify(arm.boundaryId);

	return (
		`<template m:arm="${escapeAttribute(arm.boundaryId)}">${armHtml}</template>` +
		`<script type="markless/arm" data-boundary="${escapeAttribute(arm.boundaryId)}"${nonceAttribute}>${escapeScriptJson(JSON.stringify(armRecords))}</script>` +
		`<script type="markless/state-patch" data-graph-node="${escapeAttribute(arm.graphNodeId)}"${nonceAttribute}>${escapeScriptJson(JSON.stringify(patch))}</script>` +
		`<script${nonceAttribute}>__mArm(${escapeScriptJson(revealArguments)})</script>`
	);
}

// The once-installed inline executor. Real range replacement between the
// boundary's existing comment anchors (no reveal dance, no placeholder).
// After the swap it wires wake triggers for the streamed arm's event names,
// mirroring the inline resumer's record-less fallback. If the resume runtime
// already started, the client settle path owns the boundary: no-op.
//
// Reveal trains (T113, G1/C3/G2): commits queue and reveal in trains —
// before the document's first paint they flush in the pre-paint frame (the
// pending arm never became visible, so the settled content simply appears:
// buffered-proxy documents keep committing on parse with zero pending
// flash); after first paint, a train leaves no earlier than
// paint+MIN_VISIBLE (D8 minimum pending visibility for streamed pending)
// and no closer than one cadence to the previous train. Within a train,
// queued commits reveal in dependency order (the compiler-known read-set
// edges the server passed to __mArm), never blind arrival order. A commit
// failure fails loudly in its own task and neither wedges the train nor
// holds dependents hostage — boundaries stay independent (D2).
function armExecutorScript(resumeModuleUrl: string | undefined, nonce: string | undefined): string {
	const debugEnabled =
		typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__;
	const debugSetup = debugEnabled
		? `let md; try { md = ${__marklessDebugBootstrapSource()}(r, 'ssr-inline', false); } catch {}
		const nodes = [r];
		const walk = d.createTreeWalker(r, 129);
		let offset = -1, node;
		while ((node = walk.nextNode())) {
			if (node === s) offset = nodes.length;
			if (node.nodeType === 1) nodes.push(node);
		}`
		: '';
	const debugRegistration = debugEnabled
		? `if (md) for (const event of records.events || []) {
			if (event.eventName !== t) continue;
			const locator = (records.locators || []).find((item) => item.hostNodeId === event.hostNodeId);
			const element = locator && nodes[offset + locator.index];
			if (element) try { md.record(element, t, { kind: 'inline-resumer', source: 'streamed-arm', hostNodeId: event.hostNodeId }); } catch {}
		}`
		: '';
	const debugActivate = debugEnabled ? 'if (md) try { md.activate(); } catch {}' : '';
	const wake = resumeModuleUrl
		? `
		const rec = d.querySelector('script[type="markless/arm"][data-boundary="' + id + '"]');
		const r = s.parentElement && s.parentElement.closest && s.parentElement.closest('[data-async-container]');
		if (!rec || !r) return;
			const records = JSON.parse(rec.textContent || 'null') || {};
			const names = new Set((records.events || []).map((x) => x.eventName));
			${debugSetup}
			for (const t of names) {
			r.addEventListener(t, async (e) => {
				if (r.__asyncResumeRuntimeStarted) return;
				const mod = await import(${JSON.stringify(resumeModuleUrl)});
				await mod.resumeContainerEvent({ root: r, event: e, element: e.target, eventRecord: null });
			}, true);
				${debugRegistration}
			}
			${debugActivate}`
		: '';
	const source = `globalThis.__mArm ||= (() => {
	const d = document;
	const queue = [];
	const done = new Set();
	let last = -1 / 0;
	let scheduled = false;
	const commit = (id) => {
	const tpl = d.querySelector('template[m\\\\:arm="' + id + '"]');
	if (!tpl) throw new Error('MARKLESS_STREAM_ARM_TEMPLATE_MISSING: ' + id);
	const w = d.createTreeWalker(d.body, 128);
	let s, e, n;
	while ((n = w.nextNode())) {
		if (n.data === 'markless:async:' + id) s = n;
		else if (n.data === '/markless:async:' + id) { e = n; break; }
	}
	if (!s || !e || s.parentNode !== e.parentNode) throw new Error('MARKLESS_STREAM_ARM_ANCHORS_MISSING: ' + id);
	const root = s.parentElement && s.parentElement.closest && s.parentElement.closest('[data-async-container]');
	if (root && root.__asyncResumeRuntimeStarted) { tpl.remove(); return; }
	while (s.nextSibling && s.nextSibling !== e) s.parentNode.removeChild(s.nextSibling);
	s.parentNode.insertBefore(tpl.content, e);
	tpl.remove();${wake}
	};
	const flush = () => {
		scheduled = false;
		let moved = true;
		while (moved) {
			moved = false;
			for (let i = 0; i < queue.length; i++) {
				if (queue[i][1].some((dep) => !done.has(dep))) continue;
				const id = queue.splice(i--, 1)[0][0];
				done.add(id);
				moved = true;
				last = performance.now();
				try { commit(id); } catch (error) { setTimeout(() => { throw error; }); }
			}
		}
	};
	const schedule = () => {
		if (scheduled || !queue.length) return;
		scheduled = true;
		const paint = performance.getEntriesByName('first-contentful-paint')[0];
		if (!paint) return void requestAnimationFrame(flush);
		setTimeout(flush, Math.max(paint.startTime + ${String(MARKLESS_PENDING_MIN_VISIBLE_MS)}, last + ${String(MARKLESS_REVEAL_TRAIN_CADENCE_MS)}) - performance.now());
	};
	return (id, deps) => { queue.push([id, deps || []]); schedule(); };
})();`;
	const nonceAttribute = nonce ? ` nonce="${escapeAttribute(nonce)}"` : '';
	return `<script data-markless-stream-executor${nonceAttribute}>${escapeInlineScript(source)}</script>`;
}

function streamArmError(boundaryId: string, expected: string, where: string): Error {
	const error = new Error(
		`MARKLESS_STREAM_ARM_RENDER_MISSING: Async boundary ${boundaryId} settled during streaming, but the re-render pass produced no ${expected} in its ${where}. The settled @try/@catch content cannot stream.`,
	) as Error & Record<string, unknown>;
	error.code = 'MARKLESS_STREAM_ARM_RENDER_MISSING';
	error.phase = 'runtime';
	error.boundaryId = boundaryId;
	error.docsUrl = 'https://markless.dev/errors/MARKLESS_STREAM_ARM_RENDER_MISSING';
	return error;
}

function escapeAttribute(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeScriptJson(value: string): string {
	return value.replace(/</g, '\\u003C');
}

function escapeInlineScript(value: string): string {
	return value.replace(/<\/script/gi, '<\\/script');
}
