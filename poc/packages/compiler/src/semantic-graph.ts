import { isEventAttribute, normalizeEventName, parseModule } from '@tsrx/core';

export type SemanticGraphInput = {
	readonly filename: string;
	readonly source: string;
};

export type HostNode = {
	readonly id: string;
	readonly tagName: string;
};

export type StateSite = {
	readonly name: string;
	readonly kind: 'scalar' | 'object';
};

export type ComputedSite = {
	readonly name: string;
	readonly async: boolean;
};

export type ElementHandle = {
	readonly name: string;
	readonly type: string | null;
};

export type EventProp = {
	readonly eventName: string;
	readonly hostNodeId: string;
	readonly hasSyncPolicy: boolean;
};

export type SourceSpan = {
	readonly start: number;
	readonly end: number;
};

export type StatePathSegment = {
	readonly kind: 'binding' | 'property' | 'literal' | 'dynamic';
	readonly text: string;
};

export type StateWrite = {
	readonly target: string;
	readonly operation: 'assign' | 'update' | 'call';
	readonly method?: string;
	readonly path?: ReadonlyArray<StatePathSegment>;
	readonly span?: SourceSpan;
};

export type BindingRead = {
	readonly source: string;
	readonly hostNodeId: string;
};

export type ElementHandleBinding = {
	readonly handleName: string;
	readonly hostNodeId: string;
	readonly span?: SourceSpan;
};

export type TextBinding = {
	readonly source: string;
	readonly hostNodeId: string;
	readonly span?: SourceSpan;
};

export type BranchAnchor = {
	readonly id: string;
	readonly condition: string;
	readonly firstHostNodeId: string | null;
	readonly span?: SourceSpan;
};

export type KeyedLoop = {
	readonly id: string;
	readonly iterable: string;
	readonly itemName: string;
	readonly indexName: string | null;
	readonly key: string | null;
	readonly firstHostNodeId: string | null;
	readonly span?: SourceSpan;
};

export type EmptyFallback = {
	readonly id: string;
	readonly firstHostNodeId: string | null;
	readonly span?: SourceSpan;
};

export type DestructuredAlias = {
	readonly name: string;
	readonly source: string | null;
	readonly kind: 'state-path' | 'props-path';
	readonly writability: 'writable-path' | 'read-only' | 'ambiguous-write' | 'local-copy';
};

export type BindingAlias = {
	readonly name: string;
	readonly source: string;
	readonly kind: 'computed';
	readonly writability: 'read-only';
};

export type TsrxSemanticGraph = {
	readonly passId: 'tsrx-semantic-graph';
	readonly filename: string;
	readonly components: ReadonlyArray<{ readonly name: string }>;
	readonly hostNodes: ReadonlyArray<HostNode>;
	readonly stateSites: ReadonlyArray<StateSite>;
	readonly computedSites: ReadonlyArray<ComputedSite>;
	readonly elementHandles: ReadonlyArray<ElementHandle>;
	readonly eventProps: ReadonlyArray<EventProp>;
	readonly behaviorProps: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly expression: string;
	}>;
	readonly asyncBoundaries: ReadonlyArray<{ readonly hostNodeId: string | null }>;
	readonly stateWrites: ReadonlyArray<StateWrite>;
	readonly bindingReads: ReadonlyArray<BindingRead>;
	readonly elementHandleBindings: ReadonlyArray<ElementHandleBinding>;
	readonly textBindings: ReadonlyArray<TextBinding>;
	readonly branchAnchors: ReadonlyArray<BranchAnchor>;
	readonly keyedLoops: ReadonlyArray<KeyedLoop>;
	readonly emptyFallbacks: ReadonlyArray<EmptyFallback>;
	readonly destructuredAliases: ReadonlyArray<DestructuredAlias>;
	readonly bindingAliases: ReadonlyArray<BindingAlias>;
};

type MutableSemanticGraph = {
	passId: 'tsrx-semantic-graph';
	filename: string;
	components: Array<{ readonly name: string }>;
	hostNodes: HostNode[];
	stateSites: StateSite[];
	computedSites: ComputedSite[];
	elementHandles: ElementHandle[];
	eventProps: EventProp[];
	behaviorProps: Array<{ readonly hostNodeId: string; readonly expression: string }>;
	asyncBoundaries: Array<{ readonly hostNodeId: string | null }>;
	stateWrites: StateWrite[];
	bindingReads: BindingRead[];
	elementHandleBindings: ElementHandleBinding[];
	textBindings: TextBinding[];
	branchAnchors: BranchAnchor[];
	keyedLoops: KeyedLoop[];
	emptyFallbacks: EmptyFallback[];
	destructuredAliases: DestructuredAlias[];
	bindingAliases: BindingAlias[];
};

