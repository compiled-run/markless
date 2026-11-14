import {
	ASYNC_BOUNDARY_ARM,
	serializeRuntimeAsyncSnapshots,
	serializeRuntimeStateCells,
	encodeProtocolPayloadLists,
	encodeStreamedArmRecords,
	type ProtocolStatePayload,
	type ProtocolStreamedArmPatch,
	type ProtocolSyncPolicy,
	type ProtocolViewPayload,
	type ProtocolSyncPolicyCondition,
} from '@markless/serializer';
import {
	PROTOCOL_IDLE_EVENT_NAME,
	PROTOCOL_VISIBLE_EVENT_NAME,
	PROTOCOL_CONTAINER_END_COMMENT,
	PROTOCOL_LOCATOR_PATHS_ATTRIBUTE,
	PROTOCOL_CONTAINER_START_COMMENT,
	PROTOCOL_EVENT_HOST_ATTRIBUTE,
	PROTOCOL_STATE_PATCH_SCRIPT_TYPE,
	PROTOCOL_STREAMED_ARM_SCRIPT_TYPE,
	type ProtocolArmRecordSet,
} from '@markless/serializer/protocol';
import {
	MARKLESS_PENDING_MIN_VISIBLE_MS,
	MARKLESS_REVEAL_TRAIN_CADENCE_MS,
} from './pending-timing.ts';
import { createInlineInPlaceCheckSource, IN_PLACE_CHECK } from './inline/resumer.ts';
import { resumesAtLoad, servedRowCount } from './fns/served-rows.ts';
import {
	artifactResumeModuleUrl,
	assembleSsrContainer,
	renderSsrOutput,
	sendsFormInPlace,
	storageRenderContext,
	type RenderToStringOptions,
	type SsrRenderable,
	type SsrRenderOutput,
	withArmEventHostMarks,
} from './render-to-string.ts';
import { __marklessDebugBootstrapSource } from './debug-channel.ts';
import { RESUME_MODULE_ATTRIBUTE } from './fns/container-region.ts';

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
// which makes the settled content INTERACTIVE. A runtime that woke first
// adopts each later arm through `__mArm` handing it over (fns/streamed-arms).

// Per-request first-flush deadline: computeds that settle within it render
// inline with zero streaming bytes; only still-pending boundaries stream.
// Implementation-defined and deliberately not user-configurable (owner
// ruling 2026-07-07). One shared timer bounds the whole first flush.
export const MARKLESS_STREAM_FIRST_FLUSH_DEADLINE_MS = 10;

// A navigation that swaps the page out clears this global, retiring the old executor and its queue.
export const STREAM_ARM_EXECUTOR_GLOBAL = '__mArm';
export const STREAMED_ARM_SELECTOR = `template[m\\:arm],script[type="${PROTOCOL_STREAMED_ARM_SCRIPT_TYPE}"],script[type="${PROTOCOL_STATE_PATCH_SCRIPT_TYPE}"]`;

export type RenderToStreamOptions = RenderToStringOptions;

export type MarklessSsrStream = {
	// The complete container shell (pending arms in place). Hosts flush this
	// first, keep the response open while appends() yields, then close.
	readonly shell: string;
	readonly pendingArmCount: number;
	readonly appends: () => AsyncGenerator<string, void, void>;
	// Abandon pending appends and abort runner work that observes its signal.
	readonly cancel: (reason?: unknown) => void;
};

type StreamRunEntry = {
	readonly promise: Promise<unknown>;
	readonly async?: boolean;
	settled?: {
		readonly status: 'fulfilled' | 'rejected';
		readonly version?: number;
		readonly key?: null;
		readonly error?: unknown;
	};
};

