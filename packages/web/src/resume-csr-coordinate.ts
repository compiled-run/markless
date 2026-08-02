import { ASYNC_BOUNDARY_ARM } from '@markless/serializer';
import type { RuntimeGraph } from '@markless/runtime';
import type { ArmCommitUpdate } from './resume-commit-arm.ts';
import type {
	ElementHandleRegistry,
	ResumeAsyncBoundaryRecord,
	ResumeDispatchOptions,
	ResumeDomElement,
	ResumeDomEvent,
	ResumeDomNode,
	ResumeEventRecord,
	ResumePreparedCore,
	ResumeRuntime,
	ResumeRuntimeInput,
} from './resume-types.ts';

type CoordinateParent = {
	readonly childNodes: ArrayLike<ResumeDomNode>;
	readonly insertBefore: (node: ResumeDomNode, before: ResumeDomNode | null) => unknown;
	readonly removeChild: (node: ResumeDomNode) => unknown;
};

type CoordinateSettlerInput = {
	readonly runtimeInput: ResumeRuntimeInput;
	readonly graph: RuntimeGraph;
	readonly boundariesById: Map<string, ResumeAsyncBoundaryRecord>;
	readonly events: ReadonlyArray<ResumeEventRecord>;
	readonly elementsByHostId: Map<string, ResumeDomElement>;
	readonly elementHandles: ElementHandleRegistry;
	readonly loadRuntime: () => Promise<ResumeRuntime>;
	readonly updateRuntimeInput: (input: ResumeRuntimeInput) => void;
};

export type CsrCoordinateSettler = NonNullable<ReturnType<typeof tryStartCsrCoordinateSettler>>;

// CSR-native chunks already carry exact anchors, hosts, and slot coordinates.
// This initial-settle path therefore touches only those declared coordinates:
// it never walks or rediscovers the live DOM. The general resume runtime stays
// asleep until the first interaction needs it.
export function tryStartCsrCoordinateSettler(
	runtimeInput: ResumeRuntimeInput,
	prepared: ResumePreparedCore,
	loadRuntime: () => Promise<ResumeRuntime>,
	updateRuntimeInput: (input: ResumeRuntimeInput) => void,
) {
	const view = runtimeInput.view;
	if (
		view.asyncBoundaries.length === 0 ||
		view.asyncBoundaries.some((boundary) => typeof boundary.renderArm !== 'function') ||
		view.asyncBoundaries.some(
			(boundary) =>
				Array.isArray(boundary.armRecords) &&
				boundary.armRecords.some(
					(records) =>
						records &&
						typeof records === 'object' &&
						((records as ArmCommitUpdate['armRecords']).branches?.length ?? 0) > 0,
				),
		) ||
		view.behaviors.length > 0 ||
		view.events.some((event) => !!event.syncPolicy || event.eventName === 'visible')
	)
		return undefined;
	const settler = createCsrCoordinateSettler({
		runtimeInput,
		graph: runtimeInput.graph,
		boundariesById: prepared.asyncBoundariesById,
		events: view.events,
		elementsByHostId: prepared.elementsByHostId,
		elementHandles: prepared.elementHandles,
		loadRuntime,
		updateRuntimeInput,
	});
	settler.start();
	return settler;
}

