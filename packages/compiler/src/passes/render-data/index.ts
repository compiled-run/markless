import { ASYNC_BOUNDARY_ARM } from '@markless/serializer/protocol';
import type {
	RenderDataArtifact,
	RenderDataBranch,
	RenderDataInitialValue,
	RenderDataRepeat,
	PayloadArenaArtifact,
	SemanticMarkupSlot,
	SemanticGraphArtifact,
	SymbolResolverPlan,
} from '../../artifacts.ts';
import { resolveBoundaryRunners } from '../public-render/boundary-runner.ts';

// The link-stage half of this pass: what an emitted render-data module carries
// once it exists as a module a consuming app can link.
export {
	RENDER_DATA_MODULE_PASS_ID,
	planRenderDataModule,
	renderDataClaimManifest,
	renderDataContentHash,
} from './manifest.ts';

export function createRenderData(input: {
	readonly semanticGraph: SemanticGraphArtifact;
	readonly symbolResolver: SymbolResolverPlan;
	readonly payloadArena?: PayloadArenaArtifact;
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
			repeatRecord(repeat, slots, semanticGraph.markup.chunks, semanticGraph, symbolResolver, input.payloadArena),
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
		...(site.testComputedGraphNodeId
			? { testComputedGraphNodeId: site.testComputedGraphNodeId }
			: {}),
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

/**
 * How many element children of the parent stand before this repeat's rows.
 *
 * The resume reconcile addresses rows by position among the parent's child
 * ELEMENTS, so a static sibling in front of them shifts every key. Nothing in
 * the served DOM says where the rows begin - a repeat leaves no anchor comment -
 * so the count is stated here, from the one place that knows the parent's
 * children: the chunk that emitted them.
 *
 * Every sibling is classified, never guessed. An element is a host record at
 * that exact child index (collect-elements mints a host id for every host
 * element, so an element without one cannot exist). Static text and a `{text}`
 * slot occupy an index and produce no element. Anything whose element count is
 * decided at render time - a branch arm, another repeat, an async boundary, a
 * child component - answers undefined, and the caller drops the repeat rather
 * than pair rows against a position it cannot defend.
 */
function repeatRowStartOffset(
	chunks: SemanticGraphArtifact['markup']['chunks'],
	repeatId: string,
): number | undefined {
	const owner = chunks.find((chunk) =>
		chunk.slots.some((slot) => slot.kind === 'repeat' && slot.repeatId === repeatId),
	);
	const anchor = owner?.slots.find((slot) => slot.kind === 'repeat' && slot.repeatId === repeatId);
	if (!owner || anchor?.coordinate.kind !== 'comment-anchor') return undefined;
	const path = anchor.coordinate.path;
	const parentPath = path.slice(0, -1);
	const samePath = (candidate: ReadonlyArray<number>, index: number) =>
		candidate.length === parentPath.length + 1 &&
		candidate[candidate.length - 1] === index &&
		parentPath.every((step, depth) => candidate[depth] === step);
	let offset = 0;
	for (let index = 0; index < (path[path.length - 1] ?? 0); index++) {
		if (owner.hosts.some((host) => samePath(host.coordinate.path, index))) {
			offset++;
			continue;
		}
		const sibling = owner.slots.find(
			(slot) => slot.coordinate.kind === 'comment-anchor' && samePath(slot.coordinate.path, index),
		);
		if (sibling && sibling.kind !== 'text') return undefined;
	}
	return offset;
}

function repeatRecord(
	repeat: SemanticGraphArtifact['keyedRepeats'][number],
	slots: ReadonlyArray<SemanticMarkupSlot>,
	chunks: SemanticGraphArtifact['markup']['chunks'],
	semanticGraph: SemanticGraphArtifact,
	symbolResolver: SymbolResolverPlan,
	payloadArena?: PayloadArenaArtifact,
): RenderDataRepeat {
	const slot = slots.find(
		(candidate): candidate is Extract<SemanticMarkupSlot, { readonly kind: 'repeat' }> =>
			candidate.kind === 'repeat' && candidate.repeatId === repeat.id,
	);
	const rowChunkId = slot?.rowTemplateId ?? `repeat:${repeat.id}:row`;
	const rowChunk = chunks.find((chunk) => chunk.id === rowChunkId);
	const rootChunk = chunks.find((chunk) => chunk.id === semanticGraph.markup.root?.templateId);
	const parent = rootChunk?.hosts.find((host) => host.hostNodeId === repeat.parentHostNodeId);
	const relativePath = (path: ReadonlyArray<number>) => path[0] === 0 ? path.slice(1) : path;
	const classWrites = (rowChunk?.slots ?? []).flatMap((rowSlot) =>
		rowSlot.kind === 'attribute' && rowSlot.directClassMatch
			? [{
				source: rowSlot.residue.kind === 'authored-expression' ? rowSlot.residue.source : '',
				hostPath: relativePath(rowSlot.coordinate.path),
				...rowSlot.directClassMatch,
			}]
			: [],
	);
	const rowHostPaths = new Map(
		(rowChunk?.hosts ?? []).map((host) => [host.hostNodeId, relativePath(host.coordinate.path)]),
	);
	const eventControls = semanticGraph.events.flatMap((event) => {
		const hostPath = rowHostPaths.get(event.hostNodeId);
		if (!hostPath) return [];
		return symbolResolver.symbols.flatMap((symbol) =>
			symbol.kind === 'event-handler' &&
			symbol.hostNodeId === event.hostNodeId &&
			symbol.eventName === event.eventName
				? [{
					eventName: event.eventName,
					hostPath,
					handlerSource: symbol.source,
					symbolId: symbol.id,
					itemContext: {
						kind: 'keyed-repeat-item' as const,
						repeatId: repeat.id,
						itemName: repeat.itemName,
						keyPath: repeat.keyPath,
					},
				}]
				: [],
		);
	});
	const rowStartOffset = repeatRowStartOffset(chunks, repeat.id);
	const payloadRepeat = payloadArena?.view.keyedRepeats.find((item) => item.id === repeat.id);
	const rowElementHandles = payloadRepeat?.rowElementHandles?.flatMap((handle) => {
		const hostPath = rowHostPaths.get(handle.hostNodeId);
		return hostPath
			? [{
				hostPath,
				handleId: handle.handleId,
				name: handle.name,
				...(handle.plural ? { plural: true as const } : {}),
			}]
			: [];
	});
	const rowBehaviorRecords = payloadRepeat?.rowBehaviors ?? semanticGraph.behaviors.filter(
		(behavior) => rowHostPaths.has(behavior.hostNodeId),
	);
	const rowBehaviors = rowBehaviorRecords.flatMap((behavior) => {
		const hostPath = rowHostPaths.get(behavior.hostNodeId);
		const symbol = symbolResolver.symbols.find(
			(candidate) => candidate.kind === 'behavior' && candidate.hostNodeId === behavior.hostNodeId,
		);
		if (!hostPath || !symbol) return [];
		const inputPaths = behavior.inputSources.map((source) =>
			source === repeat.itemName ? [] : source.startsWith(`${repeat.itemName}.`) ? source.slice(repeat.itemName.length + 1).split('.') : null,
		);
		return inputPaths.some((path) => path === null) ? [] : [{ hostPath, symbolId: symbol.id, inputPaths: inputPaths as ReadonlyArray<ReadonlyArray<string>> }];
	});
	return {
		repeatId: repeat.id,
		parentHostNodeId: repeat.parentHostNodeId,
		...(repeat.rowHostNodeId ? { rowHostNodeId: repeat.rowHostNodeId } : {}),
		itemName: repeat.itemName,
		...(repeat.collectionGraphNodeId
			? { collectionGraphNodeId: repeat.collectionGraphNodeId }
			: { collectionSource: repeat.collectionSource }),
		collectionPath: repeat.collectionPath,
		keyPath: repeat.keyPath,
		// Pay-per-use: only `key row` needs the marker, a position key reads as unkeyed here.
		...(!repeat.indexKey && repeat.keyPath.length === 0 ? { itemKey: true as const } : {}),
		rowChunkId,
		...(slot?.emptyTemplateId ? { emptyChunkId: slot.emptyTemplateId } : {}),
		rowElementCount: chunks.find((chunk) => chunk.id === rowChunkId)?.hosts.length ?? 0,
		...(rowStartOffset === undefined ? {} : { rowStartOffset }),
		...(parent ? { parentPath: relativePath(parent.coordinate.path) } : {}),
		...(classWrites.length > 0 ? { classWrites } : {}),
		...(eventControls.length > 0 ? { eventControls } : {}),
		...(rowElementHandles && rowElementHandles.length > 0 ? { rowElementHandles } : {}),
		...(rowBehaviors.length > 0 ? { rowBehaviors } : {}),
		directSupported:
			repeat.indexName === undefined && repeat.collectionGraphNodeId !== undefined,
	};
}
