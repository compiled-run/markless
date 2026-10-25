import { ASYNC_BOUNDARY_ARM } from '@markless/serializer/async-boundary-arm';
import type {
	ProtocolStatePayload,
	ProtocolStreamedArmPatch,
	ProtocolViewPayload,
} from '@markless/serializer/protocol';
import type { SerializedGraphPayload } from '../../../serializer/src/value-decode-client.ts';
import { decodeProtocolPayloadLists } from '@markless/serializer/record-templates';
import { derivedReconcilePlane, installDerivedReconcilePlane } from '../reconcile-plane-slot.ts';
import { PROTOCOL_STREAM_OPEN_PROPERTY } from '../../../serializer/src/protocol-stream-open.ts';

// A runtime that wakes while the server still streams an @pending boundary's arm
// runs every event at once and adopts the arm when it lands: the boundary's runner
// answers from the streamed snapshot and its settle commits the streamed HTML, so
// the browser fetches no data and renders no arm. The streamed HTML shows server
// state, so arm bindings that read a cell the page wrote before adoption run once
// against the live graph; every other arm binding is already right and stays idle.

type StreamRoot = Element & {
	__mArmLive?: (boundaryId: string) => boolean;
	__marklessArmRegistering?: Set<Promise<unknown>>;
	__marklessEventOnlyGraph?: Map<string, unknown>;
};

type SymbolLoader = (symbolId: string) => unknown;

type StreamedState = {
	readonly boundaryId: string;
	readonly runnerGraphNodeId: string;
	readonly arrived: Promise<StreamedArm | undefined>;
	resolve?: (arm: StreamedArm | undefined) => void;
	runnerAnswered?: { readonly value?: unknown; readonly rejected?: true };
	consumed?: true;
};

type StateDelta = Pick<ProtocolStatePayload, 'cells' | 'computed'>;

type StreamedArm = {
	readonly html: string;
	readonly patch: ProtocolStreamedArmPatch;
	readonly state: StateDelta | null;
};

type GraphSubscription = {
	readonly graphNodeId: string;
	readonly path?: ReadonlyArray<string>;
	run: (value: unknown) => unknown;
};

type Internals = {
	readonly cells: ReadonlyMap<string, unknown>;
	addSubscription: (subscription: GraphSubscription) => void;
	readonly dirtyPaths: Array<{
		readonly graphNodeId: string;
		readonly path: ReadonlyArray<string>;
	}>;
	readonly computedNodes: ReadonlyMap<
		string,
		{ readonly dependencies?: ReadonlyArray<{ readonly graphNodeId: string }> }
	>;
	readonly scheduleFlush: () => void;
};

const ARM_RECORDS = 'script[type="markless/arm"]';
const STATE_PATCH = 'script[type="markless/state-patch"]';

