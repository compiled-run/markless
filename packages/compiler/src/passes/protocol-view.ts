import { ASYNC_PROTOCOL_VERSION } from '@markless/serializer';
import type {
	PlannedSymbol,
	ProtocolViewArmRecordSet,
	ProtocolViewPayloadInput,
	ProtocolViewPayloadWithArmRecords,
	RenderDataArtifact,
} from '../artifacts.ts';

function renderDataOf(input: ProtocolViewPayloadInput): RenderDataArtifact {
	if (!input.renderData) {
		throw new Error('createProtocolViewPayload requires the registered renderData artifact.');
	}
	return input.renderData;
}

export function createProtocolViewPayload(
	input: ProtocolViewPayloadInput,
): ProtocolViewPayloadWithArmRecords {
	const boundEventSymbols = boundEventSymbolIds(input);
	const boundDomUpdateSymbols = boundDomUpdateSymbolIds(input);
	const eventSymbols = new Map<string, string[]>();
	const domUpdateSymbols = new Map<string, string>();
	const behaviorSymbols = new Map<string, string[]>();
	const asyncRunnerSymbols = new Map<string, string>();

	for (const symbol of input.symbolResolver.symbols) {
		if (symbol.kind === 'event-handler') {
			const key = `${symbol.hostNodeId}:${symbol.eventName}`;
			const symbols = eventSymbols.get(key) ?? [];
			symbols[symbol.order] = boundEventSymbols.get(symbol.id) ?? symbol.id;
			eventSymbols.set(key, symbols);
		}

		if (symbol.kind === 'dom-update') {
			domUpdateSymbols.set(
				`${symbol.hostNodeId}:${domUpdateTargetKey(symbol.target)}:${symbol.graphNodeId}:${symbol.source}`,
				boundDomUpdateSymbols.get(symbol.id) ?? symbol.id,
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
		...optionalAsyncRunnerRegistry(input, asyncRunnerSymbols),
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
				asyncReads: protocolAsyncBoundaryReads(input, boundary).map((read) => ({
					...read,
					runnerSymbolId: asyncRunnerSymbols.get(read.graphNodeId),
				})),
			}),
		),
	};
}

function protocolAsyncBoundaryReads(
	input: ProtocolViewPayloadInput,
	// Only the boundary's reads are walked, so partially projected boundaries qualify.
	boundary: Pick<
		ProtocolViewPayloadInput['payloadArena']['view']['asyncBoundaries'][number],
		'asyncReads'
	>,
): ProtocolViewPayloadInput['payloadArena']['view']['asyncBoundaries'][number]['asyncReads'] {
	const computedByGraphNode = new Map(
		input.payloadArena.state.computed.map((computed) => [computed.graphNodeId, computed]),
	);
	const reads: ProtocolViewPayloadInput['payloadArena']['view']['asyncBoundaries'][number]['asyncReads'][number][] =
		[];
	const seen = new Set<string>();
	const visit = (graphNodeId: string, source: string, path: ReadonlyArray<string>): void => {
		const computed = computedByGraphNode.get(graphNodeId);
		if (!computed || computed.async === true) {
			if (seen.has(graphNodeId)) return;
			seen.add(graphNodeId);
			reads.push({ source, graphNodeId, path });
			return;
		}
		for (const dependency of computed.dependencies ?? []) {
			visit(dependency.graphNodeId, source, dependency.path);
		}
	};
	for (const read of boundary.asyncReads) {
		visit(read.graphNodeId, read.source, read.path);
		const computed = computedByGraphNode.get(read.graphNodeId);
		if (computed?.async === false && !seen.has(read.graphNodeId)) {
			seen.add(read.graphNodeId);
			reads.push(read);
		}
	}
	return reads;
}

