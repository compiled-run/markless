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
		initialValues: semanticGraph.graphBindings.flatMap((binding) =>
			initialValue(binding, symbolResolver),
		),
		branches: semanticGraph.branchSites.map((site) =>
			branchRecord(site, slots, symbolResolver),
		),
		repeats: semanticGraph.keyedRepeats.map((repeat) => repeatRecord(repeat, slots)),
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
		? [
				{
					graphNodeId: binding.id,
					value: { kind: 'value-function', source: binding.initializerSource },
				},
			]
		: [];
}

function branchRecord(
	site: SemanticGraphArtifact['branchSites'][number],
	slots: ReadonlyArray<SemanticMarkupSlot>,
	symbolResolver: SymbolResolverPlan,
): RenderDataBranch {
	const slot = slots.find(
		(candidate): candidate is Extract<SemanticMarkupSlot, { readonly kind: 'branch' }> =>
			candidate.kind === 'branch' && candidate.branchSiteId === site.id,
	);
	const symbol = symbolResolver.symbols.find(
		(candidate) => candidate.kind === 'branch-update' && candidate.branchSiteId === site.id,
	);
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
		armChunkIds:
			slot?.armTemplateIds ??
			Array.from({ length: site.armCount }, (_, index) => `branch:${site.id}:arm:${index}`),
		anchorOrder: site.anchorOrder,
		...(site.asyncBoundaryId ? { asyncBoundaryId: site.asyncBoundaryId } : {}),
		...(site.asyncBoundaryArm !== undefined ? { asyncBoundaryArm: site.asyncBoundaryArm } : {}),
	};
}

function repeatRecord(
	repeat: SemanticGraphArtifact['keyedRepeats'][number],
	slots: ReadonlyArray<SemanticMarkupSlot>,
): RenderDataRepeat {
	const slot = slots.find(
		(candidate): candidate is Extract<SemanticMarkupSlot, { readonly kind: 'repeat' }> =>
			candidate.kind === 'repeat' && candidate.repeatId === repeat.id,
	);
	return {
		repeatId: repeat.id,
		...(repeat.collectionGraphNodeId
			? { collectionGraphNodeId: repeat.collectionGraphNodeId }
			: {}),
		collectionPath: repeat.collectionPath,
		keyPath: repeat.keyPath,
		rowChunkId: slot?.rowTemplateId ?? `repeat:${repeat.id}:row`,
		...(slot?.emptyTemplateId ? { emptyChunkId: slot.emptyTemplateId } : {}),
	};
}
