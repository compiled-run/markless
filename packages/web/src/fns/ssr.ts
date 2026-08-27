import {
	marklessCarryWidgetRegistry,
	marklessComposedInstancePath,
	marklessComposedSyncPolicy,
	marklessComposeState,
	marklessComposeWidgetRegistry,
	marklessRegisterComposedWidgets,
	marklessCsrChildReadIsStatic,
	marklessCsrRemapChildGraph,
	marklessCsrRemapChildDomUpdate,
	marklessCsrRemapChildKeyedRepeat,
	marklessCsrRemapGraphOutput,
	marklessWithWidgetRegistry,
} from './composition.ts';
import type {
	ComposeChild,
	ComposeChildOutput,
	ComposeGraphProps,
	ComposeGraphRead,
	ComposeStateDraft,
} from './composition.ts';
import {
	marklessBaseSymbolId,
	marklessBoundSymbolId,
	marklessDomUpdateSymbolId,
	marklessLiveBoundGraphRoute,
} from './bound-symbol.ts';
import {
	marklessInstancePath,
	marklessRowSegment,
	marklessWidgetHandleId,
} from './instance-scope.ts';
import { marklessSerializeGraphValue } from './state-serialize.ts';
import type { SsrDataStructure } from '../ssr-data/renderer.ts';
import { ASYNC_BOUNDARY_ARM } from '@markless/serializer';
import type { ProtocolComposedGraphProp } from '@markless/serializer';

// SSR composition works on DRAFT payload records: the shapes the protocol
// eventually serializes, still mutable and still carrying producer-only fields.
// Each type below names the fields composition reads and lets the rest ride
// through the index signature.
type SsrRecord = { readonly [key: string]: unknown };
type SsrHostedRecord = SsrRecord & { readonly hostNodeId: string };
type SsrLocatorRecord = SsrRecord & {
	readonly hostNodeId: string;
	index: number;
	tagName: string;
};
type SsrEventRecord = SsrRecord & {
	readonly hostNodeId: string;
	symbolIds: ReadonlyArray<string>;
	readonly eventName?: string;
};
type SsrDomUpdateRecord = SsrRecord & {
	readonly hostNodeId: string;
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
	symbolId?: string;
};
type SsrBehaviorRecord = SsrRecord & {
	readonly hostNodeId: string;
	readonly symbolId?: string;
	readonly inputGraphReads?: ReadonlyArray<ComposeGraphRead>;
};
// Row events address their element by a row-relative path, not a host id.
type SsrRowEventRecord = SsrRecord & { readonly symbolIds: ReadonlyArray<string> };
type SsrKeyedRepeatRecord = SsrRecord & {
	readonly id: string;
	readonly parentHostNodeId: string;
	readonly ownerHostNodeId?: string;
	readonly collectionGraphNodeId?: string;
	readonly collectionPath: ReadonlyArray<string>;
	readonly rowEvents: ReadonlyArray<SsrRowEventRecord>;
};
type SsrAnchoredRecord = SsrRecord & {
	readonly id: string;
	readonly startAnchor?: SsrRecord;
	readonly endAnchor?: SsrRecord;
};
type SsrBranchRecord = SsrAnchoredRecord & {
	readonly testReads?: ReadonlyArray<ComposeGraphRead>;
	readonly contentReads?: ReadonlyArray<ComposeGraphRead>;
	readonly symbolId?: string;
	readonly takenArm?: number;
	readonly armRecords?: ReadonlyArray<SsrArmRecordSet>;
	readonly escalates?: true;
	readonly servedArmRecords?: SsrArmRecordSet;
	readonly composedInstancePath?: string;
	readonly composedGraphProps?: ReadonlyArray<ProtocolComposedGraphProp>;
};
type SsrArmRecordSet = SsrRecord & {
	readonly locators?: ReadonlyArray<SsrLocatorRecord>;
	readonly events?: ReadonlyArray<SsrEventRecord>;
	readonly domUpdates?: ReadonlyArray<SsrDomUpdateRecord>;
	readonly behaviors?: ReadonlyArray<SsrBehaviorRecord>;
	readonly elementHandles?: ReadonlyArray<SsrHostedRecord>;
	readonly keyedRepeats?: ReadonlyArray<SsrKeyedRepeatRecord>;
	readonly branches?: ReadonlyArray<SsrBranchRecord>;
};
type SsrAsyncReadRecord = ComposeGraphRead & { readonly runnerSymbolId?: string };
type SsrBoundaryRecord = SsrAnchoredRecord & {
	readonly runnerGraphNodeId?: string | null;
	readonly updateSymbolId?: string;
	readonly asyncReads?: ReadonlyArray<SsrAsyncReadRecord>;
	readonly armRecords?: SsrArmRecordSet | ReadonlyArray<SsrArmRecordSet>;
};
type SsrViewDraft = SsrRecord & {
	readonly locators: ReadonlyArray<SsrLocatorRecord>;
	readonly events: ReadonlyArray<SsrEventRecord>;
	readonly domUpdates: ReadonlyArray<SsrDomUpdateRecord>;
	readonly behaviors: ReadonlyArray<SsrBehaviorRecord>;
	readonly elementHandles: ReadonlyArray<SsrHostedRecord>;
	readonly keyedRepeats?: ReadonlyArray<SsrKeyedRepeatRecord>;
	readonly branches?: ReadonlyArray<SsrBranchRecord>;
	readonly asyncBoundaries?: ReadonlyArray<SsrBoundaryRecord>;
	readonly asyncRunners?: Readonly<Record<string, string>>;
};
type SsrPropEvent = {
	readonly hostNodeId: string;
	readonly eventName: string;
	readonly propName: string;
};
type SsrChildOutput = ComposeChildOutput & {
	readonly html?: string;
	readonly view?: SsrViewDraft;
	readonly externalSymbolIds?: ReadonlyArray<string>;
	readonly propEvents?: ReadonlyArray<SsrPropEvent>;
};
type SsrChildComponent = {
	readonly renderSsr?: ((
		props?: unknown,
		renderContext?: unknown,
	) => SsrChildOutput | undefined | Promise<SsrChildOutput | undefined>) & {
		/** Set by the compiler on a component whose body seeds a shared instance. */
		readonly marklessSeedsShared?: boolean;
		/**
		 * The widget-scoped shared definitions this component ROOTS, set by the
		 * compiler on a component whose payload owns their cells. Every rendered
		 * instance of it starts a widget instance of its own.
		 */
		readonly marklessWidgetRoots?: ReadonlyArray<string>;
		readonly marklessChildrenWidgetRoot?: string;
	};
	/** SSR entry per exported component, for a module that serves more than one. */
	readonly renderSsrComponents?: Readonly<Record<string, SsrChildComponent>>;
};
/** The prop a component edge hands its child the ids of its callback symbols under. */
export const MARKLESS_SSR_CALLBACKS_PROP = '__marklessSsrCallbacks';
type SsrChildProps = Readonly<Record<string, unknown>> & {
	readonly __marklessSsrCallbacks?: Readonly<Record<string, string>>;
};
export type MarklessSsrComposedChild = ComposeChild & {
	readonly asyncBoundaryId?: string;
	readonly callbackProps?: Readonly<Record<string, string>>;
	readonly output?: SsrChildOutput;
};
type SsrComposedChild = MarklessSsrComposedChild;
// The composed child once its rendered view is known: composition also carries
// the child's external symbol ids as a lookup set.
type SsrChildData = SsrComposedChild & {
	readonly view: SsrViewDraft;
	readonly externalSymbolIds: Set<string>;
};
// Prefixing only needs the child's identity fields, so arm-record prefixing
// accepts any composed child shape carrying them.
type SsrPrefixChild = {
	readonly hostPrefix: string;
	readonly symbolPrefix?: string;
	readonly boundSymbols?: Readonly<Record<string, string>>;
	readonly graphProps?: ComposeGraphProps;
	readonly externalSymbolIds?: ReadonlySet<string>;
};
type SsrBranchArmSelection = { readonly id: string; readonly takenArm: number };
type SsrAsyncSnapshot = {
	readonly status: string;
	readonly version: number;
	readonly key?: unknown;
	readonly value?: unknown;
	readonly error?: unknown;
};
type SsrAsyncSnapshotEntry = {
	readonly graphNodeId: string;
	readonly snapshot: SsrAsyncSnapshot;
};
type SsrAsyncRead = (graphNodeId: string, path?: ReadonlyArray<string>) => unknown;
type SsrAsyncRunner = (context: {
	readonly key: unknown;
	readonly signal: AbortSignal;
	readonly read: SsrAsyncRead;
}) => unknown;
type SsrAsyncRunnerDefinition = {
	readonly run: SsrAsyncRunner;
	readonly dependencies?: ReadonlyArray<string>;
	readonly async?: boolean;
};
type SsrAsyncRunEntry = {
	async?: boolean;
	promise?: Promise<SsrAsyncSnapshot>;
	settled?: SsrAsyncSnapshot;
};
type SsrAsyncRuns = Map<string, SsrAsyncRunEntry>;
type SsrRenderContext = SsrRecord & {
	readonly prerender?: boolean;
	readonly prerenderSettle?: {
		readonly graph?: {
			readonly read: (graphNodeId: string, path: ReadonlyArray<string>) => SsrAsyncSnapshot;
		};
	};
	readonly streaming?: {
		readonly runs?: SsrAsyncRuns;
		readonly signal?: AbortSignal;
		readonly prestart?: boolean;
		readonly deadline?: Promise<unknown>;
	};
};
// The SSR locator array doubles as the counter for elements that render
// without a locator of their own (repeat rows, async arm hosts).
export type MarklessSsrHostLocator = {
	readonly hostNodeId: string;
	readonly strategy: 'dom-order';
	readonly index: number;
	readonly tagName: string;
};
export type MarklessSsrHostLocators = Array<MarklessSsrHostLocator> & {
	marklessSsrExtraElements?: number;
};

