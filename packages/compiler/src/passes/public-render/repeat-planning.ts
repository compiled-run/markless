import { isEventAttribute, normalizeEventName } from '@tsrx/core';
import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import {
	getElementAttributes,
	getElementTagName,
	isHostTagName,
	isIgnorableStaticTextNode as isIgnorableTextNode,
	isPlainHostTemplateNode,
	isStaticTextNode,
	unwrapExpressionContainer,
} from '../../ast/tsrx.ts';
import {
	resolveGraphPath,
	semanticAliasMap,
	splitStaticGraphPath,
} from '../../artifact-helpers/graph-paths.ts';
import type {
	PayloadKeyedRepeat,
	PlannedSymbol,
	PublicRenderPlanClassWrite,
	PublicRenderPlanEventControl,
	PublicRenderPlanKeyedRepeat,
	PublicRenderPlanRepeatGate,
	PublicRenderPlanTextWrite,
	PublicRenderPlanUnsupportedReason,
	SemanticGraphBinding,
} from '../../artifacts.ts';
import { eventHandlerExpressions, singleRowRoot, staticHtml } from './template.ts';
import type { AssignedHosts } from './host-locators.ts';

export function countPlanRowElements(node: AnyNode): number {
	const isElement = node.type === 'Element' || node.type === 'JSXElement' ? 1 : 0;
	return asNodes(node.children).reduce(
		(total, child) => total + countPlanRowElements(child),
		isElement,
	);
}

export function supportedRepeatGate(input: {
	readonly aliases: ReturnType<typeof semanticAliasMap>;
	readonly assignedHosts: AssignedHosts;
	readonly bindings: ReadonlyMap<string, SemanticGraphBinding>;
	readonly payloadRepeat: PayloadKeyedRepeat;
	readonly repeatNode: AnyNode;
	readonly semanticRepeat: SemanticKeyedRepeat;
	readonly source: string;
	readonly symbols: ReadonlyArray<PlannedSymbol>;
}): PublicRenderPlanRepeatGate {
	const unsupportedReason = (reason: PublicRenderPlanUnsupportedReason) =>
		({
			repeatId: input.payloadRepeat.id,
			supported: false,
			reason,
		}) as const;

	const parent = input.assignedHosts.nodeByHostId.get(input.payloadRepeat.parentHostNodeId);
	if (!parent) return unsupportedReason('repeat-parent-locator-missing');

	if (!parentContainsOnlyRepeat(parent, input.repeatNode)) {
		return unsupportedReason('repeat-parent-must-contain-only-repeat');
	}

	const row = singleRowRoot(input.repeatNode);
	if (!row) return unsupportedReason('single-row-root-required');

	if (containsNestedRepeat(row)) return unsupportedReason('nested-repeat-unsupported');

	const rowPlan = collectRowPlan({
		aliases: input.aliases,
		assignedHosts: input.assignedHosts,
		bindings: input.bindings,
		indexName: input.semanticRepeat.indexName,
		itemName: input.semanticRepeat.itemName,
		keyPath: input.payloadRepeat.keyPath,
		repeatId: input.payloadRepeat.id,
		row,
		source: input.source,
		symbols: input.symbols,
	});
	if (!rowPlan) {
		// Rows containing component invocations get their own reason so the
		// diagnostic can explain the component-row rules (D4) instead of the
		// generic binding guidance.
		return unsupportedReason(
			containsComponentTag(row) ? 'row-component-content-unsupported' : 'unsupported-row-binding',
		);
	}

	if (rowPlan.usesIndex || input.semanticRepeat.keySource === input.semanticRepeat.indexName) {
		return rowPlan.hasComponents
			? { repeatId: input.payloadRepeat.id, supported: true, ssrOnly: true, componentRows: true }
			: { repeatId: input.payloadRepeat.id, supported: true, ssrOnly: true };
	}
	return rowPlan.hasComponents
		? { repeatId: input.payloadRepeat.id, supported: true, componentRows: true }
		: { repeatId: input.payloadRepeat.id, supported: true };
}

