import { isEventAttribute, normalizeEventName, parseModule } from '@tsrx/core';
import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../ast/nodes.ts';
import { expressionSource } from '../ast/source.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
	splitStaticGraphPath,
} from '../artifact-helpers/graph-paths.ts';
import type {
	ClientEventOnlyRenderPlanArtifact,
	ClientEventOnlyRenderPlanClassBinding,
	ClientEventOnlyRenderPlanEventControl,
	ClientEventOnlyRenderPlanInput,
	ClientEventOnlyRenderPlanKeyedRepeat,
	ClientEventOnlyRenderPlanTextBinding,
	PayloadKeyedRepeat,
	PlannedSymbol,
	SemanticGraphBinding,
	SemanticKeyedRepeat,
} from '../artifacts.ts';

export function planClientEventOnlyRender(
	input: ClientEventOnlyRenderPlanInput,
): ClientEventOnlyRenderPlanArtifact {
	const ast = parseModule(input.source.source, input.source.filename) as AnyNode;
	const component = findComponent(ast);
	const root = firstComponentRoot(component);
	if (!root) {
		return emptyPlan();
	}

	const hostIds = assignHostIds(
		root,
		input.semanticGraph.hostNodes.map((host) => host.id),
	);
	const repeatNodes = keyedRepeatNodes(root);
	const bindings = graphBindingMap(input.semanticGraph);
	const aliases = semanticAliasMap(input.semanticGraph);
	const keyedRepeats = input.payloadArena.view.keyedRepeats.flatMap((payloadRepeat, index) => {
		const semanticRepeat = input.semanticGraph.keyedRepeats.find(
			(repeat) => repeat.id === payloadRepeat.id,
		);
		const repeatNode = repeatNodes[index];
		if (!semanticRepeat || !repeatNode) return [];

		const row = firstRepeatRow(repeatNode);
		if (!row) return [];

		return [
			planKeyedRepeat({
				bindings,
				aliases,
				hostIds,
				payloadRepeat,
				row,
				semanticRepeat,
				source: input.source.source,
				symbols: input.symbolResolver.symbols,
			}),
		];
	});

	return {
		passId: 'client-event-only-render-plan',
		rootTemplateHtml: staticHtml(root, { expressionText: ' ', omitForExpressions: true }),
		keyedRepeats,
		diagnostics: [],
	};
}

function emptyPlan(): ClientEventOnlyRenderPlanArtifact {
	return {
		passId: 'client-event-only-render-plan',
		rootTemplateHtml: null,
		keyedRepeats: [],
		diagnostics: [],
	};
}

function planKeyedRepeat(input: {
	readonly bindings: ReadonlyMap<string, SemanticGraphBinding>;
	readonly aliases: ReturnType<typeof semanticAliasMap>;
	readonly hostIds: ReadonlyMap<AnyNode, string>;
	readonly payloadRepeat: PayloadKeyedRepeat;
	readonly row: AnyNode;
	readonly semanticRepeat: SemanticKeyedRepeat;
	readonly source: string;
	readonly symbols: ReadonlyArray<PlannedSymbol>;
}): ClientEventOnlyRenderPlanKeyedRepeat {
	const rowPlan = collectRowPlan({
		bindings: input.bindings,
		aliases: input.aliases,
		hostIds: input.hostIds,
		itemName: input.semanticRepeat.itemName,
		row: input.row,
		source: input.source,
		symbols: input.symbols,
	});

	return {
		repeatId: input.payloadRepeat.id,
		parentHostNodeId: input.payloadRepeat.parentHostNodeId,
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
		textBindings: rowPlan.textBindings,
		classBindings: rowPlan.classBindings,
		eventControls: rowPlan.eventControls,
	};
}

