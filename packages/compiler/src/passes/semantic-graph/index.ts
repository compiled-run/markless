import { parseModule } from '@tsrx/core';
import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import type {
	SemanticGraphArtifact,
	SemanticGraphInput,
	SemanticLocalDeclaration,
} from '../../artifacts.ts';
import { applyMarklessAllowDirectives } from '../../diagnostics.ts';
import {
	collectAsyncBoundary,
	collectAsyncBoundaryDiagnostics,
	collectComputedDependencyCycleDiagnostics,
	finalizeComputedDependencies,
	propagateAsyncComputedCapability,
} from './collect-async.ts';
import {
	collectImports,
	collectModuleImports,
	frameworkApiSources,
	getFrameworkApiForCall,
} from './imports.ts';
import { collectComponentProps } from './collect-components.ts';
import { getComponentFunction, getElementAttributes, unwrapExpressionContainer } from '../../ast/tsrx.ts';
import {
	collectConditionalBranchText,
	collectElement,
	collectElementHandleDiagnostics,
	collectTemplateExpression,
} from './collect-elements.ts';
import {
	collectAssignment,
	collectCollectionCall,
	collectComputedWriteDiagnostics,
	collectDelete,
	collectExpressionReads,
	collectUpdate,
	declaredBindingNamesDeep,
} from './collect-expressions.ts';
import { collectModuleScopeGraphCreation } from './collect-module-scope.ts';
import { submoduleUnsupportedDiagnostic } from './diagnostics.ts';
import {
	collectSharedDefinitionDependencies,
	collectSharedFactoryGraph,
} from './collect-shared.ts';
import { attachKeyedRepeatRowHost, collectKeyedRepeat } from './collect-repeat.ts';
import { collectBranchSite } from './collect-branches.ts';
import { collectModuleGraphInterface, collectVariableDeclaration } from './collect-state.ts';
import { createMutableSemanticGraphArtifact, createWalkState, type WalkState } from './types.ts';
import { collectSemanticMarkup } from './collect-markup.ts';

export async function buildSemanticGraph(
	input: SemanticGraphInput,
): Promise<SemanticGraphArtifact> {
	const ast = parseModule(input.source, input.filename) as unknown as AnyNode;
	const statements = asNodes(ast.body);
	const graph = createMutableSemanticGraphArtifact(input.filename);
	const apiSources = frameworkApiSources(input.additionalFrameworkApiSources);
	graph.moduleImports.push(...collectModuleImports(statements, apiSources));
	const frameworkApiImports = collectImports(statements, apiSources);
	const state = createWalkState({
		filename: input.filename,
		source: input.source,
		graph,
		frameworkApiImports,
		importedModuleInterfaces: input.importedModuleInterfaces,
	});
	state.walk = walk;
	for (const statement of statements) {
		const declaration =
			statement.type === 'ExportNamedDeclaration'
				? ((statement.declaration as AnyNode | undefined) ?? statement)
				: statement;
		if (declaration.type !== 'FunctionDeclaration') continue;
		if (getComponentFunction(statement)) continue;
		const name = getIdentifierName(declaration.id as AnyNode | undefined);
		if (name) state.helperFunctions.set(name, declaration);
	}
	graph.moduleGraphInterface = collectModuleGraphInterface({ statements, state });

	for (const statement of statements) {
		collectModuleScopeGraphCreation(statement, state);
		collectSubmoduleDiagnostics(statement, state);
	}

	collectSharedDefinitionDependencies(statements, state);
	collectSharedFactoryGraph(statements, state, walk);

	for (const statement of statements) {
		const componentFunction = getComponentFunction(statement);
		if (!componentFunction) continue;

		graph.components.push({ name: componentFunction.name });
		const previousComponentName = state.currentComponentName;
		const previousComponentId = state.currentComponentId;
		const componentSpan = sourceSpan(componentFunction.node, input.filename);
		if (!componentSpan) {
			throw new Error(
				`TSRX parser omitted the source span for component "${componentFunction.name}".`,
			);
		}
		state.currentComponentName = componentFunction.name;
		state.currentComponentId = `component:${componentSpan.start}:${componentSpan.end}`;
		prepareComponentLocalBindings(componentFunction.node.body as AnyNode, state);
		collectComponentProps(componentFunction.node, state);
		walk(componentFunction.node.body as AnyNode, state);
		mergeComponentLocalDeclarations(state);
		state.currentComponentName = previousComponentName;
		state.currentComponentId = previousComponentId;
	}

	collectComputedWriteDiagnostics(state);
	finalizeComputedDependencies(state);
	propagateAsyncComputedCapability(graph);
	collectComputedDependencyCycleDiagnostics(graph);
	collectElementHandleDiagnostics(graph);
	collectAsyncBoundaryDiagnostics(graph);
	graph.markup = collectSemanticMarkup({
		ast,
		source: input.source,
		filename: input.filename,
		graph,
		hostIds: state.hostIds,
	});

	return {
		...graph,
		diagnostics: applyMarklessAllowDirectives({
			source: input.source,
			filename: input.filename,
			diagnostics: graph.diagnostics,
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
		}) as SemanticGraphArtifact['diagnostics'],
	};
}

