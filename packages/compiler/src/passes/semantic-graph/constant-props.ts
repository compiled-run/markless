import { getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { resolvedSymbolAt } from './collect-expressions.ts';
import { moduleConstantInitializer } from './collect-state.ts';
import {
	evaluateConstantExpression,
	namesMutatedInModule,
	type ConstantValue,
} from './constant-values.ts';
import { ownedModuleAst } from './shared-ast.ts';
import type { WalkState } from './types.ts';

const NOT_CONSTANT: ConstantValue = { ok: false };

export type ConstantPropValue = {
	readonly value: ConstantValue;
	readonly importedConstants: ReadonlyArray<{
		readonly source: string;
		readonly exportName: string;
	}>;
};

/**
 * The build-time value of a component prop written as module constant data -
 * `node={TREE[0]}`, `items={LINKS}` - read from this file's own `const`
 * declarations and from the imported constants the bundler supplied. An import
 * whose value was not supplied is named in `importedConstants`.
 */
export function constantPropValue(expression: AnyNode, state: WalkState): ConstantPropValue {
	const importedConstants: Array<{ readonly source: string; readonly exportName: string }> = [];
	const resolveName = (identifier: AnyNode, visiting: ReadonlySet<string>): ConstantValue => {
		const name = getIdentifierName(identifier);
		if (!name || typeof identifier.start !== 'number' || visiting.has(name))
			return NOT_CONSTANT;
		const semantic = state.semantic();
		const symbolId = resolvedSymbolAt(semantic, identifier.start);
		if (symbolId === null) return NOT_CONSTANT;
		if (semantic.scope.kind(semantic.symbol.scopeId(symbolId)) !== 'module')
			return NOT_CONSTANT;

		const moduleImport = state.graph.moduleImports.find(
			(candidate) => candidate.localName === name && candidate.typeOnly !== true,
		);
		if (moduleImport) {
			if (moduleImport.kind === 'namespace') return NOT_CONSTANT;
			const exportName = moduleImport.importedName ?? 'default';
			const constants = state.importedModuleConstants[moduleImport.source];
			if (constants && Object.hasOwn(constants, exportName)) {
				return { ok: true, value: constants[exportName] };
			}
			if (!constants) importedConstants.push({ source: moduleImport.source, exportName });
			return NOT_CONSTANT;
		}

		if (mutatedModuleNames(state).has(name)) return NOT_CONSTANT;
		const initializer = moduleConstantInitializer(name, symbolId, state);
		if (!initializer) return NOT_CONSTANT;
		const nextVisiting = new Set(visiting).add(name);
		return evaluateConstantExpression(initializer, (next) => resolveName(next, nextVisiting));
	};
	const value = evaluateConstantExpression(expression, (identifier) =>
		resolveName(identifier, new Set()),
	);
	return { value, importedConstants: value.ok ? [] : importedConstants };
}

const mutatedNamesByState = new WeakMap<WalkState, ReadonlySet<string>>();

function mutatedModuleNames(state: WalkState): ReadonlySet<string> {
	let names = mutatedNamesByState.get(state);
	if (!names) {
		names = namesMutatedInModule(ownedModuleAst(state, state.source, state.filename));
		mutatedNamesByState.set(state, names);
	}
	return names;
}