type AnyNode = {
	type?: string;
	start?: number;
	end?: number;
	[key: string]: unknown;
};

const ignoredWalkKeys = new Set([
	'comments',
	'closingElement',
	'innerComments',
	'leadingComments',
	'loc',
	'metadata',
	'openingElement',
	'parent',
	'range',
	'trailingComments',
]);

const mutatingCollectionMethods = new Set([
	'copyWithin',
	'fill',
	'pop',
	'push',
	'reverse',
	'shift',
	'sort',
	'splice',
	'unshift',
]);

export async function buildSemanticGraph(input: SemanticGraphInput): Promise<TsrxSemanticGraph> {
	const ast = parseModule(input.source, input.filename) as AnyNode;
	const graph: MutableSemanticGraph = {
		passId: 'tsrx-semantic-graph',
		filename: input.filename,
		components: [],
		hostNodes: [],
		stateSites: [],
		computedSites: [],
		elementHandles: [],
		eventProps: [],
		behaviorProps: [],
		asyncBoundaries: [],
		stateWrites: [],
		bindingReads: [],
		elementHandleBindings: [],
		textBindings: [],
		branchAnchors: [],
		keyedLoops: [],
		emptyFallbacks: [],
		destructuredAliases: [],
		bindingAliases: [],
	};

	const hostNodeIds = new WeakMap<object, string>();

	for (const statement of asNodes(ast.body)) {
		const component = getExportedFunction(statement);
		if (!component) continue;

		const name = getIdentifierName(component.id);
		if (!name) continue;

		graph.components.push({ name });
		collectComponentFacts(component, graph, input.source, hostNodeIds);
	}

	return graph;
}

function collectComponentFacts(
	component: AnyNode,
	graph: MutableSemanticGraph,
	source: string,
	hostNodeIds: WeakMap<object, string>,
): void {
	walk(component.body as AnyNode, (node) => {
		if (node.type === 'VariableDeclaration') {
			collectDeclarationFacts(node, graph);
			return;
		}

		if (node.type === 'Element') {
			collectElementFacts(node, graph, source, hostNodeIds);
			return;
		}

		if (node.type === 'TryStatement') {
			graph.asyncBoundaries.push({ hostNodeId: null });
			return;
		}

		if (node.type === 'IfStatement') {
			collectIfLocatorFacts(node, graph, source, hostNodeIds);
			return;
		}

		if (node.type === 'ForOfStatement') {
			collectForLocatorFacts(node, graph, source, hostNodeIds);
			return;
		}

		if (node.type === 'AssignmentExpression') {
			const target = expressionPathInfo(node.left as AnyNode, source);
			if (target) {
				pushUniqueStateWrite(graph, {
					target: target.display,
					operation: 'assign',
					path: target.segments,
					span: sourceSpan(node),
				});
			}
			return;
		}

		if (node.type === 'UpdateExpression') {
			const target = expressionPathInfo(node.argument as AnyNode, source);
			if (target) {
				pushUniqueStateWrite(graph, {
					target: target.display,
					operation: 'update',
					path: target.segments,
					span: sourceSpan(node),
				});
			}
			return;
		}

		if (node.type === 'CallExpression') {
			const write = collectionMethodWrite(node, source);
			if (write) pushUniqueStateWrite(graph, write);
		}
	});
}

function collectDeclarationFacts(node: AnyNode, graph: MutableSemanticGraph): void {
	for (const declarator of asNodes(node.declarations)) {
		collectDestructuredAliases(declarator, graph);

		const name = getIdentifierName(declarator.id);
		const init = declarator.init as AnyNode | undefined;
		const callee = getCalleeName(init);

		if (!name) continue;

		if (callee === 'state') {
			const firstArg = asNodes(init?.arguments)[0];
			pushUniqueByName(graph.stateSites, {
				name,
				kind: firstArg?.type === 'ObjectExpression' ? 'object' : 'scalar',
			});
			continue;
		}

		if (callee === 'computed') {
			const runner = asNodes(init?.arguments)[0];
			pushUniqueByName(graph.computedSites, {
				name,
				async: runner?.async === true,
			});
			continue;
		}

		if (callee === 'element') {
			pushUniqueByName(graph.elementHandles, {
				name,
				type: null,
			});
			continue;
		}

		const initPath = expressionPath(init);
		if (name && initPath) {
			const source = computedSourceFor(initPath, graph);
			if (source) {
				pushUniqueBindingAlias(graph, {
					name,
					source,
					kind: 'computed',
					writability: 'read-only',
				});
			}
		}
	}
}

