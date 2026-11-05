import { getIdentifierName, walkNode, type AnyNode } from '../../ast/nodes.ts';
import type { SemanticGraphDependency } from '../../artifacts.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
} from '../../artifact-helpers/graph-paths.ts';
import { collectGraphDependencies } from './collect-async.ts';
import { resolvedSymbolAt } from './collect-expressions.ts';
import { findSharedInstance, resolveSharedInstanceGraphPath } from './collect-shared.ts';
import { rowValueLocalUnfollowedDiagnostic } from './diagnostics.ts';
import { ownedModuleAst } from './shared-ast.ts';
import type { WalkState } from './types.ts';

type Region = { readonly start: number; readonly end: number };

/**
 * Records, for each component-body local a @for row value names, the graph reads
 * behind it: its definition's reads plus those of every local that definition
 * names, so a helper, a helper chain or a factory's closure wakes the row.
 */
export function collectRowLocalReads(expression: AnyNode, state: WalkState): void {
	const componentName = state.currentComponentName;
	if (state.currentKeyedRepeatScopeIds.length === 0 || !componentName) return;
	if (state.currentSharedDefinitionId) return;
	const entries = (state.graph.rowLocalReads ??= []);
	for (const { name, symbolId } of bodyLocalsNamed(expression, state)) {
		if (entries.some((entry) => entry.componentName === componentName && entry.name === name))
			continue;
		const reads: SemanticGraphDependency[] = [];
		const unfollowed = followLocal(symbolId, state, new Set([symbolId]), reads);
		entries.push({
			componentName,
			name,
			reads: unique(reads),
			...(unfollowed ? { unfollowed: true as const } : {}),
		});
		if (unfollowed)
			state.graph.diagnostics.push(
				rowValueLocalUnfollowedDiagnostic({
					localName: unfollowed,
					expression,
					source: state.source,
					filename: state.filename,
				}),
			);
	}
}

// The name of the first local in the chain with no definition to read, or null when every one was followed.
function followLocal(
	symbolId: number,
	state: WalkState,
	seen: Set<number>,
	reads: SemanticGraphDependency[],
): string | null {
	const semantic = state.semantic();
	const binding = semantic.bindings[symbolId]!;
	const value =
		binding.declarations.length === 1
			? definitionOf(binding.declarations[0]!.start, state)
			: null;
	if (!value) return binding.name;
	const componentName = state.currentComponentName ?? undefined;
	// A definition outside every row sees no row's names: a row item spelled like a state must not hide it.
	const active = state.currentKeyedRepeatScopeIds;
	if (!insideRowBody(value, state)) state.currentKeyedRepeatScopeIds = [];
	try {
		reads.push(...collectGraphDependencies(value, state, componentName));
		walkNode(value, (node) => {
			for (const fallback of parameterDefaults(node))
				reads.push(...collectGraphDependencies(fallback, state, componentName));
		});
	} finally {
		state.currentKeyedRepeatScopeIds = active;
	}
	for (const local of bodyLocalsNamed(value, state)) {
		if (seen.has(local.symbolId)) continue;
		seen.add(local.symbolId);
		const unfollowed = followLocal(local.symbolId, state, seen, reads);
		if (unfollowed) return unfollowed;
	}
	return null;
}

// Identifiers in `node` that resolve to a local of an enclosing function, not a graph binding, a row binding or a module value.
function bodyLocalsNamed(
	node: AnyNode,
	state: WalkState,
): ReadonlyArray<{ readonly name: string; readonly symbolId: number }> {
	if (typeof node.start !== 'number' || typeof node.end !== 'number') return [];
	const region: Region = { start: node.start, end: node.end };
	const semantic = state.semantic();
	const found: Array<{ readonly name: string; readonly symbolId: number }> = [];
	walkNode(node, (candidate) => {
		if (candidate.type !== 'Identifier' || typeof candidate.start !== 'number') return;
		const name = getIdentifierName(candidate);
		const symbolId = name ? resolvedSymbolAt(semantic, candidate.start) : null;
		if (!name || symbolId === null || found.some((local) => local.symbolId === symbolId))
			return;
		const scope = semantic.scopes[semantic.bindings[symbolId]!.scope.id]!;
		if (scope.kind === 'module') return;
		if (scope.node.start >= region.start && scope.node.end <= region.end) return;
		if (readsGraph(name, state)) return;
		const declarations = semantic.bindings[symbolId]!.declarations;
		if (
			declarations.length === 1 &&
			definitionOf(declarations[0]!.start, state) === ROW_BINDING
		)
			return;
		found.push({ name, symbolId });
	});
	return found;
}

function readsGraph(name: string, state: WalkState): boolean {
	const componentName = state.currentComponentName ?? undefined;
	return Boolean(
		resolveGraphPath(
			name,
			graphBindingMap(state.graph, null, componentName),
			semanticAliasMap(state.graph, null, componentName),
		) ??
		resolveSharedInstanceGraphPath(name, state.graph, componentName) ??
		findSharedInstance(name, state.graph, componentName),
	);
}

