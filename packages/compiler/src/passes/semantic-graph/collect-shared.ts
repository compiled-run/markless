import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import type {
	SemanticGraphBinding,
	SemanticSharedDefinition,
	SemanticSharedDependency,
	SemanticSharedReturnProperty,
	SemanticSharedScope,
} from '../../artifacts.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
} from '../../artifact-helpers/graph-paths.ts';
import { invalidSharedScopeDiagnostic, sharedDefinitionCycleDiagnostic } from './diagnostics.ts';
import { getCallName, getFrameworkApiForCall } from './imports.ts';
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
	const callName = getCallName(input.init);
	if (!callName) return;

	const definition = resolveSharedDefinitionCall(callName, input.state);
	if (!definition) return;

	input.state.graph.sharedInstances.push({
		definitionId: definition.id,
		definitionName: definition.name,
		localName: input.localName,
		source: expressionSource(input.init, input.state.source),
		sourceSpan: sourceSpan(input.init, input.state.filename),
	});
}

function resolveSharedDefinitionCall(
	callName: string,
	state: WalkState,
): { readonly id: string; readonly name: string } | undefined {
	const sameModuleDefinition = state.graph.sharedDefinitions.find(
		(shared) => shared.name === callName,
	);
	if (sameModuleDefinition) return sameModuleDefinition;

	const importedDefinition = state.graph.moduleImports.find(
		(moduleImport) =>
			moduleImport.kind === 'named' &&
			moduleImport.localName === callName &&
			moduleImport.importedName &&
			isTsrxModuleImport(moduleImport.source),
	);
	if (!importedDefinition?.importedName) return undefined;

	return {
		id: sharedDefinitionId(importedDefinition.source, importedDefinition.importedName),
		name: importedDefinition.importedName,
	};
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
		state.currentSharedDefinitionId = previousSharedDefinitionId;

		const returnProperties = collectSharedReturnProperties({
			factory: declaration.factory,
			definitionId: definition.id,
			state,
		});
		if (returnProperties.length === 0) continue;

		const index = state.graph.sharedDefinitions.findIndex((item) => item.id === definition.id);
		if (index === -1) continue;

		state.graph.sharedDefinitions[index] = {
			...state.graph.sharedDefinitions[index],
			returnProperties,
		};
	}
}

export function sharedDefinitionId(filename: string, exportedName: string): string {
	return `shared:${filename}#${exportedName}`;
}

function isTsrxModuleImport(source: string): boolean {
	return source.endsWith('.tsrx');
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
			properties.push({
				kind: 'method',
				name,
				source: propertySource,
				sourceSpan: sourceSpan(property, input.state.filename),
			});
			continue;
		}

		const valueSource = expressionSource(value, input.state.source);
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
					valueSpan: value ? sourceSpan(value, state.filename) : sourceSpan(property, state.filename),
				}),
			);
			return undefined;
		}
		if (value.value === 'request' || value.value === 'container' || value.value === 'page') {
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
