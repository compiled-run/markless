import {
	PROTOCOL_PROP_GRAPH_NODE_PREFIX,
	PROTOCOL_PROPS_GRAPH_NODE_ID,
} from '@markless/serializer';
import type { PublicRenderModuleInput, SemanticComponentEdge } from '../../artifacts.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
} from '../../artifact-helpers/graph-paths.ts';

/** A keyed `@for` over one prop whose record and served collection a render drops when its caller passes that prop a value that never changes. */
export type StaticRowRepeat = { readonly repeatId: string; readonly prop: string };

/** What a placed child's props are fixed by: a value no browser write reaches, or this component's own prop of that name. */
export type EdgeStaticProps = {
	readonly fixed?: ReadonlyArray<string>;
	readonly from?: ReadonlyArray<readonly [string, string]>;
};

/**
 * The repeats of `componentName` whose rows the browser never reads back once
 * their collection cannot change: no row handler, handle, attach, @if or
 * callback, no nested list wired off a row, and no row slot showing anything
 * but the item. Such rows stay as served, so the record and the collection
 * are dead weight in an instance whose caller fixed the prop.
 */
export function staticRowRepeats(
	input: PublicRenderModuleInput,
	componentName: string,
): ReadonlyArray<StaticRowRepeat> {
	const records = input.protocolView.keyedRepeats ?? [];
	return records.flatMap((record): StaticRowRepeat[] => {
		const [prop, ...rest] = record.collectionPath;
		const render = input.renderData.repeats.find((entry) => entry.repeatId === record.id);
		const semantic = input.semanticGraph.keyedRepeats.find((entry) => entry.id === record.id);
		const rowChunk = input.renderData.chunks.find((chunk) => chunk.id === render?.rowChunkId);
		if (
			!render ||
			!semantic ||
			rowChunk?.componentName !== componentName ||
			record.collectionGraphNodeId !== PROTOCOL_PROPS_GRAPH_NODE_ID ||
			!prop ||
			prop === '*' ||
			rest.length > 0 ||
			semantic.enclosingRepeatId ||
			record.enclosingRow ||
			'branchArm' in record ||
			record.rowEvents.length > 0 ||
			record.rowElementHandles?.length ||
			records.some((other) => other.enclosingRow?.repeatId === record.id)
		)
			return [];
		const template = record.rowTemplate;
		if (
			template &&
			(template.branchSlots?.length ||
				template.componentName ||
				[...(template.textSlots ?? []), ...(template.attributeSlots ?? [])].some(
					(slot) => !('itemPath' in slot),
				))
		)
			return [];
		if (!rowsReadNothingBack(input, rowChunk.id)) return [];
		if (writesProp(input, componentName, prop, record.id)) return [];
		return [{ repeatId: record.id, prop }];
	});
}

// Every chunk a row renders, nested rows and projected children included, holds nothing the browser runs.
function rowsReadNothingBack(input: PublicRenderModuleInput, rowChunkId: string): boolean {
	const chunks = new Map(input.renderData.chunks.map((chunk) => [chunk.id, chunk]));
	const edges = new Map(input.semanticGraph.componentEdges.map((edge) => [edge.id, edge]));
	const hosts = new Set<string>();
	const walked = new Set<string>();
	const walk = (chunkId: string): boolean => {
		if (walked.has(chunkId)) return true;
		walked.add(chunkId);
		const chunk = chunks.get(chunkId);
		if (!chunk) return false;
		for (const host of chunk.hosts) hosts.add(host.hostNodeId);
		return chunk.slots.every((slot) => {
			if (slot.kind === 'branch') return false;
			if (slot.kind === 'dynamic-host') return walk(slot.childChunkId);
			if (slot.kind === 'repeat') return walk(slot.rowTemplateId);
			if (slot.kind !== 'child-component') return true;
			const edge = edges.get(slot.componentEdgeId);
			if (!edge || edge.props.some((prop) => prop.kind === 'callback' || prop.kind === 'spread'))
				return false;
			// A row child's handler reads what its row passed it back off the list when it runs.
			const child = childInterface(input, edge);
			const handled = child?.handlerProps ?? [];
			if (!child || edge.props.some((prop) => handled.includes(prop.name) || handled.includes('*')))
				return false;
			return slot.projectionChunkId === undefined || walk(slot.projectionChunkId);
		});
	};
	if (!walk(rowChunkId)) return false;
	const view = input.protocolView;
	return (
		!view.events.some((event) => hosts.has(event.hostNodeId)) &&
		!view.behaviors.some((behavior) => hosts.has(behavior.hostNodeId)) &&
		!view.elementHandles.some((handle) => hosts.has(handle.hostNodeId)) &&
		!input.symbolResolver.symbols.some(
			(symbol) => 'hostNodeId' in symbol && hosts.has(symbol.hostNodeId as string),
		)
	);
}