type StreamRenderContext = ReturnType<typeof storageRenderContext> & {
	readonly streaming: {
		readonly runs: Map<string, StreamRunEntry>;
		readonly signal: AbortSignal;
		readonly deadline?: Promise<void>;
		readonly prestart?: boolean;
		// The cell each @catch this render showed writes its error to, by page boundary id.
		readonly caughtErrors?: Map<string, string>;
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
	const settleController = new AbortController();
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
	const storage = storageRenderContext(options.cookie);
	const discoveryOutput = await renderSsrOutput(component, options.props, {
		...storage,
		streaming: { runs, signal: settleController.signal, prestart: true },
	} satisfies StreamRenderContext);
	const renderContext: StreamRenderContext = {
		...storage,
		streaming: { runs, signal: settleController.signal, deadline, caughtErrors: new Map() },
	};
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
	const pendingArms = pendingStreamArms(output, renderContext);
	const shellRows = servedRowCount(pageRepeats(output), output.state);
	const shell = await assembleSsrContainer(component, output, {
		...options,
		// A page whose rows would make the first press pay for adopting them resumes after load instead.
		...(resumesAtLoad(shellRows)
			? {}
			: { streamedBoundaryIds: new Set(pendingArms.map((arm) => arm.boundaryId)) }),
	});
	const resumeModuleUrl = options.resumeModuleUrl ?? artifactResumeModuleUrl(component);
	return {
		shell,
		pendingArmCount: pendingArms.length,
		appends: () =>
			streamArmAppends({
				component,
				options,
				renderContext,
				pendingArms,
				resumeModuleUrl,
				shellState: output.state,
				shellRows,
			}),
		cancel: (reason) => settleController.abort(reason),
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
	readonly shellState: ProtocolStatePayload | undefined;
	readonly shellRows: number;
}): AsyncGenerator<string, void, void> {
	let rows = input.shellRows;
	const remaining = new Map(input.pendingArms.map((arm) => [arm.boundaryId, arm]));
	const signal = input.renderContext.streaming.signal;
	if (signal.aborted) return;
	let cancelAppends!: () => void;
	const cancelled = new Promise<void>((resolve) => {
		cancelAppends = resolve;
	});
	const onCancel = () => cancelAppends();
	signal.addEventListener('abort', onCancel, { once: true });
	let executorEmitted = false;
	const settledRuns = new Set<PendingArm>();
	for (const arm of remaining.values())
		arm.entry.promise.then(
			() => settledRuns.add(arm),
			() => settledRuns.add(arm),
		);
	// A wave that starts after an arm's value settled must stream it, or every later wave re-renders forever.
	const missedWaves = new Map<PendingArm, number>();
	try {
		while (remaining.size > 0) {
			await Promise.race([
				...[...remaining.values()].map((arm) => arm.entry.promise),
				cancelled,
			]);
			if (signal.aborted) return;
			const settledBeforeWave = [...remaining.values()].filter((arm) => settledRuns.has(arm));
			// One re-render pass per settle wave: settled runners resolve from the
			// per-request registry (no run() re-execution), so the pass renders the
			// settled arm html + armized records for every boundary that just
			// settled; still-pending boundaries render @pending again and wait.
			const output = await renderSettleWave(input, remaining.values());
			if (signal.aborted) return;
			// The wave's own render output is the settled truth (request-versioning
			// discipline, Ripple prior art): a runner that settles WHILE this pass
			// renders was captured by it as @pending, so it streams in the NEXT
			// wave. Checking the live registry here would stream the pending arm
			// as if it were the settled content.
			const settledInWave = new Set(
				(output.state?.computed ?? []).flatMap((computed) => {
					const status = (
						computed as { readonly snapshot?: { readonly status?: string } }
					).snapshot?.status;
					return status === 'fulfilled' || status === 'rejected'
						? [computed.graphNodeId]
						: [];
				}),
			);
			// A sync derive gating a boundary carries no snapshot; the arm this wave took is its settle.
			const armTakenInWave = new Set(
				(output.view?.asyncBoundaries ?? []).flatMap((boundary) =>
					boundary.initiallyServedArm === ASYNC_BOUNDARY_ARM.try ||
					boundary.initiallyServedArm === ASYNC_BOUNDARY_ARM.catch
						? [boundary.id]
						: [],
				),
			);
			const parts: string[] = [];
			// Deleting the visited entry during Map iteration is safe in JS.
			for (const arm of remaining.values()) {
				if (
					!settledInWave.has(arm.graphNodeId) &&
					!(arm.entry.async === false && armTakenInWave.has(arm.boundaryId))
				)
					continue;
				remaining.delete(arm.boundaryId);
				if (!executorEmitted) {
					parts.push(armExecutorScript(input.resumeModuleUrl, input.options.nonce));
					executorEmitted = true;
				}
				const append = renderArmAppend(
					output,
					arm,
					input.options.nonce,
					input.shellState,
					input.renderContext.streaming.caughtErrors?.get(arm.boundaryId),
					rows,
				);
				rows = append.rows;
				parts.push(append.html);
			}
			for (const arm of settledBeforeWave) {
				if (!remaining.has(arm.boundaryId)) continue;
				const missed = (missedWaves.get(arm) ?? 0) + 1;
				if (missed > 1)
					throw streamArmError(arm.boundaryId, '@try or @catch arm', 'boundary record');
				missedWaves.set(arm, missed);
			}
			if (parts.length > 0) yield parts.join('');
		}
	} finally {
		signal.removeEventListener('abort', onCancel);
	}
}

// Settled content that cannot render fails its own boundary: it takes @catch, so the page never stays on @pending.
async function renderSettleWave(
	input: {
		readonly component: SsrRenderable;
		readonly options: RenderToStreamOptions;
		readonly renderContext: StreamRenderContext;
	},
	remaining: Iterable<PendingArm>,
): Promise<SsrRenderOutput> {
	const render = () => renderSsrOutput(input.component, input.options.props, input.renderContext);
	try {
		return await render();
	} catch (error) {
		const settled = [...remaining].filter((arm) => arm.entry.settled?.status === 'fulfilled');
		const fail = (arms: ReadonlyArray<PendingArm>) => {
			const previous = arms.map((arm) => arm.entry.settled);
			for (const arm of arms)
				arm.entry.settled = { status: 'rejected', version: 1, key: null, error };
			return () => arms.forEach((arm, index) => (arm.entry.settled = previous[index]));
		};
		for (const arms of [
			...settled.map((arm) => [arm]),
			...(settled.length > 1 ? [settled] : []),
		]) {
			const restore = fail(arms);
			try {
				const output = await render();
				console.error(
					`[markless] the settled @try content of ${arms.map((arm) => arm.boundaryId).join(', ')} failed to render on the server, so it streams its @catch content:`,
					error,
				);
				return output;
			} catch {
				restore();
			}
		}
		throw error;
	}
}

// A sync derive gating the arm reads upstream values the shell served as pending, so they ride its patch.
function armDependencyClosure(output: SsrRenderOutput, graphNodeId: string): ReadonlySet<string> {
	const definitions = new Map(
		(output.state?.computed ?? []).map((definition) => [definition.graphNodeId, definition]),
	);
	const closure = new Set([graphNodeId]);
	for (const id of closure) {
		const definition = definitions.get(id) as
			| {
					readonly async?: boolean;
					readonly dependencies?: ReadonlyArray<{ readonly graphNodeId: string }>;
			  }
			| undefined;
		if (!definition || (id !== graphNodeId && definition.async === true)) continue;
		for (const dependency of definition.dependencies ?? []) closure.add(dependency.graphNodeId);
	}
	return closure;
}

function renderArmAppend(
	output: SsrRenderOutput,
	arm: PendingArm,
	nonce: string | undefined,
	shellState: ProtocolStatePayload | undefined,
	caughtError: string | undefined,
	rowsBefore: number,
): { readonly html: string; readonly rows: number } {
	const renderedAnchor = output.structure?.anchors.find(
		(candidate) => candidate.kind === 'async' && candidate.id === arm.boundaryId,
	);
	if (!renderedAnchor)
		throw streamArmError(arm.boundaryId, 'renderData boundary record', 'structure');
	const armHtml = renderedAnchor.html;

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
	const shellGraphNodeIds = new Set([
		...(shellState?.cells ?? []).map((cell) => cell.graphNodeId),
		...(shellState?.computed ?? []).map((definition) => definition.graphNodeId),
	]);
	// The shell served the @catch error cell empty; this arm's own error rides its patch.
	const cells = serializeRuntimeStateCells(
		(output.state?.cells ?? []).filter(
			(cell) => !shellGraphNodeIds.has(cell.graphNodeId) || cell.graphNodeId === caughtError,
		),
	);
	const armGraphNodeIds = armDependencyClosure(output, arm.graphNodeId);
	const computedById = new Map(
		(output.state?.computed ?? [])
			.filter(
				(definition) =>
					armGraphNodeIds.has(definition.graphNodeId) ||
					!shellGraphNodeIds.has(definition.graphNodeId),
			)
			.map((definition) => [definition.graphNodeId, definition]),
	);
	const patch: Pick<ProtocolStatePayload, 'cells' | 'computed'> = encodeProtocolPayloadLists(
		'markless/state',
		{ cells, computed: serializeRuntimeAsyncSnapshots([...computedById.values()]) },
	);
	const armEvents = withServedBranchArmEvents(
		armRecords as ProtocolArmRecordSet,
		renderedAnchor.elementStart,
		output.structure?.anchors ?? [],
	);
	const servedArmRecords = withPaintedBranchArms(armEvents, output) as ProtocolArmRecordSet;
	const armPatch: ProtocolStreamedArmPatch = [boundary.initiallyServedArm, streamedArmRecords(servedArmRecords)];
	const nonceAttribute = nonce ? ` nonce="${escapeAttribute(nonce)}"` : '';

	const rows = rowsBefore + servedRowCount(servedArmRecords.keyedRepeats ?? [], output.state);
	const starts = armRunsWithoutInteraction(servedArmRecords) || resumesAtLoad(rows);
	const revealArguments =
		arm.revealDependencyIds.length || starts
			? `${JSON.stringify(arm.boundaryId)},${JSON.stringify(arm.revealDependencyIds)}${starts ? ',1' : ''}`
			: JSON.stringify(arm.boundaryId);

	return {
		rows,
		html:
			`<template m:arm="${escapeAttribute(arm.boundaryId)}">${withArmEventHostMarks(armEvents, armHtml)}</template>` +
			`<script type="${PROTOCOL_STREAMED_ARM_SCRIPT_TYPE}" data-boundary="${escapeAttribute(arm.boundaryId)}"${nonceAttribute}>${escapeScriptJson(JSON.stringify(armPatch))}</script>` +
			`<script type="${PROTOCOL_STATE_PATCH_SCRIPT_TYPE}" data-graph-node="${escapeAttribute(arm.graphNodeId)}"${nonceAttribute}>${escapeScriptJson(JSON.stringify(patch))}</script>` +
			`<script${nonceAttribute}>${sendsFormInPlace(servedArmRecords) ? escapeInlineScript(createInlineInPlaceCheckSource()) : ''}__mArm(${escapeScriptJson(revealArguments)})</script>`,
	};
}

type ServedBranch = NonNullable<ProtocolArmRecordSet['branches']>[number] & {
	readonly servedArmRecords?: ProtocolArmRecordSet;
};

// The stream boot reads only the arm's own events, so an @if's painted arm lends its events and their hosts to the arm,
// placed where the render put the @if.
function withServedBranchArmEvents(
	armRecords: ProtocolArmRecordSet,
	armStart: number,
	anchors: NonNullable<SsrRenderOutput['structure']>['anchors'],
): ProtocolArmRecordSet {
	const branches = (armRecords.branches ?? []) as ReadonlyArray<ServedBranch>;
	if (!branches.some((branch) => branch.servedArmRecords?.events.length)) return armRecords;
	const locators = [...armRecords.locators];
	const events = [...armRecords.events];
	for (const branch of branches) {
		const served = branch.servedArmRecords;
		const anchor = anchors.find(
			(candidate) => candidate.kind === 'branch' && candidate.id === branch.id,
		);
		if (!served?.events.length || !anchor) continue;
		const placed = new Map(served.locators.map((locator) => [locator.hostNodeId, locator]));
		for (const event of served.events) {
			const locator = placed.get(event.hostNodeId);
			if (!locator) continue;
			if (!locators.some((held) => held.hostNodeId === locator.hostNodeId))
				locators.push({
					...locator,
					index: anchor.elementStart - armStart + locator.index,
				});
			events.push(event);
		}
	}
	return { ...armRecords, locators, events };
}

// A streamed arm can land after the page changed state, so its branches name the arm this render painted.
function withPaintedBranchArms(armRecords: object, output: SsrRenderOutput): object {
	const painted = new Map(
		(
			(
				output as {
					readonly servedBranches?: ReadonlyArray<{
						readonly id: string;
						readonly takenArm: number;
					}>;
				}
			).servedBranches ?? []
		).map((branch) => [branch.id, branch.takenArm]),
	);
	const branches = (armRecords as { readonly branches?: ReadonlyArray<{ readonly id: string }> })
		.branches;
	if (!painted.size || !branches?.length) return armRecords;
	return {
		...armRecords,
		branches: branches.map((branch) =>
			painted.has(branch.id) ? { ...branch, takenArm: painted.get(branch.id) } : branch,
		),
	};
}

// Serialized into the stream executor, so it stays self-contained.
function applyStreamedArmSyncPolicy(
	policy: ProtocolSyncPolicy,
	event: Event,
	root: Element,
	inPlaceCheck: ((event: Event, later: true) => unknown) | undefined,
): boolean {
	// Run here, before the dispatch below: a trusted press lets that dispatch read the kept submit before any later listener.
	if (!('branches' in policy) && policy.when.type === 'submits-in-place') {
		if (!inPlaceCheck) return false;
		inPlaceCheck(event, true);
		return true;
	}
	const branches = 'branches' in policy ? policy.branches : [policy];
	const readsGraph = (condition: ProtocolSyncPolicyCondition): boolean =>
		condition.type === 'graph-truthy' ||
		((condition.type === 'and' || condition.type === 'or') &&
			condition.conditions.some(readsGraph)) ||
		(condition.type === 'not' && readsGraph(condition.condition));
	if (branches.some((branch) => readsGraph(branch.when))) {
		const shared = (
			globalThis as {
				readonly __marklessInlineSyncPolicy?: {
					readonly run?: (
						policy: ProtocolSyncPolicy,
						event: Event,
						root: Element,
					) => void;
				};
			}
		).__marklessInlineSyncPolicy;
		if (!shared?.run) return false;
		shared.run(policy, event, root);
		return true;
	}
	const matches = (condition: ProtocolSyncPolicyCondition): boolean =>
		condition.type === 'and'
			? condition.conditions.every(matches)
			: condition.type === 'or'
				? condition.conditions.some(matches)
				: condition.type === 'not'
					? !matches(condition.condition)
					: condition.type === 'constant-truthy'
						? !!condition.value
						: condition.type === 'event-equals' &&
							(event as unknown as Record<string, unknown>)[condition.field] ===
								condition.value;
	for (const branch of branches) {
		if (!matches(branch.when)) continue;
		for (const action of branch.actions) {
			if (action === 'preventDefault') event.preventDefault();
			if (action === 'stopPropagation') event.stopPropagation();
		}
	}
	return true;
}

// The once-installed inline executor. Real range replacement between the
// boundary's existing comment anchors (no reveal dance, no placeholder).
// After the swap it wires wake triggers for the streamed arm's event names,
// mirroring the inline resumer's record-less fallback; a runtime it wakes adds no
// listeners beside it, since a second listener would dispatch every press twice. Once the runtime has
// read the streamed patches (`__mAdopted`), the client settle path owns the
// boundary: no-op, and the template stays so the commit still reads as unflushed.
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
// `__mArm.idle(f)` runs f once no scheduled train is left, so an event-less wake adopts every held commit.
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
	// One executor serves every streamed page in the document, so a boot imports the arm's own root's module.
	const wake = resumeModuleUrl
		? `
		const rec = d.querySelector('script[type="${PROTOCOL_STREAMED_ARM_SCRIPT_TYPE}"][data-boundary="' + id + '"]');
		const r = s.parentElement && s.parentElement.closest && s.parentElement.closest('[data-async-container]');
		if (!rec || !r) return;
			const records = (JSON.parse(rec.textContent || 'null') || [])[1] || {};
			const names = new Set(records.eventNames || (records.events || []).map((x) => x.eventName));
			const armEnd = e;
			const applyPolicy = ${applyStreamedArmSyncPolicy.toString()};
			${debugSetup}
			const life = (r.__mL ||= {});
			const forward = async (e) => {
				if (r.__mL !== life) return r.removeEventListener(e.type, forward, true);
				const t = e.type;
				let applied = false;
				// A ref indexes this arm's own events, so only an element between the arm's anchors is read.
				for (let el = e.target; el && !applied && el !== r; el = el.parentElement) {
					if (!(s.compareDocumentPosition(el) & 4) || !(armEnd.compareDocumentPosition(el) & 2)) continue;
					for (const entry of (el.getAttribute(${JSON.stringify(PROTOCOL_EVENT_HOST_ATTRIBUTE)}) || '').split(';')) {
						const [name, ref] = entry.split('!')[0].split(':');
						const x = name === t && ref && (records.events || [])[ref];
						if (x && x.syncPolicy && applyPolicy(x.syncPolicy, e, r, self[${JSON.stringify(IN_PLACE_CHECK)}])) applied = true;
					}
				}
				const input = { root: r, event: e, element: e.target, eventRecord: null, propagationStopped: e.cancelBubble, ...(applied ? { syncPolicyAlreadyApplied: true } : {}) };
				if (r.__marklessDispatch) return r.__marklessDispatch(input);
				if (r.__asyncResumeRuntimeStarted) return;
				r.__marklessDelegatedDispatch = true;
				const own = r.querySelector('script[${RESUME_MODULE_ATTRIBUTE}]');
				// Shared with the boot, so a kept submit falls back to the browser if this load fails.
				const mod = await (r.__mResume ||= import((own && own.getAttribute(${JSON.stringify(RESUME_MODULE_ATTRIBUTE)})) || ${JSON.stringify(resumeModuleUrl)}).catch((error) => {
					throw ((r.__mResume = undefined), error);
				}));
				// A navigation that kept the container started another page while the module loaded.
				if (r.__mL !== life) return;
				await mod.resumeContainerEvent(input);
			};
			r.__marklessListen ||= (t) => r.addEventListener(t, forward, true);
			for (const t of names) {
			r.addEventListener(t, forward, true);
				${debugRegistration}
			}
			${debugActivate}
			// An arm whose hosts run at idle or when visible needs the runtime with no interaction, as the shell's own would.
			if (starts) (globalThis.requestIdleCallback || setTimeout)(async () => {
				if (r.__mL !== life || r.__marklessDispatch || r.__asyncResumeRuntimeStarted) return;
				r.__marklessDelegatedDispatch = true;
				const own = r.querySelector('script[${RESUME_MODULE_ATTRIBUTE}]');
				const mod = await (r.__mResume ||= import((own && own.getAttribute(${JSON.stringify(RESUME_MODULE_ATTRIBUTE)})) || ${JSON.stringify(resumeModuleUrl)}).catch((error) => {
					throw ((r.__mResume = undefined), error);
				}));
				if (r.__mL === life) await mod.resumeContainerEvent({ root: r, event: 0 });
			});`
		: '';
	const source = `globalThis.__mArm ||= (() => {
	const d = document;
	const me = d.currentScript;
	// The server streams everything after its first executor, so the served page is what precedes it.
	const pin = (root) => {
		let x;
		const c = [root], m = [], cw = d.createTreeWalker(root, 129);
		for (; (x = cw.nextNode()) && x !== me;)
			if (x.nodeType !== 8) c.push(x);
			else if (x.data === ${JSON.stringify(PROTOCOL_CONTAINER_START_COMMENT)}) (c.length = 1), (m.length = 0);
			else if (x.data === ${JSON.stringify(PROTOCOL_CONTAINER_END_COMMENT)}) break;
			else m.push(x);
		root.__marklessComments = m;
		if (root.__marklessCensus) return;
		const p = x === me && root.getAttribute?.(${JSON.stringify(PROTOCOL_LOCATOR_PATHS_ATTRIBUTE)}), o = p && p.split('|')[3];
		let g = 0;
		if (o) for (const el of c.slice(1)) { const n = el.localName || ''; g = (g * 31 + n.length * 32 + (n.charCodeAt(0) | 32)) | 0; }
		if (p && (parseInt(p) !== c.length || (o && o !== (g >>> 0).toString(36)))) root.__marklessShifted = 1;
		root.__marklessCensus = c;
	};
	const own = me && me.closest && me.closest('[data-async-container]');
	if (own && !own.__marklessComments) pin(own);
	const queue = [];
	const done = new Set();
	let last = -1 / 0;
	let scheduled = false;
	const idle = [];
	const commit = (id, starts) => {
	const w = d.createTreeWalker(d.body, 128);
	let s, e, n;
	while ((n = w.nextNode())) {
		if (n.data === 'markless:async:' + id) s = n;
		else if (n.data === '/markless:async:' + id) { e = n; break; }
	}
	if (!s || !e || s.parentNode !== e.parentNode) throw new Error('MARKLESS_STREAM_ARM_ANCHORS_MISSING: ' + id);
	const root = s.parentElement && s.parentElement.closest && s.parentElement.closest('[data-async-container]');
	if (root && !root.__marklessComments) pin(root);
	if (root && root.__mArmLive && root.__mArmLive(id)) return;
	if (root && root.__mAdopted) return;
	const tpl = d.querySelector('template[m\\\\:arm="' + id + '"]');
	if (!tpl) throw new Error('MARKLESS_STREAM_ARM_TEMPLATE_MISSING: ' + id);
	while (s.nextSibling && s.nextSibling !== e) s.parentNode.removeChild(s.nextSibling);
	s.parentNode.insertBefore(tpl.content, e);
	tpl.remove();${wake}
	};
	const flush = () => {
		scheduled = false;
		if (globalThis.__mArm !== arm) { queue.length = 0; return; }
		let moved = true;
		while (moved) {
			moved = false;
			for (let i = 0; i < queue.length; i++) {
				if (queue[i][1].some((dep) => !done.has(dep))) continue;
				const [id, , starts] = queue.splice(i--, 1)[0];
				done.add(id);
				moved = true;
				last = performance.now();
				try { commit(id, starts); } catch (error) { setTimeout(() => { throw error; }); }
			}
		}
		for (const f of idle.splice(0)) f();
	};
	const schedule = () => {
		if (scheduled || !queue.length) return;
		scheduled = true;
		const paint = performance.getEntriesByName('first-contentful-paint')[0];
		if (!paint) return void requestAnimationFrame(flush);
		setTimeout(flush, Math.max(paint.startTime + ${String(MARKLESS_PENDING_MIN_VISIBLE_MS)}, last + ${String(MARKLESS_REVEAL_TRAIN_CADENCE_MS)}) - performance.now());
	};
	const arm = (id, deps, starts) => { queue.push([id, deps || [], starts]); schedule(); };
	arm.idle = (f) => (scheduled ? idle.push(f) : f());
	arm.flush = flush;
	return arm;
})();`;
	const nonceAttribute = nonce ? ` nonce="${escapeAttribute(nonce)}"` : '';
	return `<script data-markless-stream-executor${nonceAttribute}>${escapeInlineScript(source)}</script>`;
}

