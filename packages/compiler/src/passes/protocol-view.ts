import { ASYNC_PROTOCOL_VERSION, type ProtocolViewPayload } from '@markless/serializer';
import type { ProtocolViewPayloadInput } from '../artifacts.ts';

export function createProtocolViewPayload(input: ProtocolViewPayloadInput): ProtocolViewPayload {
	const eventSymbols = new Map<string, string[]>();
	const domUpdateSymbols = new Map<string, string>();
	const behaviorSymbols = new Map<string, string[]>();
	const asyncRunnerSymbols = new Map<string, string>();

	for (const symbol of input.symbolResolver.symbols) {
		if (symbol.kind === 'event-handler') {
			const key = `${symbol.hostNodeId}:${symbol.eventName}`;
			const symbols = eventSymbols.get(key) ?? [];
			symbols[symbol.order] = symbol.id;
			eventSymbols.set(key, symbols);
		}

		if (symbol.kind === 'dom-update') {
			domUpdateSymbols.set(
				`${symbol.hostNodeId}:${domUpdateTargetKey(symbol.target)}:${symbol.graphNodeId}:${symbol.source}`,
				symbol.id,
			);
		}

		if (symbol.kind === 'behavior') {
			const symbols = behaviorSymbols.get(symbol.hostNodeId) ?? [];
			symbols[symbol.order] = symbol.id;
			behaviorSymbols.set(symbol.hostNodeId, symbols);
		}

		if (symbol.kind === 'async-computed-runner') {
			asyncRunnerSymbols.set(symbol.graphNodeId, symbol.id);
		}
	}

	return {
		version: ASYNC_PROTOCOL_VERSION,
		locators: input.payloadArena.view.locators,
		events: input.payloadArena.view.events.map((event) => ({
			hostNodeId: event.hostNodeId,
			eventName: event.eventName,
			syncPolicy: event.syncPolicy,
			symbolIds: eventSymbols.get(`${event.hostNodeId}:${event.eventName}`) ?? [],
		})),
		domUpdates: input.payloadArena.view.domUpdates.map((domUpdate) => ({
			...domUpdate,
			symbolId: domUpdateSymbols.get(
				`${domUpdate.hostNodeId}:${domUpdateTargetKey(domUpdate.target)}:${domUpdate.graphNodeId}:${domUpdate.source}`,
			),
		})),
		behaviors: input.payloadArena.view.behaviors.map((behavior, index) => ({
			...behavior,
			symbolId: behaviorSymbols.get(behavior.hostNodeId)?.[index],
		})),
		elementHandles: input.payloadArena.view.elementHandles,
		// Only gate-supported boundaries have SSR-emitted anchors; shipping
		// records for ungated boundaries would make resume throw
		// missingCommentAnchorError. Re-index contiguously over the emitted set.
		keyedRepeats: resumableKeyedRepeats(input),
		// Branch and boundary anchor pairs share one document-order stream, so
		// re-indexing allocates over the emitted union in anchorOrder.
		branches: supportedBranchRecords(input),
		asyncBoundaries: supportedAsyncBoundaries(input).map(
			({ kind: _kind, anchorOrder: _order, ...boundary }) => ({
				...boundary,
				updateSymbolId: boundaryUpdateSymbols(input).get(boundary.id),
				startAnchor: {
					...boundary.startAnchor,
					index: emittedPairRank(input, boundary.id) * 2,
				},
				endAnchor: {
					...boundary.endAnchor,
					index: emittedPairRank(input, boundary.id) * 2 + 1,
				},
				asyncReads: boundary.asyncReads.map((read) => ({
					...read,
					runnerSymbolId: asyncRunnerSymbols.get(read.graphNodeId),
				})),
			}),
		),
	};
}

function domUpdateTargetKey(
	target: ProtocolViewPayloadInput['payloadArena']['view']['domUpdates'][number]['target'],
): string {
	if (target.kind === 'attribute') return `attribute:${target.name}`;
	if (target.kind === 'property') return `property:${target.name}`;
	if (target.kind === 'text') {
		return `text:${target.prefix ?? ''}:${target.suffix ?? ''}:${target.trueValue ?? ''}:${target.falseValue ?? ''}`;
	}
	if (target.kind === 'class')
		return `class:${target.trueValue ?? ''}:${target.falseValue ?? ''}`;
	return target.kind;
}

