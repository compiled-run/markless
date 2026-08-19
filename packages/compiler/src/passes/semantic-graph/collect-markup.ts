import { isEventAttribute } from '@tsrx/core';
import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import {
	escapeAttribute,
	escapeHtml,
	getComponentFunction,
	getDynamicTagExpression,
	getElementAttributes,
	getElementTagName,
	isHostTagName,
	isIgnorableStaticTextNode,
	isSpreadAttribute,
	isStaticTextNode,
	staticTextValue,
	unwrapExpressionContainer,
} from '../../ast/tsrx.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
} from '../../artifact-helpers/graph-paths.ts';
import type {
	SemanticMarkupArtifact,
	SemanticMarkupChunk,
	SemanticMarkupResidue,
	SemanticMarkupSlot,
} from '../../artifacts.ts';
import { resolveSharedInstanceGraphPath } from './collect-shared.ts';
import { isIdrefAttribute } from './idref-attributes.ts';
import {
	createStyleConstResolver,
	lowerStyleObject,
	type StyleConstResolver,
} from './style-object.ts';
import { collectStyleScopes } from '../public-render/style-scopes.ts';
import type { MutableSemanticGraphArtifact } from './types.ts';

type CollectionContext = {
	readonly source: string;
	readonly filename: string;
	readonly graph: MutableSemanticGraphArtifact;
	readonly hostIds: WeakMap<object, string>;
	readonly chunks: SemanticMarkupChunk[];
	readonly usedRepeatIds: Set<string>;
	branchIndex: number;
	boundaryIndex: number;
	styleScopeClass: string | null;
	styleConstResolver: StyleConstResolver | null;
};

type ChunkBuilder = {
	readonly id: string;
	readonly kind: SemanticMarkupChunk['kind'];
	readonly componentName: string;
	readonly statics: string[];
	readonly hosts: SemanticMarkupChunk['hosts'][number][];
	readonly slots: SemanticMarkupSlot[];
};

type WithoutStaticIndex<Slot> = Slot extends unknown ? Omit<Slot, 'staticIndex'> : never;
type NewSlot = WithoutStaticIndex<SemanticMarkupSlot>;
type WithoutCoordinate<Slot> = Slot extends unknown ? Omit<Slot, 'coordinate'> : never;
type NewAnchorSlot = WithoutCoordinate<NewSlot>;

// Captures native markup while the semantic pass still owns the parsed TSRX
// tree. Consumers receive strings and direct coordinates, never a structure
// of element/tag/children records that could become a runtime walker.
export function collectSemanticMarkup(input: {
	readonly ast: AnyNode;
	readonly source: string;
	readonly filename: string;
	readonly graph: MutableSemanticGraphArtifact;
	readonly hostIds: WeakMap<object, string>;
}): SemanticMarkupArtifact {
	const chunks: SemanticMarkupChunk[] = [];
	const context: CollectionContext = {
		source: input.source,
		filename: input.filename,
		graph: input.graph,
		hostIds: input.hostIds,
		chunks,
		usedRepeatIds: new Set(),
		branchIndex: 0,
		boundaryIndex: 0,
		styleScopeClass: null,
		styleConstResolver: null,
	};
	const components: Array<{
		readonly name: string;
		readonly root: AnyNode;
		readonly exported: boolean;
		readonly rootEligible: boolean;
	}> = [];

	for (const statement of asNodes(input.ast.body)) {
		const component = getComponentFunction(statement);
		if (!component) continue;
		const root = firstMarkupOutput(component.node);
		if (!root) continue;
		components.push({
			name: component.name,
			root,
			rootEligible: isPublicRoot(root) && isPublicComponentBody(component.node, root),
			exported:
				statement.type === 'ExportNamedDeclaration' ||
				statement.type === 'ExportDefaultDeclaration',
		});
	}

	for (const component of components) {
		context.styleScopeClass = collectStyleScopes(component.root, input.filename).styleScopes[0]?.scopeId ?? null;
		const builder = createChunk(`template:${component.name}`, 'template', component.name);
		emitNode(component.root, [0], builder, context, null);
		chunks.push(finishChunk(builder));
	}

	const rootCandidates = components.filter((component) => component.rootEligible);
	const selected = rootCandidates.find((component) => component.exported) ?? rootCandidates[0];
	return {
		root: selected
			? { componentName: selected.name, templateId: `template:${selected.name}` }
			: null,
		chunks,
	};
}

