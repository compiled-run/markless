import { isEventAttribute, normalizeEventName, parseModule } from '@tsrx/core';
import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import {
	escapeAttribute,
	escapeHtml,
	getElementAttributes,
	getElementTagName,
	isHostTagName,
	isIgnorableStaticTextNode as isIgnorableTextNode,
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
	unsupportedRenderConstructDiagnostic,
	unsupportedRenderRootDiagnostic,
} from './diagnostics.ts';
import type {
	PayloadKeyedRepeat,
	PlannedSymbol,
	PublicRenderPlanArtifact,
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
	SemanticKeyedRepeat,
} from '../../artifacts.ts';

// Builds the public render artifact that the module emitter consumes. This pass
// decides what direct DOM work is compiler-proven instead of emitting code itself.
export function planPublicRender(input: PublicRenderPlanInput): PublicRenderPlanArtifact {
	const ast = parseModule(input.source.source, input.source.filename) as unknown as AnyNode;
	const component = findComponent(ast);
	const root = firstComponentRoot(component);
	if (!root) {
		return emptyPlan(componentRootDiagnostics(ast, input.source.filename));
	}

	const assignedHosts = assignHostIds(
		root,
		input.semanticGraph.hostNodes.map((host) => host.id),
	);
	const hostPaths = collectHostPaths(root, assignedHosts);
	const repeatNodes = keyedRepeatNodes(root);
	const repeatNodeById = new Map<string, AnyNode>();
	input.semanticGraph.keyedRepeats.forEach((repeat, index) => {
		const node = repeatNodes[index];
		if (node) repeatNodeById.set(repeat.id, node);
	});

	const bindings = graphBindingMap(input.semanticGraph);
	const aliases = semanticAliasMap(input.semanticGraph);
	const locatorByHostNodeId = new Map(
		input.payloadArena.view.locators.map((locator) => [locator.hostNodeId, locator]),
	);
	const staticTextWrites = collectStaticTextWrites({
		aliases,
		bindings,
		root,
		source: input.source.source,
	});

	const repeatGates: PublicRenderPlanRepeatGate[] = [];
	const keyedRepeats: PublicRenderPlanKeyedRepeat[] = [];

	for (const payloadRepeat of input.payloadArena.view.keyedRepeats) {
		const semanticRepeat = input.semanticGraph.keyedRepeats.find(
			(repeat) => repeat.id === payloadRepeat.id,
		);
		const repeatNode = repeatNodeById.get(payloadRepeat.id);
		if (!semanticRepeat || !repeatNode) continue;

		const gate = supportedRepeatGate({
			aliases,
			assignedHosts,
			bindings,
			payloadRepeat,
			repeatNode,
			semanticRepeat,
			source: input.source.source,
			symbols: input.symbolResolver.symbols,
		});
		repeatGates.push(gate);
		if (!gate.supported) continue;

		const row = singleRowRoot(repeatNode);
		const parentLocator = locatorByHostNodeId.get(payloadRepeat.parentHostNodeId);
		const parentPath = hostPaths.get(payloadRepeat.parentHostNodeId);
		if (!row || !parentLocator || !parentPath) continue;

		const rowPlan = collectRowPlan({
			aliases,
			assignedHosts,
			bindings,
			itemName: semanticRepeat.itemName,
			keyPath: payloadRepeat.keyPath,
			repeatId: payloadRepeat.id,
			row,
			source: input.source.source,
			symbols: input.symbolResolver.symbols,
		});
		if (!rowPlan) continue;

		keyedRepeats.push(
			planKeyedRepeat({
				payloadRepeat,
				parentLocator,
				parentPath,
				row,
				rowPlan,
				semanticRepeat,
				source: input.source.source,
			}),
		);
	}

	const rootTemplateHtml = staticHtml(root, { expressionText: ' ', omitForExpressions: true });
	const directRenderTemplateHtml =
		staticTextWrites && staticShellSupported(root)
			? staticHtml(root, { expressionText: ' ', omitForExpressions: true })
			: null;

	return {
		passId: 'public-render-plan',
		rootTemplateHtml,
		directRenderTemplateHtml,
		staticHostNodeIds: collectStaticHostNodeIds(root, assignedHosts),
		staticHostLocators: input.payloadArena.view.locators.flatMap((locator) => {
			const hostPath = hostPaths.get(locator.hostNodeId);
			return hostPath
				? [
						{
							hostNodeId: locator.hostNodeId,
							tagName: locator.tagName,
							hostPath,
						},
					]
				: [];
		}),
		staticEventControls: collectStaticEventControls({
			hostPaths,
			payloadEvents: input.payloadArena.view.events,
			symbols: input.symbolResolver.symbols,
		}),
		staticTextWrites: staticTextWrites ?? [],
		repeatGates,
		keyedRepeats,
		diagnostics: [
			...collectUnsupportedConstructDiagnostics(root, input.source.filename),
			...repeatRenderDiagnostics({
				componentEdgeCount: input.semanticGraph.componentEdges.length,
				filename: input.source.filename,
				keyedRepeats,
				repeatGates,
				repeatNodeById,
			}),
		],
	};
}