function optionalAsyncRunnerRegistry(
	input: ProtocolViewPayloadInput,
	runnerSymbols: ReadonlyMap<string, string>,
): { readonly asyncRunners?: Readonly<Record<string, string>> } {
	const computedByGraphNode = new Map(
		input.payloadArena.state.computed.map((computed) => [computed.graphNodeId, computed]),
	);
	const demanded = new Set<string>();
	const visit = (graphNodeId: string): void => {
		if (demanded.has(graphNodeId)) return;
		demanded.add(graphNodeId);
		for (const dependency of computedByGraphNode.get(graphNodeId)?.dependencies ?? []) {
			if (computedByGraphNode.has(dependency.graphNodeId)) visit(dependency.graphNodeId);
		}
	};
	for (const boundary of supportedAsyncBoundaries(input)) {
		for (const read of boundary.asyncReads) visit(read.graphNodeId);
	}

	const asyncRunners = Object.fromEntries(
		[...demanded].flatMap((graphNodeId) => {
			const symbolId = runnerSymbols.get(graphNodeId);
			return symbolId ? [[graphNodeId, symbolId]] : [];
		}),
	);
	return Object.keys(asyncRunners).length > 0 ? { asyncRunners } : {};
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
		renderDataOf(input).boundaries
			.filter((boundary) => boundary.protocolSupported)
			.map((boundary) => boundary.boundaryId),
	);
	return input.payloadArena.view.asyncBoundaries.filter((boundary) => supported.has(boundary.id));
}

function supportedBranchIds(input: ProtocolViewPayloadInput): ReadonlySet<string> {
	// armScoped branches render as anchor-less ternaries re-evaluated on arm
	// settle (need 8): no flip records, no anchor pairs.
	return new Set(
		renderDataOf(input).branches.flatMap((branch) =>
			branch.asyncBoundaryId || branch.update === 'boundary'
				? []
				: [branch.branchSiteId],
		),
	);
}

function emittedAnchorPairs(input: ProtocolViewPayloadInput) {
	const branchIds = supportedBranchIds(input);
	const supportedBoundaryIds = new Set(
		renderDataOf(input).boundaries
			.filter((boundary) => boundary.protocolSupported)
			.map((boundary) => boundary.boundaryId),
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
	return (input.payloadArena.view.branchSites ?? [])
		.filter((site) => branchIds.has(site.id))
		.map((site) => ({
			...(renderDataOf(input).branches.find(
				(branch) => branch.branchSiteId === site.id,
			)?.armTests
				? {
						armTests: renderDataOf(input).branches.find(
							(branch) => branch.branchSiteId === site.id,
						)?.armTests,
					}
				: {}),
			...(renderDataOf(input).branches.find(
				(branch) => branch.branchSiteId === site.id,
			)?.declaredEmptyArms
				? {
						declaredEmptyArms: renderDataOf(input).branches.find(
							(branch) => branch.branchSiteId === site.id,
						)?.declaredEmptyArms,
					}
				: {}),
			id: site.id,
			startAnchor: {
				strategy: 'dom-order-comment' as const,
				index: emittedPairRank(input, site.id) * 2,
			},
			endAnchor: {
				strategy: 'dom-order-comment' as const,
				index: emittedPairRank(input, site.id) * 2 + 1,
			},
			symbolId: branchSymbols.get(site.id)?.id,
			testReads: branchSymbols.get(site.id)?.testReads ?? [],
			armRecords: branchArmRecords(input, site.id),
		}));
}

// Row event symbols already exist on the row host nodes; the record maps
// row-relative host paths to them so resume can dispatch per row instance
// with keys derived from the serialized collection by row index.
function resumableKeyedRepeats(input: ProtocolViewPayloadInput) {
	const boundEventSymbols = boundEventSymbolIds(input);
	const renderEntries = new Map(
		renderDataOf(input).repeats.map((entry) => [entry.repeatId, entry]),
	);
	return (input.payloadArena.view.keyedRepeats ?? []).flatMap((repeat) => {
		const render = renderEntries.get(repeat.id);
		if (!render || render.keyPath.length === 0 || render.rowElementCount === 0) return [];
		const rowHostPaths = hostPathsForChunk(input, render.rowChunkId, true);
		return [
			{
				id: repeat.id,
				parentHostNodeId: repeat.parentHostNodeId,
				collectionGraphNodeId: repeat.collectionGraphNodeId,
				collectionPath: repeat.collectionPath,
				keyPath: repeat.keyPath,
				itemName: render.itemName,
				rowElementCount: render.rowElementCount,
				rowEvents: input.payloadArena.view.events
					.filter((event) => rowHostPaths.has(event.hostNodeId))
					.map((event) => ({
						hostPath: rowHostPaths.get(event.hostNodeId)!,
						eventName: event.eventName,
						symbolIds: eventSymbolsForHost(input, event.hostNodeId, event.eventName).map(
							(symbolId) => boundEventSymbols.get(symbolId) ?? symbolId,
						),
					})),
			},
		];
	});
}

function boundaryUpdateSymbols(input: ProtocolViewPayloadInput): ReadonlyMap<string, string> {
	// Parts-based (tier 3) and component-executing (tier 4) update modules
	// share the async-boundary-update wiring: either one settles the range.
	const armsBoundaries = new Set(
		renderDataOf(input).boundaries
			.filter((entry) => entry.protocolSupported)
			.map((entry) => entry.boundaryId),
	);
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
	const flipHostIds = armScopedBranchHostIds(input, boundaryId);
	const boundEventSymbols = boundEventSymbolIds(input);
	const eventSymbols = new Map<string, string[]>();
	for (const symbol of input.symbolResolver.symbols) {
		if (symbol.kind !== 'event-handler') continue;
		const key = `${symbol.hostNodeId}:${symbol.eventName}`;
		const symbols = eventSymbols.get(key) ?? [];
		symbols[symbol.order] = boundEventSymbols.get(symbol.id) ?? symbol.id;
		eventSymbols.set(key, symbols);
	}
	const branches = bindArmBranchEventSymbols(input, armScopedBranchRecords(input, boundaryId, arm));
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
		renderDataOf(input).branches.flatMap((branch) =>
			branch.armChunkIds.flatMap((chunkId) => [
				...hostPathsForChunk(input, chunkId).keys(),
			]),
		),
	);
}

