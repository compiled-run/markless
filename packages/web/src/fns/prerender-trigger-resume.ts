import type { RuntimeGraph, RuntimeGraphUpdate } from '@markless/runtime';
import type { ArmCommitUpdate } from '../resume-commit-arm.ts';
import type { DecodedPayloadScripts } from '../../../serializer/src/protocol-client-storage.ts';
import { decodePayloadScripts } from '../../../serializer/src/protocol-client-storage.ts';
import {
	mergeResumeRecordDelta,
	type ResumeRecordSet,
} from '@markless/serializer/resume-record-merge';
import {
	createResumeRuntime,
	type ResumeDomElement,
	type ResumeDomEvent,
	type ResumeRuntime,
} from '../resume.ts';
import type { ProtocolStatePayload } from '@markless/serializer/protocol';
import type { ResumePayloadScriptsInput, ResumePayloadScriptsResult } from '../payload-full.ts';
import { createRuntimeGraphFromResumePayload } from '../payload-graph-construct.ts';
import {
	documentTemplateBranchHtml,
	readPayloadScriptsFromDocument,
	type PayloadScriptDocument,
} from '../payload-document-common.ts';
import { adoptFilledArms } from '../prerender/adopt-filled-arms.ts';
import {
	attachPrerenderStagedGraphRegistration,
	registerPrerenderStagedComputeds,
	type PrerenderStagedComputedRegistration,
} from '../prerender/staged-graph.ts';
import {
	attachPrerenderBoundaryAuthority,
	beginPrerenderBoundaryArmCommit,
	claimPrerenderBoundaryArmRegistration,
	completePrerenderBoundaryArmRegistration,
	resolvePrerenderBoundaryAuthority,
	type PrerenderBoundaryArmRegistration,
} from '../prerender/staged-boundary-authority.ts';

type TriggerGroupInput = Omit<ResumePayloadScriptsInput, 'stateScript' | 'viewScript'> &
	DecodedPayloadScripts & {
		readonly groupId: string;
		readonly graphNodeIds: ReadonlyArray<string>;
		readonly renderBoundaryArm?: (
			boundaryId: string,
			status: 'fulfilled' | 'rejected',
			graph: RuntimeGraph,
		) => ArmCommitUpdate & {
			readonly nodes: ReadonlyArray<import('../resume-types.ts').ResumeDomNode>;
		};
		readonly prepareBoundaryArm?: (
			boundaryId: string,
			status: 'fulfilled' | 'rejected',
			graph: RuntimeGraph,
		) => Promise<void>;
	};

type GraphSegment = {
	readonly graph: RuntimeGraph;
	readonly graphNodeIds: ReadonlySet<string>;
	readonly sharedDefinitionIds: ReadonlySet<string>;
};

type StagedContainer = {
	readonly groups: Map<string, Promise<ResumePayloadScriptsResult>>;
	readonly segments: GraphSegment[];
	readonly runtimes: Array<{
		readonly segment: GraphSegment;
		readonly runtime: ResumeRuntime;
		readonly registerComputedRefreshes: (
			records: ReadonlyArray<PrerenderStagedComputedRegistration>,
		) => Promise<void> | undefined;
	}>;
	readonly computed: Map<
		string,
		{
			readonly owner: GraphSegment;
			readonly record: PrerenderStagedComputedRegistration;
		}
	>;
	dispatchRegistered: boolean;
};

const stagedContainers = new WeakMap<ResumeDomElement, StagedContainer>();

export function mergePrerenderPayloadRecords(
	derived: ResumeRecordSet,
	document: PayloadScriptDocument,
): ResumeRecordSet {
	const stateScript = document.querySelector('script[type="markless/state"]');
	const viewScript = document.querySelector('script[type="markless/view"]');
	if (!stateScript && !viewScript) return derived;
	const payload = decodePayloadScripts(readPayloadScriptsFromDocument(document));
	return mergeResumeRecordDelta(derived, payload);
}

export function resumePrerenderTriggerGroup(
	input: TriggerGroupInput,
): Promise<ResumePayloadScriptsResult> {
	let container = stagedContainers.get(input.root);
	if (!container) {
		container = {
			groups: new Map(),
			segments: [],
			runtimes: [],
			computed: new Map(),
			dispatchRegistered: false,
		};
		stagedContainers.set(input.root, container);
		attachPrerenderBoundaryAuthority(input.root);
	}
	const existing = container.groups.get(input.groupId);
	if (existing) return existing;
	const started = startTriggerGroup(input, container);
	container.groups.set(input.groupId, started);
	return started;
}

