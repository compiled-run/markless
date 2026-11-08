import type {
	SemanticComponentEdge,
	SemanticGraphArtifact,
	SemanticMarkupChunk,
	SemanticMarkupSlot,
} from '../artifacts.ts';
import type { ConstructReachInput } from './construct-reach.ts';
import { VOID_TAG_NAMES } from './semantic-graph/collect-markup.ts';

/** Whether a chunk's top level is exactly one element; an @if or @switch counts when each arm is. Other rows live between row comments. */
export function chunkRootIsOneElement(
	input: Pick<ConstructReachInput, 'chunks' | 'componentEdges' | 'importedModuleInterfaces'>,
	chunkId: string,
	seen: Set<string> = new Set(),
): boolean {
	const chunk = input.chunks.find((candidate) => candidate.id === chunkId);
	if (!chunk || seen.has(chunkId)) return false;
	seen.add(chunkId);
	const top = topLevelUnits(chunk);
	if (top.length !== 1) return false;
	const [only] = top;
	if (only === 'element') return true;
	if (only === 'text' || !only) return false;
	if (only.kind === 'branch')
		return only.armTemplateIds.every((armChunkId) =>
			chunkRootIsOneElement(input, armChunkId, seen),
		);
	if (only.kind !== 'child-component') return false;
	const edge = input.componentEdges.find((candidate) => candidate.id === only.componentEdgeId);
	return edge !== undefined && childRootIsOneElement(input, edge, only.childTemplateId, seen);
}

/** The same question for the component one edge reaches, local or behind an import. */
export function childRootIsOneElement(
	input: Pick<ConstructReachInput, 'chunks' | 'componentEdges' | 'importedModuleInterfaces'>,
	edge: SemanticComponentEdge,
	childTemplateId: string,
	seen: Set<string> = new Set(),
): boolean {
	if (edge.importSource === undefined) return chunkRootIsOneElement(input, childTemplateId, seen);
	const entry = input.importedModuleInterfaces?.[edge.importSource]?.render.components.find(
		(candidate) => candidate.componentName === edge.childComponentName,
	);
	return entry !== undefined && entry.rangeRoot !== true;
}

// The chunk's top-level nodes in order: an element, a text run, or the slot a marker comment stands for.
function topLevelUnits(chunk: SemanticMarkupChunk): Array<'element' | 'text' | SemanticMarkupSlot> {
	const html = chunk.statics.join('');
	const units: Array<'element' | 'text' | SemanticMarkupSlot> = [];
	let depth = 0;
	let at = 0;
	while (at < html.length) {
		const open = html.indexOf('<', at);
		const text = html.slice(at, open < 0 ? html.length : open);
		if (depth === 0 && text.trim() !== '') units.push('text');
		if (open < 0) break;
		if (html.startsWith('<!--', open)) {
			const end = html.indexOf('-->', open + 4);
			const marker = /^markless-slot:(\d+)$/.exec(html.slice(open + 4, end));
			const slot = marker ? chunk.slots[Number(marker[1])] : undefined;
			if (depth === 0 && slot) units.push(slot);
			at = end < 0 ? html.length : end + 3;
			continue;
		}
		const close = html.indexOf('>', open);
		const tag = html.slice(open, close < 0 ? html.length : close + 1);
		at = close < 0 ? html.length : close + 1;
		if (tag.startsWith('</')) {
			depth--;
			continue;
		}
		if (depth === 0) units.push('element');
		const name = /^<([^\s/>]+)/.exec(tag)?.[1]?.toLowerCase() ?? '';
		if (!VOID_TAG_NAMES.has(name) && !tag.endsWith('/>')) depth++;
	}
	return units;
}

/** Why the browser cannot yet track this repeat's rows between row comments (phrased to follow "this list"), or null when it can. */
export function rowRangeRefusal(
	graph: Pick<
		SemanticGraphArtifact,
		'keyedRepeats' | 'markup' | 'elementHandleBindings' | 'behaviors' | 'events'
	>,
	repeatId: string,
): string | null {
	const repeat = graph.keyedRepeats.find((candidate) => candidate.id === repeatId);
	if (!repeat) return 'is not one this page tracks';
	if (repeat.enclosingRepeatId) return 'sits inside the row of another @for';
	if (graph.keyedRepeats.some((candidate) => candidate.enclosingRepeatId === repeatId))
		return 'has rows that hold another @for';
	const chunks = graph.markup.chunks;
	const row = chunks.find((chunk) => chunk.id === `repeat:${repeatId}:row`);
	if (row?.slots.some((slot) => slot.kind === 'branch'))
		return 'has rows that hold an @if or @switch';
	if (
		row?.slots.some((slot) => slot.kind === 'child-component') &&
		!(row.slots.length === 1 && topLevelUnits(row).length === 1)
	)
		return 'has rows that hold a component beside other nodes';
	if (
		graph.elementHandleBindings.some((binding) =>
			binding.keyedRepeatScopeIds.includes(repeatId),
		)
	)
		return 'has rows that bind an element() handle';
	if (graph.behaviors.some((behavior) => behavior.keyedRepeatScopeIds?.includes(repeatId)))
		return 'has rows that attach a behavior';
	const rowHosts = new Set(row?.hosts.map((host) => host.hostNodeId));
	if (graph.events.some((event) => event.syncPolicy && rowHosts.has(event.hostNodeId)))
		return 'has rows with an event that cancels before any code loads';
	const owner = chunks.find((chunk) =>
		chunk.slots.some((slot) => slot.kind === 'repeat' && slot.repeatId === repeatId),
	);
	const anchor = owner?.slots.find(
		(slot) => slot.kind === 'repeat' && slot.repeatId === repeatId,
	);
	if (owner?.kind === 'component-projection') return 'is passed to a component as its children';
	if (
		(owner?.kind === 'branch-arm' || owner?.kind === 'async-arm') &&
		anchor?.coordinate.path.length === 1
	)
		return 'stands straight inside an @if, @switch or @try arm, with no element of its own around it';
	return null;
}
