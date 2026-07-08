import { ASYNC_PROTOCOL_VERSION } from '@markless/serializer';
import {
	armScopedBranchHostIds,
	armScopedBranchRecords,
} from '../artifact-helpers/arm-branch-records.ts';
import type {
	ProtocolViewArmRecordSet,
	ProtocolViewPayloadInput,
	ProtocolViewPayloadWithArmRecords,
} from '../artifacts.ts';

export function createProtocolViewPayload(
	input: ProtocolViewPayloadInput,
): ProtocolViewPayloadWithArmRecords {
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

	// Branch-arm hosts and async-boundary-arm hosts leave every flat stream:
	// their records ride armRecords in the owning range's coordinate space,
	// since page-absolute locators cannot name elements a flip or an async
	// settle replaces (D3).
	const excludedHostIds = new Set([...armHostIds(input), ...boundaryArmHostIds(input)]);
	return {
		version: ASYNC_PROTOCOL_VERSION,
		locators: input.payloadArena.view.locators.filter(
			(locator) => !excludedHostIds.has(locator.hostNodeId),
		),
		events: input.payloadArena.view.events
			.filter((event) => !excludedHostIds.has(event.hostNodeId))
			.map((event) => ({
				hostNodeId: event.hostNodeId,
				eventName: event.eventName,
				syncPolicy: event.syncPolicy,
				symbolIds: eventSymbols.get(`${event.hostNodeId}:${event.eventName}`) ?? [],
			})),
		domUpdates: input.payloadArena.view.domUpdates
			.filter((domUpdate) => !armHostIds(input).has(domUpdate.hostNodeId))
			.map((domUpdate) => ({
				...domUpdate,
				symbolId: domUpdateSymbols.get(
					`${domUpdate.hostNodeId}:${domUpdateTargetKey(domUpdate.target)}:${domUpdate.graphNodeId}:${domUpdate.source}`,
				),
			})),
		behaviors: input.payloadArena.view.behaviors
			.filter((behavior) => !excludedHostIds.has(behavior.hostNodeId))
			.map((behavior, index) => ({
				...behavior,
				symbolId: behaviorSymbols.get(behavior.hostNodeId)?.[index],
			})),
		elementHandles: input.payloadArena.view.elementHandles.filter(
			(handle) => !excludedHostIds.has(handle.hostNodeId),
		),
		// Only gate-supported boundaries have SSR-emitted anchors; shipping
		// records for ungated boundaries would make resume throw
		// missingCommentAnchorError. Re-index contiguously over the emitted set.
		keyedRepeats: resumableKeyedRepeats(input),
		// Branch and boundary anchor pairs share one document-order stream, so
		// re-indexing allocates over the emitted union in anchorOrder.
		branches: supportedBranchRecords(input),
		asyncBoundaries: supportedAsyncBoundaries(input).map(
			({ kind: _kind, anchorOrder: _order, armRecords, ...boundary }) => ({
				...boundary,
				armRecords: armRecords.map((set, arm) =>
					wiredArmRecordSet(input, set, boundary.id, arm),
				),
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
	// armScoped branches render as anchor-less ternaries re-evaluated on arm
	// settle (need 8): no flip records, no anchor pairs.
	return new Set(
		(input.publicRenderPlan.branchReactivityGates ?? []).flatMap((gate) =>
			gate.supported && gate.armScoped !== true ? [gate.branchSiteId] : [],
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
			declaredEmptyArms: armsBySite.get(site.id)?.declaredEmptyArms,
			armRecords: branchArmRecords(input, site.id),
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
	// Parts-based (tier 3) and component-executing (tier 4) update modules
	// share the async-boundary-update wiring: either one settles the range.
	const armsBoundaries = new Set([
		...(input.publicRenderPlan.asyncBoundaryArms ?? []).map((entry) => entry.boundaryId),
		...(input.publicRenderPlan.asyncBoundaryArmRenders ?? []).map((entry) => entry.boundaryId),
	]);
	return new Map(
		input.symbolResolver.symbols.flatMap((symbol) =>
			symbol.kind === 'async-boundary-update' && armsBoundaries.has(symbol.boundaryId)
				? [[symbol.boundaryId, symbol.id] as const]
				: [],
		),
	);
}

// Hosts inside a supported boundary's arms: their records nest under the
// boundary in arm-relative coordinates instead of riding the flat streams.
function boundaryArmHostIds(input: ProtocolViewPayloadInput): ReadonlySet<string> {
	return new Set(
		supportedAsyncBoundaries(input).flatMap((boundary) =>
			boundary.armRecords.flatMap((set) => set.locators.map((locator) => locator.hostNodeId)),
		),
	);
}

// Attaches lazy symbol IDs to a planned arm record set (the flat-stream
// wiring, applied inside the boundary's coordinate space). Hosts owned by an
// arm-scoped flip site leave the boundary's sets — their records nest under
// the flip record and re-register on every flip (D1 tier 3 inside arms).
function wiredArmRecordSet(
	input: ProtocolViewPayloadInput,
	set: ProtocolViewPayloadInput['payloadArena']['view']['asyncBoundaries'][number]['armRecords'][number],
	boundaryId: string,
	arm: number,
): ProtocolViewArmRecordSet {
	const flipHostIds = armScopedBranchHostIds(input.publicRenderPlan.branchArms, boundaryId);
	const eventSymbols = new Map<string, string[]>();
	for (const symbol of input.symbolResolver.symbols) {
		if (symbol.kind !== 'event-handler') continue;
		const key = `${symbol.hostNodeId}:${symbol.eventName}`;
		const symbols = eventSymbols.get(key) ?? [];
		symbols[symbol.order] = symbol.id;
		eventSymbols.set(key, symbols);
	}
	const branches = armScopedBranchRecords({
		publicRenderPlan: input.publicRenderPlan,
		symbols: input.symbolResolver.symbols,
		payloadView: input.payloadArena.view,
		boundaryId,
		arm,
	});
	return {
		locators: set.locators.filter((locator) => !flipHostIds.has(locator.hostNodeId)),
		events: set.events
			.filter((event) => !flipHostIds.has(event.hostNodeId))
			.map((event) => ({
				hostNodeId: event.hostNodeId,
				eventName: event.eventName,
				syncPolicy: event.syncPolicy,
				symbolIds: eventSymbols.get(`${event.hostNodeId}:${event.eventName}`) ?? [],
			})),
		behaviors: set.behaviors
			.filter((behavior) => !flipHostIds.has(behavior.hostNodeId))
			.map((behavior, index) => ({
				...behavior,
				symbolId: behaviorSymbolsForArms(input).get(behavior.hostNodeId)?.[index],
			})),
		elementHandles: set.elementHandles.filter((handle) => !flipHostIds.has(handle.hostNodeId)),
		...(branches ? { branches } : {}),
	};
}

function armHostIds(input: ProtocolViewPayloadInput): ReadonlySet<string> {
	return new Set(
		(input.publicRenderPlan.branchArms ?? []).flatMap((entry) =>
			(entry.armHosts ?? []).flatMap((arm) => arm.map((host) => host.hostNodeId)),
		),
	);
}

// Per-arm records for gate-supported branch sites: everything the resume
// runtime must rewire when an arm flips in, addressed by arm-relative host
// paths (the keyed-repeat rowEvents convention).
function branchArmRecords(input: ProtocolViewPayloadInput, branchSiteId: string) {
	const arms = (input.publicRenderPlan.branchArms ?? []).find(
		(entry) => entry.branchSiteId === branchSiteId,
	);
	if (!arms?.armHosts) return undefined;
	const eventSymbols = new Map<string, string[]>();
	const domUpdateSymbols = new Map<string, string>();
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
	}
	return arms.armHosts.map((armHostList) => {
		const hostIds = new Map(armHostList.map((host) => [host.hostNodeId, host.hostPath]));
		return {
			events: input.payloadArena.view.events
				.filter((event) => hostIds.has(event.hostNodeId))
				.map((event) => ({
					hostPath: hostIds.get(event.hostNodeId)!,
					eventName: event.eventName,
					syncPolicy: event.syncPolicy,
					symbolIds: eventSymbols.get(`${event.hostNodeId}:${event.eventName}`) ?? [],
				})),
			domUpdates: input.payloadArena.view.domUpdates
				.filter((domUpdate) => hostIds.has(domUpdate.hostNodeId))
				.map((domUpdate) => ({
					...domUpdate,
					hostPath: hostIds.get(domUpdate.hostNodeId)!,
					symbolId: domUpdateSymbols.get(
						`${domUpdate.hostNodeId}:${domUpdateTargetKey(domUpdate.target)}:${domUpdate.graphNodeId}:${domUpdate.source}`,
					),
				})),
			behaviors: input.payloadArena.view.behaviors
				.filter((behavior) => hostIds.has(behavior.hostNodeId))
				.map((behavior, index) => ({
					...behavior,
					hostPath: hostIds.get(behavior.hostNodeId)!,
					symbolId: behaviorSymbolsForArms(input).get(behavior.hostNodeId)?.[index],
				})),
			elementHandles: input.payloadArena.view.elementHandles
				.filter((handle) => hostIds.has(handle.hostNodeId))
				.map((handle) => ({
					...handle,
					hostPath: hostIds.get(handle.hostNodeId)!,
				})),
		};
	});
}

function behaviorSymbolsForArms(input: ProtocolViewPayloadInput): ReadonlyMap<string, string[]> {
	const behaviorSymbols = new Map<string, string[]>();
	for (const symbol of input.symbolResolver.symbols) {
		if (symbol.kind !== 'behavior') continue;
		const symbols = behaviorSymbols.get(symbol.hostNodeId) ?? [];
		symbols[symbol.order] = symbol.id;
		behaviorSymbols.set(symbol.hostNodeId, symbols);
	}
	return behaviorSymbols;
}
