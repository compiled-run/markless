import { asNodes, childNodes, type AnyNode } from '../../ast/nodes.ts';
import {
	getComponentFunction,
	isIgnorableStaticTextNode as isIgnorableTextNode,
	isPlainHostTemplateNode,
} from '../../ast/tsrx.ts';

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
		if (child.type !== 'ReturnStatement') continue;
		const argument = child.argument as AnyNode | undefined;
		if (argument && (argument.type === 'Element' || argument.type === 'JSXElement')) {
			return argument;
		}
		if (argument && (argument.type === 'Fragment' || argument.type === 'JSXFragment')) {
			return supportedFragmentRoot(argument);
		}
	}
	return null;
}

export function selectPublicRenderRoot(ast: AnyNode): PublicRenderRootSelection | null {
	let fallback: PublicRenderRootSelection | null = null;
	for (const statement of asNodes(ast.body)) {
		const component = getComponentFunction(statement);
		if (!component) continue;
		const root = firstComponentRoot(component.node);
		if (!root) continue;
		const selection = { component: component.node, componentName: component.name, root };
		if (
			statement.type === 'ExportDefaultDeclaration' ||
			statement.type === 'ExportNamedDeclaration'
		) return selection;
		fallback ??= selection;
	}
	return fallback;
}

export function supportedFragmentRoot(fragment: AnyNode): AnyNode | null {
	const children = asNodes(fragment.children).filter((child) => !isIgnorableTextNode(child));
	const supported = children.length > 0 && children.every((child) =>
		((child.type === 'Element' || child.type === 'JSXElement') && isPlainHostTemplateNode(child)) ||
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
		) return 'control-flow child';
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