function createChunk(
	id: string,
	kind: SemanticMarkupChunk['kind'],
	componentName: string,
): ChunkBuilder {
	return { id, kind, componentName, statics: [''], hosts: [], slots: [] };
}

function finishChunk(builder: ChunkBuilder): SemanticMarkupChunk {
	return { ...builder };
}

function append(builder: ChunkBuilder, value: string): void {
	builder.statics[builder.statics.length - 1] += value;
}

function addSlot(builder: ChunkBuilder, slot: NewSlot): void {
	builder.slots.push({ ...slot, staticIndex: builder.statics.length - 1 } as SemanticMarkupSlot);
	builder.statics.push('');
}

function addAnchorSlot(
	builder: ChunkBuilder,
	slot: NewAnchorSlot,
	path: ReadonlyArray<number>,
): void {
	append(builder, `<!--markless-slot:${builder.slots.length}-->`);
	addSlot(builder, {
		...slot,
		coordinate: { kind: 'comment-anchor', path },
	} as NewSlot);
}

function emitNode(
	node: AnyNode,
	path: ReadonlyArray<number>,
	builder: ChunkBuilder,
	context: CollectionContext,
	repeat: { readonly id: string; readonly itemName: string } | null,
): number {
	if (isStaticTextNode(node)) {
		const text = staticTextValue(node);
		if (!text) return 0;
		append(builder, escapeHtml(text));
		return 1;
	}

	if (node.type === 'JSXExpressionContainer' || node.type === 'TSRXExpression') {
		const expression = node.expression as AnyNode | undefined;
		if (!expression) return 0;
		addAnchorSlot(
			builder,
			{
				kind: 'text',
				residue: expressionResidue(expression, context, repeat),
				...(getIdentifierName(expression) === 'children' ? { raw: true } : {}),
			},
			path,
		);
		return 1;
	}

	if (node.type === 'Fragment' || node.type === 'JSXFragment') {
		return emitNodes(asNodes(node.children), path, builder, context, repeat);
	}

	if (node.type === 'JSXIfExpression' || node.type === 'JSXSwitchExpression') {
		const branchSiteId = `branch-site:${context.branchIndex++}`;
		const armTemplateIds = branchArms(node).map((arm, armIndex) => {
			const id = `branch:${branchSiteId}:arm:${armIndex}`;
			const armBuilder = createChunk(id, 'branch-arm', builder.componentName);
			emitNodes(arm, [0], armBuilder, context, repeat);
			context.chunks.push(finishChunk(armBuilder));
			return id;
		});
		addAnchorSlot(builder, { kind: 'branch', branchSiteId, armTemplateIds }, path);
		return 1;
	}

	if (node.type === 'JSXForExpression') {
		const itemName = repeatItemName(node) ?? 'item';
		const collection = node.right as AnyNode | undefined;
		const key = node.key as AnyNode | undefined;
		const semanticRepeat = context.graph.keyedRepeats.find(
			(candidate) =>
				!context.usedRepeatIds.has(candidate.id) &&
				candidate.itemName === itemName &&
				candidate.collectionSource ===
					(collection ? expressionSource(collection, context.source) : '') &&
				candidate.keySource === (key ? expressionSource(key, context.source) : ''),
		);
		if (semanticRepeat) context.usedRepeatIds.add(semanticRepeat.id);
		const repeatId = semanticRepeat?.id ?? `markup-repeat:${node.start ?? 'unknown'}`;
		const rowTemplateId = `repeat:${repeatId}:row`;
		const rowBuilder = createChunk(rowTemplateId, 'repeat-row', builder.componentName);
		emitNodes(asNodes((node.body as AnyNode | undefined)?.body), [0], rowBuilder, context, {
			id: repeatId,
			itemName,
		});
		context.chunks.push(finishChunk(rowBuilder));

		const emptyNodes = asNodes((node.empty as AnyNode | undefined)?.body);
		const emptyTemplateId = emptyNodes.length > 0 ? `repeat:${repeatId}:empty` : undefined;
		if (emptyTemplateId) {
			const emptyBuilder = createChunk(
				emptyTemplateId,
				'repeat-empty',
				builder.componentName,
			);
			emitNodes(emptyNodes, [0], emptyBuilder, context, repeat);
			context.chunks.push(finishChunk(emptyBuilder));
		}
		addAnchorSlot(
			builder,
			{
				kind: 'repeat',
				repeatId,
				rowTemplateId,
				...(emptyTemplateId ? { emptyTemplateId } : {}),
			},
			path,
		);
		return 1;
	}

	if (node.type === 'JSXTryExpression') {
		const boundaryId = `boundary:${context.boundaryIndex++}`;
		const tryNodes = asNodes((node.block as AnyNode | undefined)?.body);
		const pendingNodes = asNodes((node.pending as AnyNode | undefined)?.body);
		const catchNodes = asNodes(
			((node.handler as AnyNode | undefined)?.body as AnyNode | undefined)?.body,
		);
		const armTemplateIds: { try: string; pending?: string; catch?: string } = {
			try: emitAsyncArm('try', tryNodes, boundaryId, builder.componentName, context, repeat),
		};
		if (pendingNodes.length > 0) {
			armTemplateIds.pending = emitAsyncArm(
				'pending',
				pendingNodes,
				boundaryId,
				builder.componentName,
				context,
				repeat,
			);
		}
		if (catchNodes.length > 0) {
			armTemplateIds.catch = emitAsyncArm(
				'catch',
				catchNodes,
				boundaryId,
				builder.componentName,
				context,
				repeat,
			);
		}
		addAnchorSlot(builder, { kind: 'async', boundaryId, armTemplateIds }, path);
		return 1;
	}

	if (node.type !== 'Element' && node.type !== 'JSXElement') return 0;
	const dynamicTag = getDynamicTagExpression(node);
	if (dynamicTag) {
		emitDynamicHost(node, dynamicTag, path, builder, context, repeat);
		return 1;
	}
	const tagName = getElementTagName(node);
	if (!tagName) return 0;
	if (!isHostTagName(tagName)) {
		const span = sourceSpan(node, context.filename);
		const edge = context.graph.componentEdges.find(
			(candidate) => candidate.sourceSpan?.start === span?.start,
		);
		const projected = asNodes(node.children).filter(
			(child) => !isIgnorableStaticTextNode(child),
		);
		const projectionChunkId = projected.length > 0
			? `projection:${edge?.id ?? `${tagName}:${span?.start ?? 0}`}`
			: undefined;
		if (projectionChunkId) {
			const projection = createChunk(
				projectionChunkId,
				'component-projection',
				builder.componentName,
			);
			emitNodes(projected, [0], projection, context, repeat);
			context.chunks.push(finishChunk(projection));
		}
		// The edge already resolved a member tag to the component it names.
		const childComponentName = edge?.childComponentName ?? tagName;
		addAnchorSlot(
			builder,
			{
				kind: 'child-component',
				componentEdgeId: edge?.id ?? `component-edge:${tagName}:${span?.start ?? 0}`,
				childComponentName,
				childTemplateId: `template:${childComponentName}`,
				...(projectionChunkId ? { projectionChunkId } : {}),
			},
			path,
		);
		return 1;
	}
	const hostNodeId = context.hostIds.get(node);
	if (hostNodeId) {
		builder.hosts.push({
			hostNodeId,
			tagName,
			coordinate: { kind: 'child-index', path },
		});
	}

	append(builder, `<${tagName}`);
	let classSeen = false;
	const elementAttributes = getElementAttributes(node);
	const declaredAttributeNames = elementAttributes.flatMap((candidate) => {
		if (isSpreadAttribute(candidate)) return [];
		const name = getIdentifierName(candidate.name as AnyNode | undefined);
		return name ? [name] : [];
	});
	for (const attribute of elementAttributes) {
		if (isSpreadAttribute(attribute)) {
			const expression = unwrapExpressionContainer(
				(attribute.argument ?? attribute.value) as AnyNode | undefined,
			);
			if (expression)
				addSlot(builder, {
					kind: 'spread-attributes',
					coordinate: { kind: 'child-index', path },
					residue: expressionResidue(expression, context, repeat),
					excludeNames: declaredAttributeNames,
				});
			continue;
		}
		const name = getIdentifierName(attribute.name as AnyNode | undefined);
		// overlay is a compiler-side elevation mark, not a DOM attribute: without this
		// skip staticAttributeValue leaks ` overlay=""` (bare) or ` overlay="true"`
		// ({true}) straight into the emitted statics.
		if (
			!name ||
			isEventAttribute(name) ||
			name === 'attach' ||
			name === 'el' ||
			name === 'overlay' ||
			isElementHandleIdref(context, node, name)
		)
			continue;
		if (name === 'class') classSeen = true;
		const value = attribute.value as AnyNode | undefined;
		const expression = unwrapExpressionContainer(value);
		const styleCss = staticStyleObjectCss(name, expression, context);
		if (styleCss !== null) {
			if (styleCss !== '') append(builder, ` style="${escapeAttribute(styleCss)}"`);
			continue;
		}
		const literal = staticAttributeValue(value, expression);
		if (literal) {
			const text = staticAttributeText(name, literal.value);
			if (text !== null)
				append(builder, ` ${name}="${escapeAttribute(name === 'class' && context.styleScopeClass ? `${text} ${context.styleScopeClass}` : text)}"`);
			continue;
		}
		if (!expression) continue;
		// A value that cannot be absent keeps its name in the statics; otherwise
		// the slot emits the whole attribute so the runtime decides presence.
		const alwaysPresent = isAlwaysPresentValue(expression);
		if (alwaysPresent) append(builder, ` ${name}="`);
		addSlot(builder, {
			kind: 'attribute',
			name,
			coordinate: { kind: 'child-index', path },
			residue: expressionResidue(expression, context, repeat),
			...(alwaysPresent ? { alwaysPresent: true } : {}),
			...(name === 'class' && repeat
				? { directClassMatch: directClassMatch(expression, context, repeat) }
				: {}),
		});
		if (alwaysPresent) append(builder, '"');
	}
	if (context.styleScopeClass && !classSeen)
		append(builder, ` class="${context.styleScopeClass}"`);
	append(builder, '>');
	emitNodes(asNodes(node.children), [...path, 0], builder, context, repeat);
	append(builder, `</${tagName}>`);
	return 1;
}