export { marklessComposeState };
export const marklessSsrRemapChildGraph = marklessCsrRemapChildGraph;
export const marklessSsrRemapGraphOutput = marklessCsrRemapGraphOutput;

// The compiled module a composed child was imported from may serve several
// components. The child names the one it declared, so its own SSR entry
// answers; a module with a single entry has no map and answers as itself.
export function marklessSsrComponentPart(
	component: SsrChildComponent | undefined,
	componentName: string,
): SsrChildComponent | undefined {
	return component?.renderSsrComponents?.[componentName] ?? component;
}

// Asks a projecting child for the shared-instance seeds its body writes. Only a
// child the compiler marked as seeding is asked, so every other child renders once.
export async function marklessSsrSeedChild(
	component: SsrChildComponent | undefined,
	componentName: string | undefined,
	props: SsrChildProps | undefined,
	renderContext: unknown,
	sharedSeeds: Map<string, unknown>,
): Promise<void> {
	const part = componentName ? marklessSsrComponentPart(component, componentName) : component;
	const render = part?.renderSsr;
	if (!render?.marklessSeedsShared) return;
	await render(props, {
		...(renderContext as Record<string, unknown> | undefined),
		marklessSharedSeeds: sharedSeeds,
	});
}

/** The widget families a placed child roots; a child that roots none costs an undefined read. */
export function marklessSsrWidgetRoots(
	component: SsrChildComponent | undefined,
	componentName: string | undefined,
): ReadonlyArray<string> {
	const part = componentName ? marklessSsrComponentPart(component, componentName) : component;
	return part?.renderSsr?.marklessWidgetRoots ?? [];
}

/**
 * Where a placed child's own composition puts the children written into it: the
 * instance path of the composed widget root that encloses them, empty when no
 * composed root does. The child declared it at build time, so the parts written
 * into that child resolve to the root COMPOSITION placed them in.
 */
export function marklessSsrChildrenWidgetRoot(
	component: SsrChildComponent | undefined,
	componentName: string | undefined,
): string {
	const part = componentName ? marklessSsrComponentPart(component, componentName) : component;
	return part?.renderSsr?.marklessChildrenWidgetRoot ?? '';
}

/**
 * What `{...rest}` on a child COMPONENT tag hands the child: the props object
 * this component was handed, minus the names its signature destructured out of
 * the rest binding. Function props do not travel this way - a consumer handler
 * crosses the edge as a view record, written where the composition seam knows
 * the host it lands on - so the callback channel never rides along.
 */
export function marklessSsrSpreadProps(
	value: unknown,
	excludeNames: ReadonlyArray<string> = [],
): Record<string, unknown> {
	const carried: Record<string, unknown> = {};
	if (!value || typeof value !== 'object') return carried;
	for (const [name, entry] of Object.entries(value as Record<string, unknown>))
		// `__markless` is the framework's own reserved prefix for the channels a
		// parent render arranges with a child; none of them is a prop anyone wrote.
		if (
			typeof entry !== 'function' &&
			name !== 'children' &&
			!name.startsWith('__markless') &&
			!excludeNames.includes(name)
		)
			carried[name] = entry;
	return carried;
}

/**
 * Whether a placed child ends this widget's seed phase: it roots a family this
 * root started, so it and everything under it belong to their own instance.
 */
export function marklessSsrWidgetBoundary(
	families: ReadonlyArray<string>,
	component: SsrChildComponent | undefined,
	componentName: string | undefined,
): boolean {
	if (families.length === 0) return false;
	return marklessSsrWidgetRoots(component, componentName).some((definitionId) =>
		families.includes(definitionId),
	);
}

export async function marklessSsrRenderChild(
	children: SsrComposedChild[],
	component: SsrChildComponent | undefined,
	props: SsrChildProps | undefined,
	child: SsrComposedChild,
	renderContext?: SsrRenderContext,
) {
	const output = await component?.renderSsr?.(props, renderContext);
	if (!output) return '';
	const entry = {
		...child,
		output,
		callbackProps: props?.__marklessSsrCallbacks ?? {},
	};
	children.push(entry);
	return output.html ?? '';
}
/**
 * The runtime instance segment one `@for` row contributes. A KEYED row has an
 * identity of its own, so everything composed inside it — payload entries,
 * seeds, minted ids, event routes — hangs off `r:<key>:`. An unkeyed row has no
 * identity to carry and contributes nothing.
 */
export function marklessSsrRowSegment(repeatKey: unknown): string {
	return repeatKey === undefined ? '' : marklessRowSegment(repeatKey);
}

/** Places a composed child inside its row: the row segment leads the edge's own prefixes. */
export function marklessSsrRowPlacement<
	T extends { readonly hostPrefix: string; readonly symbolPrefix: string },
>(child: T, repeatKey: unknown): T {
	const segment = marklessSsrRowSegment(repeatKey);
	if (!segment) return child;
	return {
		...child,
		hostPrefix: segment + child.hostPrefix,
		symbolPrefix: segment + child.symbolPrefix,
	};
}

// Component invocation inside a keyed repeat row: rows repeat, so no composed
// child record can exist — the child contributes MARKUP ONLY. Interactive
// child output (own state, events, async content) would silently die after
// resume, so it refuses loudly instead (D2). Prop-keyed dom updates are
// allowed: prop values are static per row instance.
export async function marklessSsrRowChild(
	component: SsrChildComponent | undefined,
	props: SsrChildProps | undefined,
	componentName: string,
) {
	const output = await component?.renderSsr?.(props);
	if (!output) return '';
	marklessAssertPresentationalRowChild(output, componentName);
	return output.html ?? '';
}
export function marklessAssertPresentationalRowChild(
	output: SsrChildOutput,
	componentName: string,
) {
	const view = output.view;
	const state = output.state;
	const interactive =
		(view?.events?.length ?? 0) > 0 ||
		(view?.behaviors?.length ?? 0) > 0 ||
		(view?.elementHandles?.length ?? 0) > 0 ||
		(view?.branches?.length ?? 0) > 0 ||
		(view?.asyncBoundaries?.length ?? 0) > 0 ||
		(view?.domUpdates ?? []).some(
			(update) => !String(update.graphNodeId).startsWith('prop:'),
		) ||
		(state?.cells?.length ?? 0) > 0 ||
		(state?.computed?.length ?? 0) > 0 ||
		(output.propEvents?.length ?? 0) > 0;
	if (!interactive) return;
	const message = `MARKLESS_ROW_COMPONENT_INTERACTIVE: <${componentName}> inside a @for row keyed by position has its own state, events, or async content, so its interactions cannot resume: an index key carries no row value to route them to. Key the @for by a stable field of the item, or keep components in index-keyed rows presentational (markup from item props, like <Link>).`;
	const error = new Error(message) as Error & Record<string, unknown>;
	error.code = 'MARKLESS_ROW_COMPONENT_INTERACTIVE';
	error.severity = 'error';
	error.phase = 'runtime';
	error.componentName = componentName;
	error.docsUrl = 'https://markless.dev/errors/MARKLESS_ROW_COMPONENT_INTERACTIVE';
	throw error;
}
export function marklessSsrBranchArm(
	branches: SsrBranchArmSelection[],
	id: string,
	takenArm: number,
) {
	branches.push({ id, takenArm });
	return '';
}
export async function marklessSsrRunAsyncComputed(
	snapshots: SsrAsyncSnapshotEntry[],
	graphNodeId: string,
	run: SsrAsyncRunner,
	renderContext?: SsrRenderContext,
	hasPendingArm?: boolean,
	runnerDefinitions?: ReadonlyMap<string, SsrAsyncRunnerDefinition>,
	requestRuns?: SsrAsyncRuns,
) {
	// Prerender records preserve the authored pending arm without executing a
	// request-dependent runner at build time or during browser-side derivation.
	// The resumed graph owns the one real runner invocation after self-wake.
	if (renderContext?.prerender === true) {
		const snapshot: SsrAsyncSnapshot = { status: 'pending', version: 1, key: null };
		marklessSsrUpsertAsyncComputedSnapshot(graphNodeId, snapshot, snapshots);
		return snapshot;
	}
	if (renderContext?.prerenderSettle?.graph) {
		const snapshot = renderContext.prerenderSettle.graph.read(graphNodeId, []);
		marklessSsrUpsertAsyncComputedSnapshot(graphNodeId, snapshot, snapshots);
		return snapshot;
	}
	// Streaming mode (T107, owner-ratified three-layer semantics): the render
	// context carries a per-request runner registry. run() executes ONCE per
	// graph node across streaming passes; re-render passes reuse the in-flight
	// promise. Boundary tier: an authored @pending arm IS the streaming opt-in
	// (hasPendingArm) — a @try without @pending HOLDS the stream (awaits).
	// Per-request tier: runners get until the shared first-flush deadline to
	// settle inline; only still-pending boundaries stream.
	const streaming = renderContext?.streaming;
	const definitions: ReadonlyMap<string, SsrAsyncRunnerDefinition> =
		runnerDefinitions ?? new Map([[graphNodeId, { run, dependencies: [] }]]);
	const runs: SsrAsyncRuns = streaming?.runs ?? requestRuns ?? new Map();
	const entry = marklessSsrEnsureAsyncComputedRun(
		graphNodeId,
		definitions,
		runs,
		snapshots,
		new Set(),
		streaming?.signal,
	);
	if (!entry) {
		const snapshot: SsrAsyncSnapshot = {
			status: 'rejected',
			version: 1,
			key: null,
			error: undefined,
		};
		marklessSsrUpsertAsyncComputedSnapshot(graphNodeId, snapshot, snapshots);
		return snapshot;
	}
	if (streaming?.runs) {
		// Discovery pass (C1 parallel runner starts): the first streaming pass
		// only STARTS runners — it never awaits one and never consumes the
		// first-flush deadline, so every boundary's runner is in flight before
		// the real render pass races any of them against the shared deadline.
		if (streaming.prestart) {
			const snapshot: SsrAsyncSnapshot = entry.settled ?? {
				status: 'pending',
				version: 1,
				key: null,
			};
			marklessSsrMaterializeAsyncComputedSnapshots(runs, snapshots, definitions, graphNodeId);
			return snapshot;
		}
		if (!entry.settled) {
			if (hasPendingArm !== true) await entry.promise;
			else if (streaming.deadline) await Promise.race([entry.promise, streaming.deadline]);
		}
		const snapshot: SsrAsyncSnapshot = entry.settled ?? {
			status: 'pending',
			version: 1,
			key: null,
		};
		marklessSsrMaterializeAsyncComputedSnapshots(runs, snapshots, definitions, graphNodeId);
		return snapshot;
	}
	const snapshot = await entry.promise;
	marklessSsrMaterializeAsyncComputedSnapshots(runs, snapshots, definitions, graphNodeId);
	return snapshot;
}

