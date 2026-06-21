import { asNodes, childNodes, walkNode, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import type {
	SemanticGraphAlias,
	SemanticGraphBinding,
	SemanticGraphDependency,
	SemanticStateRead,
} from '../../artifacts.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
	uniqueBy,
} from '../../artifact-helpers/graph-paths.ts';
import { asyncBoundaryRequiredDiagnostic, asyncPostAwaitReadDiagnostic } from './diagnostics.ts';
import type { MutableSemanticGraphArtifact, SemanticGraphWalk, WalkState } from './types.ts';

export function collectAsyncBoundary(
	node: AnyNode,
	state: WalkState,
	walk: SemanticGraphWalk,
): void {
	const boundaryId = `boundary:${state.nextBoundaryId++}`;
	const previousBoundaryId = state.currentAsyncBoundaryId;

	state.graph.asyncBoundaries.push({ id: boundaryId });
	state.currentAsyncBoundaryId = boundaryId;

	for (const child of childNodes(node)) {
		walk(child, state);
	}

	state.currentAsyncBoundaryId = previousBoundaryId;
}

export function propagateAsyncComputedCapability(graph: MutableSemanticGraphArtifact): void {
	const asyncCapableIds = new Set(
		graph.graphBindings
			.filter((binding) => binding.kind === 'computed' && binding.async === true)
			.map((binding) => binding.id),
	);
	let changed = true;

	while (changed) {
		changed = false;

		for (const binding of graph.graphBindings) {
			if (binding.kind !== 'computed' || asyncCapableIds.has(binding.id)) continue;

			const dependsOnAsync = (binding.dependencies ?? []).some((dependency) =>
				asyncCapableIds.has(dependency.graphNodeId),
			);
			if (!dependsOnAsync) continue;

			asyncCapableIds.add(binding.id);
			changed = true;
		}
	}

	graph.graphBindings = graph.graphBindings.map((binding) => {
		if (binding.kind !== 'computed') return binding;

		return {
			...binding,
			asyncCapable: asyncCapableIds.has(binding.id),
		};
	});
}

export function collectAsyncBoundaryDiagnostics(graph: MutableSemanticGraphArtifact): void {
	const bindings = graphBindingMap(graph, null);
	const aliases = semanticAliasMap(graph, null);

	for (const read of graph.templateReads) {
		if (read.asyncBoundaryId) continue;

		const resolved = resolveGraphPath(read.source, bindings, aliases);
		if (!resolved) continue;
		if (resolved.binding.kind !== 'computed' || resolved.binding.asyncCapable !== true)
			continue;

		graph.diagnostics.push(asyncBoundaryRequiredDiagnostic(read, resolved.binding));
	}
}

export function collectGraphDependencies(
	node: AnyNode | undefined,
	state: WalkState,
): ReadonlyArray<SemanticGraphDependency> {
	const dependencies: SemanticGraphDependency[] = [];
	const bindings = graphBindingMap(state.graph, currentGraphScope(state));
	const aliases = semanticAliasMap(state.graph, currentGraphScope(state));

	const visit = (candidate: AnyNode | undefined): void => {
		if (!candidate) return;

		if (
			candidate.type === 'ArrowFunctionExpression' ||
			candidate.type === 'FunctionExpression' ||
			candidate.type === 'FunctionDeclaration'
		) {
			visit(candidate.body as AnyNode | undefined);
			return;
		}

		if (candidate.type === 'CallExpression') {
			const callee = candidate.callee as AnyNode | undefined;
			if (callee?.type === 'MemberExpression') {
				visit(callee.object as AnyNode | undefined);
				for (const argument of asNodes(candidate.arguments)) {
					visit(argument);
				}
				return;
			}
		}

		if (candidate.type === 'MemberExpression') {
			const dependency = graphDependency(candidate, state, bindings, aliases);
			if (dependency) {
				dependencies.push(dependency);
				return;
			}

			if (candidate.computed === true) {
				visit(candidate.property as AnyNode | undefined);
			}
			return;
		}

		if (candidate.type === 'Identifier') {
			const dependency = graphDependency(candidate, state, bindings, aliases);
			if (dependency) dependencies.push(dependency);
			return;
		}

		for (const child of childNodes(candidate)) {
			visit(child);
		}
	};

	visit(node);

	return uniqueBy(
		dependencies,
		(dependency) =>
			`${dependency.graphNodeId}:${dependency.path.join('.')}:${dependency.source}`,
	);
}

