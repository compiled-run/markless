import type { PublicRenderModuleInput } from '../../artifacts.ts';
import type { CompilerDiagnostic } from '../../diagnostics.ts';
import { asNodes, isNode, type AnyNode } from '../../ast/nodes.ts';
import { parseModule } from '../../js-ast.ts';
import { PUBLIC_RENDER_PLAN_PASS_ID, serverDeriveUnreachableDiagnostic } from './diagnostics.ts';
import { collectSsrSharedComputedSources } from './html.ts';
import {
	authoredResidueSources,
	renderDecisionSources,
	sharedInstanceReadGraphNodeIds,
} from './residue-reader.ts';
import {
	componentEdgesFor,
	moduleScopeDeclarations,
	publicRenderValueImports,
	repeatCollectionGraphNodeIds,
} from './shared.ts';

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
	const copiedBodyReported = new Set<string>();
	const bound = moduleBoundNames(input);
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
		for (const graphNodeId of reached) {
			const source = sharedSources.get(graphNodeId);
			if (source === undefined || copiedBodyReported.has(graphNodeId)) continue;
			copiedBodyReported.add(graphNodeId);
			diagnostics.push(
				...foreignCopiedBodyDiagnostics(input, {
					graphNodeId,
					name: syncComputedNames.get(graphNodeId) ?? graphNodeId,
					source,
					bound,
				}),
			);
		}
	}
	return diagnostics;
}

/** This pass owns the code; readers import it rather than restating the string. */
export const SHARED_COMPUTED_CROSS_MODULE_CODE = 'MARKLESS_SHARED_COMPUTED_CROSS_MODULE';

/** The file a `shared:<filename>#<name>/...` node was defined in. */
function sharedDefinitionFilename(graphNodeId: string): string | null {
	const hash = graphNodeId.indexOf('#');
	return graphNodeId.startsWith('shared:') && hash !== -1
		? graphNodeId.slice('shared:'.length, hash)
		: null;
}

/** Every name the emitted server module binds at module scope. */
function moduleBoundNames(input: PublicRenderModuleInput): ReadonlySet<string> {
	const declarations = moduleScopeDeclarations(input.source.source, input.source.filename);
	return new Set([
		...publicRenderValueImports(
			input.semanticGraph.moduleImports,
			input.semanticGraph.componentEdges,
			declarations.map((declaration) => declaration.source).join('\n'),
		).map((moduleImport) => moduleImport.localName),
		...declarations.flatMap((declaration) => [...declaration.names]),
	]);
}

/**
 * The refusal for a factory `computed()` whose expression this module copies out
 * of another file. The copy carries the authored text and the graph reads the
 * compiler rewrote into it and nothing else, so a name from the defining file's
 * module scope either binds to nothing here - a ReferenceError while the page is
 * served - or matches a same-named import of THIS file and quietly means
 * something the author never wrote.
 */
function foreignCopiedBodyDiagnostics(
	input: PublicRenderModuleInput,
	cell: {
		readonly graphNodeId: string;
		readonly name: string;
		readonly source: string;
		readonly bound: ReadonlySet<string>;
	},
): ReadonlyArray<CompilerDiagnostic> {
	const definedIn = sharedDefinitionFilename(cell.graphNodeId);
	if (definedIn === null || definedIn === input.source.filename) return [];
	return [...freeIdentifierNames(cell.source)]
		.filter((name) => !isPlatformGlobal(name))
		.map((name) => ({
			code: SHARED_COMPUTED_CROSS_MODULE_CODE,
			severity: 'error' as const,
			phase: 'public-render' as const,
			passId: PUBLIC_RENDER_PLAN_PASS_ID,
			artifactKeys: ['publicRenderModule'],
			title: `A shared() computed cannot be read from another module yet ("${cell.name}")`,
			message: cell.bound.has(name)
				? `Serving this page works "${cell.name}" out by copying its expression from ${definedIn} into this file. The copied expression names "${name}", and the import of "${name}" in THIS file was matched against it by name alone, so the served value would be built from this module's "${name}" rather than the one ${definedIn} means.`
				: `Serving this page works "${cell.name}" out by copying its expression from ${definedIn} into this file. The copied expression names "${name}", and nothing in this module binds it, so rendering this page on the server would throw a ReferenceError.`,
			why: "A shared() factory has no instance on the server to ask for a computed value, so the server works the value out by copying the factory's own expression into the module of every page that reads it. Copying text moves the statements but not the scope they were written in: the defining file's imports and module-scope constants do not travel, and the copy is matched against the reading file's imports by name. Both failures happen only while the page is being served, so this build refuses instead of shipping one.",
			suggestions: [
				{
					message: `Write "${cell.name}" so it needs nothing from ${definedIn}'s module scope - out of the factory's own state and platform globals only - and it copies into any file unchanged.`,
				},
				{
					message: `Or read "${cell.name}" from a part that ${definedIn} publishes and compose that part here. Inside its own module the same expression copies back into the scope it was written in.`,
				},
			],
			docsUrl: `https://markless.dev/errors/${SHARED_COMPUTED_CROSS_MODULE_CODE}`,
		}));
}

