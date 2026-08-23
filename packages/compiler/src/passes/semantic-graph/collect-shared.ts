import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import type {
	ModuleGraphInterfaceArtifact,
	ModuleGraphInterfaceSharedDefinition,
	SemanticGraphBinding,
	SemanticGraphDiagnostic,
	SemanticModuleImport,
	SemanticSharedDefinition,
	SemanticSharedDependency,
	SemanticSharedInstance,
	SemanticSharedReturnProperty,
	SemanticSharedScope,
} from '../../artifacts.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
	splitStaticGraphPath,
	type ResolvedGraphPath,
} from '../../artifact-helpers/graph-paths.ts';
import {
	callbackSlotSourceDiagnostic,
	implicitFamilyScopeDiagnostic,
	invalidSharedScopeDiagnostic,
	sharedDefinitionCycleDiagnostic,
	unboundCallbackSlotDiagnostic,
} from './diagnostics.ts';
import { collectComputedBinding } from './collect-state.ts';
import { collectExpressionReads } from './collect-expressions.ts';
import { getCallName, getFrameworkApiForCall, isFrameworkApiName } from './imports.ts';
import type { SemanticGraphWalk, WalkState } from './types.ts';

export function collectSharedDefinition(input: {
	readonly name: string;
	readonly init: AnyNode;
	readonly state: WalkState;
}): void {
	const args = asNodes(input.init.arguments);
	const factory = args[0];
	const scope = sharedScopeFromOptions(args[1], input.state);
	const definition: SemanticSharedDefinition = {
		id: sharedDefinitionId(input.state.filename, input.name),
		name: input.name,
		exportedName: input.name,
		...(scope ? { scope } : {}),
		factorySource: factory ? expressionSource(factory, input.state.source) : '',
		sourceSpan: sourceSpan(input.init, input.state.filename),
	};

	input.state.graph.sharedDefinitions.push(definition);
}

export function collectSharedInstance(input: {
	readonly localName: string;
	readonly init: AnyNode;
	readonly state: WalkState;
}): void {
	const resolved = resolveSharedCall(input.init, input.state);
	const target = resolved?.definition ?? unlinkedImportedSharedTarget(input.init, input.state);
	if (!target) {
		reportUnresolvedSharedCall(input.init, input.state);
		return;
	}

	if (resolved?.published) adoptSharedDefinition(resolved.published, input.state);

	input.state.graph.sharedInstances.push({
		definitionId: target.id,
		definitionName: target.name,
		localName: input.localName,
		...(input.state.currentComponentName
			? { componentName: input.state.currentComponentName }
			: {}),
		source: expressionSource(input.init, input.state.source),
		sourceSpan: sourceSpan(input.init, input.state.filename),
	});
}

/**
 * What a call spelled `family()`, `fam.state()` or `ui.checkbox.state()` names.
 * Reading is separate from adopting on purpose: the helper-return collector asks
 * the same question one step earlier, to stop claiming a `.tsrx` import that is
 * really a shared definition, and it must not write anything into the graph.
 */
export type ResolvedSharedCall = {
	readonly definition: SemanticSharedDefinition;
	/** Absent for a definition this module declares itself. */
	readonly published?: ModuleGraphInterfaceSharedDefinition;
};

export function resolveSharedCall(init: AnyNode, state: WalkState): ResolvedSharedCall | null {
	const path = staticCalleePath(init);
	if (!path) return null;

	const [rootName, ...memberPath] = path;
	if (!rootName) return null;

	if (memberPath.length === 0) {
		const sameModuleDefinition = state.graph.sharedDefinitions.find(
			(shared) => shared.name === rootName,
		);
		if (sameModuleDefinition) return { definition: sameModuleDefinition };
	}

	const moduleImport = state.graph.moduleImports.find((item) => item.localName === rootName);
	if (!moduleImport) return null;

	const published = resolvePublishedSharedDefinition({
		moduleInterface: interfaceForSource(moduleImport.source, state),
		exportPath: importExportPath(moduleImport, memberPath),
		state,
		seen: new Set(),
	});
	return published ? { definition: published.definition, published } : null;
}

/**
 * The pre-interface reading of `import { session } from './session.tsrx'`: a
 * name imported from a `.tsrx` and called is that module's shared definition,
 * identified by the specifier because nothing here knows the module's own
 * filename. It stands only while no interface for that module is linked; once
 * one is, `resolveSharedCall` answers first with the definition's real identity.
 */
function unlinkedImportedSharedTarget(
	init: AnyNode,
	state: WalkState,
): { readonly id: string; readonly name: string } | null {
	const callName = getCallName(init);
	if (!callName) return null;

	const moduleImport = state.graph.moduleImports.find(
		(item) =>
			item.kind === 'named' &&
			item.localName === callName &&
			item.importedName !== undefined &&
			item.source.endsWith('.tsrx'),
	);
	if (!moduleImport?.importedName) return null;

	return {
		id: sharedDefinitionId(moduleImport.source, moduleImport.importedName),
		name: moduleImport.importedName,
	};
}

