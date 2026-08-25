import { isEventAttribute } from 'yuku-tsrx';
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
	markupInterpolationExpression,
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
import {
	anchorElementHandleDynamicStyleDiagnostic,
	branchElseSpellingDiagnostic,
	idrefElementHandleIdConflictDiagnostic,
} from './diagnostics.ts';
import { anchorStyleProperty, isIdrefAttribute } from './idref-attributes.ts';
import { OVERLAY_DOM_ATTRIBUTE, overlayLiteralValue } from './overlay-attribute.ts';
import {
	createStyleConstResolver,
	lowerStyleObject,
	type StyleConstResolver,
} from './style-object.ts';
import { componentMarkupRoot } from '../public-render/component-markup-root.ts';
import { collectStyleScopes } from '../public-render/style-scopes.ts';
import { propsRestSignature } from './spread-event-guard.ts';
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
	// Names the component being emitted destructured out of its props, so a
	// spread of the rest binding can say what it can never carry.
	destructuredNames: ReadonlyArray<string>;
	// The rest binding those names were taken out of. Only a spread of THIS
	// identifier carries consumer props; any other object is the author's own.
	restName: string | null;
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
		destructuredNames: [],
		restName: null,
	};
	const components: Array<{
		readonly name: string;
		readonly node: AnyNode;
		readonly root: AnyNode;
		readonly exported: boolean;
		readonly rootEligible: boolean;
	}> = [];

	for (const statement of asNodes(input.ast.body)) {
		const component = getComponentFunction(statement);
		if (!component) continue;
		const root = componentMarkupRoot(component.node);
		if (!root) continue;
		components.push({
			name: component.name,
			node: component.node,
			root,
			rootEligible: isPublicRoot(root) && isPublicComponentBody(component.node, root),
			exported:
				statement.type === 'ExportNamedDeclaration' ||
				statement.type === 'ExportDefaultDeclaration',
		});
	}

	for (const component of components) {
		context.styleScopeClass =
			collectStyleScopes(component.root, input.filename).styleScopes[0]?.scopeId ?? null;
		const restSignature = propsRestSignature(component.node);
		context.destructuredNames = [...(restSignature?.destructuredNames ?? [])];
		context.restName = restSignature?.restName ?? null;
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

// `overlay={false}` is the absent case and lowers to nothing; a non-literal never
// reaches markup collection because the semantic pass refuses it first.
function isElevated(attribute: AnyNode): boolean {
	const value = attribute.value as AnyNode | undefined;
	return overlayLiteralValue(value, unwrapExpressionContainer(value)) === true;
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

function emitTextSlot(
	expression: AnyNode | undefined,
	path: ReadonlyArray<number>,
	builder: ChunkBuilder,
	context: CollectionContext,
	repeat: { readonly id: string; readonly itemName: string } | null,
): number {
	if (!expression) return 0;
	addAnchorSlot(
		builder,
		{
			kind: 'text',
			residue: expressionResidue(expression, context, repeat, builder.componentName),
			...(getIdentifierName(expression) === 'children' ? { raw: true } : {}),
		},
		path,
	);
	return 1;
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
		return emitTextSlot(node.expression as AnyNode | undefined, path, builder, context, repeat);
	}

	const interpolated = markupInterpolationExpression(node);
	if (interpolated) return emitTextSlot(interpolated, path, builder, context, repeat);

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
		const projectionChunkId =
			projected.length > 0
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
	// The element an IDREF names carries the minted id. It is written before the
	// authored attributes so the pair is emitted from one record, never from an
	// author-visible string.
	const mintedIdHandle = mintedElementIdHandle(context, node, elementAttributes);
	if (mintedIdHandle) {
		append(builder, ' id="');
		addSlot(builder, {
			kind: 'attribute',
			name: 'id',
			coordinate: { kind: 'child-index', path },
			residue: { kind: 'element-handle-id', handleGraphNodeId: mintedIdHandle },
			alwaysPresent: true,
		});
		append(builder, '"');
	}
	// One residue for the whole style attribute when a CSS anchor position named
	// a handle here: the consumer's style rides inside it rather than in a second
	// style attribute the parser would drop.
	const anchorStyle = anchorStyleResidue(context, node, elementAttributes);
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
			if (expression) {
				// A name the part took out of its own props can never be inside the
				// rest binding, so spreading `rest` must not write it. Any other
				// object is one the author built: it keeps every key it carries.
				const spreadsRestBinding =
					context.restName !== null && getIdentifierName(expression) === context.restName;
				addSlot(builder, {
					kind: 'spread-attributes',
					coordinate: { kind: 'child-index', path },
					residue: expressionResidue(expression, context, repeat, builder.componentName),
					excludeNames: spreadsRestBinding
						? [...new Set([...declaredAttributeNames, ...context.destructuredNames])]
						: declaredAttributeNames,
					...(context.destructuredNames.length > 0
						? { destructuredNames: context.destructuredNames }
						: {}),
				});
			}
			continue;
		}
		const name = getIdentifierName(attribute.name as AnyNode | undefined);
		// overlay lowers to one normalized valueless attribute, never to whatever
		// staticAttributeValue would have made of the authored spelling: bare and
		// `={true}` both write ` overlay=""`, `={false}` writes nothing, and a
		// non-literal never reaches here because the semantic pass refuses it.
		if (name === OVERLAY_DOM_ATTRIBUTE) {
			if (isElevated(attribute)) append(builder, ` ${OVERLAY_DOM_ATTRIBUTE}=""`);
			continue;
		}
		if (
			!name ||
			isEventAttribute(name) ||
			name === 'attach' ||
			name === 'el' ||
			// A CSS anchor position is not a DOM attribute: it lowers to the one
			// style slot below, so writing it here would leak `anchorname="..."`.
			anchorStyleProperty(name) !== undefined ||
			(name === 'style' && anchorStyle !== null)
		)
			continue;
		const idrefHandle = elementHandleIdrefTarget(context, node, name);
		if (idrefHandle) {
			// A shared() handle names an element some OTHER part of the widget
			// renders, and whether that part was placed is not a build-time fact of
			// this file. So the slot writes the whole attribute or nothing, rather
			// than baking the name into the statics around an id that may name
			// nothing. A component-local handle is bound in this same markup, so it
			// keeps the statics it always had.
			const omittable = idrefHandle.startsWith('shared:');
			if (!omittable) append(builder, ` ${name}="`);
			addSlot(builder, {
				kind: 'attribute',
				name,
				coordinate: { kind: 'child-index', path },
				residue: {
					kind: 'element-handle-id',
					handleGraphNodeId: idrefHandle,
					...(omittable ? { idref: true as const } : {}),
				},
				...(omittable ? {} : { alwaysPresent: true as const }),
			});
			if (!omittable) append(builder, '"');
			continue;
		}
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
				append(
					builder,
					` ${name}="${escapeAttribute(name === 'class' && context.styleScopeClass ? `${text} ${context.styleScopeClass}` : text)}"`,
				);
			continue;
		}
		if (!expression) continue;
		// In a scoped module every element carries the scope class, so a dynamic
		// class is always present and the constant rides the statics after the slot.
		const scopeSuffix = name === 'class' ? context.styleScopeClass : null;
		// A value that cannot be absent keeps its name in the statics; otherwise
		// the slot emits the whole attribute so the runtime decides presence.
		const alwaysPresent = isAlwaysPresentValue(expression) || scopeSuffix !== null;
		if (alwaysPresent) append(builder, ` ${name}="`);
		addSlot(builder, {
			kind: 'attribute',
			name,
			coordinate: { kind: 'child-index', path },
			residue: expressionResidue(expression, context, repeat, builder.componentName),
			...(alwaysPresent ? { alwaysPresent: true } : {}),
			...(name === 'class' && repeat
				? {
						directClassMatch: directClassMatch(
							expression,
							context,
							repeat,
							builder.componentName,
							context.styleScopeClass,
						),
					}
				: {}),
		});
		if (alwaysPresent) append(builder, scopeSuffix ? ` ${scopeSuffix}"` : '"');
	}
	if (anchorStyle) {
		append(builder, ' style="');
		addSlot(builder, {
			kind: 'attribute',
			name: 'style',
			coordinate: { kind: 'child-index', path },
			residue: anchorStyle,
			alwaysPresent: true,
		});
		append(builder, '"');
	}
	if (context.styleScopeClass && !classSeen)
		append(builder, ` class="${context.styleScopeClass}"`);
	append(builder, '>');
	emitNodes(asNodes(node.children), [...path, 0], builder, context, repeat);
	append(builder, `</${tagName}>`);
	return 1;
}