function marklessSsrEnsureAsyncComputedRun(
	graphNodeId: string,
	definitions: ReadonlyMap<string, SsrAsyncRunnerDefinition>,
	runs: SsrAsyncRuns,
	snapshots: ReadonlyArray<SsrAsyncSnapshotEntry>,
	visiting: ReadonlySet<string> = new Set(),
	signal?: AbortSignal,
): SsrAsyncRunEntry | undefined {
	if (visiting.has(graphNodeId)) {
		const snapshot: SsrAsyncSnapshot = {
			status: 'rejected',
			version: 1,
			key: null,
			error: undefined,
		};
		return { settled: snapshot, promise: Promise.resolve(snapshot) };
	}
	const existing = runs.get(graphNodeId);
	if (existing) return existing;

	const definition = definitions.get(graphNodeId);
	if (!definition) return undefined;

	// Install the entry before traversing dependencies. Besides deduplicating
	// arbitrary document order, this prevents a malformed cycle from creating
	// unbounded recursive entries; valid computed graphs remain acyclic.
	const entry: SsrAsyncRunEntry = {};
	entry.async = definition.async !== false;
	runs.set(graphNodeId, entry);
	const dependencyPath = new Set(visiting);
	dependencyPath.add(graphNodeId);
	entry.promise = Promise.resolve()
		.then(async (): Promise<SsrAsyncSnapshot> => {
			const dependencyEntries = [...new Set(definition.dependencies ?? [])].flatMap(
				(dependencyGraphNodeId) => {
					const dependency = marklessSsrEnsureAsyncComputedRun(
						dependencyGraphNodeId,
						definitions,
						runs,
						snapshots,
						dependencyPath,
						signal,
					);
					return dependency ? [dependency] : [];
				},
			);
			const dependencySnapshots = await Promise.all(
				dependencyEntries.map((dependency) => dependency.promise),
			);
			const rejected = dependencySnapshots.find(
				(snapshot) => snapshot?.status === 'rejected',
			);
			if (rejected) {
				return {
					status: 'rejected',
					version: 1,
					key: null,
					error: rejected.error,
				};
			}
			return marklessSsrSettleAsyncComputed(
				definition.run,
				(readGraphNodeId, path) =>
					marklessSsrReadAsyncComputedSnapshot(readGraphNodeId, path, runs, snapshots),
				signal,
			);
		})
		.then((settledSnapshot) => {
			entry.settled = settledSnapshot;
			return settledSnapshot;
		});
	return entry;
}

function marklessSsrMaterializeAsyncComputedSnapshots(
	runs: SsrAsyncRuns,
	snapshots: SsrAsyncSnapshotEntry[],
	definitions: ReadonlyMap<string, SsrAsyncRunnerDefinition>,
	graphNodeId: string,
) {
	const dependencyClosure = new Set([graphNodeId]);
	for (const candidateGraphNodeId of dependencyClosure)
		for (const dependencyGraphNodeId of definitions.get(candidateGraphNodeId)?.dependencies ??
			[])
			dependencyClosure.add(dependencyGraphNodeId);
	for (const candidateGraphNodeId of dependencyClosure) {
		const entry = runs.get(candidateGraphNodeId);
		if (!entry) continue;
		if (entry.async === false) continue;
		const snapshot: SsrAsyncSnapshot = entry.settled ?? {
			status: 'pending',
			version: 1,
			key: null,
		};
		marklessSsrUpsertAsyncComputedSnapshot(candidateGraphNodeId, snapshot, snapshots);
	}
}

function marklessSsrUpsertAsyncComputedSnapshot(
	graphNodeId: string,
	snapshot: SsrAsyncSnapshot,
	snapshots: SsrAsyncSnapshotEntry[],
) {
	const index = snapshots.findIndex((entry) => entry.graphNodeId === graphNodeId);
	const next = { graphNodeId, snapshot };
	if (index === -1) snapshots.push(next);
}

function marklessSsrReadAsyncComputedSnapshot(
	graphNodeId: string,
	path: ReadonlyArray<string> = [],
	runs: SsrAsyncRuns,
	snapshots: ReadonlyArray<SsrAsyncSnapshotEntry>,
): unknown {
	const run = runs.get(graphNodeId);
	let value: unknown = run?.settled;
	if (run?.async === false && run.settled?.status === 'fulfilled') value = run.settled.value;
	if (value === undefined) {
		for (const entry of snapshots) {
			if (entry.graphNodeId === graphNodeId) value = entry.snapshot;
		}
	}
	for (const segment of path)
		value = (value as Readonly<Record<string, unknown>> | null | undefined)?.[segment];
	return value;
}

async function marklessSsrSettleAsyncComputed(
	run: SsrAsyncRunner,
	read: SsrAsyncRead,
	signal: AbortSignal = new AbortController().signal,
): Promise<SsrAsyncSnapshot> {
	try {
		const value = await run({ key: null, signal, read });
		return { status: 'fulfilled', version: 1, key: null, value };
	} catch (error) {
		return { status: 'rejected', version: 1, key: null, error };
	}
}
export function marklessSsrAttachSnapshots<T extends ComposeStateDraft>(
	state: T,
	snapshots: ReadonlyArray<SsrAsyncSnapshotEntry>,
) {
	if (snapshots.length === 0) return state;
	const byId = new Map(snapshots.map((entry) => [entry.graphNodeId, entry.snapshot]));
	// The record that replaces a composed state stands in for it at the level
	// above, so the render registry composition filed on it travels along.
	return marklessCarryWidgetRegistry(state, {
		...state,
		computed: (state.computed ?? []).map((computed) =>
			byId.has(computed.graphNodeId)
				? { ...computed, snapshot: byId.get(computed.graphNodeId) }
				: computed,
		),
	});
}
export function marklessSsrMergeBranches(
	payloadBranches: ReadonlyArray<SsrBranchRecord> | undefined,
	runtimeBranches: ReadonlyArray<SsrBranchArmSelection>,
) {
	const takenById = new Map(runtimeBranches.map((branch) => [branch.id, branch.takenArm]));
	return (payloadBranches ?? []).map((branch) =>
		takenById.has(branch.id) ? { ...branch, takenArm: takenById.get(branch.id) } : branch,
	);
}
export function marklessSsrAsyncArm(snapshot?: { readonly status?: string } | null) {
	return snapshot?.status === 'fulfilled'
		? ASYNC_BOUNDARY_ARM.try
		: snapshot?.status === 'rejected'
			? ASYNC_BOUNDARY_ARM.catch
			: ASYNC_BOUNDARY_ARM.pending;
}
export function marklessSsrArmHost(hostLocators: MarklessSsrHostLocators) {
	hostLocators.marklessSsrExtraElements = (hostLocators.marklessSsrExtraElements ?? 0) + 1;
	return '';
}
export function marklessSsrHost(
	hostLocators: MarklessSsrHostLocators,
	hostNodeId: string,
	tagName: string,
) {
	hostLocators.push({
		hostNodeId,
		strategy: 'dom-order',
		index: hostLocators.length + (hostLocators.marklessSsrExtraElements ?? 0),
		tagName,
	});
	return '';
}
export function marklessSsrCallbacks(callbacks: Readonly<Record<string, string | undefined>>) {
	const result: Record<string, string> = {};
	for (const key of Object.keys(callbacks)) {
		const callback = callbacks[key];
		if (callback) result[key] = callback;
	}
	return result;
}
/**
 * A callback slot's answer: the id of the symbol the composing module's own prop
 * was compiled into. It stays a live value rather than a serialized one so
 * composition can lift it into that composer's instance space; the serving
 * boundary serializes it with every other live cell.
 */