function computedSourceFor(path: string, graph: MutableSemanticGraph): string | null {
	if (graph.computedSites.some((site) => site.name === path)) return path;

	const alias = graph.bindingAliases.find(
		(candidate) => candidate.name === path && candidate.kind === 'computed',
	);
	return alias?.source ?? null;
}

function collectDestructuredAliases(declarator: AnyNode, graph: MutableSemanticGraph): void {
	const id = declarator.id as AnyNode | undefined;
	const initPath = expressionPath(declarator.init as AnyNode | undefined);

	if (!id || !initPath) return;

	if (id.type === 'ObjectPattern') {
		for (const property of asNodes(id.properties)) {
			if (property.type !== 'Property') continue;

			const value = property.value as AnyNode | undefined;
			const name = getIdentifierName(value);
			if (!name) continue;

			const computed = property.computed === true;
			const propertyName = computed
				? null
				: getPropertyName(property.key as AnyNode | undefined, false);
			const kind = aliasKind(initPath);

			pushUniqueAlias(graph, {
				name,
				source: propertyName ? `${initPath}.${propertyName}` : null,
				kind,
				writability: aliasWritability({
					kind,
					computed,
					propertyName,
					aliasName: name,
				}),
			});
		}
		return;
	}

	if (id.type === 'ArrayPattern') {
		for (const element of asNodes(id.elements)) {
			const name = getIdentifierName(element);
			if (!name) continue;

			pushUniqueAlias(graph, {
				name,
				source: `${initPath}.*`,
				kind: aliasKind(initPath),
				writability: aliasKind(initPath) === 'props-path' ? 'read-only' : 'local-copy',
			});
		}
	}
}

function aliasKind(initPath: string): DestructuredAlias['kind'] {
	return initPath === 'props' || initPath.startsWith('props.') ? 'props-path' : 'state-path';
}

function aliasWritability(input: {
	readonly kind: DestructuredAlias['kind'];
	readonly computed: boolean;
	readonly propertyName: string | null;
	readonly aliasName: string;
}): DestructuredAlias['writability'] {
	if (input.kind === 'props-path') return 'read-only';
	if (input.computed || !input.propertyName) return 'ambiguous-write';
	return input.propertyName === input.aliasName ? 'writable-path' : 'ambiguous-write';
}

function collectElementFacts(
	node: AnyNode,
	graph: MutableSemanticGraph,
	source: string,
	hostNodeIds: WeakMap<object, string>,
): void {
	const hostNodeId = getHostNodeId(node, graph, hostNodeIds);

	for (const attribute of asNodes(node.attributes)) {
		if (attribute.type !== 'Attribute') continue;

		const attributeName = getIdentifierName(attribute.name);
		if (!attributeName) continue;

		if (isEventAttribute(attributeName)) {
			graph.eventProps.push({
				eventName: normalizeEventName(attributeName),
				hostNodeId,
				hasSyncPolicy: containsPreventDefault(attribute.value as AnyNode),
			});
			continue;
		}

		if (attributeName === 'attach') {
			graph.behaviorProps.push({
				hostNodeId,
				expression: sourceForNode(source, attribute.value as AnyNode),
			});
			continue;
		}

		if (attributeName === 'el') {
			const handleName = getIdentifierName(attribute.value);
			if (handleName) {
				pushUniqueElementHandleBinding(graph, {
					handleName,
					hostNodeId,
					span: sourceSpan(attribute),
				});
			}
			continue;
		}

		collectBindingReads(attribute.value as AnyNode, hostNodeId, graph);
	}

	for (const child of asNodes(node.children)) {
		if (child.type === 'TSRXExpression') {
			const bindingSource = sourceForNode(source, child.expression as AnyNode).trim();
			if (bindingSource) {
				pushUniqueTextBinding(graph, {
					source: bindingSource,
					hostNodeId,
					span: sourceSpan(child),
				});
			}
			collectBindingReads(child.expression as AnyNode, hostNodeId, graph);
		}
	}
}