/**
 * The one inline style value for an element whose CSS anchor positions named
 * element() handles, consumer declarations included.
 *
 * One residue rather than one per declaration, because an element carries
 * exactly one style attribute: two would leave the browser keeping the first
 * and dropping the rest without saying so, and the dynamic-host path writes
 * attributes by name, where a second `style` really would clobber. Composing
 * here also fixes the precedence: the consumer's declarations come first, so
 * the anchor names - which are plumbing, not design - win the cascade.
 *
 * Returns null when this element declares no anchor, and also when it declares
 * one alongside a style the compiler cannot read at compile time, which is
 * refused rather than merged in the browser.
 */
function anchorStyleResidue(
	context: CollectionContext,
	node: AnyNode,
	attributes: ReadonlyArray<AnyNode>,
): SemanticMarkupResidue | null {
	const hostNodeId = context.hostIds.get(node);
	if (!hostNodeId) return null;
	const anchors = context.graph.elementHandleAnchors
		.filter((anchor) => anchor.hostNodeId === hostNodeId)
		.slice()
		.sort((left, right) => left.order - right.order);
	if (anchors.length === 0) return null;
	const declarations = anchors.flatMap((anchor) => {
		const property = anchorStyleProperty(anchor.attributeName);
		return property ? [{ property, handleGraphNodeId: anchor.handleGraphNodeId }] : [];
	});
	if (declarations.length === 0) return null;

	const styleAttribute = attributes.find(
		(candidate) =>
			!isSpreadAttribute(candidate) &&
			getIdentifierName(candidate.name as AnyNode | undefined) === 'style',
	);
	let staticStyle = '';
	if (styleAttribute) {
		const value = styleAttribute.value as AnyNode | undefined;
		const expression = unwrapExpressionContainer(value);
		const objectCss = staticStyleObjectCss('style', expression, context);
		if (objectCss !== null) staticStyle = objectCss;
		else {
			const literal = staticAttributeValue(value, expression);
			const text = literal ? staticAttributeText('style', literal.value) : null;
			if (text === null) {
				context.graph.diagnostics.push(
					anchorElementHandleDynamicStyleDiagnostic({
						attributeName: anchors[0]!.attributeName,
						span: sourceSpan(styleAttribute, context.filename),
					}),
				);
				return null;
			}
			staticStyle = text;
		}
	}
	// The lowered style object ends in `;`; the composed value supplies its own
	// separators, so a trailing one would emit an empty declaration.
	const consumerStyle = staticStyle.replace(/;\s*$/, '');
	return {
		kind: 'element-handle-anchor-style',
		declarations,
		...(consumerStyle ? { staticStyle: consumerStyle } : {}),
	};
}