export function marklessSsrCallbackSlot(
	state: ComposeStateDraft,
	graphNodeId: string,
	symbolId: string | undefined,
) {
	const cell = state.cells?.find((candidate) => candidate.graphNodeId === graphNodeId);
	if (cell && symbolId !== undefined)
		Object.assign(cell, { value: undefined, directValue: symbolId });
}
export function marklessSsrCallbackSymbol(
	props: SsrChildProps | undefined,
	path: ReadonlyArray<string>,
) {
	let value: unknown = props?.__marklessSsrCallbacks;
	for (const key of path)
		value = (value as Readonly<Record<string, unknown>> | null | undefined)?.[key];
	return typeof value === 'string' ? value : undefined;
}
// An arm rebuild reads its props back out of the graph, which a CSR mount seeds
// and a served page must carry; `keys` narrows the bag, null means a lone prop.
export function marklessSsrSeedPropCells(
	state: ComposeStateDraft,
	props: Readonly<Record<string, unknown>> | undefined,
	cells: ReadonlyArray<{
		readonly graphNodeId: string;
		readonly keys: ReadonlyArray<string> | null;
	}>,
) {
	const seeded = cells.flatMap((cell) => {
		const name = cell.graphNodeId.slice('prop:'.length);
		const present = (cell.keys ?? []).filter((key) => props?.[key] !== undefined);
		if (cell.keys ? present.length === 0 : props?.[name] === undefined) return [];
		const value = cell.keys
			? Object.fromEntries(present.map((key) => [key, props?.[key]]))
			: props?.[name];
		return [
			{
				graphNodeId: cell.graphNodeId,
				name,
				valueKind: marklessSsrValueKind(value),
				value: marklessSerializeGraphValue(value),
			},
		];
	});
	if (seeded.length === 0) return state;
	return marklessCarryWidgetRegistry(state, {
		...state,
		cells: [...(state.cells ?? []), ...seeded],
	});
}

function marklessSsrValueKind(value: unknown) {
	if (Array.isArray(value)) return 'array' as const;
	if (value !== null && typeof value === 'object') return 'object' as const;
	return 'scalar' as const;
}

function marklessSsrUnbindLocalSymbolId(symbolId: string) {
	return marklessBaseSymbolId(symbolId) ?? symbolId;
}

function marklessSsrUnbindLocalRecordSet(set: SsrArmRecordSet) {
	for (const event of set.events ?? [])
		event.symbolIds = (event.symbolIds ?? []).map(marklessSsrUnbindLocalSymbolId);
	for (const update of set.domUpdates ?? [])
		if (update.symbolId) update.symbolId = marklessSsrUnbindLocalSymbolId(update.symbolId);
	for (const branch of set.branches ?? [])
		for (const arm of branch.armRecords ?? []) marklessSsrUnbindLocalRecordSet(arm);
	return set;
}

function marklessSsrUnbindLocalView(view: SsrViewDraft, localHostIds: ReadonlySet<string>) {
	const events = view.events.filter((event) => localHostIds.has(event.hostNodeId));
	for (const event of events)
		event.symbolIds = event.symbolIds.map(marklessSsrUnbindLocalSymbolId);
	const domUpdates = view.domUpdates.filter((update) => localHostIds.has(update.hostNodeId));
	for (const update of domUpdates)
		if (update.symbolId) update.symbolId = marklessSsrUnbindLocalSymbolId(update.symbolId);
	// Whose repeat this is, is a question about the markup that WROTE it: a
	// projected repeat renders into a child's element, so its parent host is never
	// one of this render's own locators.
	const keyedRepeats = (view.keyedRepeats ?? [])
		.filter((repeat) => localHostIds.has(repeat.ownerHostNodeId ?? repeat.parentHostNodeId))
		.map((repeat) => ({
			...repeat,
			rowEvents: repeat.rowEvents.map((event) => ({
				...event,
				symbolIds: event.symbolIds.map(marklessSsrUnbindLocalSymbolId),
			})),
		}));
	// A branch arm's records address a child component this module rebuilds from
	// compiled markup, so a bound id here is the capture route THIS module minted
	// for its own edge; unbinding it would drop the caller's captured values.
	for (const boundary of view.asyncBoundaries ?? []) {
		const sets = Array.isArray(boundary.armRecords)
			? boundary.armRecords
			: [boundary.armRecords];
		for (const set of sets) if (set) marklessSsrUnbindLocalRecordSet(set);
	}
	return {
		events,
		domUpdates,
		keyedRepeats,
		branches: [...(view.branches ?? [])],
		asyncBoundaries: [...(view.asyncBoundaries ?? [])],
	};
}

// View composition runs before state composition and registers the same widget
// roots, so both work against the ONE registry this level's children carry —
// this render's, never a render in flight beside it.
export function marklessSsrComposeView(
	structure: SsrDataStructure,
	view: SsrViewDraft,
	children: ReadonlyArray<SsrComposedChild>,
	asyncSnapshots: ReadonlyArray<SsrAsyncSnapshotEntry>,
	idPrefix = '',
) {
	return marklessWithWidgetRegistry(marklessComposeWidgetRegistry(children), () =>
		marklessSsrComposedView(structure, view, children, asyncSnapshots, idPrefix),
	);
}