function collectIfLocatorFacts(
	node: AnyNode,
	graph: MutableSemanticGraph,
	source: string,
	hostNodeIds: WeakMap<object, string>,
): void {
	const statementSource = sourceForNode(source, node).trimStart();
	if (statementSource.startsWith('@empty')) {
		pushUniqueEmptyFallback(graph, {
			id: `empty${graph.emptyFallbacks.length}`,
			firstHostNodeId: firstHostNodeIdIn(node.consequent as AnyNode, graph, hostNodeIds),
			span: sourceSpan(node),
		});
		return;
	}

	if (!statementSource.startsWith('@if')) return;

	const condition = sourceForNode(source, node.test as AnyNode).trim();
	if (!condition) return;

	pushUniqueBranchAnchor(graph, {
		id: `branch${graph.branchAnchors.length}`,
		condition,
		firstHostNodeId: firstHostNodeIdIn(node.consequent as AnyNode, graph, hostNodeIds),
		span: sourceSpan(node),
	});
}

function collectForLocatorFacts(
	node: AnyNode,
	graph: MutableSemanticGraph,
	source: string,
	hostNodeIds: WeakMap<object, string>,
): void {
	const statementSource = sourceForNode(source, node).trimStart();
	if (!statementSource.startsWith('@for')) return;

	const itemName = forOfItemName(node.left as AnyNode | undefined);
	const iterable =
		expressionPath(node.right as AnyNode | undefined) ??
		sourceForNode(source, node.right as AnyNode).trim();
	if (!itemName || !iterable) return;

	pushUniqueKeyedLoop(graph, {
		id: `loop${graph.keyedLoops.length}`,
		iterable,
		itemName,
		indexName: getIdentifierName(node.index),
		key:
			expressionPath(node.key as AnyNode | undefined) ??
			sourceForNode(source, node.key as AnyNode).trim() ??
			null,
		firstHostNodeId: firstHostNodeIdIn(node.body as AnyNode, graph, hostNodeIds),
		span: sourceSpan(node),
	});
}

function forOfItemName(node: AnyNode | undefined): string | null {
	if (!node) return null;

	if (node.type === 'VariableDeclaration') {
		const declarator = asNodes(node.declarations)[0];
		return getIdentifierName(declarator?.id);
	}

	return getIdentifierName(node);
}

function firstHostNodeIdIn(
	node: AnyNode | null | undefined,
	graph: MutableSemanticGraph,
	hostNodeIds: WeakMap<object, string>,
): string | null {
	if (!node) return null;

	if (node.type === 'Element') {
		return getHostNodeId(node, graph, hostNodeIds);
	}

	for (const [key, value] of Object.entries(node)) {
		if (ignoredWalkKeys.has(key)) continue;

		if (Array.isArray(value)) {
			for (const child of value) {
				if (!isNode(child)) continue;
				const hostNodeId = firstHostNodeIdIn(child, graph, hostNodeIds);
				if (hostNodeId) return hostNodeId;
			}
			continue;
		}

		if (isNode(value)) {
			const hostNodeId = firstHostNodeIdIn(value, graph, hostNodeIds);
			if (hostNodeId) return hostNodeId;
		}
	}

	return null;
}

function getHostNodeId(
	node: AnyNode,
	graph: MutableSemanticGraph,
	hostNodeIds: WeakMap<object, string>,
): string {
	const existing = hostNodeIds.get(node);
	if (existing) return existing;

	const id = `h${graph.hostNodes.length}`;
	hostNodeIds.set(node, id);
	graph.hostNodes.push({
		id,
		tagName: tagNameForElement(node),
	});
	return id;
}

function getExportedFunction(node: AnyNode): AnyNode | null {
	if (node.type !== 'ExportNamedDeclaration') return null;

	const declaration = node.declaration as AnyNode | undefined;
	if (declaration?.type !== 'FunctionDeclaration') return null;

	return declaration;
}

