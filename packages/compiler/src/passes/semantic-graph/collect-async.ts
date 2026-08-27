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
import { resolveSharedInstanceGraphPath } from './collect-shared.ts';
import {
	readRegion,
	resolvedSymbolAt,
	rootBindsInsideRegion,
	rootIdentifierOffset,
	type ReadRegion,
} from './collect-expressions.ts';
import {
	asyncBoundaryRequiredDiagnostic,
	asyncPostAwaitReadDiagnostic,
	computedDependencyGraphCycleDiagnostic,
} from './diagnostics.ts';
import type { MutableSemanticGraphArtifact, SemanticGraphWalk, WalkState } from './types.ts';

export function collectAsyncBoundary(
	node: AnyNode,
	state: WalkState,
	walk: SemanticGraphWalk,
): void {
	if (node.type !== 'JSXTryExpression') {
		for (const child of childNodes(node)) {
			walk(child, state);
		}
		return;
	}

	const boundaryId = `boundary:${state.nextBoundaryId++}`;
	const previousBoundaryId = state.currentAsyncBoundaryId;
	const previousArm = state.currentAsyncBoundaryArm;
	// Arm index inside this boundary: 0 = @try, 1 = @pending, 2 = @catch.
	const armByNode = new Map<unknown, number>([
		[node.block, 0],
		[node.pending, 1],
		[node.handler, 2],
	]);

	state.graph.asyncBoundaries.push({
		id: boundaryId,
		anchorOrder: state.nextAnchorOrder++,
		...(previousBoundaryId ? { parentBoundaryId: previousBoundaryId } : {}),
	});
	state.currentAsyncBoundaryId = boundaryId;

	for (const child of asNodes([node.block, node.handler, node.pending])) {
		state.currentAsyncBoundaryArm = armByNode.get(child) ?? previousArm;
		walk(child, state);
	}

	state.currentAsyncBoundaryId = previousBoundaryId;
	state.currentAsyncBoundaryArm = previousArm;
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

export function finalizeComputedDependencies(state: WalkState): void {
	for (const pending of state.pendingComputedDependencies) {
		const owner = pendingDeriveOwner(pending, state);
		const previousSharedDefinitionId = state.currentSharedDefinitionId;
		state.currentSharedDefinitionId = pending.sharedDefinitionId;
		const declaringComponentName = owner?.componentName;
		const directBindingNames = new Set(
			graphBindingMap(state.graph, currentGraphScope(state), declaringComponentName).keys(),
		);
		const finalizedDependencies = collectGraphDependencies(
			pending.body,
			state,
			declaringComponentName,
		).filter((dependency) => directBindingNames.has(dependency.source.split('.')[0] ?? ''));
		state.currentSharedDefinitionId = previousSharedDefinitionId;
		state.graph.graphBindings = state.graph.graphBindings.map((binding) => {
			if (binding.id !== pending.graphNodeId) return binding;
			if (owner && binding !== owner) return binding;
			const dependencies = uniqueBy(
				[...(binding.dependencies ?? []), ...finalizedDependencies],
				(dependency) =>
					`${dependency.graphNodeId}:${dependency.path.join('.')}:${dependency.source}`,
			);
			return { ...binding, dependencies };
		});
	}
}

/**
 * The binding a pending derive was declared as. Sibling components declaring the
 * same local name mint the same graph node id, so the id alone names more than
 * one binding; the derive body sits lexically inside exactly one component, and
 * `componentId` carries that component's span.
 */
function pendingDeriveOwner(
	pending: { readonly graphNodeId: string; readonly body: AnyNode | undefined },
	state: WalkState,
): SemanticGraphBinding | undefined {
	const candidates = state.graph.graphBindings.filter(
		(binding) => binding.id === pending.graphNodeId,
	);
	if (candidates.length <= 1) return candidates[0];

	const span = pending.body ? sourceSpan(pending.body, state.filename) : null;
	if (!span) return undefined;

	const declaring = candidates.filter((binding) =>
		componentSpanContains(binding.componentId, span.start, span.end),
	);
	return declaring.length === 1 ? declaring[0] : undefined;
}

function componentSpanContains(
	componentId: string | undefined,
	start: number,
	end: number,
): boolean {
	if (!componentId) return false;
	const [, rawStart, rawEnd] = componentId.split(':');
	const componentStart = Number(rawStart);
	const componentEnd = Number(rawEnd);
	if (!Number.isFinite(componentStart) || !Number.isFinite(componentEnd)) return false;

	return start >= componentStart && end <= componentEnd;
}

export function collectComputedDependencyCycleDiagnostics(
	graph: MutableSemanticGraphArtifact,
): void {
	const computedById = new Map(
		graph.graphBindings
			.filter((binding) => binding.kind === 'computed')
			.map((binding) => [binding.id, binding]),
	);
	const visited = new Set<string>();
	const active = new Map<string, number>();
	const stack: SemanticGraphBinding[] = [];
	const reported = new Set<string>();

	const visit = (binding: SemanticGraphBinding): void => {
		if (visited.has(binding.id)) return;
		const activeIndex = active.get(binding.id);
		if (activeIndex !== undefined) {
			const cycleBindings = [...stack.slice(activeIndex), binding];
			const names = cycleBindings.map((candidate) => candidate.name);
			const key = canonicalCycleKey(names);
			if (reported.has(key)) return;
			reported.add(key);
			graph.diagnostics.push(computedDependencyGraphCycleDiagnostic({ cycle: names }));
			return;
		}

		active.set(binding.id, stack.length);
		stack.push(binding);
		for (const dependency of binding.dependencies ?? []) {
			const target = computedById.get(dependency.graphNodeId);
			if (target) visit(target);
		}
		stack.pop();
		active.delete(binding.id);
		visited.add(binding.id);
	};

	for (const binding of computedById.values()) visit(binding);
}

function canonicalCycleKey(cycle: ReadonlyArray<string>): string {
	const members = cycle.slice(0, -1);
	if (members.length === 0) return cycle.join('->');
	return members
		.map((_, index) => [...members.slice(index), ...members.slice(0, index)].join('->'))
		.sort()[0];
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
	componentName?: string | undefined,
): ReadonlyArray<SemanticGraphDependency> {
	const dependencies: SemanticGraphDependency[] = [];
	const bindings = graphBindingMap(state.graph, currentGraphScope(state), componentName);
	const aliases = semanticAliasMap(state.graph, currentGraphScope(state), componentName);
	const bodyRegion = readRegion(node);

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

		if (candidate.type === 'Property') {
			if (candidate.computed === true) visit(candidate.key as AnyNode | undefined);
			visit(candidate.value as AnyNode | undefined);
			return;
		}

		if (candidate.type === 'MemberExpression') {
			const dependency = graphDependency(candidate, state, bindings, aliases, bodyRegion);
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
			const dependency = graphDependency(candidate, state, bindings, aliases, bodyRegion);
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
	bodyRegion: ReadRegion | null,
): SemanticGraphDependency | null {
	if (!namesGraphBinding(node, state, bodyRegion)) return null;

	const source = expressionSource(node, state.source);
	// Own scope first: a factory local and the instance local naming it routinely collide.
	const resolved =
		resolveGraphPath(source, bindings, aliases) ??
		resolveSharedInstanceGraphPath(source, state.graph, state.currentComponentName);
	if (!resolved) return null;

	return {
		source,
		graphNodeId: resolved.binding.id,
		path: resolved.path,
	};
}

/**
 * Whether the leftmost identifier of a candidate dependency really names a
 * graph binding, rather than something else the derive body spells the same
 * way. The question is asked of yuku's resolved references, because a name is
 * not an identity: the `total` in `const total = rate * 3` is a declaration and
 * refers to nothing, and the `total` that follows it refers to that local, not
 * to the derive named `total`. Matching by name records the derive as its own
 * dependency and the graph then reports a legal derive as a cycle on itself.
 */
function namesGraphBinding(
	node: AnyNode,
	state: WalkState,
	bodyRegion: ReadRegion | null,
): boolean {
	const offset = rootIdentifierOffset(node, state.source);
	if (offset === null) return false;

	// A declaration site has no reference row at all, so it reads nothing.
	if (resolvedSymbolAt(state.semantic(), offset) === null) return false;

	// A binding the derive body declares itself - a `const`, a callback
	// parameter - shadows any graph binding of the same name.
	return !rootBindsInsideRegion(node, state, bodyRegion);
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
	const bodyRegion = readRegion(node);

	const visit = (candidate: AnyNode | undefined): void => {
		if (!candidate) return;

		if (candidate.type === 'MemberExpression') {
			const read = postAwaitRead(candidate, firstAwaitEnd, state, bindings, aliases, bodyRegion);
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
			const read = postAwaitRead(candidate, firstAwaitEnd, state, bindings, aliases, bodyRegion);
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
	bodyRegion: ReadRegion | null,
): SemanticStateRead | null {
	const span = sourceSpan(node, state.filename);
	if (!span || span.start <= firstAwaitEnd) return null;

	// A binding the derive body declares itself is a local value, not graph
	// state, even when an identically named alias exists elsewhere in the
	// module. Snapshotting into such a local before the first await is the
	// prescribed fix for this diagnostic; the graph read that fed it is checked
	// on its own.
	if (rootBindsInsideRegion(node, state, bodyRegion)) return null;

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