/**
 * An IDREF attribute whose value resolved to an element() handle is a recorded
 * relationship, not a value binding, so it must not reach the statics at all.
 * Emitting the slot anyway would ship `aria-labelledby=""` - an id reference
 * pointing at nothing, which is worse than an absent attribute. The consuming
 * emitter writes both sides of the relationship from the record.
 */
function isElementHandleIdref(context: CollectionContext, node: AnyNode, name: string): boolean {
	if (!isIdrefAttribute(name)) return false;
	const hostNodeId = context.hostIds.get(node);
	if (!hostNodeId) return false;
	return context.graph.elementHandleIdrefs.some(
		(idref) => idref.hostNodeId === hostNodeId && idref.attributeName === name,
	);
}

function directClassMatch(expression: AnyNode,
	context: CollectionContext,
	repeat: { readonly id: string; readonly itemName: string },
) {
	if (expression.type !== 'ConditionalExpression') return undefined;
	const test = expression.test as AnyNode | undefined;
	if (test?.type !== 'BinaryExpression' || (test.operator !== '===' && test.operator !== '==')) {
		return undefined;
	}
	const left = expressionResidue(test.left as AnyNode, context, repeat);
	const right = expressionResidue(test.right as AnyNode, context, repeat);
	const graph = left.kind === 'graph-read' ? left : right.kind === 'graph-read' ? right : null;
	const item = left.kind === 'repeat-item' ? left : right.kind === 'repeat-item' ? right : null;
	const consequent = expression.consequent as AnyNode | undefined;
	const alternate = expression.alternate as AnyNode | undefined;
	if (
		!graph || !item ||
		consequent?.type !== 'Literal' || typeof consequent.value !== 'string' ||
		alternate?.type !== 'Literal' || typeof alternate.value !== 'string'
	) return undefined;
	return {
		stateGraphNodeId: graph.graphNodeId,
		statePath: graph.path,
		itemPath: item.path,
		trueClass: consequent.value,
		falseClass: alternate.value,
	};
}