function supportedAsyncBoundaries(input: ProtocolViewPayloadInput) {
	const supported = new Set(
		input.publicRenderPlan.asyncBoundaryGates.flatMap((gate) =>
			gate.supported ? [gate.boundaryId] : [],
		),
	);
	return input.payloadArena.view.asyncBoundaries.filter((boundary) => supported.has(boundary.id));
}

function supportedBranchIds(input: ProtocolViewPayloadInput): ReadonlySet<string> {
	return new Set(
		(input.publicRenderPlan.branchReactivityGates ?? []).flatMap((gate) =>
			gate.supported ? [gate.branchSiteId] : [],
		),
	);
}

function emittedAnchorPairs(input: ProtocolViewPayloadInput) {
	const branchIds = supportedBranchIds(input);
	const supportedBoundaryIds = new Set(
		input.publicRenderPlan.asyncBoundaryGates.flatMap((gate) =>
			gate.supported ? [gate.boundaryId] : [],
		),
	);
	return [
		...(input.payloadArena.view.branchSites ?? []).filter((site) => branchIds.has(site.id)),
		...input.payloadArena.view.asyncBoundaries
			.filter((boundary) => supportedBoundaryIds.has(boundary.id))
			.map((boundary) => ({ id: boundary.id, anchorOrder: boundary.anchorOrder })),
	].sort((left, right) => left.anchorOrder - right.anchorOrder);
}

function emittedPairRank(input: ProtocolViewPayloadInput, id: string): number {
	return emittedAnchorPairs(input).findIndex((pair) => pair.id === id);
}

function supportedBranchRecords(input: ProtocolViewPayloadInput) {
	const branchIds = supportedBranchIds(input);
	const branchSymbols = new Map(
		input.symbolResolver.symbols.flatMap((symbol) =>
			symbol.kind === 'branch-update' ? [[symbol.branchSiteId, symbol] as const] : [],
		),
	);
	const armsBySite = new Map(
		(input.publicRenderPlan.branchArms ?? []).map((entry) => [entry.branchSiteId, entry]),
	);
	return (input.payloadArena.view.branchSites ?? [])
		.filter((site) => branchIds.has(site.id))
		.map((site) => ({
			id: site.id,
			startAnchor: {
				strategy: 'dom-order-comment' as const,
				index: emittedPairRank(input, site.id) * 2,
			},
			endAnchor: {
				strategy: 'dom-order-comment' as const,
				index: emittedPairRank(input, site.id) * 2 + 1,
			},
			symbolId: armsBySite.get(site.id) ? branchSymbols.get(site.id)?.id : undefined,
			testReads: branchSymbols.get(site.id)?.testReads ?? [],
			armTests: armsBySite.get(site.id)?.armTests,
		}));
}

// Row event symbols already exist on the row host nodes; the record maps
// row-relative host paths to them so resume can dispatch per row instance
// with keys derived from the serialized collection by row index.
function resumableKeyedRepeats(input: ProtocolViewPayloadInput) {
	const planEntries = new Map(
		input.publicRenderPlan.keyedRepeats.map((entry) => [entry.repeatId, entry]),
	);
	return (input.payloadArena.view.keyedRepeats ?? []).flatMap((repeat) => {
		const plan = planEntries.get(repeat.id);
		if (!plan || plan.rowElementCount === undefined) return [];
		return [
			{
				id: repeat.id,
				parentHostNodeId: repeat.parentHostNodeId,
				collectionGraphNodeId: repeat.collectionGraphNodeId,
				collectionPath: repeat.collectionPath,
				keyPath: repeat.keyPath,
				itemName: plan.itemName,
				rowElementCount: plan.rowElementCount,
				rowEvents: plan.eventControls.map((control) => ({
					hostPath: control.hostPath,
					eventName: control.eventName,
					symbolIds: [control.symbolId],
				})),
			},
		];
	});
}

function boundaryUpdateSymbols(input: ProtocolViewPayloadInput): ReadonlyMap<string, string> {
	const armsBoundaries = new Set(
		(input.publicRenderPlan.asyncBoundaryArms ?? []).map((entry) => entry.boundaryId),
	);
	return new Map(
		input.symbolResolver.symbols.flatMap((symbol) =>
			symbol.kind === 'async-boundary-update' && armsBoundaries.has(symbol.boundaryId)
				? [[symbol.boundaryId, symbol.id] as const]
				: [],
		),
	);
}