function createCsrCoordinateSettler(input: CoordinateSettlerInput) {
	const releases: Array<() => void> = [];
	const eventReleases = new Map<string, Array<() => void>>();
	const updates = new Map<string, ArmCommitUpdate>();
	const arms = new Map<string, number>();
	const unsettled = new Set(input.boundariesById.keys());
	let resolveSettled = () => {};
	let settled = new Promise<void>((resolve) => (resolveSettled = resolve));
	let commitFloor = 0;
	let started = false;
	let startingRuntime: Promise<ResumeRuntime> | undefined;
	let currentRuntimeInput = input.runtimeInput;
	const baseView = input.runtimeInput.view;

	function registerEvents(
		owner: string,
		records: ReadonlyArray<ResumeEventRecord>,
		eventElements?: ReadonlyMap<string, ReadonlyArray<ResumeDomElement>>,
	): void {
		for (const release of eventReleases.get(owner) ?? []) release();
		const owned: Array<() => void> = [];
		for (const record of records) {
			const elements =
				eventElements?.get(record.hostNodeId) ??
				(input.elementsByHostId.has(record.hostNodeId)
					? [input.elementsByHostId.get(record.hostNodeId)!]
					: []);
			if (elements.length === 0) throw missingCoordinateHost(record.hostNodeId, 'event');
			for (const element of elements) {
				const listener = (event: ResumeDomEvent) => dispatch(event);
				element.addEventListener?.(record.eventName, listener);
				owned.push(() => element.removeEventListener?.(record.eventName, listener));
			}
		}
		eventReleases.set(owner, owned);
	}

	async function commit(
		boundary: ResumeAsyncBoundaryRecord,
		status: 'fulfilled' | 'rejected',
	): Promise<void> {
		const hold = commitFloor - Date.now();
		if (hold > 0) await new Promise((resolve) => setTimeout(resolve, hold));
		const update = boundary.renderArm!(status);
		assertCoordinateHosts(update);
		const previous = updates.get(boundary.id);
		for (const hostNodeId of previous?.elementsByHostId?.keys() ?? [])
			input.elementsByHostId.delete(hostNodeId);
		replaceCoordinateRange(boundary, update.nodes);
		for (const [hostNodeId, element] of update.elementsByHostId)
			input.elementsByHostId.set(hostNodeId, element);
		updates.set(boundary.id, update);
		arms.set(
			boundary.id,
			status === 'rejected' ? ASYNC_BOUNDARY_ARM.catch : ASYNC_BOUNDARY_ARM.try,
		);
		registerEvents(boundary.id, update.armRecords.events, update.eventElementsByHostId);
		currentRuntimeInput = settledRuntimeInput(
			input,
			baseView,
			updates,
			arms,
			currentRuntimeInput,
		);
		input.updateRuntimeInput(currentRuntimeInput);
		unsettled.delete(boundary.id);
		if (unsettled.size === 0) resolveSettled();
	}

	async function dispatch(event: ResumeDomEvent, options?: ResumeDispatchOptions): Promise<void> {
		if (!startingRuntime) {
			dispose();
			startingRuntime = input.loadRuntime().then(async (runtime) => {
				await runtime.start();
				return runtime;
			});
		}
		await (await startingRuntime).dispatch(event, options);
	}

	function dispose(): void {
		for (const release of releases.splice(0)) release();
		for (const owned of eventReleases.values()) for (const release of owned) release();
		eventReleases.clear();
		if (unsettled.size > 0) {
			unsettled.clear();
			resolveSettled();
			settled = Promise.resolve();
		}
	}

	return {
		start(): void {
			if (started) return;
			started = true;
			registerEvents('root', input.events);
			for (const boundary of input.boundariesById.values()) {
				for (const read of boundary.asyncReads) {
					releases.push(
						input.graph.subscribe({
							id: `csr-coordinate-boundary:${boundary.id}:${read.graphNodeId}:${read.path.join('.')}`,
							graphNodeId: read.graphNodeId,
							path: [],
							async run(snapshot) {
								const status = coordinateBoundaryStatus(
									input.graph,
									boundary,
									read.graphNodeId,
									snapshot,
								);
								if (status === 'fulfilled' || status === 'rejected')
									await commit(boundary, status);
							},
						}),
					);
				}
				for (const read of boundary.asyncReads)
					input.graph.read(read.graphNodeId, ['status']);
			}
		},
		whenSettled(): Promise<void> {
			return unsettled.size === 0 ? Promise.resolve() : settled;
		},
		handoff(): ResumeRuntimeInput {
			dispose();
			return currentRuntimeInput;
		},
		dispatch,
		holdCommitsFor(ms: number): void {
			commitFloor = Math.max(commitFloor, Date.now() + ms);
		},
		dispose,
	};
}

