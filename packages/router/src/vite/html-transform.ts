/**
 * Users write one document boundary with <Html> for SSR and CSR. SSR needs
 * those attributes before Arcade renders the page, so this transform extracts
 * root <Html> props into a helper while runtime Html stays children-only.
 */

import type { Plugin } from 'vite';

const HELPER = '__arcadeRouterHtmlAttributes';
const SAFE_GLOBALS = new Set(['String', 'Number', 'Boolean', 'Math', 'JSON']);
const DOCUMENT_FILE_LABEL = 'document.tsx or document.jsx';
const DOCUMENT_FILE_FILTER = /(?:^|\/)document\.[tj]sx(?:$|\?)/;

type Node = {
	readonly type?: string;
	readonly start?: number;
	readonly end?: number;
	readonly range?: readonly [number, number];
	readonly [key: string]: unknown;
};

export function htmlTransformPlugin(): Plugin {
	return {
		name: 'arcade-router:html',
		transform: {
			order: 'pre',
			filter: {
				id: DOCUMENT_FILE_FILTER,
			},
			handler(code, id) {
				const ast = this.parse(code, {
					astType: 'ts',
					lang: id.includes('document.jsx') ? 'jsx' : 'tsx',
					range: true,
				}) as unknown as Node;

				return transformHtmlSource(code, ast);
			},
		},
	};
}

export function transformHtmlSource(code: string, astInput: unknown) {
	const ast = node(astInput);
	if (!ast) {
		fail(`ArcadeRouter could not read ${DOCUMENT_FILE_LABEL}. Check it for syntax errors.`);
	}

	const fn = findDefaultDocumentFunction(ast);
	if (fn?.type !== 'ArrowFunctionExpression' && fn?.type !== 'FunctionExpression') {
		fail(
			`ArcadeRouter needs to see your document body in ${DOCUMENT_FILE_LABEL}. Write \`export default (props) => <Html>...</Html>\` instead of passing a named function.`,
		);
	}

	const props = first(nodes(fn.params));
	const propsName = props?.type === 'Identifier' ? string(props.name) : undefined;
	const propsSource = props ? slice(code, props) : '';
	const html = findReturnedHtml(fn);
	const attrs = nodes(node(html.openingElement)?.attributes).map((attr) =>
		htmlAttr(code, attr, propsName),
	);

	const body = attrs.length
		? `{\n${attrs.map(([name, value]) => `    ${JSON.stringify(name)}: ${value}`).join(',\n')}\n  }`
		: '{}';
	const helper = `export function ${HELPER}(${propsSource}) {\n  return ${body};\n}\n`;

	return code.endsWith('\n') ? `${code}\n${helper}` : `${code}\n\n${helper}`;
}

function findDefaultDocumentFunction(ast: Node) {
	for (const statement of nodes(ast.body)) {
		const declaration = node(statement.declaration);
		if (statement.type !== 'ExportDefaultDeclaration') {
			continue;
		}

		if (
			declaration?.type === 'ArrowFunctionExpression' ||
			declaration?.type === 'FunctionExpression'
		) {
			return declaration;
		}
	}

	fail(
		`ArcadeRouter could not find the document function. ${DOCUMENT_FILE_LABEL} must default export \`() => <Html>...</Html>\`.`,
	);
}

function findReturnedHtml(fn: Node) {
	const body = unwrap(node(fn.body));
	const returned =
		body?.type === 'BlockStatement'
			? unwrap(
					node(
						nodes(body.body).find((item) => item.type === 'ReturnStatement')?.argument,
					),
				)
			: body;

	if (returned?.type !== 'JSXElement') {
		fail(
			`ArcadeRouter expected ${DOCUMENT_FILE_LABEL} to return <Html> at the top level. Wrap your document shell in \`<Html>...</Html>\`.`,
		);
	}

	if (jsxName(node(node(returned.openingElement)?.name)) !== 'Html') {
		fail(
			`ArcadeRouter expected ${DOCUMENT_FILE_LABEL} to return <Html> at the top level. Put <head> and <body> inside \`<Html>...</Html>\`.`,
		);
	}

	return returned;
}

function htmlAttr(code: string, attr: Node, propsName: string | undefined) {
	if (attr.type === 'JSXSpreadAttribute') {
		fail(
			'ArcadeRouter does not support spreading props onto <Html> yet. Write each html attribute directly, like `<Html lang="en">`.',
		);
	}

	const name = jsxName(node(attr.name));
	if (!name) {
		fail(
			'ArcadeRouter found an unsupported <Html> attribute name. Use plain html attributes like `lang`, `class`, or `data-theme`.',
		);
	}

	const value = node(attr.value);
	if (!value) {
		return [name, 'true'] as const;
	}

	if (value.type === 'Literal') {
		return [name, JSON.stringify(value.value)] as const;
	}

	if (value.type !== 'JSXExpressionContainer') {
		fail(
			`ArcadeRouter could not understand the <Html> "${name}" attribute. Use a string or JSX expression, like \`${name}="value"\` or \`${name}={props.url.pathname}\`.`,
		);
	}

	const expression = unwrap(node(value.expression));
	if (!expression || expression.type === 'JSXEmptyExpression') {
		fail(
			`ArcadeRouter found an empty <Html> "${name}" attribute expression. Add a value or remove the attribute.`,
		);
	}

	const ref = unsupportedIdentifier(expression, propsName);
	if (ref) {
		fail(
			`ArcadeRouter cannot use "${ref}" in <Html ${name}={...}> because html attributes are read before Arcade renders ${DOCUMENT_FILE_LABEL}. Use props directly, like \`${name}={props.url.pathname}\`, or a literal value.`,
		);
	}

	return [name, slice(code, expression)] as const;
}

function unsupportedIdentifier(root: Node, propsName: string | undefined) {
	const stack: unknown[] = [root];

	while (stack.length > 0) {
		const current = node(stack.pop());
		if (!current) {
			continue;
		}

		if (current.type === 'Identifier') {
			const name = string(current.name);
			if (name && name !== propsName && !SAFE_GLOBALS.has(name)) {
				return name;
			}
			continue;
		}

		if (current.type === 'MemberExpression') {
			stack.push(current.object);
			if (current.computed === true) {
				stack.push(current.property);
			}
			continue;
		}

		if (current.type === 'Property') {
			stack.push(current.value);
			if (current.computed === true) {
				stack.push(current.key);
			}
			continue;
		}

		for (const child of Object.values(current)) {
			if (Array.isArray(child)) {
				stack.push(...child);
			} else {
				stack.push(child);
			}
		}
	}

	return undefined;
}

function jsxName(name: Node | undefined): string | undefined {
	return name?.type === 'JSXIdentifier' ? string(name.name) : undefined;
}

function unwrap(value: Node | undefined): Node | undefined {
	let current = value;
	while (
		current?.type === 'ParenthesizedExpression' ||
		current?.type === 'TSAsExpression' ||
		current?.type === 'TSNonNullExpression'
	) {
		current = node(current.expression);
	}

	return current;
}

function slice(code: string, value: Node) {
	const range = value.range;
	if (range) {
		return code.slice(range[0], range[1]);
	}

	return code.slice(value.start, value.end);
}

function nodes(value: unknown): Node[] {
	return Array.isArray(value) ? value.filter((item): item is Node => !!node(item)) : [];
}

function node(value: unknown): Node | undefined {
	return typeof value === 'object' && value !== null ? (value as Node) : undefined;
}

function first<T>(items: readonly T[]) {
	return items[0];
}

function string(value: unknown) {
	return typeof value === 'string' ? value : undefined;
}

function fail(message: string): never {
	throw new Error(message);
}
