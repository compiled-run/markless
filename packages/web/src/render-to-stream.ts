import { serializeRuntimeAsyncSnapshots } from '@markless/serializer';
import {
	artifactResumeModuleUrl,
	assembleSsrContainer,
	renderSsrOutput,
	type RenderToStringOptions,
	type SsrRenderable,
	type SsrRenderOutput,
} from './render-to-string.ts';

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
	settled?: { readonly status: 'fulfilled' | 'rejected' };
};

type StreamRenderContext = {
	readonly streaming: {
		readonly runs: Map<string, StreamRunEntry>;
		readonly deadline: Promise<void>;
	};
};

type PendingArm = {
	readonly boundaryId: string;
	readonly graphNodeId: string;
	readonly entry: StreamRunEntry;
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
	const renderContext: StreamRenderContext = {
		streaming: {
			runs: new Map(),
			deadline: new Promise((resolve) =>
				setTimeout(resolve, MARKLESS_STREAM_FIRST_FLUSH_DEADLINE_MS),
			),
		},
	};
	const output = await renderSsrOutput(component, options.props, renderContext);
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
	const snapshotById = new Map(
		(output.state?.computed ?? []).map((computed) => [
			computed.graphNodeId,
			(computed as { readonly snapshot?: { readonly status?: string } }).snapshot,
		]),
	);
	return (output.view?.asyncBoundaries ?? []).flatMap((boundary) => {
		const graphNodeId = boundary.asyncReads[0]?.graphNodeId;
		const entry = graphNodeId ? renderContext.streaming.runs.get(graphNodeId) : undefined;
		return graphNodeId && entry && snapshotById.get(graphNodeId)?.status === 'pending'
			? [{ boundaryId: boundary.id, graphNodeId, entry }]
			: [];
	});
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
		const parts: string[] = [];
		// Deleting the visited entry during Map iteration is safe in JS.
		for (const arm of remaining.values()) {
			if (!arm.entry.settled) continue;
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

function renderArmAppend(output: SsrRenderOutput, arm: PendingArm, nonce: string | undefined): string {
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

	return (
		`<template m:arm="${escapeAttribute(arm.boundaryId)}">${armHtml}</template>` +
		`<script type="markless/arm" data-boundary="${escapeAttribute(arm.boundaryId)}"${nonceAttribute}>${escapeScriptJson(JSON.stringify(armRecords))}</script>` +
		`<script type="markless/state-patch" data-graph-node="${escapeAttribute(arm.graphNodeId)}"${nonceAttribute}>${escapeScriptJson(JSON.stringify(patch))}</script>` +
		`<script${nonceAttribute}>__mArm(${escapeScriptJson(JSON.stringify(arm.boundaryId))})</script>`
	);
}

// The once-installed inline executor. Real range replacement between the
// boundary's existing comment anchors (no reveal dance, no placeholder).
// After the swap it wires wake triggers for the streamed arm's event names,
// mirroring the inline resumer's record-less fallback. If the resume runtime
// already started, the client settle path owns the boundary: no-op.
function armExecutorScript(resumeModuleUrl: string | undefined, nonce: string | undefined): string {
	const wake = resumeModuleUrl
		? `
	const rec = d.querySelector('script[type="markless/arm"][data-boundary="' + id + '"]');
	const r = s.parentElement && s.parentElement.closest && s.parentElement.closest('[data-async-container]');
	if (!rec || !r) return;
	const names = new Set((JSON.parse(rec.textContent || 'null')?.events || []).map((x) => x.eventName));
	for (const t of names) {
		r.addEventListener(t, async (e) => {
			if (r.__asyncResumeRuntimeStarted) return;
			const mod = await import(${JSON.stringify(resumeModuleUrl)});
			await mod.resumeContainerEvent({ root: r, event: e, element: e.target, eventRecord: null });
		}, true);
	}`
		: '';
	const source = `globalThis.__mArm ||= (id) => {
	const d = document;
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
};`;
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
