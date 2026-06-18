import type {
	SemanticGraphBinding,
	SemanticTemplateAttribute,
	SemanticTemplateNode,
	TemplateViewArtifact,
	TemplateViewAttribute,
	TemplateViewInput,
	TemplateViewNode,
} from '../artifacts.ts';
import {
	resolveGraphPath,
	resolveSharedInstanceGraphPath,
	semanticAliasMap,
} from '../artifact-helpers/graph-paths.ts';
import { compilerBinaryExpressionMatcher } from '../source-patterns.ts';

export function planTemplateView(input: TemplateViewInput): TemplateViewArtifact {
	const bindings = new Map<string, SemanticGraphBinding>();
	const aliases = semanticAliasMap(input.semanticGraph);

	for (const binding of input.semanticGraph.graphBindings) {
		bindings.set(binding.name, binding);
	}

	const nodes = input.semanticGraph.templateNodes.map((node) =>
		templateViewNode(node, input.semanticGraph, bindings, aliases),
	);
	const nodesById = new Map(nodes.map((node) => [node.id, node]));

	return {
		passId: 'template-view',
		components: input.semanticGraph.templateRoots.map((root) => ({
			name: root.componentName,
			rootNodeIds: root.nodeIds,
			initialHtml: root.nodeIds.map((nodeId) => renderNode(nodesById, nodeId)).join(''),
		})),
		nodes,
		diagnostics: input.stateLowering.diagnostics,
	};
}

function templateViewNode(
	node: SemanticTemplateNode,
	semanticGraph: TemplateViewInput['semanticGraph'],
	bindings: ReadonlyMap<string, SemanticGraphBinding>,
	aliases: ReturnType<typeof semanticAliasMap>,
): TemplateViewNode {
	if (node.kind === 'element') {
		return {
			...node,
			attributes: node.attributes.map((attribute) =>
				templateViewAttribute(attribute, semanticGraph, bindings, aliases),
			),
		};
	}

	if (node.kind === 'binding') {
		const resolved =
			resolveGraphPath(node.source, bindings, aliases) ??
			resolveSharedInstanceGraphPath(node.source, semanticGraph);
		if (!resolved) return node;

		return {
			...node,
			graphNodeId: resolved.binding.id,
			path: resolved.path,
			initialValue: initialValueForBinding(
				resolved.binding,
				resolved.path,
				bindings,
				aliases,
			),
		};
	}

	return node;
}

function templateViewAttribute(
	attribute: SemanticTemplateAttribute,
	semanticGraph: TemplateViewInput['semanticGraph'],
	bindings: ReadonlyMap<string, SemanticGraphBinding>,
	aliases: ReturnType<typeof semanticAliasMap>,
): TemplateViewAttribute {
	if (attribute.kind === 'static') return attribute;

	const resolved =
		resolveGraphPath(attribute.source, bindings, aliases) ??
		resolveSharedInstanceGraphPath(attribute.source, semanticGraph);
	if (!resolved) return attribute;

	return {
		...attribute,
		graphNodeId: resolved.binding.id,
		path: resolved.path,
		initialValue: initialValueForBinding(resolved.binding, resolved.path, bindings, aliases),
	};
}

function initialValueForBinding(
	binding: SemanticGraphBinding,
	path: ReadonlyArray<string>,
	bindings: ReadonlyMap<string, SemanticGraphBinding>,
	aliases: ReturnType<typeof semanticAliasMap>,
): unknown {
	if (binding.kind === 'state') {
		return pathInitialValue(binding.initialValue, path);
	}

	if (binding.kind === 'computed' && binding.async !== true) {
		const value = computeInitialValue(binding, bindings, aliases);
		return pathInitialValue(value, path);
	}

	return undefined;
}

function computeInitialValue(
	binding: SemanticGraphBinding,
	bindings: ReadonlyMap<string, SemanticGraphBinding>,
	aliases: ReturnType<typeof semanticAliasMap>,
): unknown {
	const expression = computedExpression(binding.functionSource);
	if (!expression) return undefined;

	const binary = expression.match(compilerBinaryExpressionMatcher);
	if (binary) {
		const { leftSource, operator, rightNumberSource } = binary.groups;
		if (!leftSource || !operator || !rightNumberSource) return undefined;

		const left = valueForSource(leftSource, bindings, aliases);
		const right = Number(rightNumberSource);
		return applyBinaryOperator(left, operator, right);
	}

	return valueForSource(expression, bindings, aliases);
}

function computedExpression(functionSource: string | undefined): string | null {
	if (!functionSource) return null;

	const arrowIndex = functionSource.indexOf('=>');
	if (arrowIndex === -1) return null;

	const body = functionSource.slice(arrowIndex + 2).trim();
	if (!body.startsWith('{') || !body.endsWith('}')) return body;

	const statement = body.slice(1, -1).trim();
	if (!statement.startsWith('return')) return body;

	const afterReturn = statement.slice('return'.length);
	if (!/\s/.test(afterReturn[0] ?? '')) return body;

	const expression = afterReturn.trim();
	return (expression.endsWith(';') ? expression.slice(0, -1) : expression).trim();
}

function valueForSource(
	source: string,
	bindings: ReadonlyMap<string, SemanticGraphBinding>,
	aliases: ReturnType<typeof semanticAliasMap>,
): unknown {
	const resolved = resolveGraphPath(source, bindings, aliases);
	if (!resolved) return undefined;

	return initialValueForBinding(resolved.binding, resolved.path, bindings, aliases);
}

function applyBinaryOperator(left: unknown, operator: string, right: number): unknown {
	const value = Number(left);
	if (!Number.isFinite(value) || !Number.isFinite(right)) return undefined;

	if (operator === '+') return value + right;
	if (operator === '-') return value - right;
	if (operator === '*') return value * right;
	if (operator === '/') return value / right;
	return undefined;
}

function pathInitialValue(initialValue: unknown, path: ReadonlyArray<string>): unknown {
	let value = initialValue;
	for (const segment of path) {
		if (value === null || value === undefined) return undefined;

		if (Array.isArray(value)) {
			const index = Number(segment);
			if (!Number.isInteger(index)) return undefined;
			value = value[index];
			continue;
		}

		if (typeof value !== 'object') return undefined;
		value = (value as Record<string, unknown>)[segment];
	}

	return value;
}

function renderNode(nodesById: ReadonlyMap<string, TemplateViewNode>, nodeId: string): string {
	const node = nodesById.get(nodeId);
	if (!node) return '';

	if (node.kind === 'text') return escapeText(node.value);
	if (node.kind === 'binding') return escapeText(valueToText(node.initialValue));

	const attributes = node.attributes.map(renderAttribute).join('');
	if (voidElements.has(node.tagName)) {
		return `<${node.tagName}${attributes}>`;
	}

	const children = node.childNodeIds.map((childId) => renderNode(nodesById, childId)).join('');
	return `<${node.tagName}${attributes}>${children}</${node.tagName}>`;
}

function renderAttribute(attribute: TemplateViewAttribute): string {
	const value = attribute.kind === 'static' ? attribute.value : attribute.initialValue;
	if (value === false || value === null || value === undefined) return '';
	if (value === true) return ` ${attribute.name}`;

	return ` ${attribute.name}="${escapeAttribute(valueToText(value))}"`;
}

function valueToText(value: unknown): string {
	if (value === null || value === undefined) return '';
	return String(value);
}

function escapeText(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttribute(value: string): string {
	return escapeText(value).replaceAll('"', '&quot;');
}

const voidElements = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr',
]);