/**
 * The export path a call walks from the module it imports: a namespace import
 * spends no segment reaching the surface, a default import spends `default`, and
 * a named import spends the name it imported. Mirrors how an imported component
 * tag walks a barrel, because it is the same barrel.
 */
function importExportPath(
	moduleImport: SemanticModuleImport,
	memberPath: ReadonlyArray<string>,
): ReadonlyArray<string> {
	return [
		...(moduleImport.kind === 'namespace'
			? []
			: moduleImport.kind === 'default'
				? ['default']
				: [moduleImport.importedName ?? moduleImport.localName]),
		...memberPath,
	];
}

/**
 * Follows an export path to the module that declares the definition. One segment
 * is either the definition the module publishes, or a re-export to follow:
 * `export { famState as state } from './fam.tsrx'` renames it, and
 * `export * as fam from './fam/index.ts'` spends the segment on the namespace.
 */
function resolvePublishedSharedDefinition(input: {
	readonly moduleInterface: ModuleGraphInterfaceArtifact | undefined;
	readonly exportPath: ReadonlyArray<string>;
	readonly state: WalkState;
	readonly seen: ReadonlySet<string>;
}): ModuleGraphInterfaceSharedDefinition | null {
	const { moduleInterface, exportPath } = input;
	const [segment, ...rest] = exportPath;
	if (!moduleInterface || !segment) return null;
	if (input.seen.has(moduleInterface.filename)) return null;

	if (rest.length === 0) {
		const published = moduleInterface.sharedDefinitions?.find(
			(candidate) => candidate.exportName === segment,
		);
		if (published) return published;
	}

	for (const reexport of moduleInterface.reexports ?? []) {
		if (reexport.exportName !== segment) continue;
		// `export * as ns from` binds a namespace, so the segment is spent on the
		// namespace and the rest of the path walks inside it; a named re-export
		// renames one export, so the whole path continues under the new name.
		const nextPath =
			reexport.importedName === '*' ? rest : rest.length === 0 ? [reexport.importedName] : null;
		if (!nextPath) continue;

		const resolved = resolvePublishedSharedDefinition({
			moduleInterface: interfaceForSource(reexport.source, input.state),
			exportPath: nextPath,
			state: input.state,
			seen: new Set([...input.seen, moduleInterface.filename]),
		});
		if (resolved) return resolved;
	}

	return null;
}

/**
 * The interface a specifier names. The exact key is the specifier the importing
 * module wrote; a specifier written inside a barrel is relative to that barrel,
 * and the linker keys the same interface under the path it rebased for this
 * module, so a module file that exactly one supplied interface names is the
 * second reading. Two candidates is an ambiguity nobody may guess through.
 */
function interfaceForSource(
	source: string,
	state: WalkState,
): ModuleGraphInterfaceArtifact | undefined {
	const exact = state.importedModuleInterfaces[source];
	if (exact) return exact;

	const tail = source.replace(/^(?:\.\.?\/)+/, '');
	const candidates = Object.values(state.importedModuleInterfaces).filter(
		(candidate) => candidate.filename === tail || candidate.filename.endsWith(`/${tail}`),
	);
	return candidates.length === 1 ? candidates[0] : undefined;
}

// The definition and its factory nodes become this module's own, so every
// consumer of the graph — instance qualification, returned-property lowering,
// seeding — reads a cross-module call exactly the way it reads a same-module one.
function adoptSharedDefinition(
	published: ModuleGraphInterfaceSharedDefinition,
	state: WalkState,
): void {
	if (!state.graph.sharedDefinitions.some((item) => item.id === published.definition.id)) {
		state.graph.sharedDefinitions.push(published.definition);
	}
	for (const binding of published.graphBindings) {
		if (state.graph.graphBindings.some((item) => item.id === binding.id)) continue;
		state.graph.graphBindings.push(binding);
	}
}

/**
 * Fail closed on a call that means to reach a shared definition and reaches
 * none. Two readings say it means to: the member is spelled with a framework API
 * name, which is the ratified `family.state()` surface, or the module it walks
 * publishes shared definitions and this is not one of them. Both are read only
 * off a zero-argument call, because a shared definition is called with none.
 */
function reportUnresolvedSharedCall(init: AnyNode, state: WalkState): void {
	if (!state.currentComponentName) return;
	if (asNodes(init.arguments).length > 0) return;

	const path = staticCalleePath(init);
	const memberName = path?.[path.length - 1];
	if (!path || !memberName || path.length < 2) return;

	const moduleImport = state.graph.moduleImports.find((item) => item.localName === path[0]);
	if (!moduleImport) return;

	const moduleInterface = interfaceForSource(moduleImport.source, state);
	const publishedNames = reachableSharedExportPaths({
		moduleInterface,
		state,
		prefix: [],
		seen: new Set(),
	});
	if (!isFrameworkApiName(memberName) && publishedNames.length === 0) return;
	// The module answered with this name under another kind, so the call is that
	// export being used, not a shared definition that failed to resolve.
	if (
		moduleInterface?.exports.some((candidate) => candidate.exportName === memberName) ||
		moduleInterface?.render.components.some((candidate) => candidate.exportName === memberName)
	) {
		return;
	}

	state.graph.diagnostics.push(
		unresolvedSharedCallDiagnostic({
			callSource: expressionSource(init, state.source),
			importSource: moduleImport.source,
			publishedNames,
			known: moduleInterface !== undefined,
			span: sourceSpan(init, state.filename),
		}),
	);
}

