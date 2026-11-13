import { runtimeResumeError } from './inline/resume-errors.ts';
import { isUncountedComment } from './resume-anchor-census.ts';
import { boundaryArmRecordSet, materializeArmRecords } from './resume-arm-records.ts';
import type { AsyncBoundaryWiring } from './resume-async-wiring.ts';
import {
	containsElement,
	elementsBetweenAnchors,
	hostIdsInsideRemovedElements,
	spliceDomOrderCensus,
} from './resume-locators.ts';
import type {
	ResumeArmBranchRecord,
	ResumeArmRecordSet,
	ResumeArmRange,
	ResumeAsyncBoundaryRecord,
	ResumeBehaviorRecord,
	ResumeDomComment,
	ResumeDomElement,
	ResumeElementHandleValue,
	ResumeDomNode,
	ResumeEventRecord,
	ResumeKeyedRepeatRecord,
	ResumeRuntimeInput,
} from './resume-types.ts';
import type { ProtocolStatePayload } from '@markless/serializer';
import type { SlotRead } from './resume-keyed-repeats.ts';

// D1 tier 4: commitArm replaces the DOM range between an async boundary's
// comment-anchor pair with freshly rendered arm content and re-registers the
// arm-relative records (D3) against the new DOM. Every consumer of arm
// rendering — CSR settle, post-mutation re-settle, streaming (T107) — routes
// through this one primitive. Range replacement is destructive, so the commit
// captures focus/selection/scroll first and restores what survives.

export type ArmCommitUpdate = {
	readonly html?: string;
	readonly nodes?: ReadonlyArray<ResumeDomNode>;
	readonly armRecords: ResumeArmRecordSet;
	readonly elementsByHostId?: ReadonlyMap<string, ResumeDomElement>;
	readonly eventElementsByHostId?: ReadonlyMap<string, ReadonlyArray<ResumeDomElement>>;
	readonly computed?: ProtocolStatePayload['computed'];
	// Cells of components this render created: nothing in the live graph answers
	// for them until the commit writes them in.
	readonly cells?: ReadonlyArray<{ readonly graphNodeId: string; readonly value: unknown }>;
	/** The async boundary arm this commit paints; rows written straight into it follow it. */
	readonly arm?: number;
	/** Keep the shown content and paint this arm after it, replacing only a previous `after` commit. */
	readonly after?: boolean;
	/** Whether a row slot's read moved since this arm's markup was rendered. */
	readonly moved?: (read: SlotRead) => boolean;
};

export type ArmRegistrationDeps = Parameters<typeof createArmCommitter>[0];

type CommitParent = {
	readonly childNodes: ArrayLike<ResumeDomNode>;
	insertBefore: (node: ResumeDomNode, before: ResumeDomNode | null) => unknown;
	removeChild: (node: ResumeDomNode) => unknown;
};
type CommitAnchor = ResumeDomNode & {
	readonly parentNode?: CommitParent | null;
	readonly parentElement?: CommitParent | null;
	// Busy marks read the records an arm registered.
	__marklessArmRecords?: unknown;
};
type FocusableElement = ResumeDomElement & {
	readonly focus?: () => void;
	readonly getAttribute?: (name: string) => string | null;
	readonly selectionStart?: number | null;
	readonly selectionEnd?: number | null;
	readonly setSelectionRange?: (start: number, end: number) => void;
};
type CommitWindow = {
	readonly scrollX?: number;
	readonly scrollY?: number;
	readonly scrollTo?: (x: number, y: number) => void;
};
type CommitDocument = {
	readonly activeElement?: unknown;
	readonly defaultView?: CommitWindow | null;
};
type CapturedFocusScroll = {
	readonly view?: CommitWindow;
	readonly scroll?: { readonly x: number; readonly y: number };
	readonly active?: {
		readonly hostNodeId?: string;
		readonly testId?: string;
		readonly selection?: { readonly start: number; readonly end: number };
	};
};

