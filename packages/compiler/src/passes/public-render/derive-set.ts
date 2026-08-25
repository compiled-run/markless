import type { PublicRenderModuleInput } from '../../artifacts.ts';
import type { CompilerDiagnostic } from '../../diagnostics.ts';
import { serverDeriveUnreachableDiagnostic } from './diagnostics.ts';
import { collectSsrSharedComputedSources } from './html.ts';
import { componentEdgesFor } from './shared.ts';

export function rowScopedEdgeIds(
	chunks: PublicRenderModuleInput['renderData']['chunks'],
): ReadonlySet<string> {
	const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
	const edgeIds = new Set<string>();
	const walked = new Set<string>();
	const walk = (chunkId: string) => {
		if (walked.has(chunkId)) return;
		walked.add(chunkId);
		for (const slot of byId.get(chunkId)?.slots ?? []) {
			if (slot.kind === 'child-component') {
				edgeIds.add(slot.componentEdgeId);
				if (slot.projectionChunkId) walk(slot.projectionChunkId);
			} else if (slot.kind === 'repeat') walk(slot.rowTemplateId);
			// An arm decides WHETHER its body renders, never which row it is inside:
			// a component an arm holds is still the row's, so the walk follows it.
			else if (slot.kind === 'branch') for (const armId of slot.armTemplateIds) walk(armId);
		}
	};
	for (const chunk of chunks) if (chunk.kind === 'repeat-row') walk(chunk.id);
	return edgeIds;
}

/**
 * What each sync derive reads, by graph node id. An async computed contributes no
 * edge: nothing derives it server-side, so nothing it reads has to derive either.
 */
export function computedDependencyEdges(
	input: PublicRenderModuleInput,
): ReadonlyMap<string, ReadonlyArray<string>> {
	const edges = new Map<string, string[]>();
	for (const symbol of input.symbolResolver.symbols) {
		if (symbol.kind !== 'sync-computed-derive') continue;
		const reads = edges.get(symbol.graphNodeId) ?? [];
		edges.set(symbol.graphNodeId, reads);
		for (const dependency of symbol.dependencies ?? [])
			if (
				dependency.graphNodeId !== symbol.graphNodeId &&
				!reads.includes(dependency.graphNodeId)
			)
				reads.push(dependency.graphNodeId);
	}
	return edges;
}

function authoredHandlerReads(
	symbol: PublicRenderModuleInput['symbolResolver']['symbols'][number],
): ReadonlyArray<string> {
	return symbol.kind === 'event-handler' || symbol.kind === 'callback-prop'
		? (symbol.reads ?? []).map((read) => read.graphNodeId)
		: [];
}

/**
 * The graph nodes an authored handler reads. A resume re-derives a sync computed
 * only when a dependency is written, so a computed in this set is one whose value
 * has to travel in the payload for the handler's first read to answer.
 */
export function handlerReadGraphNodeIds(input: PublicRenderModuleInput): ReadonlySet<string> {
	return new Set(input.symbolResolver.symbols.flatMap(authoredHandlerReads));
}

/** The same reads, narrowed to the handlers one component's own render places. */
function componentHandlerReadGraphNodeIds(
	input: PublicRenderModuleInput,
	componentName: string,
): ReadonlyArray<string> {
	const hostNodeIds = new Set(
		input.renderData.chunks
			.filter((chunk) => chunk.componentName === componentName)
			.flatMap((chunk) => chunk.hosts.map((host) => host.hostNodeId)),
	);
	const edgeIds = new Set(componentEdgesFor(input, componentName).map((edge) => edge.id));
	return input.symbolResolver.symbols.flatMap((symbol) =>
		(symbol.kind === 'event-handler' && hostNodeIds.has(symbol.hostNodeId)) ||
		(symbol.kind === 'callback-prop' && edgeIds.has(symbol.componentEdgeId))
			? authoredHandlerReads(symbol)
			: [],
	);
}

/**
 * The graph nodes this component's own markup, props and branch tests read
 * DIRECTLY - before the transitive walk adds what those reads themselves read.
 */
function directDeriveRootGraphNodeIds(
	input: PublicRenderModuleInput,
	componentName: string,
): ReadonlySet<string> {
	const rowScopedEdges = rowScopedEdgeIds(input.renderData.chunks);
	const chunks = input.renderData.chunks.filter((chunk) => chunk.componentName === componentName);
	return new Set([
		...chunks.flatMap((chunk) =>
			chunk.slots.flatMap((slot) => {
				const residueIds =
					'residue' in slot && slot.residue.kind === 'graph-read'
						? [slot.residue.graphNodeId]
						: [];
				return slot.kind === 'dynamic-host'
					? [
							...residueIds,
							...slot.attributeSlots.flatMap((attribute) =>
								attribute.residue.kind === 'graph-read'
									? [attribute.residue.graphNodeId]
									: [],
							),
						]
					: residueIds;
			}),
		),
		// A branch condition the compiler recombined into one computed is read the
		// same way a text slot reads its residue: off the state map, by id. Left
		// out of the seed pass the server read `undefined` and took the else arm
		// whenever the authored condition was true, so the served HTML disagreed
		// with what the client resumed to.
		...chunks.flatMap((chunk) =>
			chunk.slots.flatMap((slot) =>
				slot.kind === 'branch'
					? (
							input.renderData.branches.find(
								(branch) => branch.branchSiteId === slot.branchSiteId,
							)?.testReads ?? []
						).map((read) => read.graphNodeId)
					: [],
			),
		),
		// A node this component reads ONLY to hand to the child it composes is
		// still read by this render: without it the child is composed from the
		// factory placeholder rather than from what this body just seeded. Row
		// -scoped edges stay out - their props read locals only the row has.
		...componentEdgesFor(input, componentName).flatMap((edge) =>
			rowScopedEdges.has(edge.id)
				? []
				: edge.props.flatMap((prop) =>
						prop.kind === 'graph-reference' || prop.kind === 'spread'
							? [prop.graphNodeId]
							: [],
					),
		),
		...componentHandlerReadGraphNodeIds(input, componentName),
	]);
}