/**
 * Every shared definition a module hands out, spelled the way a caller of that
 * module writes it (`state`, `checkbox.state`). Read only to say what a refused
 * call could have named instead, so it walks the same re-export chain the
 * resolver walks.
 */
function reachableSharedExportPaths(input: {
	readonly moduleInterface: ModuleGraphInterfaceArtifact | undefined;
	readonly state: WalkState;
	readonly prefix: ReadonlyArray<string>;
	readonly seen: ReadonlySet<string>;
}): ReadonlyArray<string> {
	const { moduleInterface } = input;
	if (!moduleInterface || input.seen.has(moduleInterface.filename)) return [];

	const seen = new Set([...input.seen, moduleInterface.filename]);
	const own = (moduleInterface.sharedDefinitions ?? []).map((published) =>
		[...input.prefix, published.exportName].join('.'),
	);

	return [
		...own,
		...(moduleInterface.reexports ?? []).flatMap((reexport) => {
			const target = interfaceForSource(reexport.source, input.state);
			if (reexport.importedName === '*') {
				return reachableSharedExportPaths({
					moduleInterface: target,
					state: input.state,
					prefix: [...input.prefix, reexport.exportName],
					seen,
				});
			}
			// A named re-export renames one export, so it contributes that one name
			// under this module's spelling of it.
			return (target?.sharedDefinitions ?? []).some(
				(published) => published.exportName === reexport.importedName,
			)
				? [[...input.prefix, reexport.exportName].join('.')]
				: [];
		}),
	];
}

function unresolvedSharedCallDiagnostic(input: {
	readonly callSource: string;
	readonly importSource: string;
	readonly publishedNames: ReadonlyArray<string>;
	readonly known: boolean;
	readonly span?: ReturnType<typeof sourceSpan>;
}): SemanticGraphDiagnostic {
	const resolves = !input.known
		? `This build has no compiled interface for ${JSON.stringify(input.importSource)}, so nothing behind it resolves.`
		: input.publishedNames.length > 0
			? `${JSON.stringify(input.importSource)} publishes these shared definitions: ${input.publishedNames
					.map((name) => `\`${name}\``)
					.join(', ')}.`
			: `${JSON.stringify(input.importSource)} publishes no shared() definitions.`;

	return {
		code: 'MARKLESS_SHARED_CALL_UNRESOLVED',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'Shared definition call does not resolve',
		message: `\`${input.callSource}\` reaches no shared() definition. ${resolves}`,
		why: 'A call the compiler cannot resolve to a shared() definition creates no graph instance, so every read of it would render a dead value and every write would go nowhere — silently, at runtime.',
		primarySpan: input.span,
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [
			{
				message:
					"Export the definition from the module this call names, and compile that module in this build. Before: `export const famState = shared(() => ..., { scope: 'widget' })` in `fam.tsrx` with nothing re-exporting it; after: `export { famState as state } from './fam.tsrx';` in the family index, so `fam.state()` names it.",
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_SHARED_CALL_UNRESOLVED',
	};
}

/**
 * `family` and `fam.state` and `ui.checkbox.state` as segment lists; a computed
 * or otherwise dynamic callee is not a path and answers with nothing.
 */
function staticCalleePath(node: AnyNode | undefined | null): ReadonlyArray<string> | null {
	if (node?.type !== 'CallExpression') return null;

	const segments: string[] = [];
	let current = node.callee as AnyNode | undefined;
	while (current?.type === 'MemberExpression') {
		if (current.computed === true) return null;
		const property = getIdentifierName(current.property as AnyNode | undefined);
		if (!property) return null;
		segments.unshift(property);
		current = current.object as AnyNode | undefined;
	}

	const rootName = getIdentifierName(current);
	if (!rootName) return null;

	return [rootName, ...segments];
}

/**
 * The shared definitions this module hands to modules that import it. Published
 * from the finished graph, because a definition's returned properties and the
 * factory nodes they name only exist once the factory graph has been collected.
 */
export function moduleInterfaceSharedDefinitions(input: {
	readonly statements: ReadonlyArray<AnyNode>;
	readonly filename: string;
	readonly sharedDefinitions: ReadonlyArray<SemanticSharedDefinition>;
	readonly graphBindings: ReadonlyArray<SemanticGraphBinding>;
}): ReadonlyArray<ModuleGraphInterfaceSharedDefinition> {
	const exportNames = exportedLocalNames(input.statements);

	return input.sharedDefinitions.flatMap((definition) => {
		// A definition this module adopted from an import is that module's to
		// publish; republishing it here would give one definition two owners.
		if (definition.id !== sharedDefinitionId(input.filename, definition.exportedName)) return [];

		return (exportNames.get(definition.name) ?? []).map((exportName) => ({
			exportName,
			definition,
			graphBindings: input.graphBindings.filter(
				(binding) => binding.sharedDefinitionId === definition.id,
			),
		}));
	});
}