// The @empty block renders when the collection is empty. Only plain-host
// static content compiles to a template; anything richer keeps the current
// blank-parent behavior until specified.
function repeatEmptyTemplateHtml(repeatNode: AnyNode): string | null {
	const emptyBlock = repeatNode.empty as AnyNode | undefined;
	if (!emptyBlock) return null;
	const children = asNodes(emptyBlock.body).filter((child) => !isIgnorableTextNode(child));
	if (children.length === 0 || children.some((child) => !isPlainHostTemplateNode(child))) {
		return null;
	}
	const html = children
		.map((child) => staticHtml(child, { expressionText: ' ', omitForExpressions: false }))
		.join('');
	return html || null;
}

export function planKeyedRepeat(input: {
	readonly payloadRepeat: PayloadKeyedRepeat;
	readonly parentLocator: PublicRenderPlanKeyedRepeat['parentLocator'];
	readonly parentPath: ReadonlyArray<number>;
	readonly row: AnyNode;
	readonly repeatNode: AnyNode;
	readonly rowPlan: RowPlan;
	readonly semanticRepeat: SemanticKeyedRepeat;
	readonly source: string;
}): PublicRenderPlanKeyedRepeat {
	return {
		repeatId: input.payloadRepeat.id,
		parentHostNodeId: input.payloadRepeat.parentHostNodeId,
		parentLocator: input.parentLocator,
		parentPath: input.parentPath,
		...(input.payloadRepeat.rowHostNodeId
			? { rowHostNodeId: input.payloadRepeat.rowHostNodeId }
			: {}),
		itemName: input.semanticRepeat.itemName,
		collectionGraphNodeId: input.payloadRepeat.collectionGraphNodeId,
		collectionPath: input.payloadRepeat.collectionPath,
		keyPath: input.payloadRepeat.keyPath,
		rowTemplateHtml: staticHtml(input.row, {
			expressionText: ' ',
			omitForExpressions: false,
		}),
		emptyTemplateHtml: repeatEmptyTemplateHtml(input.repeatNode),
		rowElementCount: countPlanRowElements(input.row),
		textWrites: input.rowPlan.textWrites,
		classWrites: input.rowPlan.classWrites,
		eventControls: input.rowPlan.eventControls,
	};
}

export type RowAttributeWrite = {
	readonly name: string;
	readonly source: string;
	readonly hostPath: ReadonlyArray<number>;
};

export type RowPlan = {
	readonly textWrites: ReadonlyArray<PublicRenderPlanTextWrite>;
	readonly classWrites: ReadonlyArray<PublicRenderPlanClassWrite>;
	readonly eventControls: ReadonlyArray<PublicRenderPlanEventControl>;
	readonly attributeWrites: ReadonlyArray<RowAttributeWrite>;
	readonly usesIndex: boolean;
	// The row invokes components (markup-only, item-scope props). Emitters must
	// execute the component per row instead of treating the row as plain hosts.
	readonly hasComponents: boolean;
};

// True when the expression's identifier reads are limited to the repeat item,
// the optional index, and the page's props (render-constant per instance).
// Static member property names are not reads.
function readsOnlyItemScope(node: AnyNode, isRowStaticRead: (name: string) => boolean): boolean {
	let ok = true;
	const visit = (candidate: AnyNode | undefined): void => {
		if (!candidate || !ok) return;
		if (candidate.type === 'Identifier') {
			const name = getIdentifierName(candidate);
			if (name && !isRowStaticRead(name)) ok = false;
			return;
		}
		if (candidate.type === 'MemberExpression' && candidate.computed !== true) {
			visit(candidate.object as AnyNode | undefined);
			return;
		}
		if (candidate.type === 'Property' && candidate.computed !== true) {
			visit(candidate.value as AnyNode | undefined);
			return;
		}
		for (const child of childNodes(candidate)) visit(child);
	};
	visit(node);
	return ok;
}

