import type { ProtocolRowTemplateSlotValue } from '@markless/serializer';
import type {
	SemanticComponentEdge,
	SemanticGraphArtifact,
	SemanticMarkupChunk,
	SemanticMarkupSlot,
} from '../artifacts.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
} from '../artifact-helpers/graph-paths.ts';
import { childConstructReach, type ConstructReachInput } from './construct-reach.ts';
import { TEMPLATE_EXPRESSION_GRAPH_NODE_PREFIX } from './public-render/html.ts';
import { createResidueDependencyReader } from './public-render/residue-dependencies.ts';

export type RowComponentMint = {
	/** Absent when `rowChunkId` names the row's own markup instead of one edge. */
	readonly componentEdgeId?: string;
	readonly componentName: string;
	readonly itemPropName?: string;
	/**
	 * Where the child's nodes go inside the row's own markup, as the
	 * fragment-relative path of the marker they replace. Absent when the row IS
	 * the component and there is no wrapper to place it in.
	 */
	readonly slotPath?: ReadonlyArray<number>;
	/**
	 * The owner's row chunk, rendered whole for each new row: set for a row that
	 * picks its markup with an @if or @switch over the row item.
	 */
	readonly rowChunkId?: string;
};

/**
 * The component a row roots, named by identity, for the mint that builds a row
 * the server never rendered.
 *
 * A component row carries no markup of its own: the client rebuilds it by
 * running the same one-edge render the server ran, so what it needs is the edge
 * to run and the component that owns it, not a copy of the output.
 *
 * Two row shapes reach that point. The row can BE the component - one slot, no
 * element of its own - or a row element can WRAP it, which is the checklist
 * idiom: `<li data-row={item.id}><Card ... /></li>`. A wrapper is admitted only
 * when the wrapper's own slots are ones the row template already mints (text or
 * attribute values off the repeated item or off the page's graph), and the record
 * then carries both
 * halves: the wrapper markup in `rowTemplate`, the child identity here, and
 * `slotPath` naming the marker inside the wrapper the child's nodes replace.
 *
 * A row that PROJECTS children mints when the projection is component parts and
 * the text between them (see `projectionIsMintable`): the parts render in the
 * row's own identity and compose beside the row's child. The child itself may
 * live in another module - the payload's component surface carries the import
 * chain the row render walks - so an imported child mints on the same terms as a
 * local one.
 *
 * Still refused when the component's body carries a boundary (`@try`): its
 * settle bookkeeping reads a census the page counted once, at boot, for the rows
 * it served, and a row born after resume has none of it - the mint would index
 * into another row's, which is why the runtime refuses such a row loudly.
 * Refusing here means the page never gets that far: it falls back to today's
 * no-growth behaviour instead. A branch is admitted: its anchors are a comment
 * pair the minted row counts in its own fragment, exactly as it counts its own
 * elements. That question must be ANSWERED, not assumed: a child whose tree this
 * module cannot reach is refused too, because the chunk it could not read might
 * have held a boundary.
 *
 * The public render plan pass asks the same question to decide whether a row
 * that cannot grow deserves a diagnostic, so the answer lives here once.
 */
export function resolveRowComponentMint(
	input: RowMintInput & {
		readonly rowChunkId: string;
		readonly rowElementCount: number;
		readonly itemName: string;
	},
): RowComponentMint | null {
	const chunk = input.chunks.find((candidate) => candidate.id === input.rowChunkId);
	if (!chunk) return null;
	const componentSlots = chunk.slots.filter((candidate) => candidate.kind === 'child-component');
	if (componentSlots.length !== 1) return null;
	const slot = componentSlots[0]!;
	if (slot.kind !== 'child-component') return null;
	const wraps = input.rowElementCount > 0;
	if (wraps) {
		// The wrapper is minted from markup, so its own slots have to be ones that
		// markup plus the item can finish - and the child needs a marker to land on.
		if (slot.coordinate.kind !== 'comment-anchor') return null;
		if (!chunk.slots.every((candidate) => candidate === slot || mintableSlotValue(candidate) !== null))
			return null;
	} else if (chunk.slots.length !== 1) return null;
	const componentName = chunk.componentName;
	if (!componentName) return null;
	const edge = input.componentEdges.find((candidate) => candidate.id === slot.componentEdgeId);
	if (!edge || edge.parentComponentName !== componentName) return null;
	if (edge.children.childCount > 0 && slot.projectionChunkId === undefined) return null;
	if (
		slot.projectionChunkId !== undefined &&
		!projectionIsMintable(input, slot.projectionChunkId, new Set(), [input.itemName])
	)
		return null;
	if (!childIsMintable(input, edge, slot.childTemplateId, new Set())) return null;
	const itemProps = edge.props.filter((prop) => prop.source === input.itemName);
	return {
		componentEdgeId: slot.componentEdgeId,
		componentName,
		...(itemProps.length === 1 ? { itemPropName: itemProps[0]!.name } : {}),
		...(wraps ? { slotPath: slot.coordinate.path } : {}),
	};
}