export function marklessStreamedArms<Load extends SymbolLoader>(
	root: StreamRoot,
	loadSymbol: Load,
): { readonly loadSymbol: Load; readonly started: () => void } {
	const idle = { loadSymbol, started() {} };
	const document = root.ownerDocument;
	const viewText = root.querySelector('script[type="markless/view"]')?.textContent;
	if (!document || !viewText) return idle;
	const query = (selector: string, attribute: string, value: string) =>
		document.querySelector(`${selector}[${attribute}="${CSS.escape(value)}"]`);
	const template = (id: string) => query('template', 'm\\:arm', id) as HTMLTemplateElement | null;
	const view = JSON.parse(viewText) as ProtocolViewPayload;
	const open = Reflect.get(document, PROTOCOL_STREAM_OPEN_PROPERTY) as Promise<void> | undefined;
	const streaming = !!open || document.readyState === 'loading';
	const byRunner = new Map<string, StreamedState>();
	const byUpdate = new Map<string, StreamedState>();
	const byBoundary = new Map<string, StreamedState>();
	for (const boundary of view.asyncBoundaries) {
		const runnerGraphNodeId = boundary.runnerGraphNodeId;
		const runnerSymbolId =
			boundary.asyncReads.find((read) => read.graphNodeId === runnerGraphNodeId)
				?.runnerSymbolId ??
			(runnerGraphNodeId ? view.asyncRunners?.[runnerGraphNodeId] : undefined);
		if (
			boundary.initiallyServedArm !== ASYNC_BOUNDARY_ARM.pending ||
			!boundary.updateSymbolId ||
			!runnerGraphNodeId ||
			!runnerSymbolId ||
			(!streaming && !template(boundary.id))
		)
			continue;
		let resolve: StreamedState['resolve'];
		const state: StreamedState = {
			boundaryId: boundary.id,
			runnerGraphNodeId,
			arrived: new Promise((done) => (resolve = done)),
		};
		state.resolve = resolve;
		byRunner.set(runnerSymbolId, state);
		byUpdate.set(boundary.updateSymbolId, state);
		byBoundary.set(boundary.id, state);
	}
	// Cells a lean dispatch already wrote: arms the stream showed before this runtime woke read them stale.
	const written = new Set(root.__marklessEventOnlyGraph?.keys() ?? []);
	const servedStale = written.size > 0 && !!document.querySelector(ARM_RECORDS);
	if (byBoundary.size === 0 && !servedStale) return idle;

	const derivedFrom = new Map<string, ReadonlyArray<{ readonly graphNodeId: string }>>();
	const learn = (delta: StateDelta | null | undefined) => {
		for (const node of delta?.computed ?? [])
			if (node.dependencies) derivedFrom.set(node.graphNodeId, node.dependencies);
	};
	const stateText = root.querySelector('script[type="markless/state"]')?.textContent;
	if (stateText)
		learn(decodeProtocolPayloadLists('markless/state', JSON.parse(stateText) as StateDelta));
	for (const patch of document.querySelectorAll(STATE_PATCH))
		learn(JSON.parse(patch.textContent ?? 'null') as StateDelta | null);

	const take = (state: StreamedState): void => {
		const arm = template(state.boundaryId);
		const records = query(ARM_RECORDS, 'data-boundary', state.boundaryId);
		if (!arm || !records) return state.resolve?.(undefined);
		const patch = query(STATE_PATCH, 'data-graph-node', state.runnerGraphNodeId);
		const delta = patch
			? decodeProtocolPayloadLists(
					'markless/state',
					JSON.parse(patch.textContent ?? 'null') as StateDelta | null,
				)
			: null;
		learn(delta);
		state.resolve?.({
			html: arm.innerHTML,
			patch: JSON.parse(records.textContent ?? 'null') as ProtocolStreamedArmPatch,
			state: delta,
		});
	};
	root.__mArmLive = (boundaryId) => {
		const state = byBoundary.get(boundaryId);
		if (state) take(state);
		return !!state;
	};
	for (const state of byBoundary.values()) if (template(state.boundaryId)) take(state);
	// A stream that closed without an arm leaves the boundary to the client settle path.
	const closed = () => {
		for (const state of byBoundary.values())
			if (!query(ARM_RECORDS, 'data-boundary', state.boundaryId)) state.resolve?.(undefined);
	};
	if (open) void open.then(closed);
	else if (streaming) document.addEventListener('DOMContentLoaded', closed, { once: true });
	else closed();

	let internals: Internals | undefined;
	// Subscriptions that read a written cell are dirtied as they register.
	let refreshing = servedStale;
	// While a streamed arm registers, its other bindings would only repeat the streamed HTML.
	let adopting = false;
	const affected = (graphNodeId: string, seen = new Set<string>()): boolean => {
		if (written.has(graphNodeId)) return true;
		if (seen.has(graphNodeId)) return false;
		seen.add(graphNodeId);
		return [
			...(internals?.computedNodes.get(graphNodeId)?.dependencies ?? []),
			...(derivedFrom.get(graphNodeId) ?? []),
		].some((dependency) => affected(dependency.graphNodeId, seen));
	};
	const inner = derivedReconcilePlane();
	if (inner)
		installDerivedReconcilePlane((captured) => {
			installDerivedReconcilePlane(inner);
			const graph = (internals = captured as unknown as Internals);
			const add = graph.addSubscription;
			graph.addSubscription = (subscription) => {
				if (adopting) {
					const run = subscription.run;
					subscription.run = (value) =>
						adopting && !affected(subscription.graphNodeId) ? undefined : run(value);
				}
				if ((refreshing || adopting) && affected(subscription.graphNodeId)) {
					graph.dirtyPaths.push({
						graphNodeId: subscription.graphNodeId,
						path: subscription.path ?? [],
					});
					graph.scheduleFlush();
				}
				add(subscription);
			};
			const plane = inner(captured);
			return {
				...plane,
				recordWrite(graphNodeId, path) {
					if (graph.cells.has(graphNodeId)) written.add(graphNodeId);
					plane.recordWrite(graphNodeId, path);
				},
			};
		});
	const endAdoption = () =>
		setTimeout(async () => {
			const registering = root.__marklessArmRegistering;
			if (registering?.size) {
				await Promise.all(registering);
				return endAdoption();
			}
			adopting = false;
		});

	const wrapped = (symbolId: string) => {
		const runner = byRunner.get(symbolId);
		if (runner)
			return async (context: unknown) => {
				if (!runner.runnerAnswered) {
					const snapshot = (await runner.arrived)?.state?.computed.find(
						(computed) => computed.graphNodeId === runner.runnerGraphNodeId,
					)?.snapshot;
					if (snapshot?.status === 'fulfilled') {
						const value = await deserialize(snapshot.value as SerializedGraphPayload);
						runner.runnerAnswered = { value };
						return value;
					}
					if (snapshot?.status === 'rejected') {
						runner.runnerAnswered = { rejected: true };
						throw await deserialize(snapshot.error as SerializedGraphPayload);
					}
				}
				return ((await loadSymbol(symbolId)) as (context: unknown) => unknown)(context);
			};
		const update = byUpdate.get(symbolId);
		if (update)
			return async (context: {
				readonly status: 'fulfilled' | 'rejected';
				readonly graph: {
					readonly read: (graphNodeId: string, path?: ReadonlyArray<string>) => unknown;
				};
			}) => {
				const answered = update.runnerAnswered;
				const fresh =
					!update.consumed &&
					!!answered &&
					(answered.rejected
						? context.status === 'rejected'
						: context.status === 'fulfilled' &&
							context.graph.read(update.runnerGraphNodeId, ['value']) ===
								answered.value);
				update.consumed = true;
				const arm = fresh ? await update.arrived : undefined;
				if (!arm)
					return ((await loadSymbol(symbolId)) as (context: unknown) => unknown)(context);
				template(update.boundaryId)?.remove();
				adopting = true;
				endAdoption();
				return {
					arm: arm.patch[0],
					html: arm.html,
					armRecords: arm.patch[1],
					computed: arm.state?.computed,
					cells: await Promise.all(
						(arm.state?.cells ?? []).map(async (cell) => ({
							graphNodeId: cell.graphNodeId,
							value: await deserialize(cell.value as SerializedGraphPayload),
						})),
					),
				};
			};
		return loadSymbol(symbolId);
	};
	return {
		loadSymbol: wrapped as Load,
		started() {
			refreshing = false;
		},
	};
}

async function deserialize(payload: SerializedGraphPayload): Promise<unknown> {
	const { deserializeGraphValueForClient } =
		await import('../../../serializer/src/value-decode-client-lazy.ts');
	return deserializeGraphValueForClient(payload);
}