export function collectAsyncComputedPostAwaitReads(
	computedName: string,
	body: AnyNode | undefined,
	state: WalkState,
): void {
	const firstAwaitEnd = findFirstAwaitEnd(body);
	if (firstAwaitEnd === null) return;

	for (const read of postAwaitGraphReads(body, firstAwaitEnd, state)) {
		state.graph.diagnostics.push(asyncPostAwaitReadDiagnostic(computedName, read));
	}
}

function graphDependency(
	node: AnyNode,
	state: WalkState,
	bindings: ReadonlyMap<string, SemanticGraphBinding>,
	aliases: ReadonlyMap<string, SemanticGraphAlias>,
): SemanticGraphDependency | null {
	const source = expressionSource(node, state.source);
	const resolved = resolveGraphPath(source, bindings, aliases);
	if (!resolved) return null;

	return {
		source,
		graphNodeId: resolved.binding.id,
		path: resolved.path,
	};
}

function findFirstAwaitEnd(node: AnyNode | undefined): number | null {
	let firstStart: number | null = null;
	let firstEnd: number | null = null;

	walkNode(node, (candidate) => {
		if (candidate.type !== 'AwaitExpression') return;
		if (typeof candidate.start !== 'number' || typeof candidate.end !== 'number') return;
		if (firstStart !== null && candidate.start >= firstStart) return;

		firstStart = candidate.start;
		firstEnd = candidate.end;
	});

	return firstEnd;
}

function postAwaitGraphReads(
	node: AnyNode | undefined,
	firstAwaitEnd: number,
	state: WalkState,
): SemanticStateRead[] {
	const reads: SemanticStateRead[] = [];
	const bindings = graphBindingMap(state.graph, currentGraphScope(state));
	const aliases = semanticAliasMap(state.graph, currentGraphScope(state));

	const visit = (candidate: AnyNode | undefined): void => {
		if (!candidate) return;

		if (candidate.type === 'MemberExpression') {
			const read = postAwaitRead(candidate, firstAwaitEnd, state, bindings, aliases);
			if (read) {
				reads.push(read);
				return;
			}

			if (candidate.computed === true) {
				visit(candidate.property as AnyNode | undefined);
			}
			return;
		}

		if (candidate.type === 'Identifier') {
			const read = postAwaitRead(candidate, firstAwaitEnd, state, bindings, aliases);
			if (read) reads.push(read);
			return;
		}

		for (const child of childNodes(candidate)) {
			visit(child);
		}
	};

	visit(node);

	return uniqueBy(reads, (read) => read.source);
}

function postAwaitRead(
	node: AnyNode,
	firstAwaitEnd: number,
	state: WalkState,
	bindings: ReadonlyMap<string, SemanticGraphBinding>,
	aliases: ReadonlyMap<string, SemanticGraphAlias>,
): SemanticStateRead | null {
	const span = sourceSpan(node, state.filename);
	if (!span || span.start <= firstAwaitEnd) return null;

	const source = expressionSource(node, state.source);
	if (!resolveGraphPath(source, bindings, aliases)) return null;

	return {
		source,
		...(state.currentSharedDefinitionId
			? { sharedDefinitionId: state.currentSharedDefinitionId }
			: {}),
		sourceSpan: span,
	};
}

function currentGraphScope(state: WalkState): string | null {
	return state.currentSharedDefinitionId ?? null;
}