type ComponentLocalBinding = WalkState['componentLocalBindings'] extends Map<
	string,
	infer Binding
>
	? Binding
	: never;

function prepareComponentLocalBindings(body: AnyNode, state: WalkState): void {
	state.componentLocalBindings = new Map();
	state.resolvedComponentLocalBindingsBySpan = new Map();
	const bodySpan = sourceSpan(body, state.filename);
	if (!bodySpan || !state.currentComponentName) return;
	const lexicalScopeId = `scope:${bodySpan.start}:${bodySpan.end}`;
	const bindingsByName = new Map<string, ComponentLocalBinding>();

	for (const statement of asNodes(body.body)) {
		if (statement.type === 'VariableDeclaration') {
			for (const declarator of asNodes(statement.declarations)) {
				const id = declarator.id as AnyNode | undefined;
				const name = getIdentifierName(id);
				const declarationSpan = id ? sourceSpan(id, state.filename) : undefined;
				if (!name || !declarationSpan) continue;
				const initializerNode = declarator.init as AnyNode | undefined;
				const initializer = callbackInitializer(initializerNode, state);
				const declaration: SemanticLocalDeclaration = {
					name,
					scope: 'component',
					componentName: state.currentComponentName,
					bindingId: `binding:${declarationSpan.start}:${declarationSpan.end}`,
					lexicalScopeId,
					declarationKind:
						statement.kind === 'let' || statement.kind === 'var' ? statement.kind : 'const',
					declarationSpan,
					writeCount: initializerNode ? 1 : 0,
					...(initializer ? { initializer } : {}),
				};
				const binding = {
					declaration,
					...(initializer ? { initializerNode } : {}),
				};
				bindingsByName.set(name, binding);
				state.componentLocalBindings.set(declaration.bindingId!, binding);
			}
			continue;
		}

		if (statement.type === 'FunctionDeclaration') {
			const id = statement.id as AnyNode | undefined;
			const name = getIdentifierName(id);
			const declarationSpan = id ? sourceSpan(id, state.filename) : undefined;
			const initializer = callbackInitializer(statement, state);
			if (!name || !declarationSpan || !initializer) continue;
			const declaration: SemanticLocalDeclaration = {
				name,
				scope: 'component',
				componentName: state.currentComponentName,
				bindingId: `binding:${declarationSpan.start}:${declarationSpan.end}`,
				lexicalScopeId,
				declarationKind: 'function',
				declarationSpan,
				writeCount: 1,
				initializer,
			};
			const binding = { declaration, initializerNode: statement };
			bindingsByName.set(name, binding);
			state.componentLocalBindings.set(declaration.bindingId!, binding);
		}
	}

	resolveComponentLocalReferences(body, bindingsByName, state, true, new Set());
}