// A write that may land on the prop, or one this component cannot place, keeps the collection.
function writesProp(
	input: PublicRenderModuleInput,
	componentName: string,
	prop: string,
	repeatId?: string,
): boolean {
	const graph = input.semanticGraph;
	const bindings = graphBindingMap(graph, null, componentName);
	const aliases = semanticAliasMap(graph, null, componentName);
	return graph.stateWrites.some((write) => {
		if ((write.componentName && write.componentName !== componentName) || write.sharedDefinitionId)
			return false;
		if (repeatId !== undefined && write.rowRepeatId === repeatId) return true;
		const through = write.through;
		if (through?.kind === 'local' || through?.kind === 'untracked') return false;
		const target =
			through?.kind === 'path'
				? through.target
				: through?.kind === 'element'
					? through.collection
					: write.target;
		const resolved = resolveGraphPath(target, bindings, aliases);
		if (!resolved) return true;
		if (resolved.binding.kind !== 'prop') return false;
		return (
			resolved.binding.id !== PROTOCOL_PROPS_GRAPH_NODE_ID ||
			resolved.path.length === 0 ||
			resolved.path[0] === prop
		);
	});
}

/**
 * The props of `componentName`, or of a component it places, that a static-row
 * repeat iterates: only a caller passing one of these is told which it fixed.
 */
export function staticRowProps(
	input: PublicRenderModuleInput,
	componentName: string,
	seen = new Set<string>(),
): ReadonlySet<string> {
	const props = new Set(staticRowRepeats(input, componentName).map((repeat) => repeat.prop));
	if (seen.has(componentName)) return props;
	seen.add(componentName);
	for (const edge of input.semanticGraph.componentEdges) {
		if (edge.parentComponentName !== componentName) continue;
		const wanted = childStaticRowProps(input, edge, seen);
		for (const [, own] of edgeStaticProps(input, edge, wanted)?.from ?? []) props.add(own);
	}
	return props;
}

function childStaticRowProps(
	input: PublicRenderModuleInput,
	edge: SemanticComponentEdge,
	seen: Set<string>,
): ReadonlySet<string> {
	if (edge.importSource === undefined)
		return staticRowProps(input, edge.childComponentName, seen);
	return new Set(childInterface(input, edge)?.staticRowProps ?? []);
}

// The child's published interface: this module's own for a same-module child, the imported module's otherwise.
function childInterface(input: PublicRenderModuleInput, edge: SemanticComponentEdge) {
	const components =
		edge.importSource === undefined
			? input.semanticGraph.moduleGraphInterface.render.components
			: input.source.importedModuleInterfaces?.[edge.importSource]?.render.components;
	return components?.find(
		(candidate) =>
			candidate.componentName === edge.childComponentName ||
			(edge.importSource !== undefined &&
				edge.importedName !== undefined &&
				candidate.exportName === edge.importedName),
	);
}

/**
 * Which of the props the child wants fixed this edge passes as a value that
 * never changes. Only an edge outside every @if, @try and row qualifies: an
 * arm or a row the browser builds again builds its child from the data.
 */
export function edgeStaticProps(
	input: PublicRenderModuleInput,
	edge: SemanticComponentEdge,
	wanted: ReadonlySet<string> = childStaticRowProps(input, edge, new Set()),
): EdgeStaticProps | undefined {
	if (
		wanted.size === 0 ||
		edge.keyedRepeatScopeIds.length > 0 ||
		edge.branchScopeIds.length > 0 ||
		edge.branchArms?.length ||
		edge.asyncBoundaryId !== undefined ||
		edge.props.some((prop) => prop.kind === 'spread')
	)
		return undefined;
	const fixed: string[] = [];
	const from: Array<readonly [string, string]> = [];
	for (const prop of edge.props) {
		if (!wanted.has(prop.name)) continue;
		if (prop.kind === 'serializable' || (prop.kind === 'opaque' && prop.buildTimeValue && !prop.rowRead))
			fixed.push(prop.name);
		else if (prop.kind === 'graph-reference' && prop.graphBindingKind === 'prop') {
			const own =
				prop.graphNodeId === PROTOCOL_PROPS_GRAPH_NODE_ID
					? prop.path.length === 1
						? prop.path[0]
						: undefined
					: prop.path.length === 0 && prop.graphNodeId.startsWith(PROTOCOL_PROP_GRAPH_NODE_PREFIX)
						? prop.graphNodeId.slice(PROTOCOL_PROP_GRAPH_NODE_PREFIX.length)
						: undefined;
			if (own && !writesProp(input, edge.parentComponentName, own)) from.push([prop.name, own]);
		}
	}
	if (fixed.length === 0 && from.length === 0) return undefined;
	return { ...(fixed.length ? { fixed } : {}), ...(from.length ? { from } : {}) };
}

// The child render context's `staticProps`, emitted only where this edge fixes a prop its child wants.
export function staticPropsField(input: PublicRenderModuleInput, edge: SemanticComponentEdge): string {
	const fixed = edgeStaticProps(input, edge);
	return fixed
		? `,staticProps:marklessSsrStaticProps(marklessSsrRenderContext,marklessSsrPlacedChild,${JSON.stringify(fixed)})`
		: '';
}

export function staticRowsComposition(
	input: PublicRenderModuleInput,
	componentName: string,
	composition: string,
): string {
	const repeats = staticRowRepeats(input, componentName);
	return repeats.length > 0
		? `marklessSsrStaticRows(${composition}, ${JSON.stringify(repeats.map(({ repeatId, prop }) => [repeatId, prop]))}, marklessSsrRenderContext)`
		: composition;
}