export function collectRowPlan(input: {
	readonly aliases: ReturnType<typeof semanticAliasMap>;
	readonly assignedHosts: AssignedHosts;
	readonly bindings: ReadonlyMap<string, SemanticGraphBinding>;
	readonly indexName?: string;
	readonly itemName: string;
	readonly keyPath: ReadonlyArray<string>;
	readonly repeatId: string;
	readonly row: AnyNode;
	readonly source: string;
	readonly symbols: ReadonlyArray<PlannedSymbol>;
}): RowPlan | null {
	const textWrites: PublicRenderPlanTextWrite[] = [];
	const classWrites: PublicRenderPlanClassWrite[] = [];
	const eventControls: PublicRenderPlanEventControl[] = [];
	const attributeWrites: RowAttributeWrite[] = [];
	// Row-static reads: the item, the index, and the page's props (aliases like
	// a destructured \`params\` resolve through the graph). Props are constant
	// for the page render (route params in row hrefs), and pages with props
	// never take the direct-DOM row path, so no reactive wiring is owed.
	const isRowStaticRead = (name: string): boolean => {
		if (name === input.itemName || name === input.indexName) return true;
		const resolved = resolveGraphPath(name, input.bindings, input.aliases);
		return resolved?.binding.kind === 'prop';
	};
	let usesIndex = false;
	// A component renders an unknown number of elements, so row-relative host
	// paths AFTER one (in document order) cannot be trusted at runtime. Row
	// EVENTS resolve their host path against the live row DOM, so they must
	// come before any component. Text/class/attribute writes only feed the
	// direct-DOM row path, which component rows never use (component edges
	// exclude the direct module), so they stay plannable anywhere in the row.
	let sawComponent = false;
	let hasComponents = false;

	const visitElement = (node: AnyNode, hostPath: ReadonlyArray<number>): boolean => {
		// Component invocations render markup only: props/children limited to the
		// repeat item (and index) scope, no event/attach/el props. The SSR/CSR
		// row mappers execute the component per row; anything richer is refused
		// (the row-child helper also fail-closes on interactive child output).
		const tagName = getElementTagName(node);
		if (tagName && !isHostTagName(tagName)) {
			if (hostPath.length === 0) return false; // the row root anchors row identity
			if (!componentRowInvocationSupported(node, isRowStaticRead)) {
				return false;
			}
			sawComponent = true;
			hasComponents = true;
			return true;
		}
		const hostNodeId = input.assignedHosts.hostIdByNode.get(node);

		for (const attribute of getElementAttributes(node)) {
			const attributeName = getIdentifierName(attribute.name as AnyNode | undefined);
			if (!attributeName) return false;

			const expression = unwrapExpressionContainer(attribute.value as AnyNode | undefined);
			if (attributeName === 'class' && expression && expression.type !== 'Literal') {
				const binding = classWritePlan({
					aliases: input.aliases,
					bindings: input.bindings,
					expression,
					hostPath,
					itemName: input.itemName,
					source: input.source,
				});
				if (!binding) return false;
				classWrites.push(binding);
				continue;
			}

			if (isEventAttribute(attributeName)) {
				if (!hostNodeId || !expression || sawComponent) return false;

				for (const handler of eventHandlerExpressions(expression)) {
					const eventName = normalizeEventName(attributeName);
					const handlerSource = expressionSource(handler, input.source);
					const symbol = input.symbols.find(
						(symbol) =>
							symbol.kind === 'event-handler' &&
							symbol.hostNodeId === hostNodeId &&
							symbol.eventName === eventName &&
							symbol.source === handlerSource,
					);
					if (!symbol) return false;

					eventControls.push({
						eventName,
						hostPath,
						handlerSource,
						symbolId: symbol.id,
						itemContext: {
							kind: 'keyed-repeat-item',
							repeatId: input.repeatId,
							itemName: input.itemName,
							keyPath: input.keyPath,
						},
					});
				}
				continue;
			}

			if (attributeName === 'attach' || attributeName === 'el') return false;
			if (expression && expression.type !== 'Literal') {
				// Item-derived dynamic attributes (href={'#/r/' + item.id},
				// data-testid={...}) are static per row instance: the SSR/CSR row
				// mappers evaluate them with the item in scope, and client row
				// rebuilds re-evaluate the same template. Reject expressions that
				// read anything beyond the item/index (those would need reactive
				// attribute wiring rows don't have yet).
				if (!readsOnlyItemScope(expression, isRowStaticRead)) return false;
				attributeWrites.push({
					name: attributeName,
					source: expressionSource(expression, input.source) ?? '',
					hostPath,
				});
				continue;
			}
		}

		let childDomIndex = 0;
		for (const child of asNodes(node.children)) {
			if (isIgnorableTextNode(child)) continue;
			if (isStaticTextNode(child)) {
				childDomIndex++;
				continue;
			}

			if (child.type === 'JSXExpressionContainer' || child.type === 'TSRXExpression') {
				const expression = child.expression as AnyNode | undefined;
				if (!expression) return false;

				const source = expressionSource(expression, input.source);
				const itemPath = itemPathFromSource(input.itemName, source);
				if (!itemPath) {
					// A bare index read renders in SSR rows (the map callback binds
					// it) but has no direct-DOM update plan, so it only flags the
					// row as ssr-only instead of rejecting the repeat.
					if (input.indexName && source === input.indexName) {
						usesIndex = true;
						childDomIndex++;
						continue;
					}
					return false;
				}

				textWrites.push({
					source,
					itemPath,
					nodePath: [...hostPath, childDomIndex],
				});
				childDomIndex++;
				continue;
			}

			if (child.type === 'Element' || child.type === 'JSXElement') {
				if (!visitElement(child, [...hostPath, childDomIndex])) return false;
				childDomIndex++;
				continue;
			}

			return false;
		}

		return true;
	};

	if (!visitElement(input.row, [])) return null;

	return {
		textWrites,
		classWrites,
		eventControls,
		attributeWrites,
		usesIndex,
		hasComponents,
	};
}

