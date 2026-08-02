import { ASYNC_BOUNDARY_ARM } from '@markless/serializer/protocol';
import type {
	RenderDataArtifact,
	RenderDataBranch,
	RenderDataInitialValue,
	RenderDataRepeat,
	SemanticMarkupSlot,
	SemanticGraphArtifact,
	SymbolResolverPlan,
} from '../../artifacts.ts';
import { resolveBoundaryRunners } from '../public-render/boundary-runner.ts';

export function createRenderData(input: {
	readonly semanticGraph: SemanticGraphArtifact;
	readonly symbolResolver: SymbolResolverPlan;
}): RenderDataArtifact {
	const { semanticGraph, symbolResolver } = input;
	const slots = semanticGraph.markup.chunks.flatMap((chunk) => chunk.slots);
	const boundaryRunners = resolveBoundaryRunners(semanticGraph);

	return {
		passId: 'render-data',
		filename: semanticGraph.filename,
		root: semanticGraph.markup.root,
		chunks: semanticGraph.markup.chunks,
		hosts: semanticGraph.hostNodes.map((host) => ({ ...host, hostNodeId: host.id })),
		initialValues: semanticGraph.graphBindings.flatMap((binding) =>
			initialValue(binding, symbolResolver),
		),
		branches: semanticGraph.branchSites.map((site) =>
			branchRecord(site, slots, semanticGraph.markup.chunks, symbolResolver),
		),
		repeats: semanticGraph.keyedRepeats.map((repeat) =>
			repeatRecord(repeat, slots, semanticGraph.markup.chunks),
		),
		boundaries: semanticGraph.asyncBoundaries.map((boundary) => {
			const slot = slots.find(
				(candidate): candidate is Extract<SemanticMarkupSlot, { readonly kind: 'async' }> =>
					candidate.kind === 'async' && candidate.boundaryId === boundary.id,
			);
			const runner = boundaryRunners.get(boundary.id);
			return {
				boundaryId: boundary.id,
				anchorOrder: boundary.anchorOrder,
				runnerGraphNodeId: runner?.runnerGraphNodeId ?? null,
				initiallyServedArm: ASYNC_BOUNDARY_ARM.pending,
				reads: runner?.reads ?? [],
				unresolvedSources: runner?.unresolvedSources ?? [],
				armChunkIds: slot?.armTemplateIds ?? {
					try: `async:${boundary.id}:arm:try`,
				},
				protocolSupported:
					boundary.parentBoundaryId === undefined &&
					!semanticGraph.asyncBoundaries.some(
						(candidate) => candidate.parentBoundaryId === boundary.id,
					),
			};
		}),
		interactions: semanticGraph.events.map((event) => ({
			eventId: event.id,
			hostNodeId: event.hostNodeId,
			eventName: event.eventName,
			symbolIds: symbolResolver.symbols
				.filter(
					(
						symbol,
					): symbol is Extract<
						SymbolResolverPlan['symbols'][number],
						{ readonly kind: 'event-handler' }
					> =>
						symbol.kind === 'event-handler' &&
						symbol.hostNodeId === event.hostNodeId &&
						symbol.eventName === event.eventName,
				)
				.sort((left, right) => left.order - right.order)
				.map((symbol) => symbol.id),
		})),
	};
}

function initialValue(
	binding: SemanticGraphArtifact['graphBindings'][number],
	symbolResolver: SymbolResolverPlan,
): RenderDataInitialValue[] {
	if (binding.kind === 'computed' && binding.async !== true) {
		const derive = symbolResolver.symbols.find(
			(symbol) => symbol.kind === 'sync-computed-derive' && symbol.graphNodeId === binding.id,
		);
		return derive
			? [
					{
						graphNodeId: binding.id,
						value: { kind: 'symbol-function', symbolId: derive.id },
					},
				]
			: [];
	}
	if (binding.kind !== 'state') return [];
	if (binding.initialValueKnown === true || 'initialValue' in binding) {
		return [
			{
				graphNodeId: binding.id,
				value: { kind: 'constant', value: binding.initialValue },
			},
		];
	}
	return binding.initializerSource
		? symbolResolver.symbols.flatMap((symbol) =>
				symbol.kind === 'state-initializer' && symbol.graphNodeId === binding.id
					? [
				{
					graphNodeId: binding.id,
					value: { kind: 'symbol-function', symbolId: symbol.id },
				},
					]
					: [],
			)
		: [];
}

