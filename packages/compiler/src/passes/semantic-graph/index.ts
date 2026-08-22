import { parseModule } from '../../js-ast.ts';
import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import type {
	SemanticGraphArtifact,
	SemanticGraphInput,
	SemanticLocalDeclaration,
} from '../../artifacts.ts';
import { applyMarklessAllowDirectives, type SourceSpan } from '../../diagnostics.ts';
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
import { collectSpreadEventShadowDiagnostics } from './spread-event-guard.ts';
import { spreadHostsField } from './spread-hosts.ts';
import { armMaterialField } from './arm-material.ts';
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
	collectComputedWriteDiagnostics,
	collectDelete,
	collectExpressionReads,
	collectUpdate,
} from './collect-expressions.ts';
import { collectModuleScopeGraphCreation } from './collect-module-scope.ts';
import { submoduleUnsupportedDiagnostic } from './diagnostics.ts';
import {
	collectSharedDefinitionDependencies,
	collectImplicitFamilyScopeDiagnostics,
	collectSharedCallbackBindings,
	collectSharedCallbackInvocations,
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
	collectMemberTagTargets(statements, state);
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
	collectSharedCallbackInvocations(statements, state);

	for (const statement of statements) {
		const componentFunction = getComponentFunction(statement);
		if (!componentFunction) continue;

		const exportName = componentExportName(statement, componentFunction.name);
		graph.components.push({
			name: componentFunction.name,
			...(exportName ? { exportName } : {}),
		});
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
		state.graph.diagnostics.push(
			...collectSpreadEventShadowDiagnostics({
				component: componentFunction.node,
				componentName: componentFunction.name,
				filename: input.filename,
			}),
		);
		walk(componentFunction.node.body as AnyNode, state);
		mergeComponentLocalDeclarations(state);
		state.currentComponentName = previousComponentName;
		state.currentComponentId = previousComponentId;
	}

	collectSharedCallbackBindings(state);
	collectImplicitFamilyScopeDiagnostics(state);
	collectComputedWriteDiagnostics(state);
	finalizeComputedDependencies(state);
	propagateAsyncComputedCapability(graph);
	collectComputedDependencyCycleDiagnostics(graph);
	collectElementHandleDiagnostics(graph, state.pendingElementHandleIdrefs);
	collectAsyncBoundaryDiagnostics(graph);
	graph.markup = collectSemanticMarkup({
		ast,
		source: input.source,
		filename: input.filename,
		graph,
		hostIds: state.hostIds,
	});
	graph.moduleGraphInterface = {
		...graph.moduleGraphInterface,
		render: {
			version: 1,
			components: graph.components.flatMap((component) => {
				const chunks = graph.markup.chunks.filter(
					(chunk) => chunk.componentName === component.name,
				);
				const root = chunks.find((chunk) => chunk.id === `template:${component.name}`);
				if (!root) return [];
				return [
					{
						componentName: component.name,
						...(component.exportName ? { exportName: component.exportName } : {}),
						rootChunkId: root.id,
						childChunks: chunks
							.filter((chunk) => chunk.id !== root.id)
							.map((chunk) => ({
								id: chunk.id,
								kind: chunk.kind,
								slotCount: chunk.slots.length,
							})),
						inputs: graph.componentPropBindings
							.filter((binding) => binding.componentName === component.name)
							.map((binding) => ({
								localName: binding.localName,
								path: binding.propPath,
							})),
						...spreadHostsField(chunks),
						...armMaterialField(graph, component.name, chunks),
					},
				];
			}),
		},
	};

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

function prepareComponentLocalBindings(body: AnyNode, state: WalkState): void {
	state.componentLocalBindings = new Map();
	state.resolvedComponentLocalBindingsBySpan = new Map();
	const bodySpan = sourceSpan(body, state.filename);
	if (!bodySpan || !state.currentComponentName) return;
	const lexicalScopeId = `scope:${bodySpan.start}:${bodySpan.end}`;

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
						statement.kind === 'let' || statement.kind === 'var'
							? statement.kind
							: 'const',
					declarationSpan,
					writeCount: initializerNode ? 1 : 0,
					...(initializer ? { initializer } : {}),
				};
				const binding = {
					declaration,
					...(initializer ? { initializerNode } : {}),
				};
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
			state.componentLocalBindings.set(declaration.bindingId!, binding);
		}
	}

	resolveComponentLocalReferences(state, bodySpan);
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

/**
 * Point every identifier use inside the component body at the component-local
 * declaration it refers to, and count the writes aimed at each declaration.
 *
 * The question is asked of yuku's resolved references rather than of a set of
 * names, because only resolution can tell a use of the component-local from a
 * use of a parameter, a block-scoped declaration, or a nested function's own
 * binding that shadows it. A reference belongs to a component-local exactly
 * when its symbol's first declaration site is the identifier the binding id was
 * minted from, so the two agree by construction rather than by name matching.
 */
function resolveComponentLocalReferences(state: WalkState, bodySpan: SourceSpan): void {
	const semantic = state.semantic();

	for (let referenceId = 0; referenceId < semantic.reference.count; referenceId += 1) {
		const start = semantic.reference.start(referenceId);
		const end = semantic.reference.end(referenceId);
		if (start < bodySpan.start || end > bodySpan.end) continue;
		// A type-position use never reads or writes the value beside it.
		if (semantic.reference.inTypePosition(referenceId)) continue;

		const symbolId = semantic.reference.symbolId(referenceId);
		if (symbolId === null) continue;
		const declaration = semantic.symbol.declNode(symbolId, 0);
		const binding = state.componentLocalBindings.get(
			`binding:${declaration.start}:${declaration.end}`,
		);
		if (!binding) continue;

		state.resolvedComponentLocalBindingsBySpan.set(
			`${start}:${end}`,
			binding.declaration.bindingId!,
		);
		if (semantic.reference.isWrite(referenceId)) {
			Object.assign(binding.declaration, {
				writeCount: (binding.declaration.writeCount ?? 0) + 1,
			});
		}
	}
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

// How the module exports a component, so an importer can match its own local
// name (or a barrel export name) back to the declared component.
function componentExportName(statement: AnyNode, componentName: string): string | null {
	if (statement.type === 'ExportDefaultDeclaration') return 'default';
	return statement.type === 'ExportNamedDeclaration' ? componentName : null;
}

// `const checkbox = { root: CheckboxRoot }` lets <checkbox.root /> collapse to CheckboxRoot.
function collectMemberTagTargets(
	statements: ReadonlyArray<AnyNode>,
	state: WalkState,
): void {
	for (const statement of statements) {
		const declaration =
			statement.type === 'ExportNamedDeclaration'
				? ((statement.declaration as AnyNode | undefined) ?? statement)
				: statement;
		if (declaration.type !== 'VariableDeclaration') continue;

		for (const declarator of asNodes(declaration.declarations)) {
			const objectName = getIdentifierName(declarator.id as AnyNode | undefined);
			const init = declarator.init as AnyNode | undefined;
			if (!objectName || init?.type !== 'ObjectExpression') continue;

			for (const property of asNodes(init.properties)) {
				if (property.type !== 'Property' && property.type !== 'ObjectProperty') continue;
				const key = getIdentifierName(property.key as AnyNode | undefined);
				const target = getIdentifierName(property.value as AnyNode | undefined);
				if (key && target) state.memberTagTargets.set(`${objectName}.${key}`, target);
			}
		}
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