function emptyPlan(
	diagnostics: ReadonlyArray<PublicRenderPlanArtifact['diagnostics'][number]> = [],
): PublicRenderPlanArtifact {
	return {
		passId: 'public-render-plan',
		rootTemplateHtml: null,
		directRenderTemplateHtml: null,
		staticHostNodeIds: [],
		staticHostLocators: [],
		staticEventControls: [],
		staticTextWrites: [],
		repeatGates: [],
		keyedRepeats: [],
		diagnostics,
	};
}

// Constructs the module emitter cannot render yet must fail loud here; their
// content would otherwise silently disappear from CSR/SSR HTML.
function collectUnsupportedConstructDiagnostics(root: AnyNode, filename: string) {
	const diagnostics: ReturnType<typeof unsupportedRenderConstructDiagnostic>[] = [];

	const visit = (node: AnyNode): void => {
		if (node.type === 'JSXSwitchExpression') {
			diagnostics.push(
				unsupportedRenderConstructDiagnostic({
					label: '@switch',
					message:
						'@switch case content is dropped from rendered HTML because the render module cannot emit it yet.',
					node,
					filename,
					suggestion:
						'Rewrite the branches with @if/@else until @switch rendering is supported.',
				}),
			);
		} else if (node.type === 'JSXTryExpression') {
			diagnostics.push(
				unsupportedRenderConstructDiagnostic({
					label: '@try/@pending/@catch',
					message:
						'@try/@pending/@catch branch content is dropped from rendered HTML because the render module cannot emit async boundary branches yet.',
					node,
					filename,
					suggestion:
						'Keep the async boundary, but expect no branch HTML from the public render path until boundary rendering is supported.',
				}),
			);
		} else if (node.type === 'JSXStyleElement') {
			diagnostics.push(
				unsupportedRenderConstructDiagnostic({
					label: '<style>',
					message:
						'<style> blocks are dropped from rendered HTML because style scoping is not implemented yet.',
					node,
					filename,
					suggestion:
						'Move the CSS into an imported stylesheet until <style> scoping lands.',
				}),
			);
		} else if (
			(node.type === 'Element' || node.type === 'JSXElement') &&
			(node.isDynamic === true || !getElementTagName(node))
		) {
			diagnostics.push(
				unsupportedRenderConstructDiagnostic({
					label: 'dynamic tag',
					message:
						'Dynamic <{expression}> tags are dropped from rendered HTML because dynamic tag lowering is not implemented yet.',
					node,
					filename,
					suggestion: 'Use a static tag name, or branch with @if over the tag choices.',
				}),
			);
		} else if (node.type === 'JSXForExpression' && node.empty) {
			diagnostics.push(
				unsupportedRenderConstructDiagnostic({
					label: '@empty',
					message:
						'@empty content is dropped from rendered HTML because the render module does not emit empty-list branches yet.',
					node: node.empty as AnyNode,
					filename,
					suggestion:
						'Wrap the list in @if to render the empty case until @empty is supported.',
				}),
			);
		}

		for (const child of childNodes(node)) visit(child);
	};

	visit(root);
	return diagnostics;
}