/**
 * An IDREF attribute whose value resolved to an element() handle is a recorded
 * relationship, not a value binding: its value is the id minted for the handle,
 * so the slot renders from the record rather than from the authored expression.
 * Returns the handle's graph node, or undefined when this attribute is an
 * ordinary value binding.
 */
function elementHandleIdrefTarget(
	context: CollectionContext,
	node: AnyNode,
	name: string,
): string | undefined {
	if (!isIdrefAttribute(name)) return undefined;
	const hostNodeId = context.hostIds.get(node);
	if (!hostNodeId) return undefined;
	return context.graph.elementHandleIdrefs.find(
		(idref) => idref.hostNodeId === hostNodeId && idref.attributeName === name,
	)?.handleGraphNodeId;
}

/**
 * The handle whose minted id this element must carry, because at least one
 * IDREF position named it. An authored id on the same element would emit two id
 * attributes, so that is refused rather than silently resolved.
 */
function mintedElementIdHandle(
	context: CollectionContext,
	node: AnyNode,
	attributes: ReadonlyArray<AnyNode>,
): string | undefined {
	const hostNodeId = context.hostIds.get(node);
	if (!hostNodeId) return undefined;
	const idref = context.graph.elementHandleIdrefs.find(
		(candidate) => candidate.boundHostNodeId === hostNodeId,
	);
	if (!idref) return undefined;
	const authoredId = attributes.find(
		(attribute) =>
			!isSpreadAttribute(attribute) &&
			getIdentifierName(attribute.name as AnyNode | undefined) === 'id',
	);
	if (authoredId) {
		context.graph.diagnostics.push(
			idrefElementHandleIdConflictDiagnostic({
				handleName: idref.handleName,
				span: sourceSpan(authoredId, context.filename),
			}),
		);
		return undefined;
	}
	return idref.handleGraphNodeId;
}