function marklessSsrComposedView(
	structure: SsrDataStructure,
	view: SsrViewDraft,
	children: ReadonlyArray<SsrComposedChild>,
	asyncSnapshots: ReadonlyArray<SsrAsyncSnapshotEntry>,
	idPrefix = '',
) {
	// View composition qualifies child dom updates before state composition runs,
	// so the widget roots must be known by here or a widget's reads land on the
	// first widget of its family.
	marklessRegisterComposedWidgets(children);
	const renderedHostIds = new Set(structure.locators.map((locator) => locator.hostNodeId));
	const plannedArmHostIds = new Set(
		(view.asyncBoundaries ?? []).flatMap((boundary) => {
			const plannedArms: ReadonlyArray<SsrArmRecordSet> = Array.isArray(boundary.armRecords)
				? boundary.armRecords
				: [];
			return plannedArms.flatMap((arm) =>
				(arm.locators ?? []).map((locator) => locator.hostNodeId),
			);
		}),
	);
	const localHostIds = new Set(
		[...view.locators.map((locator) => locator.hostNodeId), ...plannedArmHostIds].flatMap(
			(hostNodeId) => (renderedHostIds.has(idPrefix + hostNodeId) ? [hostNodeId] : []),
		),
	);
	const childData = children
		.map((child) => ({
			...child,
			view: child.output?.view,
			externalSymbolIds: new Set(child.output?.externalSymbolIds ?? []),
		}))
		.filter((child): child is SsrChildData => Boolean(child.view));
	const locators: SsrLocatorRecord[] = [];
	const { events, domUpdates, keyedRepeats, branches, asyncBoundaries } =
		marklessSsrUnbindLocalView(view, localHostIds);
	const behaviors = view.behaviors.filter((behavior) => localHostIds.has(behavior.hostNodeId));
	const elementHandles = view.elementHandles.filter((handle) =>
		localHostIds.has(handle.hostNodeId),
	);
	const asyncRunners: Record<string, string> = { ...view.asyncRunners };
	const externalSymbolIds = new Set<string>();
	const boundaryArmBranches = new Map<string, SsrBranchRecord[]>();
	for (const child of childData) {
		if (child.view)
			marklessSsrAppendChildView({
				child,
				baseIndex: 0,
				locators,
				events,
				domUpdates,
				keyedRepeats,
				behaviors,
				elementHandles,
				branches,
				asyncBoundaries,
				asyncRunners,
				externalSymbolIds,
				boundaryArmBranches,
			});
	}
	const locatorByHostId = new Map<string, { readonly index: number; readonly tagName: string }>(
		structure.locators.map((locator) => [locator.hostNodeId, locator]),
	);
	for (const locator of view.locators.filter((candidate) =>
		localHostIds.has(candidate.hostNodeId),
	)) {
		const rendered = locatorByHostId.get(idPrefix + locator.hostNodeId);
		if (!rendered) throw new Error(`MARKLESS_SSR_DATA_HOST_MISSING: ${locator.hostNodeId}`);
		locators.push({ ...locator, index: rendered.index, tagName: rendered.tagName });
	}
	for (const locator of locators) {
		const rendered = locatorByHostId.get(idPrefix + locator.hostNodeId);
		if (rendered) Object.assign(locator, { index: rendered.index, tagName: rendered.tagName });
	}
	locators.sort((a, b) => a.index - b.index);
	const boundariesWithComposedBranches = asyncBoundaries.map((boundary) => {
		const composed = boundaryArmBranches.get(boundary.id);
		if (!composed?.length || !Array.isArray(boundary.armRecords)) return boundary;
		return {
			...boundary,
			armRecords: boundary.armRecords.map((arm, index) =>
				index === 0
					? { ...arm, branches: [...(arm.branches ?? []), ...composed] }
					: arm,
			),
		};
	});
	const armizedBoundaries = marklessSsrArmizeBoundaries(
		structure,
		marklessSsrResolveAnchorRecords(
			structure,
			'async',
			boundariesWithComposedBranches,
			idPrefix,
		),
		{ locators, events, domUpdates, behaviors, elementHandles, keyedRepeats },
		asyncSnapshots,
		idPrefix,
	);
	const renderedBranchIds = new Set(
		structure.anchors
			.filter((anchor) => anchor.kind === 'branch')
			.map((anchor) => anchor.id),
	);
	const composedBranches = marklessSsrArmizeBranches(
		structure,
		marklessSsrResolveAnchorRecords(
			structure,
			'branch',
			branches.filter((branch) => renderedBranchIds.has(idPrefix + branch.id)),
			idPrefix,
		),
		{ locators, events, domUpdates, behaviors, elementHandles, keyedRepeats },
		idPrefix,
	);
	return {
		view: {
			...view,
			locators,
			events,
			domUpdates,
			keyedRepeats,
			behaviors,
			elementHandles,
			branches: composedBranches,
			asyncBoundaries: armizedBoundaries,
			...(Object.keys(asyncRunners).length > 0 ? { asyncRunners } : {}),
		},
		elementCount: structure.elementCount,
		externalSymbolIds: [...externalSymbolIds],
	};
}
// D3 arm-relative coordinates: renderData structure is the truth for which arm
// a boundary served and where its elements sit. The structural element range
// at the anchor gives the arm's page offset; every flat record in that range
// pair moves into boundary.armRecords with anchor-relative indexes, and the
// taken arm's compile-time record set (events/behaviors/handles keyed by
// hostNodeId) merges in. Composed children inside arms are covered by the
// same positional move, so no page-absolute offset surgery remains for arms.
export function marklessSsrArmizeBoundaries(
	structure: SsrDataStructure,
	boundaries: ReadonlyArray<SsrBoundaryRecord>,
	streams: {
		locators: SsrLocatorRecord[];
		events: SsrEventRecord[];
		domUpdates: SsrDomUpdateRecord[];
		behaviors: SsrBehaviorRecord[];
		elementHandles: SsrHostedRecord[];
		keyedRepeats: SsrKeyedRepeatRecord[];
	},
	asyncSnapshots: ReadonlyArray<SsrAsyncSnapshotEntry> | undefined,
	idPrefix = '',
) {
	if (boundaries.length === 0) return boundaries;
	const anchorById = new Map<string, { readonly elementStart: number; readonly elementEnd: number }>(
		structure.anchors
			.filter((anchor) => anchor.kind === 'async')
			.map((anchor) => [anchor.id, anchor]),
	);
	// Keyed by the possibly-null runner id so a boundary without a runner looks
	// up (and misses) exactly as it did untyped.
	const snapshotById = new Map<string | null | undefined, SsrAsyncSnapshot | undefined>(
		(asyncSnapshots ?? []).map((entry) => [entry.graphNodeId, entry.snapshot]),
	);
	return boundaries.map((boundary) => {
		// Child-composed boundaries already carry a single armized record set;
		// arm-relative coordinates survive composition untouched.
		if (!Array.isArray(boundary.armRecords)) return boundary;
		const plannedArms: ReadonlyArray<SsrArmRecordSet> = boundary.armRecords;
		const anchor = anchorById.get(idPrefix + boundary.id);
		if (!anchor) throw new Error(`MARKLESS_SSR_DATA_ANCHOR_MISSING: async:${boundary.id}`);
		const opensStart = anchor.elementStart;
		const opensEnd = anchor.elementEnd;
		const armLocators: SsrLocatorRecord[] = [];
		for (let i = streams.locators.length - 1; i >= 0; i--) {
			const locator = streams.locators[i];
			if (locator.index < opensStart || locator.index >= opensEnd) continue;
			armLocators.unshift({
				...locator,
				strategy: 'arm-relative',
				index: locator.index - opensStart,
			});
			streams.locators.splice(i, 1);
		}
		const armHostIds = new Set(armLocators.map((locator) => locator.hostNodeId));
		const moved: {
			events: SsrEventRecord[];
			domUpdates: SsrDomUpdateRecord[];
			behaviors: SsrBehaviorRecord[];
			elementHandles: SsrHostedRecord[];
		} = { events: [], domUpdates: [], behaviors: [], elementHandles: [] };
		for (const key of Object.keys(moved) as ReadonlyArray<keyof typeof moved>) {
			const records: SsrHostedRecord[] = streams[key] ?? [];
			for (let i = records.length - 1; i >= 0; i--) {
				if (armHostIds.has(records[i].hostNodeId))
					(moved[key] as SsrHostedRecord[]).unshift(...records.splice(i, 1));
			}
		}
		const directStatus = snapshotById.get(boundary.runnerGraphNodeId)?.status;
		// Authored sync gates are the recorded settle nodes, while their snapshots
		// are derived request-locally and intentionally absent from the serialized
		// async snapshot list. In that case the expanded async-read closure tells us
		// which arm SSR actually served.
		const dependencyStatuses = (boundary.asyncReads ?? [])
			.filter((read) => read.runnerSymbolId)
			.map((read) => snapshotById.get(read.graphNodeId)?.status);
		const status =
			directStatus ??
			(dependencyStatuses.includes('rejected')
				? 'rejected'
				: dependencyStatuses.length > 0 &&
					  dependencyStatuses.every((candidate) => candidate === 'fulfilled')
					? 'fulfilled'
					: 'pending');
		const takenArm =
			status === 'fulfilled'
				? ASYNC_BOUNDARY_ARM.try
				: status === 'rejected'
					? ASYNC_BOUNDARY_ARM.catch
					: ASYNC_BOUNDARY_ARM.pending;
		const planned: SsrArmRecordSet = plannedArms[takenArm] ?? {};
		const renderedArmLocators = new Map<string, SsrDataStructure['locators'][number]>();
		for (const locator of structure.locators) {
			if (locator.index < opensStart || locator.index >= opensEnd) continue;
			if (!renderedArmLocators.has(locator.hostNodeId))
				renderedArmLocators.set(locator.hostNodeId, locator);
		}
		for (const locator of planned.locators ?? []) {
			const rendered = renderedArmLocators.get(idPrefix + locator.hostNodeId);
			if (!rendered) continue;
			if (armLocators.some((candidate) => candidate.hostNodeId === locator.hostNodeId))
				continue;
			armLocators.push({
				...locator,
				strategy: 'arm-relative',
				index: rendered.index - opensStart,
				tagName: rendered.tagName,
			});
		}
		armLocators.sort((left, right) => left.index - right.index);
		const completeArmHostIds = new Set(armLocators.map((locator) => locator.hostNodeId));
		const movedKeyedRepeats: SsrKeyedRepeatRecord[] = [];
		for (let i = (streams.keyedRepeats ?? []).length - 1; i >= 0; i--) {
			if (completeArmHostIds.has(streams.keyedRepeats[i].parentHostNodeId))
				movedKeyedRepeats.unshift(...streams.keyedRepeats.splice(i, 1));
		}
		const keyedRepeats = [...(planned.keyedRepeats ?? []), ...movedKeyedRepeats];
		return {
			...boundary,
			initiallyServedArm: takenArm,
			armRecords: {
				locators: armLocators,
				events: [...(planned.events ?? []), ...moved.events],
				domUpdates: [...(planned.domUpdates ?? []), ...moved.domUpdates],
				behaviors: [...(planned.behaviors ?? []), ...moved.behaviors],
				elementHandles: [...(planned.elementHandles ?? []), ...moved.elementHandles],
				...(keyedRepeats.length > 0 ? { keyedRepeats } : {}),
				// Arm-scoped branch records (flips + escalations) ride the taken
				// arm's planned set; resume resolves their anchors arm-locally.
				branches: planned.branches ?? [],
			},
		};
	});
}
// An escalating branch holds a component that has to run, so a flip replaces its
// range wholesale rather than rebuilding markup. Its served records therefore
// have to leave the page-absolute streams and become arm-relative, exactly as a
// boundary arm's do. Nothing else armizes: a page with no escalating branch
// keeps every record where it was, byte for byte.
export function marklessSsrArmizeBranches(
	structure: SsrDataStructure,
	branches: ReadonlyArray<SsrBranchRecord>,
	streams: {
		locators: SsrLocatorRecord[];
		events: SsrEventRecord[];
		domUpdates: SsrDomUpdateRecord[];
		behaviors: SsrBehaviorRecord[];
		elementHandles: SsrHostedRecord[];
		keyedRepeats: SsrKeyedRepeatRecord[];
	},
	idPrefix = '',
): ReadonlyArray<SsrBranchRecord> {
	if (!branches.some((branch) => branch.escalates === true)) return branches;
	const anchorById = new Map(
		structure.anchors
			.filter((anchor) => anchor.kind === 'branch')
			.map((anchor) => [anchor.id, anchor] as const),
	);
	return branches.map((branch) => {
		if (branch.escalates !== true) return branch;
		// A branch lifted from a child already armized its own arm inside that
		// child's composition; its records left these streams there, so moving
		// the range again would overwrite the set with an empty one.
		if (branch.servedArmRecords) return branch;
		const anchor = anchorById.get(idPrefix + branch.id);
		if (!anchor) throw new Error(`MARKLESS_SSR_DATA_ANCHOR_MISSING: branch:${branch.id}`);
		return { ...branch, servedArmRecords: marklessSsrMoveArmRange(streams, anchor) };
	});
}

