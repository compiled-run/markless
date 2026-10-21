import { asNodes, childNodes, type AnyNode } from '../../ast/nodes.ts';
import {
	getComponentFunction,
	getDynamicTagExpression,
	getElementTagName,
	isHostTagName,
	isIgnorableStaticTextNode as isIgnorableTextNode,
	isPlainHostTemplateNode,
	isConstantTextNode,
	isStaticTextNode,
} from '../../ast/tsrx.ts';

export type PublicRenderRootSelection = {
	readonly component: AnyNode;
	readonly componentName: string;
	readonly root: AnyNode;
};

const templateNodeTypes = new Set([
	'Element',
	'JSXElement',
	'JSXStyleElement',
	'Fragment',
	'JSXFragment',
	'JSXIfExpression',
	'JSXSwitchExpression',
	'JSXForExpression',
	'JSXTryExpression',
]);

type ImplicitFragment = { readonly fragment: AnyNode; readonly statements: ReadonlySet<AnyNode> };
const implicitFragments = new WeakMap<AnyNode, ImplicitFragment | null>();

function topLevelTemplateNode(statement: AnyNode): AnyNode | null {
	if (templateNodeTypes.has(statement.type ?? '')) return statement;
	const expression = statement.type === 'ExpressionStatement'
		? (statement.expression as AnyNode | undefined)
		: undefined;
	return expression && templateNodeTypes.has(expression.type ?? '') ? expression : null;
}

// A lone @for stays out: its rows need an element, which soleLoopRoot reports.
const soleBlockRootTypes = new Set(['JSXIfExpression', 'JSXSwitchExpression', 'JSXTryExpression']);

// Two or more top-level template statements, or one bare @if/@switch/@try, are one root: the fragment the author left implicit.
function implicitFragment(body: AnyNode): ImplicitFragment | null {
	const cached = implicitFragments.get(body);
	if (cached !== undefined) return cached;
	const statements = new Set<AnyNode>();
	const children: AnyNode[] = [];
	for (const statement of childNodes(body)) {
		const template = topLevelTemplateNode(statement);
		if (!template) continue;
		statements.add(statement);
		children.push(template);
	}
	const first = children[0];
	const last = children[children.length - 1];
	const found = first && last && (children.length > 1 || soleBlockRootTypes.has(first.type ?? ''))
		? {
				fragment: {
					type: first.type?.startsWith('JSX') ? 'JSXFragment' : 'Fragment',
					start: first.start,
					end: last.end,
					...(first.loc && last.loc
						? { loc: { start: (first.loc as AnyNode).start, end: (last.loc as AnyNode).end } }
						: {}),
					children,
				} as AnyNode,
				statements,
			}
		: null;
	implicitFragments.set(body, found);
	return found;
}

// A body whose only template content is one @for has no element to hold its rows.
export function soleLoopRoot(component: AnyNode | undefined): AnyNode | null {
	const body = component?.body as AnyNode | undefined;
	if (!body) return null;
	const templates = childNodes(body)
		.map(topLevelTemplateNode)
		.filter((template): template is AnyNode => template !== null);
	const [only] = templates;
	return templates.length === 1 && only?.type === 'JSXForExpression' ? only : null;
}

export function implicitFragmentRoot(component: AnyNode | undefined): AnyNode | null {
	const body = component?.body as AnyNode | undefined;
	return body ? (implicitFragment(body)?.fragment ?? null) : null;
}

// True when the body statement is (or returns, or is part of) the component's render root.
export function isRootStatement(
	component: AnyNode,
	root: AnyNode,
	statement: AnyNode,
): boolean {
	if (statement === root) return true;
	if (statement.type === 'ReturnStatement' && statement.argument === root) return true;
	const body = component.body as AnyNode | undefined;
	const implicit = body ? implicitFragment(body) : null;
	return implicit?.fragment === root && implicit.statements.has(statement);
}

export function firstComponentRoot(component: AnyNode | undefined): AnyNode | null {
	const body = component?.body as AnyNode | undefined;
	if (!body) return null;
	const implicit = implicitFragment(body);
	if (implicit) return supportedFragmentRoot(implicit.fragment);
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
	let firstExported: PublicRenderRootSelection | null = null;
	let fallback: PublicRenderRootSelection | null = null;
	for (const statement of asNodes(ast.body)) {
		const component = getComponentFunction(statement);
		if (!component) continue;
		const root = firstComponentRoot(component.node);
		if (!root) continue;
		const selection = { component: component.node, componentName: component.name, root };
		if (statement.type === 'ExportDefaultDeclaration') return selection;
		if (statement.type === 'ExportNamedDeclaration') firstExported ??= selection;
		fallback ??= selection;
	}
	return firstExported ?? fallback;
}

export function supportedFragmentRoot(fragment: AnyNode): AnyNode | null {
	const children = asNodes(fragment.children).filter((child) => !isIgnorableTextNode(child));
	const supported = children.length > 0 && children.every((child) =>
		((child.type === 'Element' || child.type === 'JSXElement') && isPlainHostTemplateNode(child)) ||
		isConstantTextNode(child) ||
		child.type === 'JSXStyleElement' ||
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
		if (isConstantTextNode(child)) continue;
		if (child.type === 'JSXExpressionContainer') {
			return 'a {expression} that can change, placed directly inside the fragment';
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
		if (node.type === 'JSXExpressionContainer') return null;
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