export function createArmCommitter(
	deps: {
		readonly root: ResumeDomElement;
		readonly renderHtml?: (html: string, parent?: ResumeDomNode | null) => ReadonlyArray<ResumeDomNode>;
		readonly elementsByHostId: Map<string, ResumeDomElement>;
		readonly disposedHosts: Set<string>;
		readonly disposeHost: (hostNodeId: string) => void;
		readonly addEventRecord: (element: ResumeDomElement, record: ResumeEventRecord) => void;
		readonly registerElementHandle: (
			hostNodeId: string,
			handle: { readonly handleId: string; readonly name: string },
			element: ResumeDomElement,
		) => void;
		readonly addBehaviors?: (
			hostNodeId: string,
			records: ResumeBehaviorRecord[],
		) => Promise<void>;
		// T104: fresh arm content brings fresh arm-branch anchors — the branch
		// runtime disposes the boundary's previous flip subscriptions and rewires
		// from these records (escalated records re-dedupe by site id).
		readonly registerArmBranches?: (
			boundaryId: string,
			records: ReadonlyArray<ResumeArmBranchRecord>,
		) => Promise<void>;
		readonly graph?: import('@markless/runtime').RuntimeGraph;
		// The live registration census: a born-late registration grows it, because a
		// node registered after boot is not in the boot-time snapshot.
		readonly graphNodeIds?: ReadonlySet<string> & { readonly add?: (id: string) => unknown };
		readonly registerComputedRefreshes?: (
			records: ProtocolStatePayload['computed'],
		) => Promise<void> | void;
		readonly loadSymbol?: (symbolId: string) => unknown | Promise<unknown>;
		readonly getElementHandle?: (handleId: string) => ResumeElementHandleValue;
		readonly storeHostSubscription?: (hostNodeId: string, release: () => void) => void;
		readonly registerKeyedRepeats?: (
			records: ReadonlyArray<ResumeKeyedRepeatRecord>,
			moved?: (read: SlotRead) => boolean,
			computed?: ArmCommitUpdate['computed'],
		) => Promise<void>;
		readonly asyncBoundaryWiring?: () => Promise<AsyncBoundaryWiring> | undefined;
		readonly documentHost?: CommitDocument;
	},
	installEventType: (eventType: string) => void,
) {
	return async function commitArm(
		boundary: ResumeArmRange,
		update: ArmCommitUpdate,
	): Promise<void> {
		if (!update.nodes && (!deps.renderHtml || update.html === undefined))
			throw armCommitRendererMissingError(boundary);
		const fresh =
			update.nodes ??
			deps.renderHtml!(
				update.html!,
				(boundary.startAnchor as { readonly parentNode?: ResumeDomNode | null }).parentNode,
			);
		const outgoing = elementsBetweenAnchors(
			deps.root,
			boundary.startAnchor,
			boundary.endAnchor,
		);
		const captured = captureFocusScroll(deps, outgoing);
		installArmEventTypes(update.armRecords, installEventType);
		for (const hostNodeId of hostIdsInsideRemovedElements(deps.elementsByHostId, outgoing)) {
			deps.disposeHost(hostNodeId);
		}
		replaceAnchorRange(boundary, fresh);
		spliceDomOrderCensus(deps.root, outgoing, fresh);
		// Arm content is in the DOM before its records; the container's listener waits on this set.
		const pending = ((deps.root as { __marklessArmRegistering?: Set<Promise<unknown>> })
			.__marklessArmRegistering ??= new Set());
		const registering = registerArmRecordSet(deps, installEventType, boundary, update, true);
		const settled = registering.catch(() => undefined);
		pending.add(settled);
		const materialized = await registering.finally(() => pending.delete(settled));
		if (update.arm !== undefined && !update.after) announceArm(deps.root, boundary, update.arm);
		restoreFocusScroll(deps, boundary, captured, materialized.elementsByHostId);
	};
}