function marklessSsrMoveArmRange(
	streams: {
		locators: SsrLocatorRecord[];
		events: SsrEventRecord[];
		domUpdates: SsrDomUpdateRecord[];
		behaviors: SsrBehaviorRecord[];
		elementHandles: SsrHostedRecord[];
		keyedRepeats: SsrKeyedRepeatRecord[];
	},
	anchor: { readonly elementStart: number; readonly elementEnd: number },
): SsrArmRecordSet {
	const armLocators: SsrLocatorRecord[] = [];
	for (let i = streams.locators.length - 1; i >= 0; i--) {
		const locator = streams.locators[i];
		if (locator.index < anchor.elementStart || locator.index >= anchor.elementEnd) continue;
		armLocators.unshift({
			...locator,
			strategy: 'arm-relative',
			index: locator.index - anchor.elementStart,
		});
		streams.locators.splice(i, 1);
	}
	const armHostIds = new Set(armLocators.map((locator) => locator.hostNodeId));
	const moved: {
		events: SsrEventRecord[];
		domUpdates: SsrDomUpdateRecord[];
		behaviors: SsrBehaviorRecord[];
		elementHandles: SsrHostedRecord[];
	} = { events: [], domUpdates: [], behaviors: [], elementHandles: [] };
	for (const key of Object.keys(moved) as ReadonlyArray<keyof typeof moved>) {
		const records: SsrHostedRecord[] = streams[key] ?? [];
		for (let i = records.length - 1; i >= 0; i--) {
			if (armHostIds.has(records[i].hostNodeId))
				(moved[key] as SsrHostedRecord[]).unshift(...records.splice(i, 1));
		}
	}
	const keyedRepeats: SsrKeyedRepeatRecord[] = [];
	for (let i = (streams.keyedRepeats ?? []).length - 1; i >= 0; i--) {
		if (armHostIds.has(streams.keyedRepeats[i].parentHostNodeId))
			keyedRepeats.unshift(...streams.keyedRepeats.splice(i, 1));
	}
	armLocators.sort((left, right) => left.index - right.index);
	return {
		locators: armLocators,
		events: moved.events,
		domUpdates: moved.domUpdates,
		behaviors: moved.behaviors,
		elementHandles: moved.elementHandles,
		...(keyedRepeats.length > 0 ? { keyedRepeats } : {}),
		branches: [],
	};
}

export function marklessSsrIsArmBranchAnchor(text: unknown) {
	return (
		typeof text === 'string' &&
		(text.startsWith('markless:arm-branch:') || text.startsWith('/markless:arm-branch:'))
	);
}

