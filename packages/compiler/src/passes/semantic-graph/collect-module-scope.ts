import { asNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, expressionSourceOrFallback } from '../../ast/source.ts';
import {
	moduleScopeGraphCreationDiagnostic,
	frameworkImportRequiredDiagnostic,
	moduleScopeElementDiagnostic,
} from './diagnostics.ts';
import { evaluateSyncPolicyConstant } from './collect-state.ts';
import { getFrameworkApiForCall, getCallName, isFrameworkApiName } from './imports.ts';
import { collectSharedDefinition } from './collect-shared.ts';
import type { WalkState } from './types.ts';

export function collectModuleScopeGraphCreation(statement: AnyNode, state: WalkState): void {
	const declaration = moduleScopeVariableDeclaration(statement);
	if (!declaration) return;

	for (const declarator of asNodes(declaration.declarations)) {
		const id = declarator.id as AnyNode | undefined;
		const init = declarator.init as AnyNode | undefined;
		const callName = getCallName(init);
		const frameworkApi = getFrameworkApiForCall(init, state.frameworkApiImports);
		const name = getIdentifierName(id);

		if (name) {
			state.graph.localDeclarations.push({
				name,
				scope: 'module',
				aliasOf: moduleAliasTarget(init, state),
			});
		}

		if (declaration.kind === 'const' && name) {
			const constant = evaluateSyncPolicyConstant(init);
			if (constant.ok) {
				state.graph.syncPolicyConstants.push({
					name,
					value: constant.value,
				});
			}
		}

		if (callName && isFrameworkApiName(callName) && !frameworkApi && init) {
			state.graph.diagnostics.push(
				frameworkImportRequiredDiagnostic(callName, init, state.filename),
			);
			continue;
		}

		if (frameworkApi === 'shared' && name && init) {
			collectSharedDefinition({ name, init, state });
			continue;
		}

		if (frameworkApi === 'element') {
			state.graph.diagnostics.push(
				moduleScopeElementDiagnostic(
					moduleScopeDeclarationName(id, state.source),
					init,
					state.filename,
				),
			);
			continue;
		}

		if (frameworkApi !== 'state' && frameworkApi !== 'computed') continue;

		state.graph.diagnostics.push(
			moduleScopeGraphCreationDiagnostic(
				moduleScopeDeclarationName(id, state.source),
				frameworkApi,
				init,
				state.filename,
			),
		);
	}
}

function moduleScopeVariableDeclaration(statement: AnyNode): AnyNode | null {
	if (statement.type === 'VariableDeclaration') return statement;

	if (statement.type === 'ExportNamedDeclaration') {
		const declaration = statement.declaration as AnyNode | undefined;
		return declaration?.type === 'VariableDeclaration' ? declaration : null;
	}

	return null;
}

function moduleScopeDeclarationName(node: AnyNode | undefined, source: string): string {
	return getIdentifierName(node) ?? expressionSourceOrFallback(node, source, 'graph binding');
}

function moduleAliasTarget(init: AnyNode | undefined, state: WalkState): string | undefined {
	if (!init) return undefined;
	const source = expressionSource(init, state.source);
	const declaration = state.graph.localDeclarations.find(
		(candidate) => candidate.scope === 'module' && candidate.name === source,
	);
	return declaration?.aliasOf ?? declaration?.name;
}