const UNPROMPTED_EVENT_NAMES: ReadonlySet<string> = new Set([
	PROTOCOL_IDLE_EVENT_NAME,
	PROTOCOL_VISIBLE_EVENT_NAME,
]);

type ArmEventRecords = {
	readonly events?: ReadonlyArray<{ readonly eventName: string }>;
	readonly keyedRepeats?: ReadonlyArray<{
		readonly rowEvents?: ReadonlyArray<{ readonly eventName: string }>;
	}>;
	readonly branches?: ReadonlyArray<{ readonly servedArmRecords?: ArmEventRecords }>;
};

// The event names an arm, its rows and its painted branches handle.
function armEventNames(records: ArmEventRecords): Set<string> {
	const names = new Set<string>();
	const add = (set: ArmEventRecords) => {
		for (const event of set.events ?? []) names.add(event.eventName);
		for (const repeat of set.keyedRepeats ?? [])
			for (const event of repeat.rowEvents ?? []) names.add(event.eventName);
	};
	add(records);
	for (const branch of records.branches ?? []) if (branch.servedArmRecords) add(branch.servedArmRecords);
	return names;
}

// An arm, its rows or its painted branches naming an idle or visible host.
function armRunsWithoutInteraction(records: ProtocolArmRecordSet): boolean {
	return [...armEventNames(records as ArmEventRecords)].some((name) => UNPROMPTED_EVENT_NAMES.has(name));
}

