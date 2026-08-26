import type {
	PublicRenderModuleInput,
	SemanticModuleImport,
	SemanticSharedDefinition,
	SemanticSharedModuleDeclaration,
} from '../../artifacts.ts';
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
	emitValueImport,
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
	return [...diagnostics, ...foreignSharedComputedScope(input).diagnostics];
}

/** This pass owns the code; readers import it rather than restating the string. */
export const SHARED_COMPUTED_CROSS_MODULE_CODE = 'MARKLESS_SHARED_COMPUTED_CROSS_MODULE';

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

/** The file a `shared:<filename>#<name>/...` node was defined in. */
function sharedDefinitionFilename(graphNodeId: string): string | null {
	const hash = graphNodeId.indexOf('#');
	return graphNodeId.startsWith('shared:') && hash !== -1
		? graphNodeId.slice('shared:'.length, hash)
		: null;
}

type ForeignCopiedBody = {
	readonly graphNodeId: string;
	readonly name: string;
	readonly source: string;
	readonly definedIn: string;
};

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

const emptyForeignFactoryScope: ForeignFactoryScope = {
	importLines: [],
	declarations: [],
	diagnostics: [],
};

export function foreignSharedComputedScope(input: PublicRenderModuleInput): ForeignFactoryScope {
	const bodies = foreignCopiedBodies(input);
	if (bodies.length === 0) return emptyForeignFactoryScope;

	const definitionOf = (graphNodeId: string) =>
		input.semanticGraph.sharedDefinitions.find((definition) =>
			graphNodeId.startsWith(`${definition.id}/`),
		);
	const consumerOrigins = consumerBindingOrigins(input);
	const importLines: string[] = [];
	const declarations: string[] = [];
	const diagnostics: CompilerDiagnostic[] = [];
	const carried = new Map<string, CarriedBinding>();
	const refused = new Set<string>();

	const refuse = (body: ForeignCopiedBody, name: string, held: BindingOrigin | undefined) => {
		const key = `${body.graphNodeId} ${name}`;
		if (refused.has(key)) return;
		refused.add(key);
		diagnostics.push(crossModuleRefusal(body, name, held));
	};

	for (const body of bodies) {
		const definition = definitionOf(body.graphNodeId);
		const needed = neededFactoryScope(definition, body.source);
		for (const name of needed.unsatisfied) refuse(body, name, consumerOrigins.get(name));

		for (const declaration of needed.declarations) {
			const origin: BindingOrigin = {
				key: `declaration:${body.definedIn}:${declaration.source}`,
				text: `a module-scope declaration in ${body.definedIn}`,
			};
			const blocked = declaration.names.flatMap((name) => {
				const held = carried.get(name)?.origin ?? consumerOrigins.get(name);
				return held && held.key !== origin.key ? [{ name, held }] : [];
			});
			if (blocked.length > 0) {
				for (const clash of blocked) refuse(body, clash.name, clash.held);
				continue;
			}
			if (declaration.names.every((name) => carried.has(name))) continue;
			declarations.push(declaration.source);
			for (const name of declaration.names) carried.set(name, { origin });
		}

		for (const moduleImport of needed.imports) {
			const origin = importOrigin(moduleImport, body.definedIn);
			const held =
				carried.get(moduleImport.localName)?.origin ??
				consumerOrigins.get(moduleImport.localName);
			if (held) {
				if (held.key !== origin.key) refuse(body, moduleImport.localName, held);
				continue;
			}
			importLines.push(
				emitValueImport({
					...moduleImport,
					source: rebaseSpecifier(
						moduleImport.source,
						body.definedIn,
						input.source.filename,
					),
				}),
			);
			carried.set(moduleImport.localName, { origin });
		}
	}

	return { importLines, declarations, diagnostics };
}

type BindingOrigin = { readonly key: string; readonly text: string };
type CarriedBinding = { readonly origin: BindingOrigin };

/** Where each name the emitted server module binds at module scope comes from. */
function consumerBindingOrigins(
	input: PublicRenderModuleInput,
): ReadonlyMap<string, BindingOrigin> {
	const declarations = moduleScopeDeclarations(input.source.source, input.source.filename);
	const origins = new Map<string, BindingOrigin>();
	for (const declaration of declarations)
		for (const name of declaration.names)
			origins.set(name, {
				key: `declaration:${input.source.filename}:${declaration.source}`,
				text: 'a module-scope declaration in this file',
			});
	for (const moduleImport of publicRenderValueImports(
		input.semanticGraph.moduleImports,
		input.semanticGraph.componentEdges,
		declarations.map((declaration) => declaration.source).join('\n'),
	))
		origins.set(moduleImport.localName, importOrigin(moduleImport, input.source.filename));
	return origins;
}

function importOrigin(moduleImport: SemanticModuleImport, ownerFilename: string): BindingOrigin {
	const resolved = resolveSpecifier(moduleImport.source, ownerFilename);
	const imported =
		moduleImport.kind === 'named'
			? (moduleImport.importedName ?? moduleImport.localName)
			: moduleImport.kind;
	return {
		key: `import:${resolved}:${moduleImport.kind}:${imported}`,
		text: `the ${moduleImport.kind} import "${imported}" of ${moduleImport.source}`,
	};
}

/**
 * The part of a factory's carried module scope one copied expression needs, and
 * the free names nothing in it explains. A carried declaration's own free names
 * join the search, so a module constant written out of another one arrives whole.
 */