function repeatRenderDiagnostics(input: {
	readonly componentEdgeCount: number;
	readonly filename: string;
	readonly keyedRepeats: ReadonlyArray<PublicRenderPlanKeyedRepeat>;
	readonly repeatGates: ReadonlyArray<PublicRenderPlanRepeatGate>;
	readonly repeatNodeById: ReadonlyMap<string, AnyNode>;
}) {
	return input.repeatGates.flatMap((gate) => {
		const node = input.repeatNodeById.get(gate.repeatId);
		if (!node) return [];
		if (!gate.supported) {
			return [
				unsupportedRenderConstructDiagnostic({
					label: '@for',
					message: `The @for rows are not compiler-proven (reason: ${gate.reason}), so the render module drops the list content.`,
					node,
					filename: input.filename,
					suggestion:
						'Reshape the rows into a single host element with directly readable item bindings.',
				}),
			];
		}
		if (input.componentEdgeCount > 0) {
			return [
				unsupportedRenderConstructDiagnostic({
					label: '@for',
					message:
						'Keyed repeat rows are skipped in SSR output when the module renders component children, so the list content is dropped.',
					node,
					filename: input.filename,
					suggestion:
						'Keep the repeat in a component without child components until repeat rows compose with component children.',
				}),
			];
		}
		if (!input.keyedRepeats.some((repeat) => repeat.repeatId === gate.repeatId)) {
			return [
				unsupportedRenderConstructDiagnostic({
					label: '@for',
					message:
						'The @for rows could not be planned even though the repeat gate is supported, so the render module drops the list content.',
					node,
					filename: input.filename,
					suggestion:
						'Keep the repeat directly inside a host parent element with a single row root.',
				}),
			];
		}
		return [];
	});
}

// findComponent only accepts components that already have an element root, so
// fragment-rooted and return-form components would silently plan nothing.
// This scan exists purely to explain those shapes; plain helper functions in a
// .tsrx module (no template content) stay diagnostic-free.
function componentRootDiagnostics(ast: AnyNode, filename: string) {
	for (const statement of asNodes(ast.body)) {
		const declaration =
			statement.type === 'ExportNamedDeclaration' ||
			statement.type === 'ExportDefaultDeclaration'
				? (statement.declaration as AnyNode | undefined)
				: statement;
		if (declaration?.type !== 'FunctionDeclaration') continue;
		const body = declaration.body as AnyNode | undefined;
		if (!body) continue;

		const fragment = childNodes(body).find(
			(child) => child.type === 'Fragment' || child.type === 'JSXFragment',
		);
		if (fragment) {
			return [
				unsupportedRenderRootDiagnostic({
					message:
						'Fragment-rooted components render nothing because the public render path needs one host or component element as the root.',
					node: fragment,
					filename,
					suggestion:
						'Wrap the fragment children in a single host element such as <div> or <section>.',
				}),
			];
		}

		const returnedTemplate = childNodes(body).find(
			(child) =>
				child.type === 'ReturnStatement' &&
				['Element', 'JSXElement', 'Fragment', 'JSXFragment'].includes(
					(child.argument as AnyNode | undefined)?.type ?? '',
				),
		);
		if (returnedTemplate) {
			return [
				unsupportedRenderRootDiagnostic({
					message:
						'Returning template content renders nothing because the public render path only reads elements placed directly in the @{...} component body.',
					node: returnedTemplate,
					filename,
					suggestion:
						'Place the element directly in the component body instead of returning it.',
				}),
			];
		}
	}

	return [];
}