// True when a component invocation inside a repeat row stays inside the
// markup-only contract: no event/attach/el props, and every prop or children
// expression reads only the repeat item (and index). Nested components inside
// the children stay unsupported (their edges would need per-row child wiring).
function componentRowInvocationSupported(
	node: AnyNode,
	isRowStaticRead: (name: string) => boolean,
): boolean {
	for (const attribute of getElementAttributes(node)) {
		const attributeName = getIdentifierName(attribute.name as AnyNode | undefined);
		if (!attributeName) return false;
		if (
			isEventAttribute(attributeName) ||
			attributeName === 'attach' ||
			attributeName === 'el'
		) {
			return false;
		}
		const expression = unwrapExpressionContainer(attribute.value as AnyNode | undefined);
		if (
			expression &&
			expression.type !== 'Literal' &&
			!readsOnlyItemScope(expression, isRowStaticRead)
		) {
			return false;
		}
	}

	const childSupported = (child: AnyNode): boolean => {
		if (isIgnorableTextNode(child) || isStaticTextNode(child)) return true;
		if (child.type === 'JSXExpressionContainer' || child.type === 'TSRXExpression') {
			const expression = child.expression as AnyNode | undefined;
			return !!expression && readsOnlyItemScope(expression, isRowStaticRead);
		}
		if (child.type === 'Element' || child.type === 'JSXElement') {
			const tagName = getElementTagName(child);
			if (!tagName || !isHostTagName(tagName)) return false;
			for (const attribute of getElementAttributes(child)) {
				const attributeName = getIdentifierName(attribute.name as AnyNode | undefined);
				if (!attributeName) return false;
				if (
					isEventAttribute(attributeName) ||
					attributeName === 'attach' ||
					attributeName === 'el'
				) {
					return false;
				}
				const expression = unwrapExpressionContainer(attribute.value as AnyNode | undefined);
				if (
					expression &&
					expression.type !== 'Literal' &&
					!readsOnlyItemScope(expression, isRowStaticRead)
				) {
					return false;
				}
			}
			return asNodes(child.children).every(childSupported);
		}
		return false;
	};
	return asNodes(node.children).every(childSupported);
}

