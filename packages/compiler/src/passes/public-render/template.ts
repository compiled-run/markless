import { isEventAttribute } from '@tsrx/core';
import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import {
	escapeAttribute,
	escapeHtml,
	getComponentFunction,
	getElementAttributes,
	getElementTagName,
	isHostTagName,
	isIgnorableStaticTextNode as isIgnorableTextNode,
	isPlainHostTemplateNode,
	isSpreadAttribute,
	isStaticTextNode,
	trimmedStaticTextValue,
	unwrapExpressionContainer,
} from '../../ast/tsrx.ts';

export function singleRowRoot(node: AnyNode): AnyNode | null {
	const bodyNodes = asNodes((node.body as AnyNode | undefined)?.body).filter(
		(child) => !isIgnorableTextNode(child),
	);
	if (bodyNodes.length !== 1) return null;

	const [row] = bodyNodes;
	if (!row || (row.type !== 'Element' && row.type !== 'JSXElement')) return null;

	return row;
}

export type PublicRenderRootSelection = {
	readonly component: AnyNode;
	readonly componentName: string;
	readonly root: AnyNode;
};

export function firstComponentRoot(component: AnyNode | undefined): AnyNode | null {
	const body = component?.body as AnyNode | undefined;
	if (!body) return null;

	for (const child of childNodes(body)) {
		if (child.type === 'Element' || child.type === 'JSXElement') return child;
		if (child.type === 'Fragment' || child.type === 'JSXFragment') {
			return supportedFragmentRoot(child);
		}
		// TSRX allows `return <element>;` at the function-body level of @{...}.
		if (child.type === 'ReturnStatement') {
			const argument = child.argument as AnyNode | undefined;
			if (argument && (argument.type === 'Element' || argument.type === 'JSXElement')) {
				return argument;
			}
			if (argument && (argument.type === 'Fragment' || argument.type === 'JSXFragment')) {
				return supportedFragmentRoot(argument);
			}
		}
	}

	return null;
}

export function selectPublicRenderRoot(ast: AnyNode): PublicRenderRootSelection | null {
	let fallback: PublicRenderRootSelection | null = null;

	for (const statement of asNodes(ast.body)) {
		const componentFunction = getComponentFunction(statement);
		if (!componentFunction) continue;
		const root = firstComponentRoot(componentFunction.node);
		if (!root) continue;

		const selection = {
			component: componentFunction.node,
			componentName: componentFunction.name,
			root,
		};
		if (
			statement.type === 'ExportDefaultDeclaration' ||
			statement.type === 'ExportNamedDeclaration'
		) {
			return selection;
		}
		fallback ??= selection;
	}

	return fallback;
}

// Fragment roots render only when every top-level child is a plain host
// element: the SSR container owns the multi-root range, but dynamic children
// (components, control flow) need the comment-anchor work and stay diagnosed.
export function supportedFragmentRoot(fragment: AnyNode): AnyNode | null {
	const children = asNodes(fragment.children).filter((child) => !isIgnorableTextNode(child));
	const supported =
		children.length > 0 &&
		children.every(
			(child) =>
				((child.type === 'Element' || child.type === 'JSXElement') &&
					isPlainHostTemplateNode(child)) ||
				// Control-flow children reuse their own gates verbatim: fragment
				// top level counts as top-level, so @if/@switch/@for/@try
				// children gate exactly like element-rooted ones (per-construct
				// gates decide support; unsupported shapes keep their existing
				// diagnostics/static behavior).
				child.type === 'JSXIfExpression' ||
				child.type === 'JSXSwitchExpression' ||
				child.type === 'JSXForExpression' ||
				child.type === 'JSXTryExpression',
		);
	return supported ? fragment : null;
}

export function unsupportedFragmentChildKind(fragment: AnyNode): string {
	for (const child of asNodes(fragment.children)) {
		if (isIgnorableTextNode(child)) continue;
		if (
			child.type === 'JSXIfExpression' ||
			child.type === 'JSXSwitchExpression' ||
			child.type === 'JSXForExpression' ||
			child.type === 'JSXTryExpression'
		) {
			return 'control-flow child';
		}
		if (child.type === 'Element' || child.type === 'JSXElement') {
			if (!isPlainHostTemplateNode(child)) return 'component or dynamic child';
			continue;
		}
		if (child.type === 'JSXExpressionContainer' || child.type === 'TSRXExpression') {
			return 'expression child';
		}
		return `${String(child.type)} child`;
	}
	return 'empty fragment';
}

export function staticHtml(
	node: AnyNode,
	options: {
		readonly componentRoots?: ReadonlyMap<string, AnyNode>;
		readonly componentStack?: ReadonlyArray<string>;
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

	if (node.type === 'Fragment' || node.type === 'JSXFragment') {
		return asNodes(node.children)
			.map((child) => staticHtml(child, options))
			.join('');
	}

	if (node.type !== 'Element' && node.type !== 'JSXElement') return '';

	const tagName = getElementTagName(node);
	if (!tagName) return '';
	if (!isHostTagName(tagName)) {
		const componentRoot = options.componentRoots?.get(tagName);
		if (!componentRoot || options.componentStack?.includes(tagName)) return '';
		return staticHtml(componentRoot, {
			...options,
			componentStack: [...(options.componentStack ?? []), tagName],
		});
	}

	const attributes = getElementAttributes(node)
		.flatMap((attribute) => staticAttributeEntry(attribute))
		.map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
		.join('');
	const children = asNodes(node.children)
		.map((child) => staticHtml(child, options))
		.join('');

	return `<${tagName}${attributes}>${children}</${tagName}>`;
}

export function sameModuleComponentRoots(ast: AnyNode): ReadonlyMap<string, AnyNode> {
	const roots = new Map<string, AnyNode>();
	for (const statement of asNodes(ast.body)) {
		const component = getComponentFunction(statement);
		if (!component) continue;
		const root = firstComponentRoot(component.node);
		if (root) roots.set(component.name, root);
	}
	return roots;
}

export function staticShellSupported(node: AnyNode): boolean {
	if (node.type !== 'Element' && node.type !== 'JSXElement') return false;
	if (node.isDynamic === true || !getElementTagName(node)) return false;
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

export function eventHandlerExpressions(node: AnyNode): AnyNode[] {
	if (node.type === 'ArrayExpression') return asNodes(node.elements);
	return [node];
}