function directClassMatch(
	expression: AnyNode,
	context: CollectionContext,
	repeat: { readonly id: string; readonly itemName: string },
	componentName: string,
	styleScopeClass: string | null,
) {
	if (expression.type !== 'ConditionalExpression') return undefined;
	const test = expression.test as AnyNode | undefined;
	if (test?.type !== 'BinaryExpression' || (test.operator !== '===' && test.operator !== '==')) {
		return undefined;
	}
	const left = expressionResidue(test.left as AnyNode, context, repeat, componentName);
	const right = expressionResidue(test.right as AnyNode, context, repeat, componentName);
	const graph = left.kind === 'graph-read' ? left : right.kind === 'graph-read' ? right : null;
	const item = left.kind === 'repeat-item' ? left : right.kind === 'repeat-item' ? right : null;
	const consequent = expression.consequent as AnyNode | undefined;
	const alternate = expression.alternate as AnyNode | undefined;
	if (
		!graph ||
		!item ||
		consequent?.type !== 'Literal' ||
		typeof consequent.value !== 'string' ||
		alternate?.type !== 'Literal' ||
		typeof alternate.value !== 'string'
	)
		return undefined;
	return {
		stateGraphNodeId: graph.graphNodeId,
		statePath: graph.path,
		itemPath: item.path,
		trueClass: styleScopeClass ? `${consequent.value} ${styleScopeClass}` : consequent.value,
		falseClass: styleScopeClass ? `${alternate.value} ${styleScopeClass}` : alternate.value,
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
	const elementAttributes = getElementAttributes(node);
	const anchorStyle = anchorStyleResidue(context, node, elementAttributes);
	for (const attribute of elementAttributes) {
		if (isSpreadAttribute(attribute)) {
			const expression = unwrapExpressionContainer(
				(attribute.argument ?? attribute.value) as AnyNode | undefined,
			);
			if (expression) {
				attributeSlots.push({
					kind: 'spread',
					residue: expressionResidue(expression, context, repeat, builder.componentName),
				});
			}
			continue;
		}
		const name = getIdentifierName(attribute.name as AnyNode | undefined);
		// Same normalized lowering as the static-host path above.
		if (name === OVERLAY_DOM_ATTRIBUTE) {
			if (isElevated(attribute)) staticAttributes[OVERLAY_DOM_ATTRIBUTE] = '';
			continue;
		}
		if (
			!name ||
			isEventAttribute(name) ||
			name === 'attach' ||
			name === 'el' ||
			anchorStyleProperty(name) !== undefined ||
			(name === 'style' && anchorStyle !== null)
		)
			continue;
		const idrefHandle = elementHandleIdrefTarget(context, node, name);
		if (idrefHandle) {
			attributeSlots.push({
				kind: 'attribute',
				name,
				residue: {
					kind: 'element-handle-id',
					handleGraphNodeId: idrefHandle,
					...(idrefHandle.startsWith('shared:') ? { idref: true as const } : {}),
				},
			});
			continue;
		}
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
				residue: expressionResidue(expression, context, repeat, builder.componentName),
			});
		}
	}
	const mintedIdHandle = mintedElementIdHandle(context, node, elementAttributes);
	if (mintedIdHandle) {
		attributeSlots.push({
			kind: 'attribute',
			name: 'id',
			residue: { kind: 'element-handle-id', handleGraphNodeId: mintedIdHandle },
		});
	}
	// The composed value carries the consumer's static style too, so it replaces
	// the static entry rather than adding a second style attribute after it.
	if (anchorStyle) attributeSlots.push({ kind: 'attribute', name: 'style', residue: anchorStyle });
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
			tag: expressionResidue(tagExpression, context, repeat, builder.componentName),
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
	let previous: AnyNode | null = null;
	for (const node of nodes) {
		if (isIgnorableStaticTextNode(node)) continue;
		if (isPlainElseSpelling(previous, node)) {
			context.graph.diagnostics.push(
				branchElseSpellingDiagnostic({ node, filename: context.filename }),
			);
		}
		previous = node;
		childIndex += emitNode(node, [...prefix, childIndex], builder, context, repeat);
	}
	return childIndex - startIndex;
}

/**
 * A plain `else` after an @if arm parses as sibling text rather than a branch,
 * so the arm silently renders as the word "else" plus escaped source. The text
 * is anchored on the preceding sibling: only text directly after a
 * JSXIfExpression can be a mis-spelled alternative.
 *
 * Two spellings fail open, and the trimmed text tells them apart from prose:
 * a bare `else` (`} else {`, `} else <p/>`, `} else {}`, or `else` on its own
 * line all trim to exactly that), and `else if (...)`, whose condition stays in
 * the text node. Prose that merely starts with the word — "else, sign in." or
 * "elsewhere" — matches neither and stays clean.
 */
const PLAIN_ELSE_TEXT = /^else$|^else\s+if\s*\(/;

function isPlainElseSpelling(previous: AnyNode | null, node: AnyNode): boolean {
	if (!previous || previous.type !== 'JSXIfExpression') return false;
	return isStaticTextNode(node) && PLAIN_ELSE_TEXT.test(staticTextValue(node).trim());
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
	componentName: string,
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
		? // Component scope only: a factory local and a component's shared-instance
			// local routinely share a name, and the instance is what markup names.
			(resolveGraphPath(
				source,
				graphBindingMap(context.graph, null),
				semanticAliasMap(context.graph, null),
			) ?? resolveSharedInstanceGraphPath(source, context.graph, componentName))
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

/** The scope class every element of this component carries, or null when it declares no <style>. */
export function componentStyleScopeClass(component: AnyNode, filename: string): string | null {
	const root = componentMarkupRoot(component);
	if (!root) return null;
	return collectStyleScopes(root, filename).styleScopes[0]?.scopeId ?? null;
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
