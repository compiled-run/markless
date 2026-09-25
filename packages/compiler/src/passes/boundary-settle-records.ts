import { ASYNC_BOUNDARY_ARM } from '@markless/serializer/protocol';
import type {
	CaptureAnalysisArtifact,
	ProtocolViewPayloadWithArmRecords,
	RenderDataArtifact,
	SemanticMarkupChunk,
} from '../artifacts.ts';

// Records a client-settled boundary arm registers, so it comes back as live as a served arm.

export type BoundarySettleLocator = {
	readonly hostNodeId: string;
	readonly index: number;
	readonly tagName: string;
	/** How many of the arm's repeats render before this element; their rows shift its index. */
	readonly repeats?: number;
};

export type BoundarySettleRecordSet = {
	readonly locators: ReadonlyArray<BoundarySettleLocator>;
	readonly events: ProtocolViewPayloadWithArmRecords['events'];
	readonly domUpdates: ProtocolViewPayloadWithArmRecords['domUpdates'];
	readonly behaviors: ProtocolViewPayloadWithArmRecords['behaviors'];
	readonly elementHandles: ProtocolViewPayloadWithArmRecords['elementHandles'];
	readonly keyedRepeats?: NonNullable<ProtocolViewPayloadWithArmRecords['keyedRepeats']>;
	readonly branches?: ReadonlyArray<unknown>;
};

export type BoundarySettleRecords = {
	/** One set per emitted arm, in the update module's arm order (try, then catch). */
	readonly arms: ReadonlyArray<BoundarySettleRecordSet>;
	/** Elements one row renders, per repeat of each arm in document order. */
	readonly rowElements: ReadonlyArray<ReadonlyArray<number>>;
};

export type BoundarySettleRecordsInput = {
	readonly boundaryId: string;
	readonly protocolView?: ProtocolViewPayloadWithArmRecords;
	readonly renderData: RenderDataArtifact;
	readonly captureAnalysis: CaptureAnalysisArtifact;
	/** Repeat parts per emitted arm; the plan must agree with what the module renders. */
	readonly repeatPartCounts: ReadonlyArray<number>;
};

// Null when an element position cannot be stated exactly; the settle then commits html only.
export function boundarySettleRecords(
	input: BoundarySettleRecordsInput,
): BoundarySettleRecords | null {
	const view = input.protocolView;
	if (!view) return null;
	const boundary = view.asyncBoundaries.find((candidate) => candidate.id === input.boundaryId);
	const planned = boundary?.armRecords;
	const renderBoundary = input.renderData.boundaries.find(
		(candidate) => candidate.boundaryId === input.boundaryId,
	);
	if (!boundary || !planned || !renderBoundary) return null;
	const armSlots = [
		{ chunkId: renderBoundary.armChunkIds.try, protocolArm: ASYNC_BOUNDARY_ARM.try },
		...(renderBoundary.armChunkIds.catch
			? [{ chunkId: renderBoundary.armChunkIds.catch, protocolArm: ASYNC_BOUNDARY_ARM.catch }]
			: []),
	];
	const unbind = unboundSymbolId(input.captureAnalysis);
	const arms: BoundarySettleRecordSet[] = [];
	const rowElements: Array<ReadonlyArray<number>> = [];
	for (const [position, slot] of armSlots.entries()) {
		const set = planned[slot.protocolArm];
		const layout = armElementLayout(input.renderData, slot.chunkId);
		if (!set || !layout) return null;
		if (layout.rowElements.length !== (input.repeatPartCounts[position] ?? 0)) return null;
		const plannedHostIds = new Set(set.locators.map((locator) => locator.hostNodeId));
		const locators = layout.hosts.filter((host) => plannedHostIds.has(host.hostNodeId));
		const hostIds = new Set(locators.map((locator) => locator.hostNodeId));
		const hosted = (record: { readonly hostNodeId: string }) => hostIds.has(record.hostNodeId);
		const keyedRepeats = (view.keyedRepeats ?? [])
			.filter((repeat) => hostIds.has(repeat.ownerHostNodeId ?? repeat.parentHostNodeId))
			.map((repeat) => ({
				...repeat,
				rowEvents: repeat.rowEvents.map((event) => ({
					...event,
					symbolIds: event.symbolIds.map(unbind),
				})),
			}));
		arms.push({
			locators,
			events: set.events.filter(hosted).map((event) => ({
				...event,
				symbolIds: event.symbolIds.map(unbind),
			})),
			domUpdates: view.domUpdates.filter(hosted).map((update) => ({
				...update,
				...(update.symbolId ? { symbolId: unbind(update.symbolId) } : {}),
			})),
			behaviors: set.behaviors.filter(hosted),
			elementHandles: set.elementHandles.filter(hosted),
			...(keyedRepeats.length > 0 ? { keyedRepeats } : {}),
			...(set.branches?.length ? { branches: set.branches } : {}),
		});
		rowElements.push(layout.rowElements);
	}
	// Pay-per-use: an arm whose only bindings show the settled value needs no records.
	const settledReads = new Set(boundary.asyncReads.map((read) => read.graphNodeId));
	const registers = arms.some(
		(arm) =>
			arm.events.length > 0 ||
			arm.behaviors.length > 0 ||
			arm.elementHandles.length > 0 ||
			(arm.keyedRepeats?.length ?? 0) > 0 ||
			(arm.branches?.length ?? 0) > 0 ||
			arm.domUpdates.some((update) => !settledReads.has(update.graphNodeId)),
	);
	return registers ? { arms, rowElements } : null;
}