// One seven-kind registration core serves both destructive arm commits and
// settled arms that were already in the served DOM at boot.
export async function registerArmRecordSet(
	deps: ArmRegistrationDeps,
	installEventType: (eventType: string) => void,
	boundary: ResumeArmRange,
	update: Pick<ArmCommitUpdate, 'armRecords' | 'elementsByHostId' | 'computed' | 'cells' | 'moved'> & {
		// A minted row has no anchors around it, so it hands over the comments its @try records count in.
		readonly comments?: ReadonlyArray<ResumeDomComment>;
	},
	eventTypesInstalled?: boolean,
) {
	const exhaustive = {
		locators: true,
		events: true,
		domUpdates: true,
		behaviors: true,
		elementHandles: true,
		keyedRepeats: true,
		branches: true,
		asyncBoundaries: true,
	} satisfies Record<keyof ResumeArmRecordSet, true>;
	void exhaustive;
	if (update.elementsByHostId) assertNativeArmRecordHosts(update);
	if (!eventTypesInstalled) installArmEventTypes(update.armRecords, installEventType);
	// Locator misalignment against the live DOM throws loud here (D2): a
	// registration that cannot prove its census must never half-register.
	const materialized = materializeArmRecords({
		root: deps.root,
		startAnchor: boundary.startAnchor,
		endAnchor: boundary.endAnchor,
		armRecords: update.armRecords,
		elementsByHostId: update.elementsByHostId,
	});
	for (const [hostNodeId, element] of materialized.elementsByHostId) {
		deps.disposedHosts.delete(hostNodeId);
		deps.elementsByHostId.set(hostNodeId, element);
	}
	if (boundary.startAnchor) (boundary.startAnchor as CommitAnchor).__marklessArmRecords = materialized;
	for (const record of materialized.events) {
		const element = materialized.elementsByHostId.get(record.hostNodeId);
		if (!element) throw armRecordHostMissingError(record.hostNodeId, 'event');
		deps.addEventRecord(element, record);
	}
	// A branch's served arm is painted with this one: its records register now, so a press in this task finds its handler.
	const served = materialized.branches.flatMap((branch) =>
		branch.servedArmRecords && branch.startAnchor && 'nodeType' in branch.startAnchor
			? [
					registerArmRecordSet(deps, installEventType, branch as ResumeArmRange, {
						armRecords: branch.servedArmRecords,
					}),
				]
			: [],
	);
	for (const handle of materialized.elementHandles) {
		const element = materialized.elementsByHostId.get(handle.hostNodeId);
		if (!element) throw armRecordHostMissingError(handle.hostNodeId, 'element handle');
		deps.registerElementHandle(handle.hostNodeId, handle, element);
	}
	// Before any refresh subscribes: a derive that runs first would read nothing.
	for (const cell of update.cells ?? []) {
		if (!deps.graph) throw new Error('Markless arm state registration is unavailable.');
		deps.graph.write({ graphNodeId: cell.graphNodeId, value: cell.value });
		deps.graphNodeIds?.add?.(cell.graphNodeId);
	}
	const computedRefreshes = (update.computed ?? []).filter(
		(computed) => computed.async === false && typeof computed.deriveSymbolId === 'string',
	);
	if (computedRefreshes.length) {
		if (!deps.registerComputedRefreshes)
			throw new Error('Markless async arm computed-refresh registration is unavailable.');
		// The async records ride along: a derive over an unsettled async value waits for it instead of running.
		await deps.registerComputedRefreshes(update.computed!);
	}
	if (materialized.keyedRepeats.length)
		await deps.registerKeyedRepeats?.(materialized.keyedRepeats, update.moved, update.computed);
	if (deps.addBehaviors && materialized.behaviors.length) {
		const byHost = new Map<string, ResumeBehaviorRecord[]>();
		for (const behavior of materialized.behaviors) {
			const records = byHost.get(behavior.hostNodeId) ?? [];
			records.push(behavior);
			byHost.set(behavior.hostNodeId, records);
		}
		for (const [hostNodeId, records] of byHost) await deps.addBehaviors(hostNodeId, records);
	}
	await Promise.all(served);
	if (materialized.branches.length)
		await deps.registerArmBranches?.(boundary.id, materialized.branches);
	if (update.armRecords.asyncBoundaries?.length)
		await registerNestedAsyncBoundaries(
			deps,
			installEventType,
			update.comments ?? commentsBetween(boundary.startAnchor, boundary.endAnchor),
			update.armRecords.asyncBoundaries,
			update.computed,
			!update.comments,
		);
	// Last: text this arm writes outside a nested @try reads the async values that registration defined.
	registerArmDomUpdates(deps, materialized.domUpdates);
	return materialized;
}

