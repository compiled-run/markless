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
import { repeatRowBindsName } from './collect-repeat.ts';
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
	asyncPostAwaitDependentReadDiagnostic,
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
export function pendingDeriveOwner(
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

			visit(candidate.object as AnyNode | undefined);
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
	const firstAwait = findFirstAwait(body);
	if (firstAwait === null) return;

	// A static-path read is already a dependency, so it is in the key and the runner binds it before run().
	for (const read of postAwaitGraphReads(body, firstAwait, state)) {
		if (read.awaitedSegment)
			state.graph.diagnostics.push(
				asyncPostAwaitDependentReadDiagnostic(computedName, read.read, read.awaitedSegment),
			);
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
	const root = /^[A-Za-z_$][\w$]*/.exec(source)?.[0];
	if (root && repeatRowBindsName(root, state)) return null;
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

type AwaitSpan = { readonly start: number; readonly end: number };

function findFirstAwait(node: AnyNode | undefined): AwaitSpan | null {
	let first: AwaitSpan | null = null;

	walkNode(node, (candidate) => {
		if (candidate.type !== 'AwaitExpression') return;
		if (typeof candidate.start !== 'number' || typeof candidate.end !== 'number') return;
		if (first !== null && candidate.start >= first.start) return;

		first = { start: candidate.start, end: candidate.end };
	});

	return first;
}

type PostAwaitRead = {
	readonly read: SemanticStateRead;
	/** The computed member segment whose value comes from the awaited work, when there is one. */
	readonly awaitedSegment?: string;
};

function postAwaitGraphReads(
	node: AnyNode | undefined,
	firstAwait: AwaitSpan,
	state: WalkState,
): PostAwaitRead[] {
	const reads: PostAwaitRead[] = [];
	const bindings = graphBindingMap(state.graph, currentGraphScope(state));
	const aliases = semanticAliasMap(state.graph, currentGraphScope(state));
	const bodyRegion = readRegion(node);
	const locals = bodyLocals(node, firstAwait, state, bodyRegion);
	const readAt = (candidate: AnyNode): SemanticStateRead | null =>
		postAwaitRead(candidate, firstAwait.end, state, bindings, aliases, bodyRegion);
	// `items[await key()]` reads `items` only once its own key's await resolves.
	const readAnywhere = (candidate: AnyNode): SemanticStateRead | null =>
		postAwaitRead(candidate, -1, state, bindings, aliases, bodyRegion);

	const visit = (candidate: AnyNode | undefined): void => {
		if (!candidate) return;

		if (candidate.type === 'Property') {
			if (candidate.computed === true) visit(candidate.key as AnyNode | undefined);
			visit(candidate.value as AnyNode | undefined);
			return;
		}

		if (candidate.type === 'MemberExpression') {
			const read = readAt(candidate);
			if (read) {
				reads.push({ read });
				return;
			}

			if (candidate.computed === true) {
				const object = candidate.object as AnyNode;
				const property = candidate.property as AnyNode;
				const keyAwaits = containsAwait(property);
				const objectRead = staticPrefixRead(object, keyAwaits ? readAnywhere : readAt);
				if (objectRead) {
					const awaited = keyAwaits || dependsOnAwaitedValue(property, state, locals);
					reads.push({
						read: {
							...objectRead,
							source: expressionSource(candidate, state.source),
							sourceSpan:
								sourceSpan(candidate, state.filename) ?? objectRead.sourceSpan,
						},
						...(awaited
							? { awaitedSegment: expressionSource(property, state.source) }
							: {}),
					});
				}
				visit(property);
			}
			visit(candidate.object as AnyNode | undefined);
			return;
		}

		if (candidate.type === 'Identifier') {
			const read = readAt(candidate);
			if (read) reads.push({ read });
			return;
		}

		for (const child of childNodes(candidate)) {
			visit(child);
		}
	};

	visit(node);

	return uniqueBy(reads, (read) => `${read.read.sourceSpan?.start}:${read.read.source}`);
}

/** The graph read a computed member hangs off: `items` in `items[k]`, `a.b` in `a.b[k].c`. */
function staticPrefixRead(
	node: AnyNode,
	readAt: (candidate: AnyNode) => SemanticStateRead | null,
): SemanticStateRead | null {
	const direct = readAt(node);
	if (direct) return direct;
	if (node.type === 'MemberExpression') return staticPrefixRead(node.object as AnyNode, readAt);
	if (node.type && transparentWrappers.has(node.type))
		return staticPrefixRead(node.expression as AnyNode, readAt);
	return null;
}

const transparentWrappers = new Set([
	'ParenthesizedExpression',
	'TSAsExpression',
	'TSSatisfiesExpression',
	'TSNonNullExpression',
	'TSTypeAssertion',
]);

function containsAwait(node: AnyNode): boolean {
	let found = false;
	walkNode(node, (candidate) => {
		if (candidate.type === 'AwaitExpression') found = true;
	});
	return found;
}

type BodyLocals = { readonly all: ReadonlySet<number>; readonly settled: ReadonlySet<number> };

/**
 * Bindings the derive body declares, and those whose value is fixed before the
 * first await starts: declared with their initializer before it and never
 * written after it. Parameters count as settled.
 */
function bodyLocals(
	body: AnyNode | undefined,
	firstAwait: AwaitSpan,
	state: WalkState,
	bodyRegion: ReadRegion | null,
): BodyLocals {
	const all = new Set<number>();
	const settled = new Set<number>();
	if (!bodyRegion) return { all, settled };
	const semantic = state.semantic();
	const declaratorEndById = new Map<number, number>();
	// A write lands when its whole assignment finishes, so `key = await x` writes after the await.
	const writeEndByTarget = new Map<number, number>();
	walkNode(body, (candidate) => {
		const target =
			candidate.type === 'VariableDeclarator'
				? candidate.id
				: candidate.type === 'AssignmentExpression'
					? candidate.left
					: candidate.type === 'UpdateExpression'
						? candidate.argument
						: null;
		if (!target) return;
		walkNode(target as AnyNode, (pattern) => {
			if (pattern.type !== 'Identifier' || typeof pattern.start !== 'number') return;
			writeEndByTarget.set(pattern.start, candidate.end as number);
			if (candidate.type === 'VariableDeclarator')
				declaratorEndById.set(pattern.start, candidate.end as number);
		});
	});
	const writtenAfterAwait = new Set<number>();
	for (const reference of semantic.references) {
		const start = reference.node.start;
		if (!reference.isWrite || (writeEndByTarget.get(start) ?? start) <= firstAwait.start)
			continue;
		const id = reference.binding?.id;
		if (typeof id === 'number') writtenAfterAwait.add(id);
	}
	for (let id = 0; id < semantic.bindings.length; id += 1) {
		const binding = semantic.bindings[id]!;
		const scope = semantic.scopes[binding.scope.id]!.node;
		if (scope.start < bodyRegion.start || scope.end > bodyRegion.end) continue;
		all.add(id);
		const declared = binding.declarations[0]?.start;
		if (typeof declared !== 'number') continue;
		const settledAt = declaratorEndById.get(declared) ?? declared;
		if (settledAt <= firstAwait.start && !writtenAfterAwait.has(id)) settled.add(id);
	}
	return { all, settled };
}

/** Whether a computed member key can hold a value produced by awaited work. */
function dependsOnAwaitedValue(node: AnyNode, state: WalkState, locals: BodyLocals): boolean {
	const semantic = state.semantic();
	let awaited = false;
	walkNode(node, (candidate) => {
		if (awaited) return;
		if (candidate.type === 'AwaitExpression') {
			awaited = true;
			return;
		}
		if (candidate.type !== 'Identifier' || typeof candidate.start !== 'number') return;
		const id = resolvedSymbolAt(semantic, candidate.start);
		if (id !== null && locals.all.has(id) && !locals.settled.has(id)) awaited = true;
	});
	return awaited;
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