// A served arm's records are composed with base symbol ids; a settled arm matches them.
function unboundSymbolId(captureAnalysis: CaptureAnalysisArtifact): (symbolId: string) => string {
	const baseById = new Map(
		(captureAnalysis.boundResolverRows ?? []).map((row) => [row.id, row.baseSymbolId]),
	);
	return (symbolId) => baseById.get(symbolId) ?? symbolId;
}

type ArmElementLayout = {
	readonly hosts: ReadonlyArray<BoundarySettleLocator>;
	readonly rowElements: ReadonlyArray<number>;
};

// Document order: elements outside rows count once, each repeat contributes rows times its row size.
function armElementLayout(
	renderData: RenderDataArtifact,
	chunkId: string,
): ArmElementLayout | null {
	const chunk = renderData.chunks.find((candidate) => candidate.id === chunkId);
	if (!chunk) return null;
	const hosts: BoundarySettleLocator[] = [];
	const rowElements: number[] = [];
	for (const entry of documentOrder(chunk)) {
		if (entry.host) {
			hosts.push({
				hostNodeId: entry.host.hostNodeId,
				index: hosts.length,
				tagName: entry.host.tagName,
				...(rowElements.length > 0 ? { repeats: rowElements.length } : {}),
			});
			continue;
		}
		const slot = entry.slot!;
		if (slot.kind === 'repeat') {
			const repeat = renderData.repeats.find(
				(candidate) => candidate.repeatId === slot.repeatId,
			);
			const row = renderData.chunks.find((candidate) => candidate.id === repeat?.rowChunkId);
			if (!row || row.slots.some((rowSlot) => rowSlot.kind !== 'text')) return null;
			rowElements.push(row.hosts.length);
			continue;
		}
		if (slot.kind !== 'text' && slot.kind !== 'attribute') return null;
	}
	return { hosts, rowElements };
}

function documentOrder(chunk: SemanticMarkupChunk) {
	return [
		...chunk.hosts.map((host) => ({
			path: host.coordinate.path,
			order: 0,
			host,
			slot: undefined,
		})),
		...chunk.slots.map((slot, order) => ({
			path: slot.coordinate.path,
			order: order + 1,
			host: undefined,
			slot,
		})),
	].sort((left, right) => comparePath(left.path, right.path) || left.order - right.order);
}

function comparePath(left: ReadonlyArray<number>, right: ReadonlyArray<number>): number {
	for (let index = 0; index < Math.min(left.length, right.length); index++) {
		const difference = left[index]! - right[index]!;
		if (difference !== 0) return difference;
	}
	return left.length - right.length;
}