function installArmEventTypes(
	records: ResumeArmRecordSet | null,
	installEventType: (eventType: string) => void,
): void {
	if (!records) return;
	for (const event of records.events) installEventType(event.eventName);
	for (const branch of records.branches ?? []) {
		for (const arm of branch.armRecords ?? [])
			for (const event of arm.events) installEventType(event.eventName);
		if (branch.servedArmRecords)
			installArmEventTypes(branch.servedArmRecords, installEventType);
	}
	for (const repeat of records.keyedRepeats ?? [])
		for (const event of repeat.rowEvents) installEventType(event.eventName);
	for (const nested of records.asyncBoundaries ?? [])
		installArmEventTypes(boundaryArmRecordSet(nested.armRecords), installEventType);
}

function assertNativeArmRecordHosts(update: ArmCommitUpdate): void {
	const elements = update.elementsByHostId!;
	for (const records of [
		update.armRecords.events,
		update.armRecords.domUpdates ?? [],
		update.armRecords.behaviors,
		update.armRecords.elementHandles,
	])
		for (const record of records)
			if (!elements.has(record.hostNodeId))
				throw armRecordHostMissingError(record.hostNodeId, 'native');
	const repeat = (update.armRecords.keyedRepeats ?? []).find(
		(record) => !elements.has(record.parentHostNodeId),
	);
	if (repeat) throw armRecordHostMissingError(repeat.parentHostNodeId, 'keyed repeat');
}

function registerArmDomUpdates(
	deps: Parameters<typeof createArmCommitter>[0],
	records: NonNullable<ResumeArmRecordSet['domUpdates']>,
): void {
	for (const domUpdate of records) {
		if (!domUpdate.symbolId) continue;
		if (!deps.graph || !deps.loadSymbol || !deps.storeHostSubscription)
			throw new Error('Markless async arm DOM-update registration is unavailable.');
		const element = deps.elementsByHostId.get(domUpdate.hostNodeId);
		// A host disposed while this registration awaited is gone, not missing.
		if (!element && deps.disposedHosts.has(domUpdate.hostNodeId)) continue;
		if (!element) throw armRecordHostMissingError(domUpdate.hostNodeId, 'DOM update');
		if (
			typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' &&
			__MARKLESS_DEBUG_ENABLED__ &&
			(deps.graphNodeIds?.size ?? 0) > 0 &&
			!deps.graphNodeIds?.has(domUpdate.graphNodeId)
		)
			throw new Error(`Markless DOM update expected graph node ${domUpdate.graphNodeId}.`);
		deps.storeHostSubscription(
			domUpdate.hostNodeId,
			deps.graph.subscribe({
				// Target in the id: one graph node can drive two attributes on a host.
				id: `view-dom-update:${domUpdate.hostNodeId}:${JSON.stringify(domUpdate.target)}:${domUpdate.graphNodeId}:${domUpdate.path.join('.')}`,
				graphNodeId: domUpdate.graphNodeId,
				path: domUpdate.path,
				code: () => deps.loadSymbol!(domUpdate.symbolId!),
				async run(value) {
					const symbol = (await deps.loadSymbol!(domUpdate.symbolId!)) as (
						context: unknown,
					) => unknown;
					return symbol({
						graph: deps.graph,
						element,
						getElementHandle: deps.getElementHandle,
						domUpdate,
						value,
					}) as import('@markless/runtime').DomJournalResult | void;
				},
			}),
		);
	}
}

function armRecordHostMissingError(hostNodeId: string, kind: string): Error {
	return new Error(`Markless async arm ${kind} record expected live host ${hostNodeId}.`);
}

// Both anchors must be live siblings under one parent BEFORE anything is
// removed: a corrupt census fails clean instead of half-emptying the page.
function replaceAnchorRange(
	boundary: ResumeArmRange,
	fresh: ReadonlyArray<ResumeDomNode>,
): void {
	const start = boundary.startAnchor as CommitAnchor;
	const end = boundary.endAnchor as CommitAnchor;
	const parent = start.parentNode ?? start.parentElement;
	if (!parent || parent !== (end.parentNode ?? end.parentElement))
		throw armCommitAnchorsError(boundary);
	const siblings = Array.from(parent.childNodes);
	const startIndex = siblings.indexOf(start);
	const endIndex = siblings.indexOf(end);
	if (startIndex === -1 || endIndex <= startIndex) throw armCommitAnchorsError(boundary);
	for (const node of siblings.slice(startIndex + 1, endIndex)) parent.removeChild(node);
	for (const node of fresh) parent.insertBefore(node, end);
}