async function startTriggerGroup(
	input: TriggerGroupInput,
	container: StagedContainer,
): Promise<ResumePayloadScriptsResult> {
	// A page the settle boot already filled must hand its arm to whichever group
	// wakes first, not only to the ungrouped fallback: without this the first
	// group resumes with @pending records and a state change it owns cannot move
	// a binding that lives inside the settled arm.
	const adopted = await adoptFilledArms(
		await adoptStreamedForWake({
			...input,
			renderBranchHtml: input.renderBranchHtml ?? documentTemplateBranchHtml(input.root),
		}),
		input.root as never,
		input.renderBoundaryArm &&
			(async (boundaryId, status, graph) => {
				await input.prepareBoundaryArm?.(boundaryId, status, graph);
				return input.renderBoundaryArm!(boundaryId, status, graph);
			}),
	);
	const prior = container.segments[0] && createStagedGraph(container, container.segments[0]);
	const state = prior
		? {
				...adopted.state,
				cells: adopted.state.cells.map((cell) =>
					container.segments.some((segment) => segment.graphNodeIds.has(cell.graphNodeId))
						? // Live graph reads bypass the serialized-value envelope.
							{ ...cell, value: undefined, directValue: prior.read(cell.graphNodeId) }
						: cell,
				),
			}
		: adopted.state;
	const segmentGraph = await createRuntimeGraphFromResumePayload({
		state,
		view: adopted.view,
		root: adopted.root,
		loadSymbol: adopted.loadSymbol,
	});
	const segment: GraphSegment = {
		graph: segmentGraph,
		graphNodeIds: new Set(adopted.graphNodeIds),
		sharedDefinitionIds: new Set(
			(adopted.state.sharedDefinitions ?? []).map((definition) => definition.id),
		),
	};
	container.segments.push(segment);
	const graph = createStagedGraph(container, segment);
	await registerPrerenderStagedComputeds(
		graph,
		(state.computed ?? [])
			.filter(
				(record) => record.async === false && typeof record.deriveSymbolId === 'string',
			)
			.map((record) => ({
				...record,
				value: graph.read(record.graphNodeId),
			})),
	);
	const boundaryClaims: PrerenderBoundaryArmRegistration[] = [];
	for (const [index, boundary] of adopted.view.asyncBoundaries.entries()) {
		const canonical = resolvePrerenderBoundaryAuthority(adopted.root, boundary);
		const claim = await claimPrerenderBoundaryArmRegistration(adopted.root, canonical);
		if (claim) boundaryClaims.push(claim);
		adopted.view.asyncBoundaries[index] = claim ? canonical : { ...canonical, armRecords: [] };
	}
	const renderAsyncBoundary = adopted.renderBoundaryArm
		? async (
				boundaryId: string,
				status: 'fulfilled' | 'rejected',
				renderGraph: RuntimeGraph,
			) => {
				await adopted.prepareBoundaryArm?.(boundaryId, status, renderGraph);
				const rendered = adopted.renderBoundaryArm!(boundaryId, status, renderGraph);
				const boundary = adopted.view.asyncBoundaries.find(
					(candidate) => candidate.id === boundaryId,
				);
				if (boundary) {
					const claim = beginPrerenderBoundaryArmCommit(
						adopted.root,
						boundary,
						rendered.armRecords,
					);
					if (claim) completePrerenderBoundaryArmRegistration(adopted.root, claim, true);
				}
				return rendered;
			}
		: adopted.renderAsyncBoundary;
	let runtime: ResumeRuntime | undefined;
	const applyDomJournal =
		adopted.applyDomJournal ??
		(async (entries) => {
			const { applyDomJournalEntries } = await import('../dom-journal.ts');
			applyDomJournalEntries(entries, {
				resolveTarget(locator) {
					const rangeAnchor = /^(branch|async-boundary):(.+?):(start|end)$/.exec(
						String(locator),
					);
					if (rangeAnchor) {
						const record =
							rangeAnchor[1] === 'branch'
								? runtime?.getBranch(rangeAnchor[2]!)
								: runtime?.getAsyncBoundary(rangeAnchor[2]!);
						return rangeAnchor[3] === 'end' ? record?.endAnchor : record?.startAnchor;
					}
					return runtime?.getElement(String(locator));
				},
			});
		});
	let registerComputedRefreshes:
		| ((records: ProtocolStatePayload['computed']) => Promise<void>)
		| undefined;
	runtime = createResumeRuntime(
		{
			root: adopted.root,
			graph,
			state: adopted.state,
			view: adopted.view,
			loadSymbol: adopted.loadSymbol,
			createVisibilityObserver: adopted.createVisibilityObserver,
			createRemovalObserver: adopted.createRemovalObserver,
			applyDomJournal,
			renderBranchHtml: adopted.renderBranchHtml,
			renderAsyncBoundary,
		},
		(register) => {
			registerComputedRefreshes = register;
		},
	);
	const eventTypes = new Set(
		adopted.view.events
			.filter((event) => event.eventName !== 'visible')
			.map((event) => event.eventName),
	);
	let started = false;
	try {
		await withoutCaptureListeners(adopted.root, eventTypes, () => runtime!.start());
		// Backfill settled-arm computeds onto their owning runtime.
		await registerComputedRefreshes?.(
			[...container.computed.values()]
				.filter((computed) => computed.owner === segment)
				.map((computed) => computed.record),
		);
		started = true;
	} finally {
		for (const claim of boundaryClaims)
			completePrerenderBoundaryArmRegistration(adopted.root, claim, started);
	}
	// Keep each staged computed with the runtime owning its derive route.
	const stagedRuntime: ResumeRuntime = {
		...runtime,
		dispatch: (event, options) =>
			withoutCaptureListeners(adopted.root, eventTypes, () =>
				runtime!.dispatch(event, options),
			),
	};
	container.runtimes.push({
		segment,
		runtime: stagedRuntime,
		registerComputedRefreshes: (records) => registerComputedRefreshes?.(records),
	});
	if (!container.dispatchRegistered) {
		type Handoff = {
			readonly event: ResumeDomEvent;
			readonly syncPolicyAlreadyApplied?: boolean;
		};
		(
			adopted.root as typeof adopted.root & {
				__marklessRegisterDispatch?: (
					dispatch: (
						handoff: Handoff,
						fallback: (handoff: Handoff) => Promise<void> | void,
					) => Promise<void> | void,
				) => void;
			}
		).__marklessRegisterDispatch?.(async (handoff, fallback) => {
			let matched = false;
			for (const candidate of container.runtimes) {
				try {
					await candidate.runtime.dispatch(handoff.event, {
						syncPolicyAlreadyApplied: handoff.syncPolicyAlreadyApplied === true,
					});
					matched = true;
				} catch (error) {
					if (!isUnmatchedDispatchError(error)) throw error;
				}
			}
			if (!matched) await fallback(handoff);
		});
		container.dispatchRegistered = true;
	}
	(
		adopted.root as typeof adopted.root & { __asyncResumeRuntimeStarted?: boolean }
	).__asyncResumeRuntimeStarted = true;
	return { decoded: adopted, graph, runtime: stagedRuntime };
}