function emitDynamicHost(
	node: AnyNode,
	tagExpression: AnyNode,
	path: ReadonlyArray<number>,
	builder: ChunkBuilder,
	context: CollectionContext,
	repeat: { readonly id: string; readonly itemName: string } | null,
): void {
	const staticAttributes: Record<string, string> = {};
	const attributeSlots: Array<
		| {
				readonly kind: 'attribute';
				readonly name: string;
				readonly residue: SemanticMarkupResidue;
		  }
		| { readonly kind: 'spread'; readonly residue: SemanticMarkupResidue }
	> = [];
	for (const attribute of getElementAttributes(node)) {
		if (isSpreadAttribute(attribute)) {
			const expression = unwrapExpressionContainer(
				(attribute.argument ?? attribute.value) as AnyNode | undefined,
			);
			if (expression) {
				attributeSlots.push({
					kind: 'spread',
					residue: expressionResidue(expression, context, repeat),
				});
			}
			continue;
		}
		const name = getIdentifierName(attribute.name as AnyNode | undefined);
		// overlay is a compiler-side elevation mark, not a DOM attribute: without this
		// skip staticAttributeValue leaks ` overlay=""` (bare) or ` overlay="true"`
		// ({true}) straight into the emitted statics.
		if (
			!name ||
			isEventAttribute(name) ||
			name === 'attach' ||
			name === 'el' ||
			name === 'overlay' ||
			isElementHandleIdref(context, node, name)
		)
			continue;
		const value = attribute.value as AnyNode | undefined;
		const expression = unwrapExpressionContainer(value);
		const styleCss = staticStyleObjectCss(name, expression, context);
		if (styleCss !== null) {
			if (styleCss !== '') staticAttributes[name] = styleCss;
			continue;
		}
		const literal = staticAttributeValue(value, expression);
		if (literal) {
			const text = staticAttributeText(name, literal.value);
			if (text !== null) staticAttributes[name] = text;
			continue;
		}
		if (expression) {
			attributeSlots.push({
				kind: 'attribute',
				name,
				residue: expressionResidue(expression, context, repeat),
			});
		}
	}
	if (context.styleScopeClass) {
		staticAttributes.class = staticAttributes.class
			? `${staticAttributes.class} ${context.styleScopeClass}`
			: context.styleScopeClass;
	}

	const childChunkId = `dynamic-host:${builder.id}:${builder.slots.length}:children`;
	const childBuilder = createChunk(childChunkId, 'dynamic-host-children', builder.componentName);
	emitNodes(asNodes(node.children), [0], childBuilder, context, repeat);
	context.chunks.push(finishChunk(childBuilder));
	const hostNodeId = context.hostIds.get(node);
	if (!hostNodeId) {
		throw new Error(`Semantic markup could not resolve the dynamic host at ${path.join('.')}.`);
	}
	addAnchorSlot(
		builder,
		{
			kind: 'dynamic-host',
			hostNodeId,
			cardinality: 'zero-or-one',
			nullishTag: 'omit',
			tag: expressionResidue(tagExpression, context, repeat),
			staticAttributes,
			attributeSlots,
			childChunkId,
		},
		path,
	);
}