/**
 * A row whose markup an @if or @switch picks from the row item, rendered whole
 * by the client the way the server rendered it.
 *
 * The record names the owner's row chunk, and the mint runs the same chunk
 * render the server ran - arm choice, child components and projections included -
 * in the row's own identity. Admitted only when everything the row renders is
 * decided by the row itself: a branch test over the row's names, text and
 * attribute values that stay current with the row, owner elements carrying no
 * record a minted row would have to register, and child components the reach
 * question clears. A test that reads page state would have to flip inside a
 * minted row, which nothing registers, so it is refused.
 */
export function resolveRowChunkMint(
	input: RowMintInput & {
		readonly rowChunkId: string;
		readonly rowElementCount: number;
		readonly rowNames: ReadonlyArray<string>;
	},
): RowComponentMint | null {
	const chunk = input.chunks.find((candidate) => candidate.id === input.rowChunkId);
	if (!chunk?.componentName || !input.semanticGraph || input.rowElementCount < 1) return null;
	if (!chunk.slots.some((slot) => slot.kind === 'branch')) return null;
	// One row element holds everything, so the row's root is that element whichever arm renders.
	if (chunk.hosts.filter((host) => host.coordinate.path.length === 1).length !== 1) return null;
	const onRowElement = chunk.slots.every(
		(slot) =>
			slot.coordinate.path[0] === 0 &&
			(slot.kind === 'attribute' || slot.coordinate.path.length > 1),
	);
	if (!onRowElement) return null;
	if (!rowContentIsMintable(input, chunk.id, new Set(), input.rowNames)) return null;
	return { componentName: chunk.componentName, rowChunkId: chunk.id };
}

function rowContentIsMintable(
	input: RowMintInput,
	chunkId: string,
	seen: Set<string>,
	rowNames: ReadonlyArray<string>,
): boolean {
	if (seen.has(chunkId)) return false;
	seen.add(chunkId);
	const chunk = input.chunks.find((candidate) => candidate.id === chunkId);
	if (!chunk || !input.recordHostIds) return false;
	if (chunk.hosts.some((host) => input.recordHostIds!.has(host.hostNodeId))) return false;
	return chunk.slots.every((slot) => {
		if (slot.kind === 'text' || slot.kind === 'attribute') {
			if (slot.residue.kind === 'repeat-item') return true;
			return (
				slot.residue.kind === 'authored-expression' &&
				readsOnlyTheRow(input, chunk.componentName, slot.residue.source, rowNames)
			);
		}
		if (slot.kind === 'branch') {
			const site = input.semanticGraph?.branchSites.find(
				(candidate) => candidate.id === slot.branchSiteId,
			);
			if (!site || site.asyncBoundaryId || site.testComputedGraphNodeId) return false;
			if (!readsOnlyTheRow(input, chunk.componentName, site.testSource, rowNames)) return false;
			return slot.armTemplateIds.every((armChunkId) =>
				rowContentIsMintable(input, armChunkId, seen, rowNames),
			);
		}
		if (slot.kind !== 'child-component') return false;
		if (
			slot.projectionChunkId !== undefined &&
			(!projectionIsMintable(input, slot.projectionChunkId, seen, rowNames) ||
				!projectionCarriesNoRecords(input, slot.projectionChunkId, new Set()))
		)
			return false;
		const edge = input.componentEdges.find((candidate) => candidate.id === slot.componentEdgeId);
		if (!edge || edge.parentComponentName !== chunk.componentName) return false;
		if (edge.children.childCount > 0 && slot.projectionChunkId === undefined) return false;
		return childIsMintable(input, edge, slot.childTemplateId, new Set());
	});
}