// `export const pnl = ...` and `export { pnl as state }` — the names this
// module's own bindings answer to from outside.
function exportedLocalNames(
	statements: ReadonlyArray<AnyNode>,
): ReadonlyMap<string, ReadonlyArray<string>> {
	const names = new Map<string, string[]>();
	const add = (localName: string, exportName: string): void => {
		names.set(localName, [...(names.get(localName) ?? []), exportName]);
	};

	for (const statement of statements) {
		if (statement.type !== 'ExportNamedDeclaration') continue;

		const declaration = statement.declaration as AnyNode | undefined;
		if (declaration?.type === 'VariableDeclaration') {
			for (const declarator of asNodes(declaration.declarations)) {
				const localName = getIdentifierName(declarator.id as AnyNode | undefined);
				if (localName) add(localName, localName);
			}
			continue;
		}

		// A specifier with a source re-exports another module's binding, which is
		// that module's definition to publish, not this one's.
		if (statement.source) continue;
		for (const specifier of asNodes(statement.specifiers)) {
			const localName = getIdentifierName(specifier.local as AnyNode | undefined);
			const exportName = getIdentifierName(specifier.exported as AnyNode | undefined);
			if (localName && exportName) add(localName, exportName);
		}
	}

	return names;
}

export function collectSharedDefinitionDependencies(
	statements: ReadonlyArray<AnyNode>,
	state: WalkState,
): void {
	const definitions = new Map(
		state.graph.sharedDefinitions.map((definition) => [definition.name, definition]),
	);
	if (definitions.size === 0) return;

	for (const declaration of sharedDefinitionDeclarations(statements, state)) {
		const definition = definitions.get(declaration.name);
		if (!definition) continue;

		const dependencies = collectFactoryDependencies({
			factory: declaration.factory,
			definitions,
			state,
		});
		if (dependencies.length === 0) continue;

		const index = state.graph.sharedDefinitions.findIndex(
			(item) => item.name === definition.name,
		);
		if (index === -1) continue;

		state.graph.sharedDefinitions[index] = {
			...definition,
			dependencies,
		};
	}

	reportSharedDefinitionCycles(state.graph.sharedDefinitions, state);
}

export function collectSharedFactoryGraph(
	statements: ReadonlyArray<AnyNode>,
	state: WalkState,
	walk: SemanticGraphWalk,
): void {
	const definitions = new Map(
		state.graph.sharedDefinitions.map((definition) => [definition.name, definition]),
	);
	if (definitions.size === 0) return;

	for (const declaration of sharedDefinitionDeclarations(statements, state)) {
		const definition = definitions.get(declaration.name);
		const body = declaration.factory?.body as AnyNode | undefined;
		if (!definition || !body) continue;

		const previousSharedDefinitionId = state.currentSharedDefinitionId;
		state.currentSharedDefinitionId = definition.id;
		walk(body, state);
		// An inline `computed()` in the returned literal declares a factory-scoped
		// node, so the definition stays current through return collection too.
		const returnProperties = collectSharedReturnProperties({
			factory: declaration.factory,
			definitionId: definition.id,
			state,
		});
		state.currentSharedDefinitionId = previousSharedDefinitionId;
		if (returnProperties.length === 0) continue;

		const index = state.graph.sharedDefinitions.findIndex((item) => item.id === definition.id);
		if (index === -1) continue;

		state.graph.sharedDefinitions[index] = {
			...state.graph.sharedDefinitions[index],
			returnProperties,
		};
	}
}

/**
 * The graph node a callback slot occupies on its definition, spelled the way
 * `graphBindingId` spells every other node of a shared factory
 * (`<definitionId>/<kind>:<name>`). Its value is the page-space id of the symbol
 * the widget root's own prop answers with, written by the root's seed.
 */
export function sharedCallbackSlotGraphNodeId(definitionId: string, slotName: string): string {
	return `${definitionId}/slot:${slotName}`;
}

export function sharedCallbackSlotNames(
	definition: SemanticSharedDefinition,
): ReadonlyArray<string> {
	return (definition.returnProperties ?? []).flatMap((property) =>
		property.kind === 'callback-slot' ? [property.name] : [],
	);
}

/**
 * The call sites a widget part routes to its consumer: `checkbox.onChange?.(next)`
 * inside a factory method. A method is inlined into every handler that calls it,
 * so the callee text collected here is the text that handler's symbol still
 * spells when capture analysis binds the slot.
 */