function emitNodes(
	nodes: ReadonlyArray<AnyNode>,
	startPath: ReadonlyArray<number>,
	builder: ChunkBuilder,
	context: CollectionContext,
	repeat: { readonly id: string; readonly itemName: string } | null,
): number {
	const prefix = startPath.slice(0, -1);
	const startIndex = startPath[startPath.length - 1] ?? 0;
	let childIndex = startIndex;
	for (const node of nodes) {
		if (isIgnorableStaticTextNode(node)) continue;
		childIndex += emitNode(node, [...prefix, childIndex], builder, context, repeat);
	}
	return childIndex - startIndex;
}

function emitAsyncArm(
	name: 'try' | 'pending' | 'catch',
	nodes: ReadonlyArray<AnyNode>,
	boundaryId: string,
	componentName: string,
	context: CollectionContext,
	repeat: { readonly id: string; readonly itemName: string } | null,
): string {
	const id = `async:${boundaryId}:arm:${name}`;
	const builder = createChunk(id, 'async-arm', componentName);
	emitNodes(nodes, [0], builder, context, repeat);
	context.chunks.push(finishChunk(builder));
	return id;
}

function expressionResidue(
	expression: AnyNode,
	context: CollectionContext,
	repeat: { readonly id: string; readonly itemName: string } | null,
): SemanticMarkupResidue {
	const source = expressionSource(expression, context.source);
	if (repeat && (source === repeat.itemName || source.startsWith(`${repeat.itemName}.`))) {
		const path =
			source === repeat.itemName ? [] : source.slice(repeat.itemName.length + 1).split('.');
		if (path.every((part) => /^[A-Za-z_$][\w$]*$/.test(part))) {
			return { kind: 'repeat-item', repeatId: repeat.id, path };
		}
	}
	const resolved = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(source)
		? (resolveGraphPath(
				source,
				graphBindingMap(context.graph),
				semanticAliasMap(context.graph),
			) ?? resolveSharedInstanceGraphPath(source, context.graph))
		: null;
	if (resolved) {
		return { kind: 'graph-read', graphNodeId: resolved.binding.id, path: resolved.path };
	}
	const span = sourceSpan(expression, context.filename);
	const computedRead = context.graph.templateReads.find(
		(read) =>
			read.source === source &&
			read.sourceSpan?.start === span?.start &&
			read.computedGraphNodeId,
	);
	return computedRead?.computedGraphNodeId
		? { kind: 'graph-read', graphNodeId: computedRead.computedGraphNodeId, path: [] }
		: { kind: 'authored-expression', source };
}

