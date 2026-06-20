import { parseModule } from '@tsrx/core';
import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import type { SemanticGraphArtifact, SemanticGraphInput } from '../../artifacts.ts';
import {
	collectAsyncBoundary,
	collectAsyncBoundaryDiagnostics,
	propagateAsyncComputedCapability,
} from './collect-async.ts';
import { collectImports, collectModuleImports } from './imports.ts';
import { getComponent, collectComponentProps } from './collect-components.ts';
import {
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
import {
	collectSharedDefinitionDependencies,
	collectSharedFactoryGraph,
} from './collect-shared.ts';
import { attachKeyedRepeatRowHost, collectKeyedRepeat } from './collect-repeat.ts';
import { collectVariableDeclaration } from './collect-state.ts';
import { createMutableSemanticGraphArtifact, createWalkState, type WalkState } from './types.ts';

export async function buildSemanticGraph(
	input: SemanticGraphInput,
): Promise<SemanticGraphArtifact> {
	const ast = parseModule(input.source, input.filename) as AnyNode;
	const statements = asNodes(ast.body);
	const graph = createMutableSemanticGraphArtifact(input.filename);
	graph.moduleImports.push(...collectModuleImports(statements));
	const frameworkApiImports = collectImports(statements);
	const state = createWalkState({
		filename: input.filename,
		source: input.source,
		graph,
		frameworkApiImports,
	});

	for (const statement of statements) {
		collectModuleScopeGraphCreation(statement, state);
	}

	collectSharedDefinitionDependencies(statements, state);
	collectSharedFactoryGraph(statements, state, walk);

	for (const statement of statements) {
		const component = getComponent(statement);
		const name = getIdentifierName(component?.id);

		if (!component || !name) continue;

		graph.components.push({ name });
		collectComponentProps(component, state);
		walk(component.body as AnyNode, state);
	}

	propagateAsyncComputedCapability(graph);
	collectElementHandleDiagnostics(graph);
	collectAsyncBoundaryDiagnostics(graph);

	return graph;
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
		case 'JSXForExpression':
			const repeatIndex = collectKeyedRepeat(node, state);
			for (const child of childNodes(node)) {
				walk(child, state);
			}
			attachKeyedRepeatRowHost(node, state, repeatIndex);
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