/**
 * Every graph node this component's render has to put in the state map. A
 * factory `computed()` reaches it THROUGH the component-local `computed()`,
 * template expression or handler that reads it, not only by being named in a
 * markup slot: reconstructing the instance without the derive read undefined and
 * dropped the attribute.
 */
export function componentDeriveGraphNodeIds(
	input: PublicRenderModuleInput,
	componentName: string,
): ReadonlySet<string> {
	const edges = computedDependencyEdges(input);
	const reached = new Set<string>();
	const queue = [...directDeriveRootGraphNodeIds(input, componentName)];
	while (queue.length > 0) {
		const id = queue.pop();
		if (id === undefined || reached.has(id)) continue;
		reached.add(id);
		for (const next of edges.get(id) ?? []) if (!reached.has(next)) queue.push(next);
	}
	return reached;
}

/**
 * Derive order for `ids`: a computed another one reads derives first. Input order
 * survives wherever it already satisfied the dependencies, so a module whose
 * declaration order was already right emits the lines it emitted before.
 * `cyclic` names the ids whose dependencies loop back - no order derives those.
 */
export function orderComputedDerives(
	ids: ReadonlyArray<string>,
	edges: ReadonlyMap<string, ReadonlyArray<string>>,
): { readonly ordered: ReadonlyArray<string>; readonly cyclic: ReadonlyArray<string> } {
	const candidates = new Set(ids);
	const ordered: string[] = [];
	const settled = new Set<string>();
	const onPath = new Set<string>();
	const cyclic = new Set<string>();
	const visit = (id: string): void => {
		if (settled.has(id)) return;
		if (onPath.has(id)) {
			cyclic.add(id);
			return;
		}
		onPath.add(id);
		for (const next of edges.get(id) ?? []) if (candidates.has(next)) visit(next);
		onPath.delete(id);
		settled.add(id);
		ordered.push(id);
	};
	for (const id of ids) visit(id);
	return { ordered, cyclic: [...cyclic] };
}

/**
 * The reachable sync computeds this module cannot derive server-side. Left
 * silent, each one reconstructs as `undefined` and its attribute simply drops
 * from the served HTML, so the compiler names it instead.
 */
export function collectSsrDeriveSetDiagnostics(
	input: PublicRenderModuleInput,
): ReadonlyArray<CompilerDiagnostic> {
	const syncComputedNames = new Map(
		input.protocolState.computed.flatMap((computed) =>
			computed.async ? [] : ([[computed.graphNodeId, computed.name]] as const),
		),
	);
	const sharedSources = collectSsrSharedComputedSources(input);
	const localComputedIds = new Set(
		input.semanticGraph.graphBindings.flatMap((binding) =>
			binding.kind === 'computed' && binding.sharedDefinitionId === undefined
				? [binding.id]
				: [],
		),
	);
	const edges = computedDependencyEdges(input);
	const componentNames = [
		...new Set(input.renderData.chunks.map((chunk) => chunk.componentName)),
	];
	const reported = new Set<string>();
	const diagnostics: CompilerDiagnostic[] = [];
	const report = (graphNodeId: string, reason: 'cycle' | 'no-source') => {
		if (reported.has(graphNodeId)) return;
		reported.add(graphNodeId);
		diagnostics.push(
			serverDeriveUnreachableDiagnostic({
				name: syncComputedNames.get(graphNodeId) ?? graphNodeId,
				reason,
			}),
		);
	};
	// A component-local `computed()` is a render-body local, evaluated where it is
	// declared. A factory computed is the one kind with no local to re-read, so it
	// is the one kind a missing derive leaves as undefined in the state map.
	const factoryComputedIds = [...syncComputedNames.keys()].filter(
		(graphNodeId) => graphNodeId.startsWith('shared:') && !localComputedIds.has(graphNodeId),
	);
	for (const componentName of componentNames) {
		const reachable = componentDeriveGraphNodeIds(input, componentName);
		const reached = factoryComputedIds.filter((graphNodeId) => reachable.has(graphNodeId));
		for (const graphNodeId of reached)
			if (!sharedSources.has(graphNodeId)) report(graphNodeId, 'no-source');
		for (const graphNodeId of orderComputedDerives(
			reached.filter((graphNodeId) => sharedSources.has(graphNodeId)),
			edges,
		).cyclic)
			report(graphNodeId, 'cycle');
	}
	return diagnostics;
}