export function collectSharedCallbackInvocations(
	statements: ReadonlyArray<AnyNode>,
	state: WalkState,
): void {
	for (const declaration of sharedDefinitionDeclarations(statements, state)) {
		const definition = state.graph.sharedDefinitions.find(
			(item) => item.name === declaration.name,
		);
		const body = declaration.factory?.body as AnyNode | undefined;
		if (!definition || !body) continue;

		const slotNames = new Set(sharedCallbackSlotNames(definition));
		if (slotNames.size === 0) continue;

		const seen = new Set<string>();
		walkSubtree(body, (node) => {
			if (node.type !== 'CallExpression') return;

			const callee = node.callee as AnyNode | undefined;
			if (callee?.type !== 'MemberExpression' || callee.computed === true) return;

			const slotName = getIdentifierName(callee.property as AnyNode | undefined);
			if (!slotName || !slotNames.has(slotName)) return;

			const calleeSource = expressionSource(callee, state.source);
			if (seen.has(calleeSource)) return;

			seen.add(calleeSource);
			state.graph.sharedCallbackInvocations.push({
				definitionId: definition.id,
				slotName,
				calleeSource,
				sourceSpan: sourceSpan(node, state.filename),
			});
		});
	}
}

/**
 * The compile-time routing fact `checkbox.onChange = onChange` states: this
 * component's own callback prop fills that slot. It emits no runtime seed —
 * the slot is not a graph node, so there is nothing to seed.
 */
export function collectSharedCallbackBindings(state: WalkState): void {
	const definitionsById = new Map(
		state.graph.sharedDefinitions.map((definition) => [definition.id, definition]),
	);

	for (const write of state.graph.stateWrites) {
		if (write.writeScope !== 'component' || !write.componentName) continue;

		const [localName, slotName, ...rest] = splitStaticGraphPath(write.target);
		if (!localName || !slotName || rest.length > 0) continue;

		const resolved = findSharedInstance(localName, state.graph);
		if (!resolved) continue;

		const definition = definitionsById.get(resolved.definition.id);
		if (!definition || !sharedCallbackSlotNames(definition).includes(slotName)) continue;

		const valueSource = write.valueSource ?? '';
		const propBinding = state.graph.componentPropBindings.find(
			(binding) =>
				binding.componentName === write.componentName &&
				binding.localName === valueSource &&
				binding.propPath.length === 1,
		);
		if (!propBinding?.propPath[0]) {
			state.graph.diagnostics.push(
				callbackSlotSourceDiagnostic({
					slotName,
					componentName: write.componentName,
					definitionName: definition.name,
					valueSource,
					span: write.targetSpan,
				}),
			);
			continue;
		}

		state.graph.sharedCallbackBindings.push({
			definitionId: definition.id,
			slotName,
			componentName: write.componentName,
			propName: propBinding.propPath[0],
			...(write.targetSpan ? { sourceSpan: write.targetSpan } : {}),
		});
	}

	for (const invocation of state.graph.sharedCallbackInvocations) {
		const bound = state.graph.sharedCallbackBindings.some(
			(binding) =>
				binding.definitionId === invocation.definitionId &&
				binding.slotName === invocation.slotName,
		);
		const definition = definitionsById.get(invocation.definitionId);
		if (bound || !definition) continue;

		state.graph.diagnostics.push(
			unboundCallbackSlotDiagnostic({
				slotName: invocation.slotName,
				definitionName: definition.name,
				span: invocation.sourceSpan,
			}),
		);
	}
}

// B6: a definition this module declares AND several of this module's components
// resolve is a family shape. Only an omitted scope warns; either explicit
// spelling is a decision, and an imported definition is another module's call.
export function collectImplicitFamilyScopeDiagnostics(state: WalkState): void {
	for (const definition of state.graph.sharedDefinitions) {
		if (definition.scope !== undefined) continue;
		if (definition.id !== sharedDefinitionId(state.filename, definition.exportedName)) continue;

		const componentNames = [
			...new Set(
				state.graph.sharedInstances.flatMap((instance) =>
					instance.definitionId === definition.id && instance.componentName
						? [instance.componentName]
						: [],
				),
			),
		];
		if (componentNames.length < 2) continue;

		state.graph.diagnostics.push(
			implicitFamilyScopeDiagnostic({
				definitionName: definition.name,
				componentNames,
				span: definition.sourceSpan,
			}),
		);
	}
}

export function sharedDefinitionId(filename: string, exportedName: string): string {
	return `shared:${filename}#${exportedName}`;
}

// What the semantic graph knows about `const s = session()`: the local name, the
// definition it came from, and the graph nodes the factory declared. Every
// consumer that turns `s.status` into a graph node id reads it through here.
export type SharedInstanceGraph = {
	readonly graphBindings: ReadonlyArray<SemanticGraphBinding>;
	readonly sharedDefinitions: ReadonlyArray<SemanticSharedDefinition>;
	readonly sharedInstances: ReadonlyArray<SemanticSharedInstance>;
};

export function findSharedInstance(
	localName: string,
	graph: Pick<SharedInstanceGraph, 'sharedDefinitions' | 'sharedInstances'>,
): { readonly instance: SemanticSharedInstance; readonly definition: SemanticSharedDefinition } | null {
	const instance = findLast(graph.sharedInstances, (item) => item.localName === localName);
	if (!instance) return null;

	const definition = graph.sharedDefinitions.find((item) => item.id === instance.definitionId);
	return definition ? { instance, definition } : null;
}