function hostPathsForChunk(
	input: ProtocolViewPayloadInput,
	chunkId: string,
	relativeToRoot = false,
): ReadonlyMap<string, ReadonlyArray<number>> {
	const chunk = renderDataOf(input).chunks.find((candidate) => candidate.id === chunkId);
	return new Map(
		(chunk?.hosts ?? []).map((host) => [
			host.hostNodeId,
			relativeToRoot && host.coordinate.path[0] === 0
				? host.coordinate.path.slice(1)
				: host.coordinate.path,
		]),
	);
}

function eventSymbolsForHost(
	input: ProtocolViewPayloadInput,
	hostNodeId: string,
	eventName: string,
): ReadonlyArray<string> {
	return input.symbolResolver.symbols
		.filter(
			(symbol): symbol is Extract<PlannedSymbol, { kind: 'event-handler' }> =>
				symbol.kind === 'event-handler' &&
				symbol.hostNodeId === hostNodeId &&
				symbol.eventName === eventName,
		)
		.sort((left, right) => left.order - right.order)
		.map((symbol) => symbol.id);
}

function armScopedBranchHostIds(
	input: ProtocolViewPayloadInput,
	boundaryId: string,
): ReadonlySet<string> {
	return new Set(
		renderDataOf(input).branches
			.filter((branch) => branch.asyncBoundaryId === boundaryId)
			.flatMap((branch) =>
				branch.armChunkIds.flatMap((chunkId) => hostIdsForChunkTree(input, chunkId)),
			),
	);
}

function hostIdsForChunkTree(
	input: ProtocolViewPayloadInput,
	chunkId: string,
	seen = new Set<string>(),
): ReadonlyArray<string> {
	if (seen.has(chunkId)) return [];
	seen.add(chunkId);
	const data = renderDataOf(input);
	const chunk = data.chunks.find((candidate) => candidate.id === chunkId);
	if (!chunk) return [];
	const childChunkIds = chunk.slots.flatMap((slot) => {
		if (slot.kind === 'branch') return slot.armTemplateIds;
		if (slot.kind === 'repeat')
			return [slot.rowTemplateId, ...(slot.emptyTemplateId ? [slot.emptyTemplateId] : [])];
		if (slot.kind === 'async')
			return [
				slot.armTemplateIds.try,
				...(slot.armTemplateIds.pending ? [slot.armTemplateIds.pending] : []),
				...(slot.armTemplateIds.catch ? [slot.armTemplateIds.catch] : []),
			];
		if (slot.kind === 'dynamic-host') return [slot.childChunkId];
		return [];
	});
	return [
		...chunk.hosts.map((host) => host.hostNodeId),
		...childChunkIds.flatMap((childChunkId) => hostIdsForChunkTree(input, childChunkId, seen)),
	];
}