function callbackInitializer(
	node: AnyNode | undefined,
	state: WalkState,
): SemanticLocalDeclaration['initializer'] | undefined {
	if (
		!node ||
		(node.type !== 'ArrowFunctionExpression' &&
			node.type !== 'FunctionExpression' &&
			node.type !== 'FunctionDeclaration')
	) {
		return undefined;
	}
	const span = sourceSpan(node, state.filename);
	if (!span) return undefined;
	const body = node.body as AnyNode | undefined;
	return {
		kind:
			node.type === 'ArrowFunctionExpression'
				? 'arrow-function'
				: node.type === 'FunctionExpression'
					? 'function-expression'
					: 'function-declaration',
		source: expressionSource(node, state.source),
		sourceSpan: span,
		...(body ? { bodySpan: sourceSpan(body, state.filename) } : {}),
		parameters: asNodes(node.params).map((parameter) =>
			expressionSource(parameter, state.source),
		),
	};
}

function resolveComponentLocalReferences(
	node: AnyNode | undefined,
	bindings: ReadonlyMap<string, ComponentLocalBinding>,
	state: WalkState,
	isRootScope: boolean,
	shadowed: ReadonlySet<string>,
): void {
	if (!node) return;
	if (node.type === 'Element' || node.type === 'JSXElement') {
		for (const attribute of getElementAttributes(node)) {
			resolveComponentLocalReferences(
				unwrapExpressionContainer(attribute.value as AnyNode | undefined),
				bindings,
				state,
				false,
				shadowed,
			);
		}
		for (const child of asNodes(node.children)) {
			resolveComponentLocalReferences(child, bindings, state, false, shadowed);
		}
		return;
	}

	if (node.type === 'Identifier') {
		const name = getIdentifierName(node);
		const binding = name && !shadowed.has(name) ? bindings.get(name) : undefined;
		const bindingId = binding?.declaration.bindingId;
		if (bindingId) {
			state.resolvedComponentLocalBindingIds.set(node, bindingId);
			const span = sourceSpan(node, state.filename);
			if (span) state.resolvedComponentLocalBindingsBySpan.set(`${span.start}:${span.end}`, bindingId);
		}
		return;
	}

	if (node.type === 'AssignmentExpression' || node.type === 'UpdateExpression') {
		const target = (node.type === 'AssignmentExpression' ? node.left : node.argument) as
			| AnyNode
			| undefined;
		incrementComponentLocalWrites(target, bindings, shadowed);
	}

	if (
		node.type === 'ArrowFunctionExpression' ||
		node.type === 'FunctionExpression' ||
		node.type === 'FunctionDeclaration'
	) {
		const functionShadowed = new Set(shadowed);
		for (const parameter of asNodes(node.params)) {
			for (const name of bindingPatternNames(parameter)) functionShadowed.add(name);
		}
		const functionBody = node.body as AnyNode | undefined;
		for (const name of directScopeBindingNames(functionBody)) functionShadowed.add(name);
		for (const child of childNodes(node)) {
			resolveComponentLocalReferences(child, bindings, state, false, functionShadowed);
		}
		return;
	}

	let nestedShadowed = shadowed;
	if (!isRootScope && isLexicalScopeNode(node)) {
		const nextShadowed = new Set(shadowed);
		for (const name of directScopeBindingNames(node)) nextShadowed.add(name);
		nestedShadowed = nextShadowed;
	}
	for (const child of childNodes(node)) {
		resolveComponentLocalReferences(child, bindings, state, false, nestedShadowed);
	}
}

function incrementComponentLocalWrites(
	target: AnyNode | undefined,
	bindings: ReadonlyMap<string, ComponentLocalBinding>,
	shadowed: ReadonlySet<string>,
): void {
	for (const name of bindingPatternNames(target)) {
		if (shadowed.has(name)) continue;
		const binding = bindings.get(name);
		if (!binding) continue;
		const writeCount = (binding.declaration.writeCount ?? 0) + 1;
		Object.assign(binding.declaration, { writeCount });
	}
}