export function containsComponentTag(node: AnyNode): boolean {
	if (node.type === 'Element' || node.type === 'JSXElement') {
		const tagName = getElementTagName(node);
		if (tagName && !isHostTagName(tagName)) return true;
	}
	return childNodes(node).some(containsComponentTag);
}

function classWritePlan(input: {
	readonly aliases: ReturnType<typeof semanticAliasMap>;
	readonly bindings: ReadonlyMap<string, SemanticGraphBinding>;
	readonly expression: AnyNode;
	readonly hostPath: ReadonlyArray<number>;
	readonly itemName: string;
	readonly source: string;
}): PublicRenderPlanClassWrite | null {
	if (input.expression.type !== 'ConditionalExpression') return null;

	const test = input.expression.test as AnyNode | undefined;
	if (!test || test.type !== 'BinaryExpression') return null;
	if (test.operator !== '===' && test.operator !== '==') return null;

	const left = test.left as AnyNode | undefined;
	const right = test.right as AnyNode | undefined;
	if (!left || !right) return null;

	const operands =
		classBindingOperands(left, right, input) ?? classBindingOperands(right, left, input);
	if (!operands) return null;

	const trueClass = stringLiteral(input.expression.consequent as AnyNode | undefined);
	const falseClass = stringLiteral(input.expression.alternate as AnyNode | undefined);
	if (trueClass === null || falseClass === null) return null;

	return {
		source: expressionSource(input.expression, input.source),
		hostPath: input.hostPath,
		stateGraphNodeId: operands.graph.binding.id,
		statePath: operands.graph.path,
		itemPath: operands.itemPath,
		trueClass,
		falseClass,
	};
}

function classBindingOperands(
	graphExpression: AnyNode,
	itemExpression: AnyNode,
	input: {
		readonly aliases: ReturnType<typeof semanticAliasMap>;
		readonly bindings: ReadonlyMap<string, SemanticGraphBinding>;
		readonly itemName: string;
		readonly source: string;
	},
): {
	readonly graph: {
		readonly binding: SemanticGraphBinding;
		readonly path: ReadonlyArray<string>;
	};
	readonly itemPath: ReadonlyArray<string>;
} | null {
	const graph = resolveGraphPath(
		expressionSource(graphExpression, input.source),
		input.bindings,
		input.aliases,
	);
	if (!graph || graph.binding.kind !== 'state') return null;

	const itemPath = itemPathFromSource(
		input.itemName,
		expressionSource(itemExpression, input.source),
	);
	if (!itemPath) return null;

	return { graph, itemPath };
}

function stringLiteral(node: AnyNode | undefined): string | null {
	return node?.type === 'Literal' && typeof node.value === 'string' ? node.value : null;
}

function itemPathFromSource(itemName: string, source: string): ReadonlyArray<string> | null {
	const segments = splitStaticGraphPath(source);
	if (segments[0] !== itemName || segments.length === 1) return null;

	return segments.slice(1);
}

export function parentContainsOnlyRepeat(parent: AnyNode, repeat: AnyNode): boolean {
	const meaningfulChildren = asNodes(parent.children).filter(
		(child) => !isIgnorableTextNode(child),
	);
	return meaningfulChildren.length === 1 && meaningfulChildren[0] === repeat;
}

export function containsNestedRepeat(node: AnyNode): boolean {
	const visit = (child: AnyNode | null | undefined): boolean => {
		if (!child || typeof child !== 'object') return false;
		if (child.type === 'JSXForExpression') return true;
		return childNodes(child).some(visit);
	};

	return childNodes(node).some(visit);
}
