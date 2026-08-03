import type { RuntimeGraph, RuntimeGraphUpdate } from '@markless/runtime';
import type { DecodedPayloadScripts } from '../../../serializer/src/protocol-client-storage.ts';
import { decodePayloadScripts } from '../../../serializer/src/protocol-client-storage.ts';
import {
	mergeResumeRecordDelta,
	type ResumeRecordSet,
} from '@markless/serializer/resume-record-delta';
import { createResumeRuntime, type ResumeDomElement, type ResumeRuntime } from '../resume.ts';
import type { ResumePayloadScriptsInput, ResumePayloadScriptsResult } from '../payload-full.ts';
import { createRuntimeGraphFromResumePayload } from '../payload-graph-construct.ts';
import {
	documentTemplateBranchHtml,
	readPayloadScriptsFromDocument,
	type PayloadScriptDocument,
} from '../payload-document-common.ts';

type TriggerGroupInput = Omit<ResumePayloadScriptsInput, 'stateScript' | 'viewScript'> &
	DecodedPayloadScripts & {
		readonly groupId: string;
		readonly graphNodeIds: ReadonlyArray<string>;
	};

type GraphSegment = {
	readonly graph: RuntimeGraph;
	readonly graphNodeIds: ReadonlySet<string>;
	readonly sharedDefinitionIds: ReadonlySet<string>;
};

type StagedContainer = {
	readonly groups: Map<string, Promise<ResumePayloadScriptsResult>>;
	readonly segments: GraphSegment[];
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
		container = { groups: new Map(), segments: [] };
		stagedContainers.set(input.root, container);
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
	const adopted = await adoptStreamedForWake({
		...input,
		renderBranchHtml: input.renderBranchHtml ?? documentTemplateBranchHtml(input.root),
	});
	const prior = container.segments[0] && createStagedGraph(container, container.segments[0]);
	const state = prior
		? {
				...adopted.state,
				cells: adopted.state.cells.map((cell) =>
					container.segments.some((segment) => segment.graphNodeIds.has(cell.graphNodeId))
						? // A live graph read never crossed the HTML boundary — the
							// shared decoder's directValue lane exists for exactly this;
							// feeding it through `value` would hit the envelope decoder.
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
	runtime = createResumeRuntime({
		root: adopted.root,
		graph,
		state: adopted.state,
		view: adopted.view,
		loadSymbol: adopted.loadSymbol,
		createVisibilityObserver: adopted.createVisibilityObserver,
		createRemovalObserver: adopted.createRemovalObserver,
		applyDomJournal,
		renderBranchHtml: adopted.renderBranchHtml,
		renderAsyncBoundary: adopted.renderAsyncBoundary,
	});
	const eventTypes = new Set(
		adopted.view.events
			.filter((event) => event.eventName !== 'visible')
			.map((event) => event.eventName),
	);
	await withoutCaptureListeners(adopted.root, eventTypes, () => runtime!.start());
	const stagedRuntime: ResumeRuntime = {
		...runtime,
		dispatch: (event, options) =>
			withoutCaptureListeners(adopted.root, eventTypes, () =>
				runtime!.dispatch(event, options),
			),
	};
	(
		adopted.root as typeof adopted.root & { __asyncResumeRuntimeStarted?: boolean }
	).__asyncResumeRuntimeStarted = true;
	return { decoded: adopted, graph, runtime: stagedRuntime };
}

function createStagedGraph(container: StagedContainer, local: GraphSegment): RuntimeGraph {
	const matching = (graphNodeId: string) =>
		container.segments.filter((segment) => segment.graphNodeIds.has(graphNodeId));
	const graphFor = (graphNodeId: string) =>
		(local.graphNodeIds.has(graphNodeId) ? local : matching(graphNodeId)[0])?.graph ?? local.graph;
	const staged: RuntimeGraph = {
		read: (graphNodeId, path) => graphFor(graphNodeId).read(graphNodeId, path),
		...(local.graph.peekAsyncSnapshot
			? {
					peekAsyncSnapshot: (graphNodeId: string) =>
						graphFor(graphNodeId).peekAsyncSnapshot?.(graphNodeId),
				}
			: {}),
		readShared: (definitionId, propertyName, path) =>
			(container.segments.find((segment) =>
				segment.sharedDefinitionIds.has(definitionId),
			)?.graph ?? local.graph
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
	return staged;
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
		if (removeDescriptor) Object.defineProperty(target, 'removeEventListener', removeDescriptor);
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