function isLexicalScopeNode(node: AnyNode): boolean {
	return (
		node.type === 'BlockStatement' ||
		node.type === 'JSXCodeBlock' ||
		node.type === 'SwitchStatement' ||
		node.type === 'CatchClause' ||
		node.type === 'ForStatement' ||
		node.type === 'ForInStatement' ||
		node.type === 'ForOfStatement'
	);
}

function directScopeBindingNames(node: AnyNode | undefined): ReadonlyArray<string> {
	if (!node) return [];
	const statements = asNodes(node.body);
	return statements.flatMap((statement) => {
		if (statement.type === 'VariableDeclaration') {
			return asNodes(statement.declarations).flatMap((declaration) =>
				bindingPatternNames(declaration.id as AnyNode | undefined),
			);
		}
		if (statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') {
			return bindingPatternNames(statement.id as AnyNode | undefined);
		}
		return [];
	});
}

function bindingPatternNames(node: AnyNode | undefined): ReadonlyArray<string> {
	if (!node) return [];
	if (node.type === 'Identifier') return getIdentifierName(node) ? [getIdentifierName(node)!] : [];
	if (node.type === 'AssignmentPattern') {
		return bindingPatternNames(node.left as AnyNode | undefined);
	}
	if (node.type === 'RestElement') {
		return bindingPatternNames(node.argument as AnyNode | undefined);
	}
	if (node.type === 'ObjectPattern') {
		return asNodes(node.properties).flatMap((property) =>
			bindingPatternNames(
				(property.type === 'Property' ? property.value : property.argument) as
					| AnyNode
					| undefined,
			),
		);
	}
	if (node.type === 'ArrayPattern') return asNodes(node.elements).flatMap(bindingPatternNames);
	return [];
}

function mergeComponentLocalDeclarations(state: WalkState): void {
	for (const binding of state.componentLocalBindings.values()) {
		const declaration = binding.declaration;
		const existing = state.graph.localDeclarations.find(
			(candidate) =>
				candidate.scope === 'component' &&
				candidate.componentName === declaration.componentName &&
				candidate.name === declaration.name,
		);
		if (existing) Object.assign(existing, declaration);
		else state.graph.localDeclarations.push(declaration);
	}
}