// The row renders with an empty owner view, so an owner element it projects must need no record.
function projectionCarriesNoRecords(
	input: RowMintInput,
	chunkId: string,
	seen: Set<string>,
): boolean {
	if (seen.has(chunkId)) return true;
	seen.add(chunkId);
	const chunk = input.chunks.find((candidate) => candidate.id === chunkId);
	if (!chunk || chunk.hosts.some((host) => input.recordHostIds?.has(host.hostNodeId) ?? true))
		return false;
	return chunk.slots.every((slot) => {
		if (slot.kind === 'child-component')
			return slot.projectionChunkId === undefined
				? true
				: projectionCarriesNoRecords(input, slot.projectionChunkId, seen);
		if (slot.kind === 'repeat')
			return [slot.rowTemplateId, ...(slot.emptyTemplateId ? [slot.emptyTemplateId] : [])].every(
				(nested) => projectionCarriesNoRecords(input, nested, seen),
			);
		return true;
	});
}

// Answered by the owner's reader with nothing outside the row: a graph read here would go stale in a minted row.
function readsOnlyTheRow(
	input: RowMintInput,
	componentName: string | undefined,
	source: string,
	rowNames: ReadonlyArray<string>,
): boolean {
	if (!input.semanticGraph || !componentName) return false;
	const value = expressionSlotValue(
		{
			kind: 'text',
			residue: { kind: 'authored-expression', source },
		} as SemanticMarkupSlot,
		input.semanticGraph,
		componentName,
		new Set(rowNames),
	);
	return value !== null && !('reads' in value && value.reads?.length);
}

export type RowMintInput = ConstructReachInput & {
	/** Hosts a record names; absent, every host in a projection's nested row is refused. */
	readonly recordHostIds?: ReadonlySet<string>;
	/** Hosts carrying a behavior or an element handle, which a row cannot register again on a flip. */
	readonly unregistrableHostIds?: ReadonlySet<string>;
	/** Hosts a DOM update keeps current. */
	readonly liveHostIds?: ReadonlySet<string>;
	/** Answers which names a projected expression reads; absent, only live hosts admit one. */
	readonly semanticGraph?: SemanticGraphArtifact;
};

type PayloadRecordView = {
	readonly events: ReadonlyArray<{ readonly hostNodeId: string }>;
	readonly domUpdates: ReadonlyArray<{ readonly hostNodeId: string }>;
	readonly behaviors: ReadonlyArray<{ readonly hostNodeId: string }>;
	readonly elementHandles: ReadonlyArray<{ readonly hostNodeId: string }>;
};

/** The record facts `RowMintInput` reads, off the module's payload. */
export function payloadRecordHosts(
	view: PayloadRecordView,
): Pick<RowMintInput, 'recordHostIds' | 'liveHostIds' | 'unregistrableHostIds'> {
	return {
		unregistrableHostIds: new Set(
			[...view.behaviors, ...view.elementHandles].map((record) => record.hostNodeId),
		),
		recordHostIds: new Set(
			[...view.events, ...view.domUpdates, ...view.behaviors, ...view.elementHandles].map(
				(record) => record.hostNodeId,
			),
		),
		liveHostIds: new Set(view.domUpdates.map((update) => update.hostNodeId)),
	};
}

/** Whether a row's own `@if`/`@switch` ships as a row template branch slot, answered for the diagnostics. */
export function rowBranchMints(
	input: RowMintInput & { readonly semanticGraph: SemanticGraphArtifact },
	componentName: string,
	slot: Extract<SemanticMarkupSlot, { readonly kind: 'branch' }>,
	rowNames: ReadonlySet<string>,
): boolean {
	const graph = input.semanticGraph;
	const site = graph.branchSites.find((candidate) => candidate.id === slot.branchSiteId);
	if (!site || site.asyncBoundaryId || (site.kind === 'switch' && !site.armTests)) return false;
	const expression = (source: string) =>
		expressionSlotValue(
			{ kind: 'text', residue: { kind: 'authored-expression', source } } as SemanticMarkupSlot,
			graph,
			componentName,
			rowNames,
		) !== null;
	const testReadable =
		site.testComputedGraphNodeId !== undefined ||
		resolveGraphPath(
			site.testSource,
			graphBindingMap(graph, null, componentName),
			semanticAliasMap(graph, null, componentName),
		) !== null ||
		expression(site.testSource);
	if (!testReadable) return false;
	return slot.armTemplateIds.every((chunkId) => {
		const chunk = input.chunks.find((candidate) => candidate.id === chunkId);
		if (!chunk) return false;
		if (chunk.hosts.some((host) => input.unregistrableHostIds?.has(host.hostNodeId))) return false;
		return chunk.slots.every(
			(armSlot) =>
				(armSlot.kind === 'text' || armSlot.kind === 'attribute') &&
				(mintableSlotValue(armSlot) !== null ||
					expressionSlotValue(armSlot, graph, componentName, rowNames) !== null),
		);
	});
}