// The arm's records as streamed, naming every event the boot listens for when a row or branch handles one its own events do not.
function streamedArmRecords(records: ProtocolArmRecordSet): ProtocolArmRecordSet {
	// The debug boot registers each arm event against its locator, so a debug page serves both plain.
	const served =
		typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__
			? records
			: encodeStreamedArmRecords(records);
	const names = armEventNames(records as ArmEventRecords);
	const own = new Set((records.events ?? []).map((event) => event.eventName));
	return [...names].some((name) => !own.has(name))
		? { ...served, eventNames: [...new Set([...(served.eventNames ?? []), ...names])] }
		: served;
}

// Every keyed repeat the shell served: the page's own and those in @try arms it rendered settled.
function pageRepeats(
	output: SsrRenderOutput,
): ReadonlyArray<{
	readonly collectionGraphNodeId?: string;
	readonly collectionPath?: ReadonlyArray<string>;
}> {
	const view = output.view as ProtocolViewPayload | undefined;
	return [
		...(view?.keyedRepeats ?? []),
		...(view?.asyncBoundaries ?? []).flatMap((boundary) =>
			boundary.armRecords && !Array.isArray(boundary.armRecords)
				? ((boundary.armRecords as ProtocolArmRecordSet).keyedRepeats ?? [])
				: [],
		),
	];
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

// Only `</` and `<!` can end or escape a script's raw text; any other `<` is inert there.
function escapeScriptJson(value: string): string {
	return value.replace(/<(?=[/!])/g, '\\u003C');
}

function escapeInlineScript(value: string): string {
	return value.replace(/<\/script/gi, '<\\/script');
}