function isUnmatchedDispatchError(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		(error as { readonly code?: unknown }).code === 'MARKLESS_EVENT_DISPATCH_UNMATCHED'
	);
}

function createStagedGraph(container: StagedContainer, local: GraphSegment): RuntimeGraph {
	const matching = (graphNodeId: string) =>
		container.segments.filter((segment) => segment.graphNodeIds.has(graphNodeId));
	const graphFor = (graphNodeId: string) =>
		(local.graphNodeIds.has(graphNodeId) ? local : matching(graphNodeId)[0])?.graph ??
		local.graph;
	const staged: RuntimeGraph = {
		read: (graphNodeId, path) => graphFor(graphNodeId).read(graphNodeId, path),
		...(local.graph.peekAsyncSnapshot
			? {
					peekAsyncSnapshot: (graphNodeId: string) =>
						graphFor(graphNodeId).peekAsyncSnapshot?.(graphNodeId),
				}
			: {}),
		readShared: (definitionId, propertyName, path) =>
			(
				container.segments.find((segment) => segment.sharedDefinitionIds.has(definitionId))
					?.graph ?? local.graph
			).readShared(definitionId, propertyName, path),
		writeShared: (write) => {
			let wrote = false;
			for (const segment of container.segments)
				if (segment.sharedDefinitionIds.has(write.definitionId))
					wrote = segment.graph.writeShared(write) || wrote;
			return wrote;
		},
		getSharedDefinition: (definitionId) =>
			container.segments
				.find((segment) => segment.sharedDefinitionIds.has(definitionId))
				?.graph.getSharedDefinition(definitionId),
		listSharedDefinitions: () => [
			...new Map(
				container.segments
					.flatMap((segment) => segment.graph.listSharedDefinitions())
					.map((definition) => [definition.id, definition] as const),
			).values(),
		],
		takeSharedPatches: () =>
			container.segments.flatMap((segment) => segment.graph.takeSharedPatches()),
		applySharedPatch: (patch) => {
			let applied = false;
			for (const segment of container.segments)
				if (segment.sharedDefinitionIds.has(patch.id))
					applied = segment.graph.applySharedPatch(patch) || applied;
			return applied;
		},
		write: (write) => {
			for (const segment of matching(write.graphNodeId)) segment.graph.write(write);
		},
		update: (update) => broadcastUpdate(staged, matching(update.graphNodeId), update),
		call: (call) => {
			let result: unknown;
			for (const [index, segment] of matching(call.graphNodeId).entries()) {
				const next = segment.graph.call(call);
				if (index === 0) result = next;
			}
			return result;
		},
		delete: (deletion) => {
			let deleted = false;
			for (const segment of matching(deletion.graphNodeId))
				deleted = segment.graph.delete(deletion) || deleted;
			return deleted;
		},
		subscribe: (subscription) => local.graph.subscribe(subscription),
		subscribeJournal: (listener) => local.graph.subscribeJournal(listener),
		flush: async () => {
			await Promise.all(container.segments.map((segment) => segment.graph.flush()));
		},
		takeJournal: () => local.graph.takeJournal(),
	};
	attachPrerenderStagedGraphRegistration(staged, async (records) => {
		registerStagedComputedClosure(container, local, records);
		await Promise.all(
			container.runtimes
				.filter((runtime) => runtime.segment === local)
				.map((runtime) => runtime.registerComputedRefreshes(records)),
		);
	});
	return staged;
}

