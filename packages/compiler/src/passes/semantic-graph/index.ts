import { parseModule } from '@tsrx/core';
import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { sourceSpan } from '../../ast/source.ts';
import type { SemanticGraphArtifact, SemanticGraphInput } from '../../artifacts.ts';
import { applyMarklessAllowDirectives } from '../../diagnostics.ts';
import {
	collectAsyncBoundary,
	collectAsyncBoundaryDiagnostics,
	collectComputedDependencyCycleDiagnostics,
	finalizeComputedDependencies,
	propagateAsyncComputedCapability,
} from './collect-async.ts';
import { collectImports, collectModuleImports, getFrameworkApiForCall } from './imports.ts';
import { collectComponentProps } from './collect-components.ts';
import { getComponentFunction } from '../../ast/tsrx.ts';
import {
	collectConditionalBranchText,
	collectElement,
	collectElementHandleDiagnostics,
	collectTemplateExpression,
} from './collect-elements.ts';
import {
	collectAssignment,
	collectCollectionCall,
	collectDelete,
	collectExpressionReads,
	collectUpdate,
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

export async function buildSemanticGraph(
	input: SemanticGraphInput,
): Promise<SemanticGraphArtifact> {
	const ast = parseModule(input.source, input.filename) as unknown as AnyNode;
	const statements = asNodes(ast.body);
	const graph = createMutableSemanticGraphArtifact(input.filename);
	graph.moduleImports.push(...collectModuleImports(statements));
	const frameworkApiImports = collectImports(statements);
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
		collectComponentProps(componentFunction.node, state);
		walk(componentFunction.node.body as AnyNode, state);
		state.currentComponentName = previousComponentName;
		state.currentComponentId = previousComponentId;
	}

	finalizeComputedDependencies(state);
	propagateAsyncComputedCapability(graph);
	collectComputedDependencyCycleDiagnostics(graph);
	collectElementHandleDiagnostics(graph);
	collectAsyncBoundaryDiagnostics(graph);

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
				withFunctionSite(state, 'computed', () => {
					withCreationSite(state, 'computed', () => walk(body, state));
				});
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