function walk(node: AnyNode | null | undefined, state: WalkState): void {
	if (!node || typeof node !== 'object') return;

	switch (node.type) {
		case 'Element':
		case 'JSXElement':
			collectElement(node, state, walk);
			return;
		case 'TSRXExpression':
		case 'JSXExpressionContainer':
			collectTemplateExpression(node, state);
			break;
		case 'VariableDeclaration':
			collectVariableDeclaration(node, state);
			break;
		case 'IfStatement':
			walk(node.test as AnyNode | undefined, state);
			withCreationSite(state, 'branch', () => {
				walk(node.consequent as AnyNode | undefined, state);
				walk(node.alternate as AnyNode | undefined, state);
			});
			return;
		case 'JSXIfExpression':
			collectBranchSite(node, state);
			walkBranch(node.consequent as AnyNode | undefined, state);
			walkBranch(node.alternate as AnyNode | undefined, state);
			collectConditionalBranchText(node, state);
			return;
		case 'JSXSwitchExpression':
			collectBranchSite(node, state);
			walk(node.discriminant as AnyNode | undefined, state);
			for (const switchCase of asNodes(node.cases)) {
				walk(switchCase.test as AnyNode | undefined, state);
				const caseBranchId = `branch:${state.nextBranchId++}`;
				state.currentBranchScopeIds.push(caseBranchId);
				for (const caseChild of asNodes(switchCase.consequent)) {
					walk(caseChild, state);
				}
				state.currentBranchScopeIds.pop();
			}
			return;
		case 'JSXForExpression':
			const repeatIndex = collectKeyedRepeat(node, state);
			const repeat = repeatIndex === null ? null : state.graph.keyedRepeats[repeatIndex];
			if (repeat) state.currentKeyedRepeatScopeIds.push(repeat.id);
			for (const child of childNodes(node)) {
				walk(child, state);
			}
			if (repeat) state.currentKeyedRepeatScopeIds.pop();
			attachKeyedRepeatRowHost(node, state, repeatIndex);
			return;
		case 'ForStatement':
			withCreationSite(state, 'loop', () => {
				for (const child of childNodes(node)) {
					walk(child, state);
				}
			});
			return;
		case 'ArrowFunctionExpression':
		case 'FunctionExpression':
		case 'FunctionDeclaration':
			withFunctionSite(state, state.currentHostNodeId ? 'handler' : 'helper', () => {
				withCreationSite(state, state.currentHostNodeId ? 'handler' : 'helper', () => {
					for (const child of childNodes(node)) {
						walk(child, state);
					}
				});
			});
			return;
		case 'AssignmentExpression':
			collectAssignment(node, state);
			collectExpressionReads(node, state);
			return;
		case 'UpdateExpression':
			collectUpdate(node, state);
			collectExpressionReads(node.argument as AnyNode | undefined, state);
			return;
		case 'UnaryExpression':
			if (node.operator === 'delete') {
				collectDelete(node, state);
				collectExpressionReads(node, state);
				return;
			}
			break;
		case 'CallExpression':
			collectCollectionCall(node, state);
			if (getFrameworkApiForCall(node, state.frameworkApiImports) === 'computed') {
				const [body, ...rest] = asNodes(node.arguments);
				const previousComputedBodyLocalNames = state.computedBodyLocalNames;
				state.computedBodyLocalNames = declaredBindingNamesDeep(body);
				withFunctionSite(state, 'computed', () => {
					withCreationSite(state, 'computed', () => walk(body, state));
				});
				state.computedBodyLocalNames = previousComputedBodyLocalNames;
				for (const argument of rest) walk(argument, state);
				return;
			}
			break;
		case 'TryStatement':
		case 'JSXTryExpression':
			collectAsyncBoundary(node, state, walk);
			return;
	}

	for (const child of childNodes(node)) {
		walk(child, state);
	}
}

// Fail-loud placeholder for TSRX submodules until the host boundary decision
// in specs/framework/08-deferred-decisions.md is accepted and implemented.
function collectSubmoduleDiagnostics(statement: AnyNode, state: WalkState): void {
	const declaration =
		statement.type === 'ExportNamedDeclaration'
			? ((statement.declaration as AnyNode | undefined) ?? statement)
			: statement;

	if (declaration.type === 'TSModuleDeclaration') {
		const name = getIdentifierName(declaration.id as AnyNode | undefined) ?? 'unknown';
		state.graph.diagnostics.push(
			submoduleUnsupportedDiagnostic('module-block', name, declaration, state.filename),
		);
		return;
	}

	if (statement.type === 'ImportDeclaration') {
		const source = statement.source as AnyNode | undefined;
		if (source?.type === 'Identifier') {
			const name = getIdentifierName(source) ?? 'unknown';
			state.graph.diagnostics.push(
				submoduleUnsupportedDiagnostic(
					'identifier-import',
					name,
					statement,
					state.filename,
				),
			);
		}
	}
}

function walkBranch(node: AnyNode | undefined, state: WalkState): void {
	if (!node) return;
	const branchId = `branch:${state.nextBranchId++}`;
	state.currentBranchScopeIds.push(branchId);
	withCreationSite(state, 'branch', () => walk(node, state));
	state.currentBranchScopeIds.pop();
}

function withCreationSite(
	state: WalkState,
	site: NonNullable<WalkState['currentCreationSite']>,
	run: () => void,
): void {
	const previous = state.currentCreationSite;
	state.currentCreationSite = previous ?? site;
	run();
	state.currentCreationSite = previous;
}

function withFunctionSite(
	state: WalkState,
	site: NonNullable<WalkState['currentFunctionSite']>,
	run: () => void,
): void {
	const previous = state.currentFunctionSite;
	state.currentFunctionSite = site;
	run();
	state.currentFunctionSite = previous;
}