function collectBindingReads(
	node: AnyNode | null | undefined,
	hostNodeId: string,
	graph: MutableSemanticGraph,
): void {
	walk(node, (candidate) => {
		if (candidate.type !== 'MemberExpression') return;

		const source = expressionPath(candidate);
		if (!source) return;

		pushUniqueBindingRead(graph, {
			source,
			hostNodeId,
		});
	});
}

function containsPreventDefault(node: AnyNode | null | undefined): boolean {
	let found = false;

	walk(node, (candidate) => {
		if (found || candidate.type !== 'CallExpression') return;

		const callee = candidate.callee as AnyNode | undefined;
		if (
			callee?.type === 'MemberExpression' &&
			getPropertyName(callee.property as AnyNode, callee.computed === true) ===
				'preventDefault'
		) {
			found = true;
		}
	});

	return found;
}

function collectionMethodWrite(node: AnyNode, source: string): StateWrite | null {
	const callee = node.callee as AnyNode | undefined;
	if (callee?.type !== 'MemberExpression') return null;

	const method = getPropertyName(
		callee.property as AnyNode | undefined,
		callee.computed === true,
	);
	if (!method || !mutatingCollectionMethods.has(method)) return null;

	const target = expressionPathInfo(callee.object as AnyNode | undefined, source);
	if (!target) return null;

	return {
		target: target.display,
		operation: 'call',
		method,
		path: target.segments,
		span: sourceSpan(node),
	};
}

function expressionPath(node: AnyNode | null | undefined): string | null {
	return expressionPathInfo(node, '')?.display ?? null;
}

type ExpressionPathInfo = {
	readonly display: string;
	readonly segments: ReadonlyArray<StatePathSegment>;
};

function expressionPathInfo(
	node: AnyNode | null | undefined,
	source: string,
): ExpressionPathInfo | null {
	if (!node) return null;

	if (node.type === 'Identifier') {
		const name = getIdentifierName(node);
		if (!name) return null;

		return {
			display: name,
			segments: [{ kind: 'binding', text: name }],
		};
	}

	if (node.type === 'MemberExpression') {
		const objectPath = expressionPathInfo(node.object as AnyNode, source);
		const property = pathSegmentForMember(
			node.property as AnyNode | undefined,
			node.computed === true,
			source,
		);

		if (!objectPath || !property) return null;

		const segments = [...objectPath.segments, property];

		return {
			display: legacyPathDisplay(segments),
			segments,
		};
	}

	if (node.type === 'ChainExpression') {
		return expressionPathInfo(node.expression as AnyNode, source);
	}

	return null;
}

function pathSegmentForMember(
	node: AnyNode | null | undefined,
	computed: boolean,
	source: string,
): StatePathSegment | null {
	if (!node) return null;

	if (!computed && node.type === 'Identifier') {
		const name = getIdentifierName(node);
		return name ? { kind: 'property', text: name } : null;
	}

	if (node.type === 'Literal') {
		const value = node.value;
		return typeof value === 'string' || typeof value === 'number'
			? { kind: computed ? 'literal' : 'property', text: String(value) }
			: null;
	}

	if (computed && node.type === 'Identifier') {
		const name = getIdentifierName(node);
		return name ? { kind: 'dynamic', text: name } : null;
	}

	if (computed) {
		const text = sourceForNode(source, node).trim();
		return text ? { kind: 'dynamic', text } : null;
	}

	return null;
}

function legacyPathDisplay(segments: ReadonlyArray<StatePathSegment>): string {
	return segments.map((segment) => segment.text).join('.');
}

function tagNameForElement(node: AnyNode): string {
	return getIdentifierName(node.id) ?? sourceName(node.id as AnyNode) ?? 'unknown';
}

function getCalleeName(node: AnyNode | null | undefined): string | null {
	if (!node || node.type !== 'CallExpression') return null;
	return expressionPath(node.callee as AnyNode);
}

function getIdentifierName(node: unknown): string | null {
	if (!isNode(node) || node.type !== 'Identifier') return null;

	return typeof node.name === 'string' ? node.name : null;
}

function getPropertyName(node: AnyNode | null | undefined, _computed: boolean): string | null {
	if (!node) return null;

	if (node.type === 'Identifier') {
		return getIdentifierName(node);
	}

	if (node.type === 'Literal') {
		const value = node.value;
		return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
	}

	return null;
}

function sourceForNode(source: string, node: AnyNode | null | undefined): string {
	if (!node || typeof node.start !== 'number' || typeof node.end !== 'number') {
		return '';
	}

	return source.slice(node.start, node.end);
}