function captureFocusScroll(
	deps: Parameters<typeof createArmCommitter>[0],
	outgoing: ReadonlySet<ResumeDomElement>,
): CapturedFocusScroll {
	const documentHost =
		deps.documentHost ?? (globalThis as { readonly document?: CommitDocument }).document;
	const view = documentHost?.defaultView ?? undefined;
	const scroll =
		typeof view?.scrollX === 'number' && typeof view.scrollY === 'number'
			? { x: view.scrollX, y: view.scrollY }
			: undefined;
	const active = documentHost?.activeElement as FocusableElement | null | undefined;
	const insideRange =
		!!active && [...outgoing].some((element) => containsElement(element, active));
	if (!insideRange) return { view, scroll };
	let hostNodeId: string | undefined;
	for (const [id, element] of deps.elementsByHostId) {
		if (element === active) {
			hostNodeId = id;
			break;
		}
	}
	const testId = active.getAttribute?.('data-testid') ?? undefined;
	const selection =
		typeof active.selectionStart === 'number'
			? {
					start: active.selectionStart,
					end:
						typeof active.selectionEnd === 'number'
							? active.selectionEnd
							: active.selectionStart,
				}
			: undefined;
	return { view, scroll, active: { hostNodeId, testId, selection } };
}

// Focus restores only when an equivalent target survived the commit (same
// hostNodeId registration or data-testid in the fresh range). Otherwise focus
// is intentionally left where the browser put it: the replaced content is new
// by definition and has no prior focus state to preserve.
function restoreFocusScroll(
	deps: Parameters<typeof createArmCommitter>[0],
	boundary: ResumeArmRange,
	captured: CapturedFocusScroll,
	freshByHostId: ReadonlyMap<string, ResumeDomElement>,
): void {
	if (captured.active) {
		const byHostId = captured.active.hostNodeId
			? freshByHostId.get(captured.active.hostNodeId)
			: undefined;
		const survivor = (byHostId ?? findByTestId(deps.root, boundary, captured.active.testId)) as
			| FocusableElement
			| undefined;
		if (survivor && typeof survivor.focus === 'function') {
			survivor.focus();
			if (captured.active.selection && typeof survivor.setSelectionRange === 'function') {
				survivor.setSelectionRange(
					captured.active.selection.start,
					captured.active.selection.end,
				);
			}
		}
	}
	if (
		captured.scroll &&
		captured.view?.scrollTo &&
		(captured.view.scrollX !== captured.scroll.x || captured.view.scrollY !== captured.scroll.y)
	) {
		captured.view.scrollTo(captured.scroll.x, captured.scroll.y);
	}
}

function findByTestId(
	root: ResumeDomElement,
	boundary: ResumeArmRange,
	testId: string | undefined,
): ResumeDomElement | undefined {
	if (testId === undefined) return undefined;
	for (const element of elementsBetweenAnchors(root, boundary.startAnchor, boundary.endAnchor)) {
		if ((element as FocusableElement).getAttribute?.('data-testid') === testId) return element;
	}
	return undefined;
}

// One factory for both commit refusals: identical diagnostic shape, message
// text unchanged (code-prefixed, author vocabulary per D2/D4).
function armCommitError(code: string, boundary: ResumeArmRange, detail: string): Error {
	const error = new Error(`${code}: Async boundary ${boundary.id} ${detail}`) as Error &
		Record<string, unknown>;
	error.name = 'RuntimeResumeError';
	error.code = code;
	error.phase = 'runtime';
	error.boundaryId = boundary.id;
	error.docsUrl = `https://markless.dev/errors/${code}`;
	return error;
}

function armCommitAnchorsError(boundary: ResumeArmRange): Error {
	return armCommitError(
		'MARKLESS_ARM_COMMIT_ANCHORS_MISSING',
		boundary,
		"could not commit its settled @try/@catch content: the boundary's comment anchor pair is no longer intact in the live DOM.",
	);
}