function firstMarkupOutput(component: AnyNode): AnyNode | null {
	const body = component.body as AnyNode | undefined;
	for (const node of body ? childNodes(body) : []) {
		if (
			node.type === 'Element' ||
			node.type === 'JSXElement' ||
			node.type === 'Fragment' ||
			node.type === 'JSXFragment' ||
			node.type === 'JSXIfExpression' ||
			node.type === 'JSXSwitchExpression' ||
			node.type === 'JSXForExpression' ||
			node.type === 'JSXTryExpression'
		)
			return node;
		if (node.type === 'ReturnStatement') {
			const argument = node.argument as AnyNode | undefined;
			if (argument) return argument;
		}
	}
	return null;
}

function isPublicRoot(node: AnyNode): boolean {
	if (node.type === 'Element' || node.type === 'JSXElement') return true;
	if (node.type !== 'Fragment' && node.type !== 'JSXFragment') return false;
	const children = asNodes(node.children).filter((child) => !isIgnorableStaticTextNode(child));
	return (
		children.length > 0 &&
		children.every(
			(child) =>
				child.type === 'JSXIfExpression' ||
				child.type === 'JSXSwitchExpression' ||
				child.type === 'JSXForExpression' ||
				child.type === 'JSXTryExpression' ||
				((child.type === 'Element' || child.type === 'JSXElement') &&
					isPlainStaticHostSubtree(child)),
		)
	);
}

function isPlainStaticHostSubtree(node: AnyNode): boolean {
	if (isStaticTextNode(node)) return true;
	if (node.type === 'JSXExpressionContainer' || node.type === 'TSRXExpression') return true;
	if (node.type !== 'Element' && node.type !== 'JSXElement') return false;
	const tagName = getElementTagName(node);
	return (
		!!tagName &&
		isHostTagName(tagName) &&
		asNodes(node.children).every(isPlainStaticHostSubtree)
	);
}

function isPublicComponentBody(component: AnyNode, root: AnyNode): boolean {
	const body = component.body as AnyNode | undefined;
	if (!body) return false;
	const templateReturns: AnyNode[] = [];
	const allReturns: AnyNode[] = [];
	const visit = (node: AnyNode): void => {
		if (node !== body && isFunctionNode(node)) return;
		if (node.type === 'ReturnStatement') {
			allReturns.push(node);
			const argument = node.argument as AnyNode | undefined;
			if (argument && isPublicRoot(argument)) templateReturns.push(node);
			return;
		}
		for (const child of childNodes(node)) visit(child);
	};
	visit(body);
	if (templateReturns.length > 1) return false;
	if (
		allReturns.some((statement) => {
			const argument = statement.argument as AnyNode | undefined;
			return argument !== root && !isEmptyGuardReturn(argument);
		})
	)
		return false;

	for (const statement of childNodes(body)) {
		if (statement.type !== 'VariableDeclaration') continue;
		const declarations = asNodes(statement.declarations);
		if (declarations.length === 1) continue;
		if (
			declarations.some((declaration) => {
				const init = declaration.init as AnyNode | undefined;
				const callee =
					init?.type === 'CallExpression'
						? getIdentifierName(init.callee as AnyNode | undefined)
						: null;
				return callee ? publicFrameworkCalls.has(callee) : false;
			})
		)
			return false;
	}
	return true;
}