// `s.status` and `s.status.deep` resolve through the definition's returned
// property to the factory's own graph node; a method property resolves to
// nothing here because a call is not a value path.
export function resolveSharedInstanceGraphPath(
	source: string,
	graph: SharedInstanceGraph,
): ResolvedGraphPath | null {
	const segments = splitStaticGraphPath(source);
	if (segments.length < 2) return null;

	const [localName, propertyName, ...propertyPath] = segments;
	if (!localName || !propertyName) return null;

	const resolved = findSharedInstance(localName, graph);
	if (!resolved) return null;

	const property = findLast(
		resolved.definition.returnProperties ?? [],
		(item) => item.name === propertyName,
	);
	if (property?.kind !== 'graph') return null;

	const binding = graph.graphBindings.find((item) => item.id === property.graphNodeId);
	if (!binding) return null;

	return { binding, path: [...property.path, ...propertyPath] };
}

// `s.disabled = props.disabled ?? false` in a component body: a plain assignment
// into the component's shared instance. It is not a runtime write — the shared
// graph does not exist yet — but the per-instance initial value for that node.
export function componentSharedSeedWrite(
	write: {
		readonly target: string;
		readonly writeScope?: string;
		readonly operation: string;
		readonly assignmentOperator?: string;
		readonly componentName?: string;
		readonly valueSource?: string;
	},
	graph: SharedInstanceGraph,
): { readonly resolved: ResolvedGraphPath; readonly componentName: string } | null {
	if (write.writeScope !== 'component') return null;
	if (write.operation !== 'assign' || write.assignmentOperator !== undefined) return null;
	if (!write.componentName || write.valueSource === undefined) return null;

	const resolved = resolveSharedInstanceGraphPath(write.target, graph);
	if (!resolved || resolved.binding.sharedDefinitionId === undefined) return null;

	return { resolved, componentName: write.componentName };
}

export function findLast<T>(
	values: ReadonlyArray<T>,
	predicate: (value: T) => boolean,
): T | undefined {
	for (let index = values.length - 1; index >= 0; index--) {
		const value = values[index];
		if (value !== undefined && predicate(value)) return value;
	}

	return undefined;
}

function collectFactoryDependencies(input: {
	readonly factory: AnyNode | undefined;
	readonly definitions: ReadonlyMap<string, SemanticSharedDefinition>;
	readonly state: WalkState;
}): SemanticSharedDependency[] {
	const dependencies: SemanticSharedDependency[] = [];
	const seen = new Set<string>();
	const root = input.factory?.body as AnyNode | undefined;
	if (!root) return [];

	walkFactoryBody(root, (node) => {
		if (node.type !== 'CallExpression') return;

		const callName = getCallName(node);
		if (!callName) return;

		const definition = input.definitions.get(callName);
		if (!definition || seen.has(definition.id)) return;

		seen.add(definition.id);
		dependencies.push({
			definitionId: definition.id,
			definitionName: definition.name,
			source: expressionSource(node, input.state.source),
			sourceSpan: sourceSpan(node, input.state.filename),
		});
	});

	return dependencies;
}

function collectSharedReturnProperties(input: {
	readonly factory: AnyNode | undefined;
	readonly definitionId: string;
	readonly state: WalkState;
}): SemanticSharedReturnProperty[] {
	const returns = sharedReturnExpressions(input.factory);
	if (returns.length === 0) return [];

	const properties: SemanticSharedReturnProperty[] = [];
	for (const returned of returns) {
		if (returned.type !== 'ObjectExpression') continue;

		properties.push(
			...collectReturnedObjectProperties({
				node: returned,
				definitionId: input.definitionId,
				state: input.state,
			}),
		);
	}

	return properties;
}

function sharedReturnExpressions(factory: AnyNode | undefined): AnyNode[] {
	const body = factory?.body as AnyNode | undefined;
	if (!body) return [];
	if (body.type === 'ObjectExpression') return [body];

	const returns: AnyNode[] = [];
	walkFactoryBody(body, (node) => {
		if (node.type !== 'ReturnStatement') return;

		const argument = node.argument as AnyNode | undefined;
		if (argument) returns.push(argument);
	});

	return returns;
}

