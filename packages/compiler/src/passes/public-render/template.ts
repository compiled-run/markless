import { asNodes, childNodes, type AnyNode } from '../../ast/nodes.ts';
import {
	getComponentFunction,
	getDynamicTagExpression,
	getElementTagName,
	isHostTagName,
	isIgnorableStaticTextNode as isIgnorableTextNode,
	isPlainHostTemplateNode,
	isStaticTextNode,
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

const controlFlowBlockLabels: Record<string, string> = {
	JSXIfExpression: 'an @if block',
	JSXSwitchExpression: 'a @switch block',
	JSXForExpression: 'a @for block',
	JSXTryExpression: 'a @try block',
};

// Names the first thing that stops a fragment root from rendering, in the
// user's own terms: "the <Counter> component inside <main>". Mirrors the
// supportedFragmentRoot / isPlainHostTemplateNode walk so the description
// always points at a real offender instead of a category. Returns null for a
// fragment with no content.
export function describeUnsupportedFragmentContent(fragment: AnyNode): string | null {
	const children = asNodes(fragment.children).filter((child) => !isIgnorableTextNode(child));
	if (children.length === 0) return null;
	for (const child of children) {
		// Control-flow blocks are supported as direct fragment children; the
		// offender is whatever comes after them.
		if (child.type !== undefined && controlFlowBlockLabels[child.type]) continue;
		if (child.type === 'JSXExpressionContainer' || child.type === 'TSRXExpression') {
			return 'a {expression} placed directly inside the fragment';
		}
		if (isStaticTextNode(child)) {
			return 'text placed directly inside the fragment';
		}
		const offender = describeUnsupportedTemplateNode(child, null);
		if (offender) return offender;
	}
	return 'content the fragment renderer does not recognize';
}

function describeUnsupportedTemplateNode(
	node: AnyNode,
	enclosingTag: string | null,
): string | null {
	const inside = enclosingTag ? ` inside <${enclosingTag}>` : '';
	if (node.type !== 'Element' && node.type !== 'JSXElement') {
		if (isStaticTextNode(node)) return null;
		if (node.type === 'JSXExpressionContainer' || node.type === 'TSRXExpression') return null;
		const block = node.type !== undefined ? controlFlowBlockLabels[node.type] : undefined;
		if (block) return `${block}${inside}`;
		return `unsupported content${inside}`;
	}
	if (getDynamicTagExpression(node)) return `a dynamic <{...}> element${inside}`;
	const tagName = getElementTagName(node);
	if (!tagName) return `a component reference${inside}`;
	if (!isHostTagName(tagName)) return `the <${tagName}> component${inside}`;
	for (const child of asNodes(node.children)) {
		const offender = describeUnsupportedTemplateNode(child, tagName);
		if (offender) return offender;
	}
	return null;
}