function neededFactoryScope(
	definition: SemanticSharedDefinition | undefined,
	copiedSource: string,
): {
	readonly imports: ReadonlyArray<SemanticModuleImport>;
	readonly declarations: ReadonlyArray<SemanticSharedModuleDeclaration>;
	readonly unsatisfied: ReadonlyArray<string>;
} {
	const scope = definition?.factoryModuleScope ?? [];
	const factoryImports = definition?.factoryModuleImports ?? [];
	const wanted = new Set(
		[...freeIdentifierNames(copiedSource)].filter((name) => !isPlatformGlobal(name)),
	);
	const keptDeclarations = new Set<SemanticSharedModuleDeclaration>();
	const keptImports = new Set<SemanticModuleImport>();
	const satisfied = new Set<string>();
	let changed = true;
	while (changed) {
		changed = false;
		for (const declaration of scope) {
			if (keptDeclarations.has(declaration)) continue;
			if (!declaration.names.some((name) => wanted.has(name))) continue;
			keptDeclarations.add(declaration);
			changed = true;
			for (const name of declaration.names) satisfied.add(name);
			for (const name of freeDeclarationNames(declaration.source))
				if (!isPlatformGlobal(name)) wanted.add(name);
		}
		for (const moduleImport of factoryImports) {
			if (keptImports.has(moduleImport) || !wanted.has(moduleImport.localName)) continue;
			keptImports.add(moduleImport);
			satisfied.add(moduleImport.localName);
			changed = true;
		}
	}
	return {
		// Emission order is the defining file's own, so a constant written out of
		// another one still comes after it and evaluates.
		imports: factoryImports.filter((moduleImport) => keptImports.has(moduleImport)),
		declarations: scope.filter((declaration) => keptDeclarations.has(declaration)),
		unsatisfied: [...wanted].filter((name) => !satisfied.has(name)),
	};
}

function crossModuleRefusal(
	body: ForeignCopiedBody,
	name: string,
	held: BindingOrigin | undefined,
): CompilerDiagnostic {
	return {
		code: SHARED_COMPUTED_CROSS_MODULE_CODE,
		severity: 'error',
		phase: 'public-render',
		passId: PUBLIC_RENDER_PLAN_PASS_ID,
		artifactKeys: ['publicRenderModule'],
		title: `A shared() computed cannot be read from another module yet ("${body.name}")`,
		message: held
			? `Serving this page works "${body.name}" out by copying its expression from ${body.definedIn} into this file. The copied expression names "${name}", which ${body.definedIn} means as its own, and THIS file already binds "${name}" as ${held.text}; one module scope cannot hold both, and matched against it by name alone the served value would be built from this module's "${name}" rather than the one ${body.definedIn} means.`
			: `Serving this page works "${body.name}" out by copying its expression from ${body.definedIn} into this file. The copied expression names "${name}", and nothing in this module binds it, so rendering this page on the server would throw a ReferenceError.`,
		why: "A shared() factory has no instance on the server to ask for a computed value, so the server works the value out by copying the factory's own expression into the module of every page that reads it. The imports and module-scope constants that expression names travel with the definition and are emitted beside the copy, but a name this file already binds from somewhere else cannot be: the emitted module would bind it twice, and matching by name alone would build the served value from this module's value instead.",
		suggestions: [
			held
				? {
						message: `Rename this module's "${name}", or import it under another local name, so the one ${body.definedIn} means can be carried in beside the copy.`,
					}
				: {
						message: `Write "${body.name}" so it needs nothing from ${body.definedIn}'s module scope - out of the factory's own state and platform globals only - and it copies into any file unchanged.`,
					},
			{
				message: `Or read "${body.name}" from a part that ${body.definedIn} publishes and compose that part here. Inside its own module the same expression copies back into the scope it was written in.`,
			},
		],
		docsUrl: `https://markless.dev/errors/${SHARED_COMPUTED_CROSS_MODULE_CODE}`,
	};
}

function isRelativeSpecifier(specifier: string): boolean {
	return specifier.startsWith('./') || specifier.startsWith('../');
}

/** A relative specifier as a path from the project root; anything else unchanged. */
function resolveSpecifier(specifier: string, importerFilename: string): string {
	if (!isRelativeSpecifier(specifier)) return specifier;
	return normalizePathSegments([
		...importerFilename.split('/').slice(0, -1),
		...specifier.split('/'),
	]).join('/');
}

/** The same module the factory's file names, spelled from the copying file. */
function rebaseSpecifier(specifier: string, fromFilename: string, toFilename: string): string {
	if (!isRelativeSpecifier(specifier)) return specifier;
	const target = resolveSpecifier(specifier, fromFilename).split('/');
	const base = normalizePathSegments(toFilename.split('/').slice(0, -1));
	let common = 0;
	while (common < base.length && common < target.length - 1 && base[common] === target[common])
		common += 1;
	const up = base.slice(common).map(() => '..');
	const down = target.slice(common);
	return up.length === 0 ? `./${down.join('/')}` : [...up, ...down].join('/');
}

function normalizePathSegments(segments: ReadonlyArray<string>): ReadonlyArray<string> {
	const parts: string[] = [];
	for (const segment of segments) {
		if (segment === '' || segment === '.') continue;
		if (segment !== '..') {
			parts.push(segment);
			continue;
		}
		if (parts.length > 0 && parts.at(-1) !== '..') parts.pop();
		else parts.push('..');
	}
	return parts;
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
	return freeNamesOfParse(`(${source})`);
}

/** The same, for a carried module-scope statement rather than an expression. */
function freeDeclarationNames(source: string): ReadonlySet<string> {
	return freeNamesOfParse(source);
}

function freeNamesOfParse(source: string): ReadonlySet<string> {
	let ast: AnyNode;
	try {
		ast = parseModule(source, 'generated.ts') as unknown as AnyNode;
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
