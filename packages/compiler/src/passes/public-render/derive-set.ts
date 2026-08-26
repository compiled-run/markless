import type { PublicRenderModuleInput } from '../../artifacts.ts';
import type { CompilerDiagnostic } from '../../diagnostics.ts';
import {
	carryForeignFactoryScope,
	computedReadCallRefusals,
	consumerBindingOrigins,
	crossModuleRefusal,
	sharedDefinitionFilename,
	COMPUTED_READ_CALLED_CODE,
	type ComputedReadingExpression,
	type ComputedReadCallRefusal,
	type ForeignCopiedBody,
} from '../foreign-scope.ts';
import { PUBLIC_RENDER_PLAN_PASS_ID, serverDeriveUnreachableDiagnostic } from './diagnostics.ts';
import { collectSsrSharedComputedSources } from './html.ts';
import {
	authoredResidueSources,
	renderDecisionSources,
	sharedInstanceReadGraphNodeIds,
} from './residue-reader.ts';
import { componentEdgesFor, repeatCollectionGraphNodeIds } from './shared.ts';

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
		// A `@for` reads its collection through the repeat record, not through a
		// slot residue, so the walk above cannot see it. Left out, a component
		// whose only read is the collection derived nothing and served no rows.
		...repeatCollectionGraphNodeIds(chunks, input.renderData.repeats),
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
		// A composite residue over a shared instance (`checkbox.checked === true`)
		// names no graph node the render data can see, so the walk above misses it:
		// the rebuilt local read the state map's `undefined` and the attribute it
		// fed dropped out of the served HTML.
		...sharedInstanceReadGraphNodeIds(
			input.semanticGraph,
			componentName,
			[
				...new Set([
					...authoredResidueSources(chunks),
					...renderDecisionSources(input, componentName),
				]),
			].join('\n'),
		),
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
	const syncComputedNames = syncComputedNamesByGraphNodeId(input);
	const sharedSources = collectSsrSharedComputedSources(input);
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
	const factoryComputedIds = factoryComputedGraphNodeIds(input, syncComputedNames);
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
	return [
		...diagnostics,
		...foreignSharedComputedScope(input).diagnostics,
		...computedReadCallSiteRefusals(input).map(computedReadCalledDiagnostic),
	];
}

// Owned by the shared foreign-scope helper; re-exported here because this pass
// is where readers of the served derive set look for it.
export { COMPUTED_READ_CALLED_CODE, SHARED_COMPUTED_CROSS_MODULE_CODE } from '../foreign-scope.ts';

/**
 * Every expression this module compiles by copying its authored text, and the
 * cells each one reads: the derives, and the callbacks whose reads the browser
 * module rewrites the same way.
 */
function computedReadingExpressions(
	input: PublicRenderModuleInput,
): ReadonlyArray<ComputedReadingExpression> {
	return input.symbolResolver.symbols.flatMap(
		(symbol): ReadonlyArray<ComputedReadingExpression> => {
			if (symbol.kind === 'sync-computed-derive' || symbol.kind === 'async-computed-runner')
				return [
					{
						id: symbol.graphNodeId,
						emission: { kind: 'derive', name: symbol.name },
						source: symbol.source,
						reads: symbol.dependencies ?? [],
					},
				];
			if (symbol.kind === 'event-handler')
				return [
					{
						id: symbol.id,
						emission: { kind: 'callback', description: `"${symbol.eventName}" handler` },
						source: symbol.source,
						reads: symbol.reads ?? [],
					},
				];
			if (symbol.kind === 'callback-prop')
				return [
					{
						id: symbol.id,
						emission: { kind: 'callback', description: `"${symbol.propName}" callback` },
						source: symbol.source,
						reads: symbol.reads ?? [],
					},
				];
			if (symbol.kind === 'branch-update')
				return [
					{
						id: symbol.id,
						emission: { kind: 'callback', description: 'test of this @if' },
						source: symbol.testSource,
						reads: symbol.testReads,
					},
				];
			return [];
		},
	);
}

function computedReadCallSiteRefusals(
	input: PublicRenderModuleInput,
): ReadonlyArray<ComputedReadCallRefusal> {
	return computedReadCallRefusals({
		expressions: computedReadingExpressions(input),
		computedGraphNodeIds: new Set(
			input.semanticGraph.graphBindings.flatMap((binding) =>
				binding.kind === 'computed' ? [binding.id] : [],
			),
		),
	});
}

/**
 * Every emitter compiles these expressions from the same authored text, and each
 * binds their cell reads to the values those cells already hold - the served
 * module as a local, the browser module as `context.graph.read(...)`. So a read
 * the expression spells as a call has no sound emission anywhere, and the one
 * refusal covers them all.
 */