const rowBodiesByState = new WeakMap<WalkState, ReadonlyArray<Region>>();

function insideRowBody(node: AnyNode, state: WalkState): boolean {
	let bodies = rowBodiesByState.get(state);
	if (!bodies) {
		const spans: Region[] = [];
		walkNode(ownedModuleAst(state, state.source, state.filename), (candidate) => {
			const body = candidate.type === 'JSXForExpression' ? (candidate.body as AnyNode | undefined) : null;
			if (typeof body?.start === 'number' && typeof body.end === 'number')
				spans.push({ start: body.start, end: body.end });
		});
		rowBodiesByState.set(state, spans);
		bodies = spans;
	}
	const start = node.start;
	return typeof start === 'number' && bodies.some((body) => start >= body.start && start < body.end);
}

const definitionsByState = new WeakMap<WalkState, ReadonlyMap<number, AnyNode>>();
const ROW_BINDING: AnyNode = { type: 'RowBinding' };

// What a declaration binds its names to: a declarator's initializer, a function declaration itself, or a @for header's row binding.
function definitionOf(declarationStart: number, state: WalkState): AnyNode | null {
	let definitions = definitionsByState.get(state);
	if (!definitions) {
		const map = new Map<number, AnyNode>();
		walkNode(ownedModuleAst(state, state.source, state.filename), (candidate) => {
			if (candidate.type === 'JSXForExpression')
				for (const header of [candidate.left, candidate.index] as Array<
					AnyNode | undefined
				>)
					for (const start of patternStarts(header)) map.set(start, ROW_BINDING);
			if (candidate.type === 'FunctionDeclaration') {
				const id = candidate.id as AnyNode | undefined;
				if (typeof id?.start === 'number') map.set(id.start, candidate);
			}
			if (candidate.type !== 'VariableDeclarator' || !candidate.init) return;
			for (const start of patternStarts(candidate.id as AnyNode | undefined))
				map.set(start, candidate.init as AnyNode);
		});
		definitionsByState.set(state, map);
		definitions = map;
	}
	return definitions.get(declarationStart) ?? null;
}

// A parameter's default value runs with the call, so its reads are the helper's too.
function parameterDefaults(value: AnyNode): ReadonlyArray<AnyNode> {
	if (
		value.type !== 'ArrowFunctionExpression' &&
		value.type !== 'FunctionExpression' &&
		value.type !== 'FunctionDeclaration'
	)
		return [];
	const defaults: AnyNode[] = [];
	const visit = (pattern: AnyNode | null | undefined): void => {
		if (!pattern) return;
		if (pattern.type === 'AssignmentPattern') {
			defaults.push(pattern.right as AnyNode);
			visit(pattern.left as AnyNode);
		} else if (pattern.type === 'ObjectPattern')
			for (const property of (pattern.properties as AnyNode[] | undefined) ?? [])
				visit((property.type === 'RestElement' ? property.argument : property.value) as AnyNode);
		else if (pattern.type === 'ArrayPattern')
			for (const element of (pattern.elements as Array<AnyNode | null> | undefined) ?? [])
				visit(element);
		else if (pattern.type === 'RestElement') visit(pattern.argument as AnyNode);
	};
	for (const parameter of (value.params as AnyNode[] | undefined) ?? []) visit(parameter);
	return defaults;
}

// Where each name a declaration or binding pattern declares starts.
function patternStarts(node: AnyNode | undefined): ReadonlyArray<number> {
	if (!node) return [];
	switch (node.type) {
		case 'Identifier':
			return typeof node.start === 'number' ? [node.start] : [];
		case 'VariableDeclaration':
			return ((node.declarations as AnyNode[] | undefined) ?? []).flatMap((declarator) =>
				patternStarts(declarator.id as AnyNode | undefined),
			);
		case 'ObjectPattern':
			return ((node.properties as AnyNode[] | undefined) ?? []).flatMap((property) =>
				patternStarts(
					(property.type === 'RestElement' ? property.argument : property.value) as
						| AnyNode
						| undefined,
				),
			);
		case 'ArrayPattern':
			return ((node.elements as Array<AnyNode | null> | undefined) ?? []).flatMap((element) =>
				patternStarts(element ?? undefined),
			);
		case 'RestElement':
			return patternStarts(node.argument as AnyNode | undefined);
		case 'AssignmentPattern':
			return patternStarts(node.left as AnyNode | undefined);
		default:
			return [];
	}
}

function unique(
	dependencies: ReadonlyArray<SemanticGraphDependency>,
): ReadonlyArray<SemanticGraphDependency> {
	const seen = new Set<string>();
	return dependencies.filter((dependency) => {
		const key = `${dependency.graphNodeId}:${JSON.stringify(dependency.path)}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