function collectStaticTextWrites(input: {
	readonly aliases: ReturnType<typeof semanticAliasMap>;
	readonly bindings: ReadonlyMap<string, SemanticGraphBinding>;
	readonly root: AnyNode;
	readonly source: string;
}): PublicRenderPlanStaticTextWrite[] | null {
	const writes: PublicRenderPlanStaticTextWrite[] = [];
	let sawRepeat = false;

	const visitElement = (node: AnyNode, hostPath: ReadonlyArray<number>): boolean => {
		let childDomIndex = 0;
		for (const child of asNodes(node.children)) {
			if (isIgnorableTextNode(child)) continue;
			if (isStaticTextNode(child)) {
				childDomIndex++;
				continue;
			}
			if (child.type === 'JSXForExpression') {
				sawRepeat = true;
				continue;
			}
			if (child.type === 'JSXExpressionContainer' || child.type === 'TSRXExpression') {
				const expression = child.expression as AnyNode | undefined;
				if (!expression) return false;

				const source = expressionSource(expression, input.source);
				const graph = resolveGraphPath(source, input.bindings, input.aliases);
				if (!graph || graph.binding.kind !== 'state') return false;
				const target = staticTextWriteTarget(node, child, hostPath, childDomIndex);

				writes.push({
					source,
					graphNodeId: graph.binding.id,
					path: graph.path,
					...target,
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

	if (!visitElement(input.root, [])) return null;
	if (sawRepeat && writes.length > 0) return null;
	return writes;
}

function staticTextWriteTarget(
	host: AnyNode,
	expressionChild: AnyNode,
	hostPath: ReadonlyArray<number>,
	childDomIndex: number,
): Pick<PublicRenderPlanStaticTextWrite, 'nodePath' | 'prefix' | 'suffix'> {
	const children = asNodes(host.children).filter((child) => !isIgnorableTextNode(child));
	const expressionChildren = children.filter(
		(child) => child.type === 'JSXExpressionContainer' || child.type === 'TSRXExpression',
	);
	if (expressionChildren.length !== 1 || expressionChildren[0] !== expressionChild) {
		return { nodePath: [...hostPath, childDomIndex] };
	}

	const expressionIndex = children.indexOf(expressionChild);
	let prefix = '';
	let suffix = '';
	for (const child of children.slice(0, expressionIndex)) {
		if (!isStaticTextNode(child)) return { nodePath: [...hostPath, childDomIndex] };
		prefix += staticTextValue(child);
	}
	for (const child of children.slice(expressionIndex + 1)) {
		if (!isStaticTextNode(child)) return { nodePath: [...hostPath, childDomIndex] };
		suffix += staticTextValue(child);
	}
	if (!prefix && !suffix) return { nodePath: [...hostPath, childDomIndex] };

	return {
		nodePath: hostPath,
		...(prefix ? { prefix } : {}),
		...(suffix ? { suffix } : {}),
	};
}

function supportedRepeatGate(input: {
	readonly aliases: ReturnType<typeof semanticAliasMap>;
	readonly assignedHosts: AssignedHosts;
	readonly bindings: ReadonlyMap<string, SemanticGraphBinding>;
	readonly payloadRepeat: PayloadKeyedRepeat;
	readonly repeatNode: AnyNode;
	readonly semanticRepeat: SemanticKeyedRepeat;
	readonly source: string;
	readonly symbols: ReadonlyArray<PlannedSymbol>;
}): PublicRenderPlanRepeatGate {
	const unsupported = unsupportedRepeatReason(input);
	if (unsupported) {
		return {
			repeatId: input.payloadRepeat.id,
			supported: false,
			reason: unsupported,
		};
	}

	return {
		repeatId: input.payloadRepeat.id,
		supported: true,
	};
}

function unsupportedRepeatReason(input: {
	readonly aliases: ReturnType<typeof semanticAliasMap>;
	readonly assignedHosts: AssignedHosts;
	readonly bindings: ReadonlyMap<string, SemanticGraphBinding>;
	readonly payloadRepeat: PayloadKeyedRepeat;
	readonly repeatNode: AnyNode;
	readonly semanticRepeat: SemanticKeyedRepeat;
	readonly source: string;
	readonly symbols: ReadonlyArray<PlannedSymbol>;
}): PublicRenderPlanUnsupportedReason | null {
	const parent = input.assignedHosts.nodeByHostId.get(input.payloadRepeat.parentHostNodeId);
	if (!parent) return 'repeat-parent-locator-missing';

	if (!parentContainsOnlyRepeat(parent, input.repeatNode)) {
		return 'repeat-parent-must-contain-only-repeat';
	}

	const row = singleRowRoot(input.repeatNode);
	if (!row) return 'single-row-root-required';

	if (containsNestedRepeat(row)) return 'nested-repeat-unsupported';

	const rowPlan = collectRowPlan({
		aliases: input.aliases,
		assignedHosts: input.assignedHosts,
		bindings: input.bindings,
		itemName: input.semanticRepeat.itemName,
		keyPath: input.payloadRepeat.keyPath,
		repeatId: input.payloadRepeat.id,
		row,
		source: input.source,
		symbols: input.symbols,
	});
	if (!rowPlan) return 'unsupported-row-binding';

	return null;
}

function planKeyedRepeat(input: {
	readonly payloadRepeat: PayloadKeyedRepeat;
	readonly parentLocator: PublicRenderPlanKeyedRepeat['parentLocator'];
	readonly parentPath: ReadonlyArray<number>;
	readonly row: AnyNode;
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
		textWrites: input.rowPlan.textWrites,
		classWrites: input.rowPlan.classWrites,
		eventControls: input.rowPlan.eventControls,
	};
}

type RowPlan = {
	readonly textWrites: ReadonlyArray<PublicRenderPlanTextWrite>;
	readonly classWrites: ReadonlyArray<PublicRenderPlanClassWrite>;
	readonly eventControls: ReadonlyArray<PublicRenderPlanEventControl>;
};

function collectRowPlan(input: {
	readonly aliases: ReturnType<typeof semanticAliasMap>;
	readonly assignedHosts: AssignedHosts;
	readonly bindings: ReadonlyMap<string, SemanticGraphBinding>;
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
				if (!itemPath) return false;

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

type AssignedHosts = {
	readonly hostIdByNode: ReadonlyMap<AnyNode, string>;
	readonly nodeByHostId: ReadonlyMap<string, AnyNode>;
};

function assignHostIds(root: AnyNode, hostNodeIds: ReadonlyArray<string>): AssignedHosts {
	const hostIdByNode = new Map<AnyNode, string>();
	const nodeByHostId = new Map<string, AnyNode>();
	let index = 0;

	const visit = (node: AnyNode | null | undefined): void => {
		if (!node || typeof node !== 'object') return;

		if (node.type === 'Element' || node.type === 'JSXElement') {
			const tagName = getElementTagName(node);
			if (tagName && isHostTagName(tagName)) {
				const hostNodeId = hostNodeIds[index++];
				if (hostNodeId) {
					hostIdByNode.set(node, hostNodeId);
					nodeByHostId.set(hostNodeId, node);
				}
			}
		}

		for (const child of childNodes(node)) visit(child);
	};

	visit(root);
	return { hostIdByNode, nodeByHostId };
}

function collectHostPaths(
	root: AnyNode,
	assignedHosts: AssignedHosts,
): ReadonlyMap<string, ReadonlyArray<number>> {
	const hostPathById = new Map<string, ReadonlyArray<number>>();

	const visit = (node: AnyNode | null | undefined, path: ReadonlyArray<number>): void => {
		if (!node || typeof node !== 'object') return;
		if (node.type !== 'Element' && node.type !== 'JSXElement') return;

		const hostNodeId = assignedHosts.hostIdByNode.get(node);
		if (hostNodeId) hostPathById.set(hostNodeId, path);

		let childDomIndex = 0;
		for (const child of asNodes(node.children)) {
			if (isIgnorableTextNode(child)) continue;
			if (child.type === 'JSXIfExpression') {
				for (const branchRoot of sameHostConditionalBranchRoots(child)) {
					const branchHostNodeId = assignedHosts.hostIdByNode.get(branchRoot);
					if (branchHostNodeId)
						hostPathById.set(branchHostNodeId, [...path, childDomIndex]);
				}
				childDomIndex++;
				continue;
			}
			if (child.type === 'Element' || child.type === 'JSXElement') {
				visit(child, [...path, childDomIndex]);
				childDomIndex++;
				continue;
			}
			childDomIndex++;
		}
	};

	visit(root, []);
	return hostPathById;
}

function sameHostConditionalBranchRoots(node: AnyNode): ReadonlyArray<AnyNode> {
	const consequent = conditionalStaticTextBranchRoot(node.consequent as AnyNode | undefined);
	const alternate = conditionalStaticTextBranchRoot(node.alternate as AnyNode | undefined);
	if (!consequent || !alternate) return [];
	if (consequent.tagName !== alternate.tagName) return [];
	if (consequent.staticAttributesKey !== alternate.staticAttributesKey) return [];
	return [consequent.node, alternate.node];
}

function conditionalStaticTextBranchRoot(node: AnyNode | undefined): {
	readonly node: AnyNode;
	readonly tagName: string;
	readonly staticAttributesKey: string;
} | null {
	const root = branchSingleOutput(node);
	if (!root || (root.type !== 'Element' && root.type !== 'JSXElement')) return null;
	const tagName = getElementTagName(root);
	if (!tagName || !isHostTagName(tagName)) return null;
	if (singleStaticTextChild(root) === null) return null;
	const staticAttributesKey = staticAttributeKey(root);
	if (staticAttributesKey === null) return null;
	return { node: root, tagName, staticAttributesKey };
}

function branchSingleOutput(node: AnyNode | undefined): AnyNode | null {
	if (!node) return null;
	if (node.type === 'BlockStatement') {
		const outputs = asNodes(node.body).filter((child) => !isIgnorableTextNode(child));
		return outputs.length === 1 ? branchSingleOutput(outputs[0]) : null;
	}
	if (node.type === 'ExpressionStatement') {
		return branchSingleOutput(node.expression as AnyNode | undefined);
	}
	return node;
}

function singleStaticTextChild(node: AnyNode): string | null {
	const children = asNodes(node.children).filter((child) => !isIgnorableTextNode(child));
	if (children.length !== 1) return null;
	const child = children[0]!;
	if (!isStaticTextNode(child)) return null;
	const value = typeof child.value === 'string' ? child.value : '';
	const normalized = value.replace(/\s+/g, ' ').trim();
	return normalized === '' ? null : normalized;
}

function staticAttributeKey(node: AnyNode): string | null {
	const attributes: Array<readonly [string, string]> = [];
	for (const attribute of getElementAttributes(node)) {
		const name = getIdentifierName(attribute.name as AnyNode | undefined);
		if (!name || isEventAttribute(name) || name === 'attach' || name === 'el') return null;

		const value = attribute.value as AnyNode | undefined;
		const expression = unwrapExpressionContainer(value);
		if (!value) {
			attributes.push([name, 'true']);
			continue;
		}
		if (value.type === 'Literal' && typeof value.value !== 'object') {
			attributes.push([name, String(value.value)]);
			continue;
		}
		if (expression?.type === 'Literal' && typeof expression.value !== 'object') {
			attributes.push([name, String(expression.value)]);
			continue;
		}
		return null;
	}
	return JSON.stringify(attributes);
}

function collectStaticHostNodeIds(
	root: AnyNode,
	assignedHosts: AssignedHosts,
): ReadonlyArray<string> {
	const hostNodeIds: string[] = [];

	const visit = (node: AnyNode | null | undefined): void => {
		if (!node || typeof node !== 'object') return;
		if (node.type === 'JSXForExpression') return;

		const hostNodeId = assignedHosts.hostIdByNode.get(node);
		if (hostNodeId) hostNodeIds.push(hostNodeId);

		for (const child of childNodes(node)) visit(child);
	};

	visit(root);
	return hostNodeIds;
}

function collectStaticEventControls(input: {
	readonly hostPaths: ReadonlyMap<string, ReadonlyArray<number>>;
	readonly payloadEvents: PublicRenderPlanInput['payloadArena']['view']['events'];
	readonly symbols: ReadonlyArray<PlannedSymbol>;
}): ReadonlyArray<PublicRenderPlanStaticEventControl> {
	return input.payloadEvents.flatMap((event): PublicRenderPlanStaticEventControl[] => {
		const hostPath = input.hostPaths.get(event.hostNodeId);
		if (!hostPath) return [];

		const symbolIds: string[] = [];
		for (const symbol of input.symbols) {
			if (
				symbol.kind !== 'event-handler' ||
				symbol.hostNodeId !== event.hostNodeId ||
				symbol.eventName !== event.eventName
			) {
				continue;
			}
			symbolIds[symbol.order] = symbol.id;
		}

		return symbolIds.length > 0
			? [
					{
						eventName: event.eventName,
						hostNodeId: event.hostNodeId,
						hostPath,
						symbolIds,
					},
				]
			: [];
	});
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

function parentContainsOnlyRepeat(parent: AnyNode, repeat: AnyNode): boolean {
	const meaningfulChildren = asNodes(parent.children).filter(
		(child) => !isIgnorableTextNode(child),
	);
	return meaningfulChildren.length === 1 && meaningfulChildren[0] === repeat;
}

function singleRowRoot(node: AnyNode): AnyNode | null {
	const bodyNodes = asNodes((node.body as AnyNode | undefined)?.body).filter(
		(child) => !isIgnorableTextNode(child),
	);
	if (bodyNodes.length !== 1) return null;

	const [row] = bodyNodes;
	if (!row || (row.type !== 'Element' && row.type !== 'JSXElement')) return null;

	return row;
}

function containsNestedRepeat(node: AnyNode): boolean {
	const visit = (child: AnyNode | null | undefined): boolean => {
		if (!child || typeof child !== 'object') return false;
		if (child.type === 'JSXForExpression') return true;
		return childNodes(child).some(visit);
	};

	return childNodes(node).some(visit);
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
	let fallback: AnyNode | undefined;

	for (const statement of asNodes(ast.body)) {
		const declaration =
			statement.type === 'ExportNamedDeclaration' ||
			statement.type === 'ExportDefaultDeclaration'
				? (statement.declaration as AnyNode | undefined)
				: statement;
		if (declaration?.type !== 'FunctionDeclaration') continue;
		if (!firstComponentRoot(declaration)) continue;

		if (statement.type === 'ExportDefaultDeclaration') return declaration;
		if (statement.type === 'ExportNamedDeclaration') return declaration;
		fallback ??= declaration;
	}

	return fallback;
}

function staticHtml(
	node: AnyNode,
	options: {
		readonly expressionText: string;
		readonly omitForExpressions: boolean;
	},
): string {
	if (isStaticTextNode(node)) return escapeHtml(trimmedStaticTextValue(node));

	if (node.type === 'JSXExpressionContainer' || node.type === 'TSRXExpression') {
		return options.expressionText;
	}

	if (node.type === 'JSXForExpression') {
		if (options.omitForExpressions) return '';
		const row = singleRowRoot(node);
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

function staticShellSupported(node: AnyNode): boolean {
	if (node.type !== 'Element' && node.type !== 'JSXElement') return false;
	if (getElementAttributes(node).some(isSpreadAttribute)) return false;
	if (
		getElementAttributes(node).some((attribute) => {
			const name = getIdentifierName(attribute.name as AnyNode | undefined);
			const expression = unwrapExpressionContainer(attribute.value as AnyNode | undefined);
			return (
				!!name &&
				!isEventAttribute(name) &&
				name !== 'attach' &&
				name !== 'el' &&
				!!expression &&
				expression.type !== 'Literal'
			);
		})
	)
		return false;

	return asNodes(node.children).every(
		(child) =>
			isIgnorableTextNode(child) ||
			isStaticTextNode(child) ||
			child.type === 'JSXExpressionContainer' ||
			child.type === 'TSRXExpression' ||
			child.type === 'JSXForExpression' ||
			staticShellSupported(child),
	);
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

function eventHandlerExpressions(node: AnyNode): AnyNode[] {
	if (node.type === 'ArrayExpression') return asNodes(node.elements);
	return [node];
}