// The compiler's own host answers for the platform names a derive may call;
// browser-only globals are absent there and are named instead.
const BROWSER_ONLY_GLOBALS: ReadonlySet<string> = new Set([
	'document',
	'getComputedStyle',
	'history',
	'localStorage',
	'location',
	'matchMedia',
	'requestAnimationFrame',
	'sessionStorage',
	'window',
]);

function isPlatformGlobal(name: string): boolean {
	return BROWSER_ONLY_GLOBALS.has(name) || name in globalThis;
}

/** Every name the copied expression uses and does not itself bind. */
function freeIdentifierNames(source: string): ReadonlySet<string> {
	let ast: AnyNode;
	try {
		ast = parseModule(`(${source})`, 'generated.ts') as unknown as AnyNode;
	} catch {
		// Text the compiler just built and cannot reparse is a different defect;
		// it is no evidence of this one, so claim nothing.
		return new Set();
	}
	const bound = new Set<string>();
	const referenced = new Set<string>();
	const seen = new Set<object>();
	const stack: unknown[] = [ast];
	while (stack.length > 0) {
		const value = stack.pop();
		if (!value || typeof value !== 'object' || seen.has(value)) continue;
		seen.add(value);
		if (Array.isArray(value)) {
			for (const item of value) stack.push(item);
			continue;
		}
		const node = value as AnyNode;
		if (node.type === 'Identifier' && typeof node.name === 'string') {
			referenced.add(node.name);
			continue;
		}
		if (BINDING_PARENT_TYPES.has(String(node.type))) collectPatternNames(node.id, bound);
		for (const parameter of asNodes(node.params)) collectPatternNames(parameter, bound);
		for (const [key, child] of Object.entries(node)) {
			if (WALK_IGNORED_KEYS.has(key)) continue;
			if (node.computed !== true && key === 'property' && node.type === 'MemberExpression')
				continue;
			if (node.computed !== true && key === 'key' && node.type === 'Property') continue;
			stack.push(child);
		}
	}
	return new Set([...referenced].filter((name) => !bound.has(name)));
}

const BINDING_PARENT_TYPES: ReadonlySet<string> = new Set([
	'VariableDeclarator',
	'FunctionDeclaration',
	'FunctionExpression',
	'ClassDeclaration',
	'ClassExpression',
]);

// Side tables, back-pointers, and the type positions, which name types rather
// than values a copied expression has to find while the page is served.
const WALK_IGNORED_KEYS: ReadonlySet<string> = new Set([
	'parent',
	'loc',
	'range',
	'leadingComments',
	'trailingComments',
	'comments',
	'typeAnnotation',
	'returnType',
	'typeParameters',
	'typeArguments',
	'superTypeArguments',
]);

/** Every name a binding pattern introduces, destructuring included. */
function collectPatternNames(pattern: unknown, into: Set<string>): void {
	if (!isNode(pattern)) return;
	if (pattern.type === 'Identifier' && typeof pattern.name === 'string') {
		into.add(pattern.name);
		return;
	}
	if (pattern.type === 'AssignmentPattern') return collectPatternNames(pattern.left, into);
	if (pattern.type === 'RestElement') return collectPatternNames(pattern.argument, into);
	if (pattern.type === 'ArrayPattern') {
		for (const element of asNodes(pattern.elements)) collectPatternNames(element, into);
		return;
	}
	if (pattern.type === 'ObjectPattern')
		for (const property of asNodes(pattern.properties))
			collectPatternNames(
				property.type === 'RestElement' ? property.argument : property.value,
				into,
			);
}