function collectRowPlan(input: {
	readonly bindings: ReadonlyMap<string, SemanticGraphBinding>;
	readonly aliases: ReturnType<typeof semanticAliasMap>;
	readonly hostIds: ReadonlyMap<AnyNode, string>;
	readonly itemName: string;
	readonly row: AnyNode;
	readonly source: string;
	readonly symbols: ReadonlyArray<PlannedSymbol>;
}): {
	readonly textBindings: ReadonlyArray<ClientEventOnlyRenderPlanTextBinding>;
	readonly classBindings: ReadonlyArray<ClientEventOnlyRenderPlanClassBinding>;
	readonly eventControls: ReadonlyArray<ClientEventOnlyRenderPlanEventControl>;
} {
	const textBindings: ClientEventOnlyRenderPlanTextBinding[] = [];
	const classBindings: ClientEventOnlyRenderPlanClassBinding[] = [];
	const eventControls: ClientEventOnlyRenderPlanEventControl[] = [];

	const visitElement = (node: AnyNode, hostPath: ReadonlyArray<number>) => {
		const hostNodeId = input.hostIds.get(node);

		for (const attribute of getElementAttributes(node)) {
			const attributeName = getIdentifierName(attribute.name as AnyNode | undefined);
			if (!attributeName) continue;

			const expression = unwrapExpressionContainer(attribute.value as AnyNode | undefined);
			if (attributeName === 'class' && expression && expression.type !== 'Literal') {
				const binding = classBindingPlan({
					aliases: input.aliases,
					bindings: input.bindings,
					expression,
					hostPath,
					itemName: input.itemName,
					source: input.source,
				});
				if (binding) classBindings.push(binding);
				continue;
			}

			if (!hostNodeId || !isEventAttribute(attributeName) || !expression) continue;

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
				if (!symbol) continue;

				eventControls.push({
					eventName,
					hostPath,
					handlerSource,
					symbolId: symbol.id,
				});
			}
		}

		let childDomIndex = 0;
		for (const child of asNodes(node.children)) {
			if (isStaticTextNode(child)) {
				childDomIndex++;
				continue;
			}

			if (child.type === 'JSXExpressionContainer' || child.type === 'TSRXExpression') {
				const expression = child.expression as AnyNode | undefined;
				if (expression) {
					const source = expressionSource(expression, input.source);
					const itemPath = itemPathFromSource(input.itemName, source);
					if (itemPath) {
						textBindings.push({
							source,
							itemPath,
							nodePath: [...hostPath, childDomIndex],
						});
					}
				}
				childDomIndex++;
				continue;
			}

			if (child.type === 'Element' || child.type === 'JSXElement') {
				visitElement(child, [...hostPath, childDomIndex]);
				childDomIndex++;
			}
		}
	};

	visitElement(input.row, []);

	return {
		textBindings,
		classBindings,
		eventControls,
	};
}

