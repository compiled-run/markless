import type {
	ProtocolViewPayloadWithArmRecords,
	RenderDataArtifact,
	SemanticGraphArtifact,
	SymbolModulesDiagnostic,
	SymbolResolverPlan,
} from '../artifacts.ts';
import type { SourceSpan } from '../diagnostics.ts';
import { armHostPaths } from './arm-child-content.ts';
import { elementAddress } from './semantic-graph/projection-placement.ts';

/**
 * Refuses an element in an @if arm or a @for row that a handler, update, behavior
 * or element() handle needs, when no element address can name it: a sibling on
 * each side of it renders a count only the page render knows. The record would
 * otherwise land on a neighbour, or on nothing, after the page loads.
 */
export function unaddressableElementDiagnostics(input: {
	readonly semanticGraph?: SemanticGraphArtifact;
	readonly renderData?: RenderDataArtifact;
	readonly protocolView?: ProtocolViewPayloadWithArmRecords;
	readonly symbolResolver: SymbolResolverPlan;
}): ReadonlyArray<SymbolModulesDiagnostic> {
	const { semanticGraph, renderData, protocolView } = input;
	if (!semanticGraph || !renderData || !protocolView) return [];
	const spans = recordSpans(semanticGraph, input.symbolResolver);
	const refused = new Map<string, SourceSpan | undefined>();
	const refuse = (hostNodeId: string) => {
		if (spans.has(hostNodeId) && !refused.has(hostNodeId))
			refused.set(hostNodeId, spans.get(hostNodeId));
	};

	const armChunks = new Set<string>();
	const branchIds = [
		...(protocolView.branches ?? [])
			.filter((branch) => branch.armRecords)
			.map((branch) => branch.id),
		...protocolView.asyncBoundaries.flatMap((boundary) =>
			(boundary.armRecords ?? []).flatMap((set) =>
				(set.branches ?? [])
					.filter((branch) => branch.armRecords)
					.map((branch) => branch.id),
			),
		),
	];
	for (const id of branchIds)
		for (const chunkId of renderData.branches.find((branch) => branch.branchSiteId === id)
			?.armChunkIds ?? [])
			armChunks.add(chunkId);
	for (const chunkId of armChunks)
		for (const [hostNodeId, placement] of armHostPaths(renderData, semanticGraph, chunkId))
			if (placement.path === null) refuse(hostNodeId);

	const chunks = semanticGraph.markup.chunks;
	for (const repeat of protocolView.keyedRepeats ?? []) {
		const rowChunkId = renderData.repeats.find(
			(candidate) => candidate.repeatId === repeat.id,
		)?.rowChunkId;
		const row = chunks.find((chunk) => chunk.id === rowChunkId);
		for (const host of row?.hosts ?? [])
			if (
				!elementAddress({
					chunks,
					branchSites: semanticGraph.branchSites,
					chunkId: row!.id,
					path: host.coordinate.path,
				})
			)
				refuse(host.hostNodeId);
	}
	return [...refused.values()].map(unaddressableElementDiagnostic);
}

// Every host a live record names (one that runs code in the browser), with the span of the first.
function recordSpans(
	graph: SemanticGraphArtifact,
	symbolResolver: SymbolResolverPlan,
): ReadonlyMap<string, SourceSpan | undefined> {
	const live = new Set(
		symbolResolver.symbols.flatMap((symbol) =>
			'hostNodeId' in symbol && typeof symbol.hostNodeId === 'string'
				? [symbol.hostNodeId]
				: [],
		),
	);
	for (const handle of graph.elementHandleBindings) live.add(handle.hostNodeId);
	const spans = new Map<string, SourceSpan | undefined>();
	const add = (hostNodeId: string, span: SourceSpan | undefined) => {
		if (!live.has(hostNodeId)) return;
		if (!spans.has(hostNodeId) || (spans.get(hostNodeId) === undefined && span))
			spans.set(hostNodeId, span);
	};
	for (const event of graph.events) add(event.hostNodeId, event.handlerSpan);
	for (const read of graph.templateReads) add(read.hostNodeId, read.sourceSpan);
	for (const behavior of graph.behaviors) add(behavior.hostNodeId, behavior.functionSpan);
	for (const handle of graph.elementHandleBindings) add(handle.hostNodeId, handle.sourceSpan);
	for (const hostNodeId of live) add(hostNodeId, undefined);
	return spans;
}

function unaddressableElementDiagnostic(span: SourceSpan | undefined): SymbolModulesDiagnostic {
	return {
		code: 'MARKLESS_ELEMENT_UNADDRESSABLE',
		severity: 'error',
		phase: 'public-render',
		title: 'The browser cannot find this element',
		message:
			'This element sits inside an @if arm or a @for row, and its parent holds a @for, or a component whose element count is only known when the page renders, both before and after it. Its handler, update or element() handle would land on a neighbouring element, or on nothing, once the page loads.',
		why: 'After the page loads, the browser finds an element inside an arm or a row by counting its parent’s child elements, with each @if, @switch or @try block as one, from the start or from the end. That count needs every sibling on at least one side to be an element, text, a block, or a component of fixed size.',
		...(span ? { primarySpan: span } : {}),
		passId: 'symbol-modules',
		artifactKeys: ['semanticGraph', 'renderData', 'protocolView'],
		suggestions: [
			{
				message:
					'Wrap this element, or the construct beside it, in its own element, so one side of it holds only plain elements and text.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_ELEMENT_UNADDRESSABLE',
	};
}