function collectReturnedObjectProperties(input: {
	readonly node: AnyNode;
	readonly definitionId: string;
	readonly state: WalkState;
}): SemanticSharedReturnProperty[] {
	const properties: SemanticSharedReturnProperty[] = [];
	const bindings = graphBindingMap(input.state.graph, input.definitionId);
	const aliases = semanticAliasMap(input.state.graph, input.definitionId);

	for (const property of asNodes(input.node.properties)) {
		if (property.type === 'SpreadElement') {
			properties.push(
				...spreadReturnProperties({
					node: property,
					bindings,
					aliases,
					state: input.state,
				}),
			);
			continue;
		}

		if (property.type !== 'Property') continue;

		const name = objectPropertyKey(property.key as AnyNode | undefined);
		if (!name) continue;

		const value = property.value as AnyNode | undefined;
		if (!value) continue;

		const propertySource = expressionSource(property, input.state.source);

		if (property.method === true || isFunctionValue(value)) {
			// A method is inlined into every handler that calls it, so every read
			// in its body must resolve to a graph node. The generic walk only
			// records reads at assignment sites, which leaves a method local
			// (`const next = s.checked !== true`) closing over the factory local.
			collectExpressionReads(value.body as AnyNode | undefined, input.state);
			properties.push({
				kind: 'method',
				name,
				source: propertySource,
				sourceSpan: sourceSpan(property, input.state.filename),
			});
			continue;
		}

		if (isCallbackSlotDeclaration(value)) {
			properties.push({
				kind: 'callback-slot',
				name,
				source: propertySource,
				sourceSpan: sourceSpan(property, input.state.filename),
			});
			continue;
		}

		const valueSource = expressionSource(value, input.state.source);

		// `isChecked: computed(() => ...)` names its node by the property key, the
		// same node the named-const form declares.
		if (getFrameworkApiForCall(value, input.state.frameworkApiImports) === 'computed') {
			const binding = collectComputedBinding({
				name,
				init: value,
				declarationKind: 'const',
				state: input.state,
			});
			if (binding) {
				properties.push({
					kind: 'graph',
					name,
					source: valueSource,
					graphNodeId: binding.id,
					path: [],
					sourceSpan: sourceSpan(value, input.state.filename),
				});
			}
			continue;
		}

		const resolved = resolveGraphPath(valueSource, bindings, aliases);
		if (!resolved) continue;

		properties.push({
			kind: 'graph',
			name,
			source: valueSource,
			graphNodeId: resolved.binding.id,
			path: resolved.path,
			sourceSpan: sourceSpan(value, input.state.filename),
		});
	}

	return properties;
}

function spreadReturnProperties(input: {
	readonly node: AnyNode;
	readonly bindings: ReadonlyMap<string, SemanticGraphBinding>;
	readonly aliases: ReturnType<typeof semanticAliasMap>;
	readonly state: WalkState;
}): SemanticSharedReturnProperty[] {
	const argument = input.node.argument as AnyNode | undefined;
	const source = argument ? expressionSource(argument, input.state.source) : '';
	const resolved = resolveGraphPath(source, input.bindings, input.aliases);
	if (!resolved) return [];

	const keys = graphObjectReturnKeys(resolved.binding);
	if (keys.length === 0) return [];

	return keys.map((name) => ({
		kind: 'graph',
		name,
		source: expressionSource(input.node, input.state.source),
		graphNodeId: resolved.binding.id,
		path: [...resolved.path, name],
		sourceSpan: sourceSpan(input.node, input.state.filename),
	}));
}

function graphObjectReturnKeys(binding: SemanticGraphBinding): string[] {
	if (binding.valueKind !== 'object') return [];
	if (!isPlainRecord(binding.initialValue)) return [];

	return Object.keys(binding.initialValue);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	if (typeof value !== 'object' || value === null) return false;
	return !Array.isArray(value);
}

function objectPropertyKey(node: AnyNode | undefined): string | null {
	if (!node) return null;
	if (typeof node.name === 'string') return node.name;
	if (typeof node.value === 'string' || typeof node.value === 'number') return String(node.value);
	return null;
}

function isFunctionValue(node: AnyNode | undefined): boolean {
	if (!node) return false;
	return node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression';
}

// `undefined as ((next: boolean) => void) | undefined` — the declaration form
// for a callback slot: a placeholder value with a function-bearing type.
function isCallbackSlotDeclaration(value: AnyNode): boolean {
	if (value.type !== 'TSAsExpression') return false;
	if (getIdentifierName(value.expression as AnyNode | undefined) !== 'undefined') return false;

	return containsFunctionType(value.typeAnnotation as AnyNode | undefined);
}

function containsFunctionType(node: AnyNode | undefined): boolean {
	if (!node || typeof node !== 'object') return false;
	if (node.type === 'TSFunctionType') return true;

	return childNodes(node).some((child) => containsFunctionType(child));
}

// The factory-body twin of `walkFactoryBody` that keeps descending into nested
// functions, because a slot invocation lives inside a returned method.
function walkSubtree(node: AnyNode | undefined, visit: (node: AnyNode) => void): void {
	if (!node || typeof node !== 'object') return;

	visit(node);
	for (const child of childNodes(node)) walkSubtree(child, visit);
}

function walkFactoryBody(node: AnyNode | undefined, visit: (node: AnyNode) => void): void {
	if (!node || typeof node !== 'object') return;

	visit(node);
	if (isNestedFunction(node)) return;

	for (const child of childNodes(node)) {
		walkFactoryBody(child, visit);
	}
}

function isNestedFunction(node: AnyNode): boolean {
	return (
		node.type === 'ArrowFunctionExpression' ||
		node.type === 'FunctionExpression' ||
		node.type === 'FunctionDeclaration'
	);
}