function armCommitRendererMissingError(boundary: ResumeArmRange): Error {
	return armCommitError(
		'MARKLESS_ARM_COMMIT_RENDERER_MISSING',
		boundary,
		'settled with rendered @try/@catch content, but this host provides no HTML renderer to build DOM nodes from it.',
	);
}

// @try blocks a settled arm rendered inside itself: their own arm records, the async
// computeds of components that render created, then live boundary wiring.
async function registerNestedAsyncBoundaries(
	deps: ArmRegistrationDeps,
	installEventType: (eventType: string) => void,
	census: ReadonlyArray<ResumeDomComment>,
	records: NonNullable<ResumeArmRecordSet['asyncBoundaries']>,
	computed: ArmCommitUpdate['computed'],
	inArm: boolean,
): Promise<void> {
	const wiring = await deps.asyncBoundaryWiring?.();
	if (!wiring || !deps.graph || !deps.loadSymbol)
		throw new Error('Markless nested async boundary registration is unavailable.');
	const boundaries: ResumeAsyncBoundaryRecord[] = records.map((record) => {
		const startAnchor = census[record.startAnchor.index];
		const endAnchor = census[record.endAnchor.index];
		if (!startAnchor || !endAnchor)
			throw runtimeResumeError(
				'MARKLESS_RESUME_LOCATOR_MISSING',
				`Async boundary ${record.id} expected its comment anchors inside the arm that rendered it.`,
			);
		return { ...record, startAnchor, endAnchor };
	});
	const runners = new Map(
		boundaries.flatMap((nested) =>
			nested.asyncReads.flatMap((read) =>
				read.runnerSymbolId ? [[read.graphNodeId, read.runnerSymbolId] as const] : [],
			),
		),
	);
	const graph = deps.graph;
	for (const record of computed ?? []) {
		const runnerSymbolId = runners.get(record.graphNodeId);
		if (record.async !== true || !runnerSymbolId) continue;
		const planes = (await import('./payload-graph-construct.ts')).asyncPlaneFactories();
		graph.defineAsyncComputed?.(
			await planes.fromRecord(
				record,
				runnerSymbolId,
				{ root: deps.root, loadSymbol: deps.loadSymbol as ResumeRuntimeInput['loadSymbol'] },
				() => graph,
				undefined,
				computed,
			),
			planes.async,
			planes.held,
		);
		deps.graphNodeIds?.add?.(record.graphNodeId);
	}
	// After the runners: an arm's value bindings read them.
	for (const nested of boundaries) {
		const armRecords = boundaryArmRecordSet(nested.armRecords);
		if (armRecords)
			await registerArmRecordSet(deps, installEventType, nested, {
				armRecords,
				...(computed && { computed }),
			});
	}
	const shown = new Map(
		(computed ?? []).flatMap(({ async, graphNodeId, snapshot }) =>
			async === true && (snapshot?.status === 'fulfilled' || snapshot?.status === 'rejected')
				? [[graphNodeId, snapshot.version] as const]
				: [],
		),
	);
	for (const nested of boundaries) {
		// A refresh that lands in place commits nothing, so rows written straight into this fresh range follow it now.
		if (inArm) announceArm(deps.root, nested, nested.initiallyServedArm);
		wiring.add(nested, shown);
	}
}

// Rows written straight into a boundary arm follow the arm its range shows.
function announceArm(root: ResumeDomElement, boundary: ResumeArmRange, arm: number): void {
	const shown = root.__marklessBranchArms?.get(boundary.id);
	if (!shown) return;
	Object.assign(shown, { arm, start: boundary.startAnchor, end: boundary.endAnchor });
	for (const paint of shown.listeners) paint();
}

// The page comment census restricted to the range, so indexes count from the arm start.
function commentsBetween(start: ResumeDomComment, end: ResumeDomComment): ResumeDomComment[] {
	const comments: ResumeDomComment[] = [];
	type Linked = ResumeDomNode & { readonly nextSibling?: Linked | null };
	const visit = (node: Linked): void => {
		if (node.nodeType === 8 && !isUncountedComment(node as ResumeDomComment))
			comments.push(node as ResumeDomComment);
		for (const child of Array.from(node.childNodes ?? [])) visit(child as Linked);
	};
	for (let at = (start as Linked).nextSibling; at && at !== end; at = at.nextSibling) visit(at);
	return comments;
}