function registerStagedComputedClosure(
	container: StagedContainer,
	local: GraphSegment,
	records: ReadonlyArray<PrerenderStagedComputedRegistration>,
): void {
	const discovered = new Map(records.map((record) => [record.graphNodeId, record]));
	const graphNodeIds = new Set(records.map((record) => record.graphNodeId));
	let changed = true;
	while (changed) {
		changed = false;
		for (const graphNodeId of graphNodeIds) {
			for (const dependency of discovered.get(graphNodeId)?.dependencies ?? []) {
				if (graphNodeIds.has(dependency.graphNodeId)) continue;
				graphNodeIds.add(dependency.graphNodeId);
				changed = true;
			}
		}
	}
	for (const graphNodeId of graphNodeIds) {
		if (discovered.has(graphNodeId)) continue;
		if (!container.segments.some((segment) => segment.graphNodeIds.has(graphNodeId))) {
			throw new Error(
				`Markless staged computed dependency ${graphNodeId} was not registered before settle render.`,
			);
		}
	}
	for (const record of records) {
		container.computed.set(record.graphNodeId, { owner: local, record });
		local.graphNodeIds.add(record.graphNodeId);
		local.graph.write({ graphNodeId: record.graphNodeId, value: record.value });
	}
	// A subscribing segment must claim dependencies to receive broadcasts.
	for (const graphNodeId of graphNodeIds) local.graphNodeIds.add(graphNodeId);
}

function broadcastUpdate(
	graph: RuntimeGraph,
	segments: ReadonlyArray<GraphSegment>,
	update: RuntimeGraphUpdate,
): unknown {
	const previous = graph.read(update.graphNodeId, update.path);
	const next = update.update(previous);
	for (const segment of segments)
		segment.graph.write({ graphNodeId: update.graphNodeId, path: update.path, value: next });
	if (update.returnValue === 'previous') return previous;
	if (update.returnValue === 'next') return next;
}

async function withoutCaptureListeners<T>(
	root: ResumeDomElement,
	eventTypes: ReadonlySet<string>,
	run: () => Promise<T> | T,
): Promise<T> {
	const target = root as ResumeDomElement & {
		addEventListener?: ResumeDomElement['addEventListener'];
		removeEventListener?: ResumeDomElement['removeEventListener'];
	};
	const addDescriptor = Object.getOwnPropertyDescriptor(root, 'addEventListener');
	const removeDescriptor = Object.getOwnPropertyDescriptor(root, 'removeEventListener');
	const add = root.addEventListener;
	const remove = root.removeEventListener;
	Object.defineProperty(target, 'addEventListener', {
		configurable: true,
		value(type: string, listener: never, options?: { readonly capture?: boolean }) {
			if (eventTypes.has(type) && options?.capture) return;
			return add?.call(root, type, listener, options);
		},
	});
	Object.defineProperty(target, 'removeEventListener', {
		configurable: true,
		value(type: string, listener: never, options?: { readonly capture?: boolean }) {
			if (eventTypes.has(type) && options?.capture) return;
			return remove?.call(root, type, listener, options);
		},
	});
	try {
		return await run();
	} finally {
		if (addDescriptor) Object.defineProperty(target, 'addEventListener', addDescriptor);
		else delete target.addEventListener;
		if (removeDescriptor)
			Object.defineProperty(target, 'removeEventListener', removeDescriptor);
		else delete target.removeEventListener;
	}
}

async function adoptStreamedForWake<T extends TriggerGroupInput>(input: T): Promise<T> {
	const documentHost = (
		input.root as {
			readonly ownerDocument?: { readonly querySelector?: (selector: string) => unknown };
		}
	).ownerDocument;
	if (
		!documentHost?.querySelector?.(
			'script[type="markless/arm"],script[type="markless/state-patch"]',
		)
	)
		return input;
	const { adoptStreamedArmPatches } = await import('../resume-stream-patches.ts');
	return { ...input, ...(await adoptStreamedArmPatches(input, input.root)) };
}