export function marklessSsrAppendChildView(context: {
	readonly child: SsrChildData;
	readonly baseIndex: number;
	readonly locators: SsrLocatorRecord[];
	readonly events: SsrEventRecord[];
	readonly domUpdates: SsrDomUpdateRecord[];
	readonly keyedRepeats: SsrKeyedRepeatRecord[];
	readonly behaviors: SsrBehaviorRecord[];
	readonly elementHandles: SsrHostedRecord[];
	readonly branches: SsrBranchRecord[];
	readonly asyncBoundaries: SsrBoundaryRecord[];
	readonly asyncRunners: Record<string, string>;
	readonly externalSymbolIds: Set<string>;
	readonly boundaryArmBranches: Map<string, SsrBranchRecord[]>;
}) {
	const childView = context.child.view;
	const propEvents = context.child.output?.propEvents ?? [];
	const callbackProps = context.child.callbackProps ?? {};
	const callbackSymbolIds = new Map<string, string>();
	for (const event of childView.events) {
		const propEvent = propEvents.find(
			(item) => item.hostNodeId === event.hostNodeId && item.eventName === event.eventName,
		);
		const callbackSymbolId = propEvent ? callbackProps[propEvent.propName] : undefined;
		if (callbackSymbolId)
			for (const symbolId of event.symbolIds)
				callbackSymbolIds.set(symbolId, callbackSymbolId);
	}
	const childInstancePath = marklessComposedInstancePath(context.child);
	for (const [graphNodeId, symbolId] of Object.entries<string>(childView.asyncRunners ?? {})) {
		const mapped = marklessSsrRemapChildGraph(
			{ graphNodeId, path: [] },
			context.child.graphProps,
			childInstancePath,
		);
		context.asyncRunners[mapped?.graphNodeId ?? graphNodeId] = marklessBoundSymbolId(
			context.child,
			symbolId,
		);
	}
	for (const locator of childView.locators)
		context.locators.push({
			...locator,
			hostNodeId: context.child.hostPrefix + locator.hostNodeId,
			index: context.baseIndex + locator.index,
		});
	for (const event of childView.events) {
		const propEvent = propEvents.find(
			(item) => item.hostNodeId === event.hostNodeId && item.eventName === event.eventName,
		);
		const callbackSymbolId = propEvent ? callbackProps[propEvent.propName] : undefined;
		const symbolIds = callbackSymbolId
			? [callbackSymbolId]
			: event.symbolIds.map((symbolId) =>
					context.child.externalSymbolIds.has(symbolId)
						? symbolId
						: marklessBoundSymbolId(context.child, symbolId),
				);
		for (const symbolId of symbolIds)
			if (callbackSymbolId || context.child.externalSymbolIds.has(symbolId))
				context.externalSymbolIds.add(symbolId);
		const composed = {
			...event,
			hostNodeId: context.child.hostPrefix + event.hostNodeId,
			symbolIds,
			...(event.syncPolicy
				? {
						syncPolicy: marklessComposedSyncPolicy(
							event.syncPolicy,
							context.child.graphProps,
							childInstancePath,
						),
					}
				: {}),
		};
		// The consumer's `{...rest}` handler for this same element was forwarded
		// into the PARENT's payload, so the part's own record and the consumer's
		// only meet here. One element, one listener list: they merge into one
		// record with the part's own symbols first - a part writes its handler
		// expecting to act, and a consumer passing one through is adding to that.
		// Merging here rather than in a resumer keeps every entry (full resume,
		// lean event-only, CSR) reading one already-ordered record.
		const forwardedAt = context.events.findIndex(
			(held) =>
				held.hostNodeId === composed.hostNodeId && held.eventName === composed.eventName,
		);
		if (forwardedAt < 0) {
			context.events.push(composed);
			continue;
		}
		const forwarded = context.events[forwardedAt]!;
		context.events[forwardedAt] = {
			...composed,
			...(composed.syncPolicy || !forwarded.syncPolicy
				? {}
				: { syncPolicy: forwarded.syncPolicy }),
			symbolIds: [
				...composed.symbolIds,
				...forwarded.symbolIds.filter((symbolId) => !composed.symbolIds.includes(symbolId)),
			],
		};
	}
	for (const update of childView.domUpdates) {
		const mapped = marklessCsrRemapChildDomUpdate(
			update,
			context.child.graphProps,
			context.child.hostPrefix,
			childInstancePath,
		);
		if (!mapped) continue;
		context.domUpdates.push({
			...update,
			hostNodeId: context.child.hostPrefix + update.hostNodeId,
			graphNodeId: mapped.graphNodeId,
			path: mapped.path,
			...(update.symbolId
				? { symbolId: marklessDomUpdateSymbolId(context.child, update.symbolId) }
				: {}),
		});
	}
	for (const repeat of childView.keyedRepeats ?? []) {
		const mapped = marklessCsrRemapChildKeyedRepeat(
			repeat,
			context.child.graphProps,
			context.child.hostPrefix,
			childInstancePath,
		);
		if (!mapped) continue;
		const rowEvents = repeat.rowEvents.map((event) => ({
			...event,
			...(event.syncPolicy
				? {
						syncPolicy: marklessComposedSyncPolicy(
							event.syncPolicy,
							context.child.graphProps,
							childInstancePath,
						),
					}
				: {}),
			symbolIds: event.symbolIds.map((symbolId) => {
				const callbackSymbolId = callbackSymbolIds.get(symbolId);
				if (callbackSymbolId) {
					context.externalSymbolIds.add(callbackSymbolId);
					return callbackSymbolId;
				}
				return marklessBoundSymbolId(context.child, symbolId);
			}),
		}));
		context.keyedRepeats.push({
			...repeat,
			id: context.child.hostPrefix + repeat.id,
			parentHostNodeId: context.child.hostPrefix + repeat.parentHostNodeId,
			...(repeat.ownerHostNodeId
				? { ownerHostNodeId: context.child.hostPrefix + repeat.ownerHostNodeId }
				: {}),
			collectionGraphNodeId: mapped.graphNodeId,
			collectionPath: mapped.path,
			rowEvents,
		});
	}
	for (const behavior of childView.behaviors)
		context.behaviors.push({
			...behavior,
			hostNodeId: context.child.hostPrefix + behavior.hostNodeId,
			...(behavior.inputGraphReads
				? {
						inputGraphReads: behavior.inputGraphReads.map((read) => {
							const mapped = marklessSsrRemapChildGraph(
								read,
								context.child.graphProps,
								childInstancePath,
							);
							return mapped
								? { ...read, graphNodeId: mapped.graphNodeId, path: mapped.path }
								: read;
						}),
					}
				: {}),
			...(behavior.symbolId
				? { symbolId: marklessBoundSymbolId(context.child, behavior.symbolId) }
				: {}),
		});
	// A widget-scoped handle id is one module-level string every instance of that
	// widget spells, so it takes the same qualification every other record's graph
	// ids take here. Without it the served payload files both instances' elements
	// under one key and the last one registered answers every handler on the page.
	for (const handle of childView.elementHandles)
		context.elementHandles.push({
			...handle,
			hostNodeId: context.child.hostPrefix + handle.hostNodeId,
			handleId: marklessWidgetHandleId(handle.handleId as string, childInstancePath),
		});
	for (const branch of childView.branches ?? []) {
		const liveTestReads = (branch.testReads ?? []).filter(
			(read) => !marklessCsrChildReadIsStatic(read, context.child.graphProps),
		);
		const armRecords = branch.armRecords?.map((arm) =>
			marklessSsrPrefixArmRecord(arm, context.child),
		);
		// An arm that renders text with no element of its own has no dom update to
		// carry; its content read refreshes the arm range through the branch
		// symbol, so it needs the same prop routing every other read gets.
		const liveContentReads = (branch.contentReads ?? []).filter(
			(read) => !marklessCsrChildReadIsStatic(read, context.child.graphProps),
		);
		// A branch decided only by an explicitly constant/absent prop has no live
		// parent route to re-decide it, but the arm it painted still owns records
		// that have to follow their values; it stays as a decide-less record.
		const decided = liveTestReads.length === 0;
		const {
			symbolId: childSymbolId,
			contentReads: _unmappedContentReads,
			composedInstancePath: _unroutedInstancePath,
			composedGraphProps: _unroutedGraphProps,
			...unwired
		} = branch;
		// Only the branch symbol can rebuild an arm, so a content read without one
		// has nothing to drive and never justifies keeping the record.
		const contentDriven = liveContentReads.length > 0 && Boolean(childSymbolId);
		if (decided && !contentDriven && !marklessSsrDecidedArmIsLive(branch, armRecords)) continue;
		const keepSymbol = Boolean(childSymbolId) && (!decided || contentDriven);
		const composedRoutes = keepSymbol
			? marklessSsrComposedBranchRoutes(branch, context.child, childInstancePath)
			: undefined;
		const mappedBranch = {
			...unwired,
			id: context.child.hostPrefix + branch.id,
			testReads: decided
				? []
				: marklessSsrRemapChildReads(
						liveTestReads,
						context.child.graphProps,
						context.child.hostPrefix + branch.id,
						childInstancePath,
					),
			...(keepSymbol && liveContentReads.length > 0
				? {
						contentReads: marklessSsrRemapChildReads(
							liveContentReads,
							context.child.graphProps,
							context.child.hostPrefix + branch.id,
							childInstancePath,
						),
					}
				: {}),
			...(keepSymbol
				? { symbolId: marklessBoundSymbolId(context.child, childSymbolId!) }
				: {}),
			...(armRecords ? { armRecords } : {}),
			...(composedRoutes?.props.length
				? {
						composedInstancePath: composedRoutes.instancePath,
						composedGraphProps: composedRoutes.props,
					}
				: {}),
			// The arm this child already served keeps its arm-relative
			// coordinates; only ids and symbols take the child's prefixes.
			...(branch.servedArmRecords
				? {
						servedArmRecords: marklessSsrPrefixBoundaryArmRecords(
							branch.servedArmRecords,
							context.child,
						),
					}
				: {}),
		};
		if (context.child.asyncBoundaryId) {
			const armBranches = context.boundaryArmBranches.get(context.child.asyncBoundaryId) ?? [];
			armBranches.push(mappedBranch);
			context.boundaryArmBranches.set(context.child.asyncBoundaryId, armBranches);
		} else {
			context.branches.push(mappedBranch);
		}
	}
	for (const boundary of childView.asyncBoundaries ?? [])
		context.asyncBoundaries.push({
			...boundary,
			id: context.child.hostPrefix + boundary.id,
			...(boundary.runnerGraphNodeId
				? {
						runnerGraphNodeId:
							marklessSsrRemapChildGraph(
								{ graphNodeId: boundary.runnerGraphNodeId, path: [] },
								context.child.graphProps,
								childInstancePath,
							)?.graphNodeId ?? boundary.runnerGraphNodeId,
					}
				: {}),
			asyncReads: marklessSsrRemapChildReads(
				boundary.asyncReads,
				context.child.graphProps,
				context.child.hostPrefix + boundary.id,
				childInstancePath,
			).map((read) => ({
				...read,
				...(read.runnerSymbolId
					? { runnerSymbolId: marklessBoundSymbolId(context.child, read.runnerSymbolId) }
					: {}),
			})),
			...(boundary.updateSymbolId
				? { updateSymbolId: marklessBoundSymbolId(context.child, boundary.updateSymbolId) }
				: {}),
			...(boundary.armRecords && !Array.isArray(boundary.armRecords)
				? {
						// The guard is the check; Array.isArray cannot narrow a
						// readonly-array member out of the union.
						armRecords: marklessSsrPrefixBoundaryArmRecords(
							boundary.armRecords as SsrArmRecordSet,
							context.child,
						),
					}
				: {}),
		});
}
// A child boundary's armized record set keeps its arm-relative coordinates
// through composition (the anchor is located live at resume); only host ids,
// symbol ids, and behavior graph reads need the child prefixes/remaps.
export function marklessSsrPrefixBoundaryArmRecords(
	set: SsrArmRecordSet,
	child: SsrPrefixChild,
) {
	const instancePath = marklessComposedInstancePath(child);
	const exhaustive = {
		locators: true,
		events: true,
		domUpdates: true,
		behaviors: true,
		elementHandles: true,
		keyedRepeats: true,
		branches: true,
	} satisfies Record<keyof import('../resume-types.ts').ResumeArmRecordSet, true>;
	void exhaustive;
	return {
		locators: (set.locators ?? []).map((locator) => ({
			...locator,
			hostNodeId: child.hostPrefix + locator.hostNodeId,
		})),
		events: (set.events ?? []).map((event) => ({
			...event,
			hostNodeId: child.hostPrefix + event.hostNodeId,
			symbolIds: (event.symbolIds ?? []).map((symbolId) =>
				child.externalSymbolIds?.has?.(symbolId)
					? symbolId
					: marklessBoundSymbolId(child, symbolId),
			),
			// An arm event's policy reads the graph by id like any other child event.
			...(event.syncPolicy
				? {
						syncPolicy: marklessComposedSyncPolicy(
							event.syncPolicy,
							child.graphProps,
							instancePath,
						),
					}
				: {}),
		})),
		domUpdates: (set.domUpdates ?? []).flatMap((update) => {
			const mapped = marklessCsrRemapChildDomUpdate(
				update,
				child.graphProps,
				child.hostPrefix,
				instancePath,
			);
			return mapped
				? [
						{
							...update,
							hostNodeId: child.hostPrefix + update.hostNodeId,
							graphNodeId: mapped.graphNodeId,
							path: mapped.path,
							...(update.symbolId
								? { symbolId: marklessBoundSymbolId(child, update.symbolId) }
								: {}),
						},
					]
				: [];
		}),
		behaviors: (set.behaviors ?? []).map((behavior) => ({
			...behavior,
			hostNodeId: child.hostPrefix + behavior.hostNodeId,
			...(behavior.inputGraphReads
				? {
						inputGraphReads: behavior.inputGraphReads.map((read) => {
							const mapped = marklessSsrRemapChildGraph(
								read,
								child.graphProps,
								instancePath,
							);
							return mapped
								? { ...read, graphNodeId: mapped.graphNodeId, path: mapped.path }
								: read;
						}),
					}
				: {}),
			...(behavior.symbolId
				? { symbolId: marklessBoundSymbolId(child, behavior.symbolId) }
				: {}),
		})),
		elementHandles: (set.elementHandles ?? []).map((handle) => ({
			...handle,
			hostNodeId: child.hostPrefix + handle.hostNodeId,
			handleId: marklessWidgetHandleId(handle.handleId as string, instancePath),
		})),
		keyedRepeats: (set.keyedRepeats ?? []).flatMap((repeat) => {
			const mapped = marklessCsrRemapChildKeyedRepeat(
				repeat,
				child.graphProps,
				child.hostPrefix,
				instancePath,
			);
			return mapped
				? [
						{
							...repeat,
							id: child.hostPrefix + repeat.id,
							parentHostNodeId: child.hostPrefix + repeat.parentHostNodeId,
							...(repeat.ownerHostNodeId
								? { ownerHostNodeId: child.hostPrefix + repeat.ownerHostNodeId }
								: {}),
							collectionGraphNodeId: mapped.graphNodeId,
							collectionPath: mapped.path,
							rowEvents: repeat.rowEvents.map((event) => ({
								...event,
								symbolIds: event.symbolIds.map((symbolId) =>
									marklessBoundSymbolId(child, symbolId),
								),
								...(event.syncPolicy
									? {
											syncPolicy: marklessComposedSyncPolicy(
												event.syncPolicy,
												child.graphProps,
												instancePath,
											),
										}
									: {}),
							})),
						},
					]
				: [];
		}),
		// Arm-scoped branch records: anchors stay arm-local (resolved by
		// position, not text); ids/symbols/test reads take the child prefixes.
		...(set.branches
			? {
					// A branch decided only by a constant or never-passed prop has no
					// live route to wire; it rendered its final arm with the child.
					branches: set.branches.flatMap((branch) => {
						const liveTestReads = (branch.testReads ?? []).filter(
							(read) => !marklessCsrChildReadIsStatic(read, child.graphProps),
						);
						if ((branch.testReads ?? []).length > 0 && liveTestReads.length === 0) return [];
						return [
							{
								...branch,
								id: child.hostPrefix + branch.id,
								testReads: marklessSsrRemapChildReads(
									liveTestReads,
									child.graphProps,
									child.hostPrefix + branch.id,
									instancePath,
								),
								...(branch.symbolId
									? { symbolId: marklessBoundSymbolId(child, branch.symbolId) }
									: {}),
								...(branch.armRecords
									? {
											armRecords: branch.armRecords.map((arm) =>
												marklessSsrPrefixArmRecord(arm, child),
											),
										}
									: {}),
							},
						];
					}),
				}
			: {}),
	};
}
export function marklessSsrRemapChildReads<T extends ComposeGraphRead>(
	reads: ReadonlyArray<T> | undefined,
	graphProps: ComposeGraphProps,
	recordId: string,
	instancePath = '',
): T[] {
	return (reads ?? []).map((read) => {
		const mapped = marklessSsrRemapChildGraph(read, graphProps, instancePath);
		if (!mapped) throw new Error('MARKLESS_COMPOSED_READ_UNMAPPED: ' + recordId);
		return { ...read, graphNodeId: mapped.graphNodeId, path: mapped.path };
	});
}
/**
 * The route table and instance path a composed branch's own update symbol
 * needs, as this level of composition can spell them.
 *
 * The symbol reads the part-local prop ids its module spells, and the record's
 * reads being rewritten leaves it nothing: only this table says where those
 * props now live. A branch that already carries a path was authored deeper than
 * this child, so its table names that module and travels this level exactly as
 * a read does; a branch whose id carries no instance path at all is this
 * child's own, and this child's route table is the answer. `undefined` means
 * there is nothing for this level to say.
 */