const publicFrameworkCalls = new Set(['state', 'computed', 'element', 'handler']);

function isEmptyGuardReturn(node: AnyNode | undefined): boolean {
	return (
		!node ||
		(node.type === 'Literal' && node.value === null) ||
		node.type === 'NullLiteral' ||
		(node.type === 'Identifier' && node.name === 'undefined')
	);
}

function isFunctionNode(node: AnyNode): boolean {
	return (
		node.type === 'FunctionDeclaration' ||
		node.type === 'FunctionExpression' ||
		node.type === 'ArrowFunctionExpression'
	);
}

function branchArms(node: AnyNode): AnyNode[][] {
	if (node.type === 'JSXIfExpression') {
		return [node.consequent, node.alternate].map((arm) => {
			const candidate = arm as AnyNode | undefined;
			if (!candidate) return [];
			return candidate.type === 'BlockStatement' ? asNodes(candidate.body) : [candidate];
		});
	}
	return asNodes(node.cases).map((switchCase) => asNodes(switchCase.consequent));
}

function repeatItemName(node: AnyNode): string | null {
	const left = node.left as AnyNode | undefined;
	if (!left) return null;
	if (left.type !== 'VariableDeclaration') return getIdentifierName(left);
	const [declaration] = asNodes(left.declarations);
	return getIdentifierName(declaration?.id as AnyNode | undefined);
}

// A literal-only style object owes the browser nothing: its CSS text is known
// while compiling, so it belongs in the statics rather than in a slot. A
// same-file const reference resolves through the same resolver the semantic
// pass used, so both passes agree on what the attribute lowers to.
function staticStyleObjectCss(
	name: string,
	expression: AnyNode | undefined,
	context: CollectionContext,
): string | null {
	if (name !== 'style' || !expression) return null;
	let objectNode = expression;
	if (expression.type === 'Identifier') {
		const identifier = getIdentifierName(expression);
		const resolved = identifier
			? markupStyleConstResolver(context).resolveObject(identifier, expression.start ?? 0)
			: null;
		if (!resolved?.object) return null;
		objectNode = resolved.object;
	} else if (expression.type !== 'ObjectExpression') {
		return null;
	}
	const lowering = lowerStyleObject(objectNode, context.source, {
		resolver: markupStyleConstResolver(context),
		usagePos: expression.start ?? 0,
		referenced: objectNode !== expression,
	});
	return lowering?.kind === 'static' ? lowering.css : null;
}

function markupStyleConstResolver(context: CollectionContext): StyleConstResolver {
	context.styleConstResolver ??= createStyleConstResolver(context.source, context.filename);
	return context.styleConstResolver;
}

// A bare attribute is already the present-with-no-value form, so it reports the
// empty string rather than the boolean a `{true}` value would.
function staticAttributeValue(
	value: AnyNode | undefined,
	expression: AnyNode | undefined,
): { readonly value: unknown } | null {
	if (!value) return { value: '' };
	if (value.type === 'Literal' && typeof value.value !== 'object') return { value: value.value };
	if (expression?.type === 'Literal' && typeof expression.value !== 'object') {
		return { value: expression.value };
	}
	return null;
}

// Both arms of a literal conditional are strings, so the attribute is present
// whichever one wins and its name can stay in the statics.
function isAlwaysPresentValue(expression: AnyNode): boolean {
	if (expression.type !== 'ConditionalExpression') return false;
	return [expression.consequent, expression.alternate].every((arm) => {
		const node = arm as AnyNode | undefined;
		return node?.type === 'Literal' && (typeof node.value === 'string' || typeof node.value === 'number');
	});
}

// The compile-time half of the presence rule marklessAttributeValue owns for
// values only the runtime sees; both halves must agree.
function staticAttributeText(name: string, value: unknown): string | null {
	if (value === null || value === undefined || value === false) return null;
	if (value === true) return name.startsWith('aria-') || name.startsWith('data-') ? 'true' : '';
	return String(value);
}