function computedReadCalledDiagnostic(refusal: ComputedReadCallRefusal): CompilerDiagnostic {
	const { emission } = refusal;
	const subject =
		emission.kind === 'derive' ? `Deriving "${emission.name}"` : `The ${emission.description}`;
	const throwsWhen =
		emission.kind === 'derive'
			? `while the page is being served, or in the browser the first time a write re-derives "${emission.name}"`
			: `the first time the ${emission.description} runs`;
	return {
		code: COMPUTED_READ_CALLED_CODE,
		severity: 'error',
		phase: 'public-render',
		passId: PUBLIC_RENDER_PLAN_PASS_ID,
		artifactKeys: ['publicRenderModule', 'symbolModules'],
		title: `A computed() is read as a value, not called ("${refusal.called}")`,
		message: `${subject} reads "${refusal.called}" off its cell, so "${refusal.called}" is bound to the value that cell already holds - and the expression spells it "${refusal.called}()". Calling a derived value throws a TypeError: ${throwsWhen}.`,
		why: "computed() answers with the derived VALUE rather than a handle to call - its declared type is the value's own type - so the compiler lowers every read of a computed into a read of its cell. Parentheses written around that read are applied to the value the read answers with, not to the expression that produced it, and nothing at build time pointed at the difference.",
		suggestions: [
			{
				message: `Drop the parentheses: write "${refusal.called}" where the expression writes "${refusal.called}()".`,
			},
			{
				message: `If "${refusal.called}" was meant to run per call, write it as a plain function beside the factory and call that instead - a computed() is a cell, and the graph derives it once per change.`,
			},
		],
		docsUrl: `https://markless.dev/errors/${COMPUTED_READ_CALLED_CODE}`,
	};
}

function syncComputedNamesByGraphNodeId(
	input: PublicRenderModuleInput,
): ReadonlyMap<string, string> {
	return new Map(
		input.protocolState.computed.flatMap((computed) =>
			computed.async ? [] : ([[computed.graphNodeId, computed.name]] as const),
		),
	);
}

/**
 * A component-local `computed()` is a render-body local, evaluated where it is
 * declared. A factory computed is the one kind with no local to re-read, so it is
 * the one kind a missing derive leaves as undefined in the state map.
 */
function factoryComputedGraphNodeIds(
	input: PublicRenderModuleInput,
	syncComputedNames: ReadonlyMap<string, string>,
): ReadonlyArray<string> {
	const localComputedIds = new Set(
		input.semanticGraph.graphBindings.flatMap((binding) =>
			binding.kind === 'computed' && binding.sharedDefinitionId === undefined
				? [binding.id]
				: [],
		),
	);
	return [...syncComputedNames.keys()].filter(
		(graphNodeId) => graphNodeId.startsWith('shared:') && !localComputedIds.has(graphNodeId),
	);
}

/** The factory expressions this module's server render copies out of another file. */
function foreignCopiedBodies(input: PublicRenderModuleInput): ReadonlyArray<ForeignCopiedBody> {
	const sharedSources = collectSsrSharedComputedSources(input);
	if (sharedSources.size === 0) return [];
	const syncComputedNames = syncComputedNamesByGraphNodeId(input);
	const factoryComputedIds = factoryComputedGraphNodeIds(input, syncComputedNames);
	if (factoryComputedIds.length === 0) return [];
	const reached = new Set<string>();
	for (const componentName of new Set(
		input.renderData.chunks.map((chunk) => chunk.componentName),
	)) {
		const reachable = componentDeriveGraphNodeIds(input, componentName);
		for (const graphNodeId of factoryComputedIds)
			if (reachable.has(graphNodeId)) reached.add(graphNodeId);
	}
	return [...reached].flatMap((graphNodeId) => {
		const source = sharedSources.get(graphNodeId);
		const definedIn = sharedDefinitionFilename(graphNodeId);
		return source === undefined || definedIn === null || definedIn === input.source.filename
			? []
			: [
					{
						graphNodeId,
						name: syncComputedNames.get(graphNodeId) ?? graphNodeId,
						source,
						definedIn,
					},
				];
	});
}

/**
 * What this module has to emit beside a factory expression it copied out of
 * another file, and the refusals for the names it cannot satisfy.
 *
 * The copy carries the authored text and the graph reads the compiler rewrote
 * into it, so every other name it spells belongs to the defining file's module
 * scope. The definition record carries that scope; this narrows it to the names
 * the copy actually spells, rebases relative specifiers onto this module's own
 * path, and drops what this module already imports from the same place. A name
 * this module binds from somewhere else cannot be carried at all - one module
 * scope cannot hold two of it - so that stays refused.
 */
export type ForeignFactoryScope = {
	readonly importLines: ReadonlyArray<string>;
	readonly declarations: ReadonlyArray<string>;
	readonly diagnostics: ReadonlyArray<CompilerDiagnostic>;
};

export function foreignSharedComputedScope(input: PublicRenderModuleInput): ForeignFactoryScope {
	const carried = carryForeignFactoryScope({
		bodies: foreignCopiedBodies(input),
		sharedDefinitions: input.semanticGraph.sharedDefinitions,
		consumerOrigins: consumerBindingOrigins(input),
		consumerFilename: input.source.filename,
	});
	return {
		importLines: carried.importLines,
		declarations: carried.declarations,
		diagnostics: carried.refusals.map(crossModuleRefusal),
	};
}
