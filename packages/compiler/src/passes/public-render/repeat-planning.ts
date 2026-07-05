import { isEventAttribute, normalizeEventName, parseModule } from '@tsrx/core';
import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import {
	escapeAttribute,
	escapeHtml,
	getComponentFunction,
	getDynamicTagExpression,
	getElementAttributes,
	getElementTagName,
	isHostTagName,
	isIgnorableStaticTextNode as isIgnorableTextNode,
	isPlainHostTemplateNode,
	isSpreadAttribute,
	isStaticTextNode,
	staticTextValue,
	trimmedStaticTextValue,
	unwrapExpressionContainer,
} from '../../ast/tsrx.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
	splitStaticGraphPath,
} from '../../artifact-helpers/graph-paths.ts';
import {
	childrenOpacityDiagnostic,
	conditionalComponentRootDiagnostic,
	noRenderableRootDiagnostic,
	repeatRowStateScopeUnsupportedDiagnostic,
	undeclaredTemplateReadDiagnostic,
	unsupportedRenderBodyDiagnostic,
	unsupportedRenderConstructDiagnostic,
	unsupportedRenderRootDiagnostic,
} from './diagnostics.ts';
import { collectStyleScopes } from './style-scopes.ts';
import type {
	PayloadKeyedRepeat,
	PlannedSymbol,
	PublicRenderPlanArtifact,
	PublicRenderPlanAsyncBoundaryGate,
	PublicRenderPlanBranchArmPart,
	PublicRenderPlanBranchGate,
	PublicRenderPlanClassWrite,
	PublicRenderPlanEventControl,
	PublicRenderPlanInput,
	PublicRenderPlanKeyedRepeat,
	PublicRenderPlanRepeatGate,
	PublicRenderPlanStaticEventControl,
	PublicRenderPlanStaticTextWrite,
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
	if (!rowPlan) return unsupportedReason('unsupported-row-binding');

	return rowPlan.usesIndex || input.semanticRepeat.keySource === input.semanticRepeat.indexName
		? { repeatId: input.payloadRepeat.id, supported: true, ssrOnly: true }
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

export type RowPlan = {
	readonly textWrites: ReadonlyArray<PublicRenderPlanTextWrite>;
	readonly classWrites: ReadonlyArray<PublicRenderPlanClassWrite>;
	readonly eventControls: ReadonlyArray<PublicRenderPlanEventControl>;
	readonly usesIndex: boolean;
};

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
	let usesIndex = false;

	const visitElement = (node: AnyNode, hostPath: ReadonlyArray<number>): boolean => {
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
				if (!hostNodeId || !expression) return false;

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
			if (expression && expression.type !== 'Literal') return false;
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
		usesIndex,
	};
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