function classBindingPlan(input: {
	readonly aliases: ReturnType<typeof semanticAliasMap>;
	readonly bindings: ReadonlyMap<string, SemanticGraphBinding>;
	readonly expression: AnyNode;
	readonly hostPath: ReadonlyArray<number>;
	readonly itemName: string;
	readonly source: string;
}): ClientEventOnlyRenderPlanClassBinding | null {
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

function assignHostIds(
	root: AnyNode,
	hostNodeIds: ReadonlyArray<string>,
): ReadonlyMap<AnyNode, string> {
	const hostIds = new Map<AnyNode, string>();
	let index = 0;

	const visit = (node: AnyNode | null | undefined): void => {
		if (!node || typeof node !== 'object') return;

		if (node.type === 'Element' || node.type === 'JSXElement') {
			const tagName = getElementTagName(node);
			if (tagName && isHostTagName(tagName)) {
				const hostNodeId = hostNodeIds[index++];
				if (hostNodeId) hostIds.set(node, hostNodeId);
			}
		}

		for (const child of childNodes(node)) visit(child);
	};

	visit(root);
	return hostIds;
}

function keyedRepeatNodes(root: AnyNode): AnyNode[] {
	const repeats: AnyNode[] = [];
	const visit = (node: AnyNode | null | undefined): void => {
		if (!node || typeof node !== 'object') return;
		if (node.type === 'JSXForExpression') repeats.push(node);
		for (const child of childNodes(node)) visit(child);
	};

	visit(root);
	return repeats;
}

function firstRepeatRow(node: AnyNode): AnyNode | null {
	const [row] = asNodes((node.body as AnyNode | undefined)?.body);
	if (!row || (row.type !== 'Element' && row.type !== 'JSXElement')) return null;

	return row;
}

function firstComponentRoot(component: AnyNode | undefined): AnyNode | null {
	const body = component?.body as AnyNode | undefined;
	if (!body) return null;

	for (const child of childNodes(body)) {
		if (child.type === 'Element' || child.type === 'JSXElement') return child;
	}

	return null;
}

function findComponent(ast: AnyNode): AnyNode | undefined {
	for (const statement of asNodes(ast.body)) {
		const declaration =
			statement.type === 'ExportNamedDeclaration'
				? (statement.declaration as AnyNode | undefined)
				: statement;
		if (declaration?.type === 'FunctionDeclaration') return declaration;
	}
}

function staticHtml(
	node: AnyNode,
	options: {
		readonly expressionText: string;
		readonly omitForExpressions: boolean;
	},
): string {
	if (isStaticTextNode(node)) return staticTextValue(node);

	if (node.type === 'JSXExpressionContainer' || node.type === 'TSRXExpression') {
		return options.expressionText;
	}

	if (node.type === 'JSXForExpression') {
		if (options.omitForExpressions) return '';
		const row = firstRepeatRow(node);
		return row ? staticHtml(row, options) : '';
	}

	if (node.type !== 'Element' && node.type !== 'JSXElement') return '';

	const tagName = getElementTagName(node);
	if (!tagName || !isHostTagName(tagName)) return '';

	const attributes = getElementAttributes(node)
		.flatMap((attribute) => staticAttributeEntry(attribute))
		.map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
		.join('');
	const children = asNodes(node.children)
		.map((child) => staticHtml(child, options))
		.join('');

	return `<${tagName}${attributes}>${children}</${tagName}>`;
}

function staticAttributeEntry(attribute: AnyNode): ReadonlyArray<readonly [string, string]> {
	const name = getIdentifierName(attribute.name as AnyNode | undefined);
	if (!name || isEventAttribute(name) || name === 'attach' || name === 'el') return [];

	const value = attribute.value as AnyNode | undefined;
	if (!value) return [[name, '']];

	if (value.type === 'Literal' && typeof value.value !== 'object') {
		return [[name, String(value.value)]];
	}

	const expression = unwrapExpressionContainer(value);
	if (expression?.type === 'Literal' && typeof expression.value !== 'object') {
		return [[name, String(expression.value)]];
	}

	return [[name, '']];
}

function isStaticTextNode(node: AnyNode): boolean {
	return node.type === 'JSXText' || node.type === 'Literal';
}

function staticTextValue(node: AnyNode): string {
	const value = typeof node.value === 'string' ? node.value : '';
	const normalized = value.replace(/\s+/g, ' ').trim();
	return normalized ? escapeHtml(normalized) : '';
}

function eventHandlerExpressions(node: AnyNode): AnyNode[] {
	if (node.type === 'ArrayExpression') return asNodes(node.elements);
	return [node];
}

function unwrapExpressionContainer(node: AnyNode | undefined): AnyNode | undefined {
	if (node?.type === 'JSXExpressionContainer' || node?.type === 'TSRXExpression') {
		return node.expression as AnyNode | undefined;
	}

	return node;
}

function getElementTagName(node: AnyNode): string | null {
	return (
		getIdentifierName(node.id as AnyNode | undefined) ??
		getIdentifierName((node.openingElement as AnyNode | undefined)?.name as AnyNode | undefined)
	);
}

function getElementAttributes(node: AnyNode): AnyNode[] {
	const directAttributes = asNodes(node.attributes);
	if (directAttributes.length > 0) return directAttributes;

	return asNodes((node.openingElement as AnyNode | undefined)?.attributes);
}

function isHostTagName(name: string): boolean {
	return name.length > 0 && name[0] === name[0].toLowerCase();
}

function escapeHtml(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttribute(value: string): string {
	return escapeHtml(value).replaceAll('"', '&quot;');
}