function armScopedBranchRecords(
	input: ProtocolViewPayloadInput,
	boundaryId: string,
	arm: number,
): ReadonlyArray<NonNullable<ProtocolViewArmRecordSet['branches']>[number]> | undefined {
	const branches = renderDataOf(input).branches.filter(
		(branch) =>
			branch.asyncBoundaryId === boundaryId && branch.asyncBoundaryArm === arm,
	);
	if (branches.length === 0) return undefined;
	const branchSymbols = new Map(
		input.symbolResolver.symbols.flatMap((symbol) =>
			symbol.kind === 'branch-update' ? [[symbol.branchSiteId, symbol] as const] : [],
		),
	);
	return branches.map((branch, rank) =>
		branch.update === 'boundary'
			? {
					id: branch.branchSiteId,
					testReads: branchSymbols.get(branch.branchSiteId)?.testReads ?? [],
				}
			: ({
		id: branch.branchSiteId,
		symbolId: branchSymbols.get(branch.branchSiteId)?.id,
		testReads: branchSymbols.get(branch.branchSiteId)?.testReads ?? [],
		startAnchor: { strategy: 'arm-branch-comment', index: rank * 2 },
		endAnchor: { strategy: 'arm-branch-comment', index: rank * 2 + 1 },
		armRecords: branchArmRecords(input, branch.branchSiteId),
		...(branch.armTests ? { armTests: branch.armTests } : {}),
		...(branch.declaredEmptyArms
			? { declaredEmptyArms: branch.declaredEmptyArms }
			: {}),
	}));
}

// Per-arm records for gate-supported branch sites: everything the resume
// runtime must rewire when an arm flips in, addressed by arm-relative host
// paths (the keyed-repeat rowEvents convention).
function branchArmRecords(input: ProtocolViewPayloadInput, branchSiteId: string) {
	const branch = renderDataOf(input).branches.find(
		(entry) => entry.branchSiteId === branchSiteId,
	);
	if (!branch) return undefined;
	const eventSymbols = new Map<string, string[]>();
	const boundEventSymbols = boundEventSymbolIds(input);
	const boundDomUpdateSymbols = boundDomUpdateSymbolIds(input);
	const domUpdateSymbols = new Map<string, string>();
	for (const symbol of input.symbolResolver.symbols) {
		if (symbol.kind === 'event-handler') {
			const key = `${symbol.hostNodeId}:${symbol.eventName}`;
			const symbols = eventSymbols.get(key) ?? [];
			symbols[symbol.order] = boundEventSymbols.get(symbol.id) ?? symbol.id;
			eventSymbols.set(key, symbols);
		}
		if (symbol.kind === 'dom-update') {
			domUpdateSymbols.set(
				`${symbol.hostNodeId}:${domUpdateTargetKey(symbol.target)}:${symbol.graphNodeId}:${symbol.source}`,
				boundDomUpdateSymbols.get(symbol.id) ?? symbol.id,
			);
		}
	}
	return branch.armChunkIds.map((chunkId) => {
		const hostIds = hostPathsForChunk(input, chunkId);
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

function boundEventSymbolIds(input: ProtocolViewPayloadInput): ReadonlyMap<string, string> {
	return boundSymbolIds(input, new Set(['event-handler']));
}

function boundDomUpdateSymbolIds(input: ProtocolViewPayloadInput): ReadonlyMap<string, string> {
	return boundSymbolIds(input, new Set(['dom-update']));
}

function boundSymbolIds(
	input: ProtocolViewPayloadInput,
	kinds: ReadonlySet<string>,
): ReadonlyMap<string, string> {
	const baseSymbolIds = new Set(
		input.symbolResolver.symbols.flatMap((symbol) =>
			kinds.has(symbol.kind) ? [symbol.id] : [],
		),
	);
	return new Map(
		(input.captureAnalysis?.boundResolverRows ?? []).flatMap((row) =>
			baseSymbolIds.has(row.baseSymbolId) ? [[row.baseSymbolId, row.id] as const] : [],
		),
	);
}

function bindArmBranchEventSymbols(
	input: ProtocolViewPayloadInput,
	branches: NonNullable<ProtocolViewArmRecordSet['branches']> | undefined,
): NonNullable<ProtocolViewArmRecordSet['branches']> | undefined {
	if (!branches) return undefined;
	const boundEventSymbols = boundEventSymbolIds(input);
	return branches.map((branch) => ({
		...branch,
		...(branch.armRecords
			? {
					armRecords: branch.armRecords.map((arm) => ({
						...arm,
						events: arm.events.map((event) => ({
							...event,
							symbolIds: event.symbolIds.map(
								(symbolId) => boundEventSymbols.get(symbolId) ?? symbolId,
							),
						})),
					})),
				}
			: {}),
	}));
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