/**
 * Whether what a row PROJECTS into its component is content the mint can rebuild.
 *
 * The projection is the owner's own markup rendered inside the row, in the row's
 * identity: every element it places takes the row's segment, so a record the
 * owner compiled for it is filed per row, served or minted. Admitted are elements,
 * text and attribute values the owner's reader answers, component parts that pass
 * the reach question the row's own child answers, and a nested @for whose rows
 * carry no record - its rows are rendered once, with the row, and never wired.
 * An arm to flip or a boundary to settle is still refused.
 */
function projectionIsMintable(
	input: RowMintInput,
	projectionChunkId: string,
	seen: Set<string>,
	rowNames: ReadonlyArray<string>,
	insideNestedRow = false,
): boolean {
	if (seen.has(projectionChunkId)) return false;
	seen.add(projectionChunkId);
	const chunk = input.chunks.find((candidate) => candidate.id === projectionChunkId);
	if (!chunk) return false;
	if (
		insideNestedRow &&
		chunk.hosts.some((host) => input.recordHostIds?.has(host.hostNodeId) ?? true)
	)
		return false;
	return chunk.slots.every((slot) => {
		if (mintableSlotValue(slot)) return true;
		if (
			(slot.kind === 'text' || slot.kind === 'attribute') &&
			slot.residue.kind === 'authored-expression'
		)
			return projectedExpressionStaysCurrent(input, chunk, slot, rowNames);
		if (slot.kind === 'repeat') {
			const nested = input.semanticGraph?.keyedRepeats.find(
				(candidate) => candidate.id === slot.repeatId,
			);
			const nestedNames = [
				...rowNames,
				...[nested?.itemName, nested?.indexName].filter((name): name is string => !!name),
			];
			return [slot.rowTemplateId, ...(slot.emptyTemplateId ? [slot.emptyTemplateId] : [])].every(
				(chunkId) => projectionIsMintable(input, chunkId, seen, nestedNames, true),
			);
		}
		// A part in a nested row would be one instance for every nested row.
		if (slot.kind !== 'child-component' || insideNestedRow) return false;
		if (
			slot.projectionChunkId !== undefined &&
			!projectionIsMintable(input, slot.projectionChunkId, seen, rowNames)
		)
			return false;
		const edge = input.componentEdges.find(
			(candidate) => candidate.id === slot.componentEdgeId,
		);
		return edge !== undefined && childIsMintable(input, edge, slot.childTemplateId, new Set());
	});
}

// A projected expression is rebuilt with its row, so it stays current when it reads only the row or a live host keeps it.
function projectedExpressionStaysCurrent(
	input: RowMintInput,
	chunk: SemanticMarkupChunk,
	slot: SemanticMarkupSlot,
	rowNames: ReadonlyArray<string>,
): boolean {
	const hostPath =
		slot.coordinate.kind === 'comment-anchor'
			? slot.coordinate.path.slice(0, -1)
			: slot.coordinate.path;
	const host = chunk.hosts.find(
		(candidate) =>
			candidate.coordinate.path.length === hostPath.length &&
			candidate.coordinate.path.every((step, at) => step === hostPath[at]),
	);
	if (host && input.liveHostIds?.has(host.hostNodeId)) return true;
	if (!input.semanticGraph || !chunk.componentName) return false;
	const value = expressionSlotValue(
		slot,
		input.semanticGraph,
		chunk.componentName,
		new Set(rowNames),
	);
	return value !== null && !('reads' in value && value.reads?.length);
}

/**
 * Where a row template would take this slot's value, or null for a slot no
 * template can fill.
 *
 * Two channels: a property of the repeated item, and a read of a graph node the
 * page already holds. What stays refused is a value only the render produces -
 * an authored expression, an element handle's id - which no record can name.
 */
export function mintableSlotValue(slot: SemanticMarkupSlot): ProtocolRowTemplateSlotValue | null {
	if (slot.kind !== 'text' && slot.kind !== 'attribute') return null;
	if (slot.residue.kind === 'repeat-item') return { itemPath: slot.residue.path };
	// A lowered style object has no value until its derive runs, after the row is built.
	if (isLoweredStyleObject(slot)) return null;
	return slot.residue.kind === 'graph-read'
		? { graphNodeId: slot.residue.graphNodeId, graphPath: slot.residue.path }
		: null;
}