function marklessSsrComposedBranchRoutes(
	branch: SsrBranchRecord,
	child: SsrPrefixChild,
	childInstancePath: string,
): { readonly instancePath: string; readonly props: ProtocolComposedGraphProp[] } | undefined {
	if (branch.composedInstancePath !== undefined)
		return {
			instancePath: childInstancePath + branch.composedInstancePath,
			props: (branch.composedGraphProps ?? []).flatMap((prop) => {
				const mapped = marklessCsrRemapChildGraph(
					{ graphNodeId: prop.graphNodeId, path: prop.path ?? [] },
					child.graphProps,
					childInstancePath,
				);
				return mapped ? [marklessSsrComposedGraphProp(prop.name, mapped)] : [];
			}),
		};
	if (marklessInstancePath(branch.id) !== '') return undefined;
	return {
		instancePath: childInstancePath,
		props: (child.graphProps ?? []).flatMap((prop) => {
			const route = marklessLiveBoundGraphRoute(prop);
			return route ? [marklessSsrComposedGraphProp(prop.name, route)] : [];
		}),
	};
}

function marklessSsrComposedGraphProp(
	name: string,
	route: { readonly graphNodeId: string; readonly path: ReadonlyArray<string> },
): ProtocolComposedGraphProp {
	return {
		name,
		graphNodeId: route.graphNodeId,
		...(route.path.length ? { path: route.path } : {}),
	};
}
function marklessSsrArmRecordSetIsLive(arm: SsrArmRecordSet | undefined): boolean {
	return Boolean(
		arm &&
			((arm.events?.length ?? 0) > 0 ||
				(arm.domUpdates?.length ?? 0) > 0 ||
				(arm.behaviors?.length ?? 0) > 0 ||
				(arm.elementHandles?.length ?? 0) > 0 ||
				(arm.keyedRepeats?.length ?? 0) > 0 ||
				(arm.branches?.length ?? 0) > 0),
	);
}

// Whether a branch nothing can re-decide still has records to wire. Throwing
// beats dropping: a live arm whose painted index the render never reported
// would otherwise go stale in silence.
function marklessSsrDecidedArmIsLive(
	branch: SsrBranchRecord,
	armRecords: ReadonlyArray<SsrArmRecordSet> | undefined,
): boolean {
	if (!armRecords?.some(marklessSsrArmRecordSetIsLive)) return false;
	if (typeof branch.takenArm !== 'number')
		throw new Error(`MARKLESS_DECIDED_BRANCH_ARM_UNKNOWN: ${branch.id}`);
	return marklessSsrArmRecordSetIsLive(armRecords[branch.takenArm]);
}

export function marklessSsrPrefixArmRecord(arm: SsrArmRecordSet, child: SsrPrefixChild) {
	const instancePath = marklessComposedInstancePath(child);
	return {
		...arm,
		events: (arm.events ?? []).map((event) => ({
			...event,
			symbolIds: event.symbolIds.map((symbolId) => marklessBoundSymbolId(child, symbolId)),
			...(event.syncPolicy
				? {
						syncPolicy: marklessComposedSyncPolicy(
							event.syncPolicy,
							child.graphProps,
							instancePath,
						),
					}
				: {}),
		})),
		domUpdates: (arm.domUpdates ?? []).flatMap((update) => {
			const mapped = marklessCsrRemapChildDomUpdate(
				update,
				child.graphProps,
				child.hostPrefix,
				instancePath,
			);
			return mapped
				? [
						{
							...update,
							graphNodeId: mapped.graphNodeId,
							path: mapped.path,
							...(update.symbolId
								? { symbolId: marklessDomUpdateSymbolId(child, update.symbolId) }
								: {}),
						},
					]
				: [];
		}),
	};
}
export function marklessSsrResolveAnchorRecords<T extends SsrAnchoredRecord>(
	structure: SsrDataStructure,
	kind: 'branch' | 'async',
	records: ReadonlyArray<T>,
	idPrefix = '',
): ReadonlyArray<T> {
	if (records.length === 0) return records;
	const anchors = new Map<string, { readonly startIndex: number; readonly endIndex: number }>(
		structure.anchors
			.filter((anchor) => anchor.kind === kind)
			.map((anchor) => [anchor.id, anchor]),
	);
	return records.map((record) => {
		const anchor = anchors.get(idPrefix + record.id);
		if (!anchor) throw new Error(`MARKLESS_SSR_DATA_ANCHOR_MISSING: ${kind}:${record.id}`);
		return {
			...record,
			startAnchor: { ...record.startAnchor, index: anchor.startIndex },
			endAnchor: { ...record.endAnchor, index: anchor.endIndex },
		};
	});
}