function sharedDefinitionDeclarations(
	statements: ReadonlyArray<AnyNode>,
	state: WalkState,
): Array<{
	readonly name: string;
	readonly factory?: AnyNode;
}> {
	const declarations: Array<{ name: string; factory?: AnyNode }> = [];

	for (const statement of statements) {
		const declaration = moduleScopeVariableDeclaration(statement);
		if (!declaration) continue;

		for (const declarator of asNodes(declaration.declarations)) {
			const id = declarator.id as AnyNode | undefined;
			const init = declarator.init as AnyNode | undefined;
			const name = getIdentifierName(id);
			if (!name || !init) continue;
			if (getFrameworkApiForCall(init, state.frameworkApiImports) !== 'shared') continue;

			const args = asNodes(init.arguments);
			declarations.push({
				name,
				factory: args[0],
			});
		}
	}

	return declarations;
}

function moduleScopeVariableDeclaration(statement: AnyNode): AnyNode | null {
	if (statement.type === 'VariableDeclaration') return statement;

	if (statement.type === 'ExportNamedDeclaration') {
		const declaration = statement.declaration as AnyNode | undefined;
		return declaration?.type === 'VariableDeclaration' ? declaration : null;
	}

	return null;
}

function reportSharedDefinitionCycles(
	definitions: ReadonlyArray<SemanticSharedDefinition>,
	state: WalkState,
): void {
	const definitionsByName = new Map(
		definitions.map((definition) => [definition.name, definition]),
	);
	const reported = new Set<string>();

	for (const definition of definitions) {
		visitSharedDefinitionCycle(definition, {
			definitionsByName,
			reported,
			stack: [],
			state,
		});
	}
}

function visitSharedDefinitionCycle(
	definition: SemanticSharedDefinition,
	context: {
		readonly definitionsByName: ReadonlyMap<string, SemanticSharedDefinition>;
		readonly reported: Set<string>;
		readonly stack: ReadonlyArray<SemanticSharedDefinition>;
		readonly state: WalkState;
	},
): void {
	const existingIndex = context.stack.findIndex((item) => item.name === definition.name);
	if (existingIndex >= 0) {
		const cycleDefinitions = [...context.stack.slice(existingIndex), definition];
		const cycleNames = cycleDefinitions.map((item) => item.name);
		const cycleKey = canonicalCycleKey(cycleNames);
		if (context.reported.has(cycleKey)) return;

		context.reported.add(cycleKey);
		const closingDependency = cycleClosingDependency(cycleDefinitions);
		if (!closingDependency) return;

		context.state.graph.diagnostics.push(
			sharedDefinitionCycleDiagnostic({
				cycle: cycleNames,
				closingDependency,
			}),
		);
		return;
	}

	const nextStack = [...context.stack, definition];
	for (const dependency of definition.dependencies ?? []) {
		const nextDefinition = context.definitionsByName.get(dependency.definitionName);
		if (!nextDefinition) continue;

		visitSharedDefinitionCycle(nextDefinition, {
			...context,
			stack: nextStack,
		});
	}
}

function cycleClosingDependency(
	cycleDefinitions: ReadonlyArray<SemanticSharedDefinition>,
): SemanticSharedDependency | undefined {
	if (cycleDefinitions.length < 2) return undefined;

	const lastDefinition = cycleDefinitions[cycleDefinitions.length - 2];
	const closingDefinition = cycleDefinitions[cycleDefinitions.length - 1];

	return lastDefinition?.dependencies?.find(
		(dependency) => dependency.definitionName === closingDefinition?.name,
	);
}

function canonicalCycleKey(cycleNames: ReadonlyArray<string>): string {
	const uniqueCycle = cycleNames.slice(0, -1);
	if (uniqueCycle.length === 0) return cycleNames.join('->');

	const rotations = uniqueCycle.map((_, index) => [
		...uniqueCycle.slice(index),
		...uniqueCycle.slice(0, index),
	]);
	const canonical = rotations
		.map((rotation) => rotation.join('->'))
		.sort((left, right) => left.localeCompare(right))[0];

	return canonical ?? cycleNames.join('->');
}

function sharedScopeFromOptions(
	node: AnyNode | undefined,
	state: WalkState,
): SemanticSharedScope | undefined {
	if (node?.type !== 'ObjectExpression') return undefined;

	for (const property of asNodes(node.properties)) {
		if (property.type !== 'Property') continue;

		const key = getIdentifierName(property.key as AnyNode | undefined);
		if (key !== 'scope') continue;

		const value = property.value as AnyNode | undefined;
		if (value?.type !== 'Literal') {
			state.graph.diagnostics.push(
				invalidSharedScopeDiagnostic({
					valueSource: value ? expressionSource(value, state.source) : undefined,
					valueSpan: value
						? sourceSpan(value, state.filename)
						: sourceSpan(property, state.filename),
				}),
			);
			return undefined;
		}
		if (
			value.value === 'request' ||
			value.value === 'container' ||
			value.value === 'page' ||
			value.value === 'widget'
		) {
			return value.value;
		}
		state.graph.diagnostics.push(
			invalidSharedScopeDiagnostic({
				valueSource: expressionSource(value, state.source),
				valueSpan: sourceSpan(value, state.filename),
			}),
		);
	}

	return undefined;
}