function sourceSpan(node: AnyNode): SourceSpan | undefined {
	if (typeof node.start !== 'number' || typeof node.end !== 'number') return undefined;

	return {
		start: node.start,
		end: node.end,
	};
}

function sourceName(node: AnyNode | null | undefined): string | null {
	if (!node) return null;
	if (node.type === 'MemberExpression') return expressionPath(node);
	return null;
}

function walk(node: unknown, visit: (node: AnyNode) => void): void {
	if (!isNode(node)) return;

	visit(node);

	for (const [key, value] of Object.entries(node)) {
		if (ignoredWalkKeys.has(key)) continue;

		if (Array.isArray(value)) {
			for (const child of value) walk(child, visit);
			continue;
		}

		if (isNode(value)) {
			walk(value, visit);
		}
	}
}

function asNodes(value: unknown): AnyNode[] {
	return Array.isArray(value) ? value.filter(isNode) : [];
}

function isNode(value: unknown): value is AnyNode {
	return value !== null && typeof value === 'object';
}

function pushUniqueByName<T extends { readonly name: string }>(items: T[], next: T): void {
	if (items.some((item) => item.name === next.name)) return;
	items.push(next);
}

function pushUniqueStateWrite(graph: MutableSemanticGraph, next: StateWrite): void {
	if (
		graph.stateWrites.some(
			(write) =>
				write.target === next.target &&
				write.operation === next.operation &&
				write.method === next.method,
		)
	) {
		return;
	}

	graph.stateWrites.push(next);
}

function pushUniqueBindingRead(graph: MutableSemanticGraph, next: BindingRead): void {
	if (
		graph.bindingReads.some(
			(read) => read.source === next.source && read.hostNodeId === next.hostNodeId,
		)
	) {
		return;
	}

	graph.bindingReads.push(next);
}

function pushUniqueElementHandleBinding(
	graph: MutableSemanticGraph,
	next: ElementHandleBinding,
): void {
	if (
		graph.elementHandleBindings.some(
			(binding) =>
				binding.handleName === next.handleName && binding.hostNodeId === next.hostNodeId,
		)
	) {
		return;
	}

	graph.elementHandleBindings.push(next);
}

function pushUniqueTextBinding(graph: MutableSemanticGraph, next: TextBinding): void {
	if (
		graph.textBindings.some(
			(binding) => binding.source === next.source && binding.hostNodeId === next.hostNodeId,
		)
	) {
		return;
	}

	graph.textBindings.push(next);
}

function pushUniqueBranchAnchor(graph: MutableSemanticGraph, next: BranchAnchor): void {
	if (
		graph.branchAnchors.some(
			(anchor) =>
				anchor.condition === next.condition &&
				anchor.firstHostNodeId === next.firstHostNodeId,
		)
	) {
		return;
	}

	graph.branchAnchors.push(next);
}

function pushUniqueKeyedLoop(graph: MutableSemanticGraph, next: KeyedLoop): void {
	if (
		graph.keyedLoops.some(
			(loop) =>
				loop.iterable === next.iterable &&
				loop.itemName === next.itemName &&
				loop.indexName === next.indexName &&
				loop.key === next.key,
		)
	) {
		return;
	}

	graph.keyedLoops.push(next);
}

function pushUniqueEmptyFallback(graph: MutableSemanticGraph, next: EmptyFallback): void {
	if (
		graph.emptyFallbacks.some((fallback) => fallback.firstHostNodeId === next.firstHostNodeId)
	) {
		return;
	}

	graph.emptyFallbacks.push(next);
}

function pushUniqueAlias(graph: MutableSemanticGraph, next: DestructuredAlias): void {
	if (
		graph.destructuredAliases.some(
			(alias) =>
				alias.name === next.name &&
				alias.source === next.source &&
				alias.kind === next.kind &&
				alias.writability === next.writability,
		)
	) {
		return;
	}

	graph.destructuredAliases.push(next);
}

function pushUniqueBindingAlias(graph: MutableSemanticGraph, next: BindingAlias): void {
	if (
		graph.bindingAliases.some(
			(alias) =>
				alias.name === next.name &&
				alias.source === next.source &&
				alias.kind === next.kind &&
				alias.writability === next.writability,
		)
	) {
		return;
	}

	graph.bindingAliases.push(next);
}