/** A style object in a row, which only its synthetic computed turns into CSS text. */
export function isLoweredStyleObject(slot: SemanticMarkupSlot): boolean {
	return (
		slot.kind === 'attribute' &&
		slot.name === 'style' &&
		slot.residue.kind === 'graph-read' &&
		slot.residue.graphNodeId.startsWith(TEMPLATE_EXPRESSION_GRAPH_NODE_PREFIX)
	);
}

const readResidueNames = createResidueDependencyReader();

/**
 * An authored-expression slot the owning component's render-data reader answers,
 * with the graph nodes outside the row it reads. A read the page cannot follow -
 * an element handle, a name the analyzer cannot resolve - refuses the slot.
 */
export function expressionSlotValue(
	slot: SemanticMarkupSlot,
	graph: SemanticGraphArtifact,
	componentName: string,
	rowNames: ReadonlySet<string>,
): ProtocolRowTemplateSlotValue | null {
	if (slot.kind !== 'text' && slot.kind !== 'attribute') return null;
	if (slot.residue.kind !== 'authored-expression') return null;
	const names = readResidueNames(slot.residue.source, 'expression');
	if (names.analysisFailed) return null;
	const bindings = graphBindingMap(graph, null, componentName);
	const aliases = semanticAliasMap(graph, null, componentName);
	const reads: Array<{ readonly graphNodeId: string; readonly path: ReadonlyArray<string> }> = [];
	for (const name of names.names) {
		if (rowNames.has(name)) continue;
		const resolved = resolveGraphPath(name, bindings, aliases);
		// A shared instance or a prop reads ids this page does not spell as its own.
		if (!resolved) {
			if (
				graph.sharedInstances.some(
					(instance) =>
						instance.localName === name &&
						(instance.componentName ?? componentName) === componentName,
				)
			)
				return null;
			continue;
		}
		// A prop read is routed to the parent's node by composition, which drops the template when it cannot.
		if (
			resolved.binding.kind !== 'state' &&
			resolved.binding.kind !== 'computed' &&
			resolved.binding.kind !== 'prop'
		)
			return null;
		if (resolved.binding.sharedDefinitionId !== undefined) return null;
		if (resolved.binding.kind === 'prop' && resolved.path.length === 0) {
			// A whole-props parameter: each member read follows its own prop.
			const members = memberReads(slot.residue.source, name);
			if (!members) return null;
			for (const member of members)
				reads.push({ graphNodeId: resolved.binding.id, path: [member] });
			continue;
		}
		reads.push({ graphNodeId: resolved.binding.id, path: resolved.path });
	}
	return { source: slot.residue.source, ...(reads.length > 0 ? { reads } : {}) };
}

// The members `name` is read through, or null when any mention is not a plain `.member` read.
function memberReads(source: string, name: string): ReadonlySet<string> | null {
	const members = new Set<string>();
	for (const match of source.matchAll(new RegExp(`(^|[^\\w$.])${name}(?![\\w$])`, 'g'))) {
		const member = /^\s*\??\.\s*([A-Za-z_$][\w$]*)/.exec(
			source.slice((match.index ?? 0) + match[0].length),
		);
		if (!member?.[1]) return null;
		members.add(member[1]);
	}
	return members;
}

/**
 * Whether one component the row reaches is PROVABLY free of an async boundary,
 * whose settle bookkeeping the page counted only for the rows it served. A nested
 * @for or a render-chosen tag is admitted: the row renders whole in the browser,
 * so its own fragment counts their nodes and its records wire the nested rows.
 *
 * Provably is the whole point: a tree this module cannot reach is a refusal,
 * never a pass. A child declared here is answered from this module's own chunks.
 * A child behind an import has no chunks here, so the answer comes from the
 * construct reach its module published PER COMPONENT - a fact about that
 * component's own tree, so a boundary in a sibling of it says nothing about this
 * row.
 */
function childIsMintable(
	input: ConstructReachInput,
	edge: SemanticComponentEdge,
	childTemplateId: string,
	seen: Set<string>,
): boolean {
	if (edge.importSource !== undefined) {
		const entry = input.importedModuleInterfaces?.[edge.importSource]?.render.components.find(
			(candidate) => candidate.componentName === edge.childComponentName,
		);
		if (!entry) return false;
	}
	const reach = childConstructReach(input, edge, childTemplateId, seen);
	return reach !== 'boundaries' && reach !== 'unknown';
}