function settledRuntimeInput(
	input: CoordinateSettlerInput,
	baseView: ResumeRuntimeInput['view'],
	updates: ReadonlyMap<string, ArmCommitUpdate>,
	arms: ReadonlyMap<string, number>,
	current: ResumeRuntimeInput,
): ResumeRuntimeInput {
	const exhaustive = {
		locators: true,
		events: true,
		domUpdates: true,
		behaviors: true,
		elementHandles: true,
		keyedRepeats: true,
		branches: true,
	} satisfies Record<keyof ArmCommitUpdate['armRecords'], true>;
	void exhaustive;
	const events = [...baseView.events];
	const domUpdates = [...baseView.domUpdates];
	const behaviors = [...baseView.behaviors];
	const elementHandles = [...baseView.elementHandles];
	const keyedRepeats = [...(baseView.keyedRepeats ?? [])];
	const branches = [...(baseView.branches ?? [])];
	for (const [boundaryId, update] of updates) {
		const records = update.armRecords;
		events.push(...records.events);
		domUpdates.push(...(records.domUpdates ?? []));
		behaviors.push(...records.behaviors);
		elementHandles.push(...records.elementHandles);
		keyedRepeats.push(...(records.keyedRepeats ?? []));
		branches.push(
			...(records.branches ?? []).map((branch) => ({ ...branch, armBoundaryId: boundaryId })),
		);
		for (const handle of records.elementHandles) {
			const element = update.elementsByHostId?.get(handle.hostNodeId);
			if (!element) throw missingCoordinateHost(handle.hostNodeId, 'element handle');
			input.elementHandles.register(handle.hostNodeId, handle, element);
		}
		const boundary = input.boundariesById.get(boundaryId);
		if (boundary)
			input.boundariesById.set(boundaryId, {
				...boundary,
				initiallyServedArm: arms.get(boundaryId) ?? boundary.initiallyServedArm,
			});
	}
	return {
		...current,
		demandAsyncBoundaries: false,
		view: {
			...baseView,
			events,
			domUpdates,
			behaviors,
			elementHandles,
			keyedRepeats,
			branches,
			asyncBoundaries: baseView.asyncBoundaries.map((boundary) => ({
				...boundary,
				initiallyServedArm: arms.get(boundary.id) ?? boundary.initiallyServedArm,
				armRecords: undefined,
			})),
		},
	};
}

function coordinateBoundaryStatus(
	graph: RuntimeGraph,
	boundary: ResumeAsyncBoundaryRecord,
	observedGraphNodeId: string,
	observed: unknown,
): unknown {
	const snapshots = boundary.asyncReads.map((read) =>
		read.graphNodeId === observedGraphNodeId ? observed : graph.read(read.graphNodeId, []),
	) as ReadonlyArray<{ readonly status?: unknown } | undefined>;
	if (snapshots.some((snapshot) => snapshot?.status === 'rejected')) return 'rejected';
	if (snapshots.some((snapshot) => snapshot?.status !== 'fulfilled')) return 'pending';
	return 'fulfilled';
}

function assertCoordinateHosts(update: ArmCommitUpdate): void {
	const elements = update.elementsByHostId;
	if (!elements) throw new Error('Markless CSR coordinate settle did not provide live hosts.');
	const records = [
		...update.armRecords.events,
		...(update.armRecords.domUpdates ?? []),
		...update.armRecords.behaviors,
		...update.armRecords.elementHandles,
	];
	for (const record of records)
		if (!elements.has(record.hostNodeId))
			throw missingCoordinateHost(record.hostNodeId, 'record');
	for (const repeat of update.armRecords.keyedRepeats ?? [])
		if (!elements.has(repeat.parentHostNodeId))
			throw missingCoordinateHost(repeat.parentHostNodeId, 'keyed repeat');
}

function replaceCoordinateRange(
	boundary: ResumeAsyncBoundaryRecord,
	fresh: ReadonlyArray<ResumeDomNode> | undefined,
): void {
	if (!fresh)
		throw new Error(`Markless CSR boundary ${boundary.id} has no coordinate arm nodes.`);
	const start = boundary.startAnchor as typeof boundary.startAnchor & {
		readonly parentNode?: CoordinateParent | null;
		readonly parentElement?: CoordinateParent | null;
	};
	const end = boundary.endAnchor as typeof boundary.endAnchor & {
		readonly parentNode?: CoordinateParent | null;
		readonly parentElement?: CoordinateParent | null;
	};
	const parent = start.parentNode ?? start.parentElement;
	if (!parent || parent !== (end.parentNode ?? end.parentElement))
		throw new Error(`Markless CSR boundary ${boundary.id} has detached coordinate anchors.`);
	const siblings = Array.from(parent.childNodes);
	const startIndex = siblings.indexOf(start);
	const endIndex = siblings.indexOf(end);
	if (startIndex < 0 || endIndex <= startIndex)
		throw new Error(`Markless CSR boundary ${boundary.id} has an invalid coordinate range.`);
	for (const node of siblings.slice(startIndex + 1, endIndex)) parent.removeChild(node);
	for (const node of fresh) parent.insertBefore(node, end);
}

function missingCoordinateHost(hostNodeId: string, kind: string): Error {
	return new Error(`Markless CSR coordinate ${kind} expected live host ${hostNodeId}.`);
}