function branchRecord(
	site: SemanticGraphArtifact['branchSites'][number],
	slots: ReadonlyArray<SemanticMarkupSlot>,
	chunks: SemanticGraphArtifact['markup']['chunks'],
	symbolResolver: SymbolResolverPlan,
): RenderDataBranch {
	const slot = slots.find(
		(candidate): candidate is Extract<SemanticMarkupSlot, { readonly kind: 'branch' }> =>
			candidate.kind === 'branch' && candidate.branchSiteId === site.id,
	);
	const symbol = symbolResolver.symbols.find(
		(candidate) => candidate.kind === 'branch-update' && candidate.branchSiteId === site.id,
	);
	const armChunkIds =
		slot?.armTemplateIds ??
		Array.from({ length: site.armCount }, (_, index) => `branch:${site.id}:arm:${index}`);
	const declaredEmptyArms = armChunkIds.flatMap((chunkId, index) => {
		const chunk = chunks.find((candidate) => candidate.id === chunkId);
		return chunk && chunk.statics.every((text) => text === '') && chunk.slots.length === 0
			? [index]
			: [];
	});
	return {
		branchSiteId: site.id,
		kind: site.kind,
		testSource: site.testSource,
		testReads:
			symbol?.kind === 'branch-update'
				? symbol.testReads.map((read) => ({
						graphNodeId: read.graphNodeId,
						path: read.path,
					}))
				: [],
		armChunkIds,
		anchorOrder: site.anchorOrder,
		...(site.asyncBoundaryId ? { asyncBoundaryId: site.asyncBoundaryId } : {}),
		...(site.asyncBoundaryArm !== undefined ? { asyncBoundaryArm: site.asyncBoundaryArm } : {}),
		...(site.armTests ? { armTests: site.armTests } : {}),
		...(declaredEmptyArms.length > 0 ? { declaredEmptyArms } : {}),
		update:
			site.asyncBoundaryId &&
			(slot?.armTemplateIds ?? []).some((chunkId) =>
				chunks
					.find((chunk) => chunk.id === chunkId)
					?.slots.some((candidate) => candidate.kind === 'child-component'),
			)
				? 'boundary'
				: 'range',
	};
}

function repeatRecord(
	repeat: SemanticGraphArtifact['keyedRepeats'][number],
	slots: ReadonlyArray<SemanticMarkupSlot>,
	chunks: SemanticGraphArtifact['markup']['chunks'],
): RenderDataRepeat {
	const slot = slots.find(
		(candidate): candidate is Extract<SemanticMarkupSlot, { readonly kind: 'repeat' }> =>
			candidate.kind === 'repeat' && candidate.repeatId === repeat.id,
	);
	const rowChunkId = slot?.rowTemplateId ?? `repeat:${repeat.id}:row`;
	return {
		repeatId: repeat.id,
		parentHostNodeId: repeat.parentHostNodeId,
		...(repeat.rowHostNodeId ? { rowHostNodeId: repeat.rowHostNodeId } : {}),
		itemName: repeat.itemName,
		...(repeat.collectionGraphNodeId
			? { collectionGraphNodeId: repeat.collectionGraphNodeId }
			: {}),
		collectionPath: repeat.collectionPath,
		keyPath: repeat.keyPath,
		rowChunkId,
		...(slot?.emptyTemplateId ? { emptyChunkId: slot.emptyTemplateId } : {}),
		rowElementCount: chunks.find((chunk) => chunk.id === rowChunkId)?.hosts.length ?? 0,
	};
}
