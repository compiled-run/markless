import { parseModule } from '@tsrx/core';
import type { RouteManifestRoute } from '../route-manifest.ts';
import { buildRouteManifestFromFileIds } from '../route-manifest.ts';
import type { Plugin } from 'vite';
import { discoverPageFiles, type RouteTypegenFileSystem } from './route-typegen.ts';

const ROUTE_HREF_HELPER_ID = 'virtual:arcade-router/route-href';
const JSX_FILE_FILTER = /\.(?:[jt]sx|tsrx)(?:$|\?)/;
const ROUTER_IMPORT_SOURCES = new Set(['@arcade/router', 'arcade/router']);

type RouteParam = RouteManifestRoute['params'][number];
export type RoutePatternMap = ReadonlyMap<string, readonly RouteParam[]>;

type Node = {
	readonly type?: string;
	readonly start?: number;
	readonly end?: number;
	readonly range?: readonly [number, number];
	readonly [key: string]: unknown;
};

type Edit = {
	readonly start: number;
	readonly end: number;
	readonly text: string;
};

export function anchorTransformPlugin(): Plugin {
	let root = '';
	let routePatterns: RoutePatternMap = new Map();
	let routesLoaded = false;

	const refreshRoutes = async (fs: RouteTypegenFileSystem) => {
		routePatterns = routePatternMap(
			buildRouteManifestFromFileIds(await discoverPageFiles(fs, root)),
		);
		routesLoaded = true;
	};

	return {
		name: 'arcade-router:anchors',
		transform: {
			order: 'pre',
			filter: {
				id: JSX_FILE_FILTER,
			},
			async handler(code, id) {
				if (!isTransformCandidateCode(code)) {
					return;
				}

				if (!routesLoaded) {
					await refreshRoutes(this.fs);
				}

				const ast = parseTransformAst(code, id, (source, options) =>
					this.parse(source, options),
				);
				const transformed = transformAnchorSource(code, ast, routePatterns);

				return transformed === code ? undefined : { code: transformed, map: null };
			},
		},
		configResolved(config) {
			root = config.root;
		},
		async buildStart() {
			await refreshRoutes(this.fs);
		},
		async watchChange() {
			await refreshRoutes(this.fs);
		},
	};
}

function parseTransformAst(
	code: string,
	id: string,
	parse: (source: string, options: Record<string, unknown>) => unknown,
): Node {
	if (id.includes('.tsrx')) {
		return parseModule(code, id) as unknown as Node;
	}

	return parse(code, {
		astType: 'ts',
		lang: id.includes('.jsx') ? 'jsx' : 'tsx',
		range: true,
	}) as unknown as Node;
}

function isTransformCandidateCode(code: string) {
	return (
		code.includes('<a') ||
		[...ROUTER_IMPORT_SOURCES].some((importSource) => code.includes(importSource))
	);
}

export function transformAnchorSource(
	code: string,
	astInput: unknown,
	routePatterns: RoutePatternMap,
) {
	const ast = node(astInput);
	if (!ast) {
		return code;
	}

	const edits: Edit[] = [];
	const linkNames = arcadeRouterLinkImportNames(ast);

	walk(ast, (current) => {
		if (current.type !== 'JSXOpeningElement') {
			return;
		}

		const name = jsxName(node(current.name));
		if (name !== 'a' && (!name || !linkNames.has(name))) {
			return;
		}

		const attributes = nodes(current.attributes);
		const href = findJsxAttribute(attributes, 'href');
		const hrefValue = href ? stringLiteralValue(node(href.value)) : undefined;
		if (!href || !hrefValue || !isRoutePatternHref(hrefValue)) {
			return;
		}

		const routeParams = routePatterns.get(hrefValue);
		if (!routeParams) {
			fail(`Typed route error: ${hrefValue} does not match any route in pages/.`);
		}

		const params = findJsxAttribute(attributes, 'params');
		if (!params) {
			fail(missingParamsMessage(hrefValue, routeParams));
		}

		const paramsExpression = jsxExpression(node(params.value));
		if (!paramsExpression) {
			fail(missingParamsMessage(hrefValue, routeParams));
		}

		validateObjectLiteralParams(hrefValue, routeParams, paramsExpression);

		edits.push({
			...rangeOf(href),
			text: `href={__arcadeRouteHref(${JSON.stringify(hrefValue)}, ${slice(
				code,
				paramsExpression,
			)})}`,
		});
		edits.push({ ...attributeRemovalRange(code, params), text: '' });
	});

	if (edits.length === 0) {
		return code;
	}

	return `${helperImport()}${applyEdits(code, edits)}`;
}

function arcadeRouterLinkImportNames(ast: Node) {
	const names = new Set<string>();

	walk(ast, (current) => {
		if (
			current.type !== 'ImportDeclaration' ||
			!ROUTER_IMPORT_SOURCES.has(literalString(node(current.source)) ?? '')
		) {
			return;
		}

		for (const specifier of nodes(current.specifiers)) {
			if (
				specifier.type === 'ImportSpecifier' &&
				identifierName(node(specifier.imported)) === 'Link'
			) {
				const localName = identifierName(node(specifier.local));
				if (localName) {
					names.add(localName);
				}
			}
		}
	});

	return names;
}

function routePatternMap(manifest: { routes: readonly RouteManifestRoute[] }) {
	return new Map(
		manifest.routes
			.filter((route) => route.params.length > 0)
			.map((route) => [route.pattern, route.params] as const),
	);
}

function validateObjectLiteralParams(
	pattern: string,
	routeParams: readonly RouteParam[],
	paramsExpression: Node,
) {
	if (paramsExpression.type !== 'ObjectExpression') {
		return;
	}

	const expected = new Set(routeParams.map((param) => param.name));
	const actual = objectLiteralKeys(paramsExpression);
	const unknown = actual.filter((param) => !expected.has(param));
	if (unknown.length > 0) {
		fail(`Typed route error: ${pattern} does not define param:\n${list(unknown)}`);
	}

	const missing = routeParams
		.map((param) => param.name)
		.filter((param) => !actual.includes(param));
	if (missing.length > 0) {
		fail(`Typed route error: ${pattern} requires params:\n${list(missing)}`);
	}
}

function objectLiteralKeys(expression: Node) {
	return nodes(expression.properties).flatMap((property) => {
		if (property.type !== 'Property') {
			return [];
		}

		const key = node(property.key);
		const name = key?.type === 'Identifier' ? string(key.name) : literalString(key);
		return name ? [name] : [];
	});
}

function helperImport() {
	return `import { __arcadeRouteHref } from "${ROUTE_HREF_HELPER_ID}";\n`;
}

function missingParamsMessage(pattern: string, routeParams: readonly RouteParam[]) {
	return `Typed route error: ${pattern} requires params:\n${list(
		routeParams.map((param) => param.name),
	)}`;
}

function list(items: readonly string[]) {
	return items.map((item) => `- ${item}`).join('\n');
}

function findJsxAttribute(attributes: readonly Node[], name: string) {
	return attributes.find(
		(attr) => attr.type === 'JSXAttribute' && jsxName(node(attr.name)) === name,
	);
}

function stringLiteralValue(value: Node | undefined) {
	return value?.type === 'Literal' ? string(value.value) : undefined;
}

function literalString(value: Node | undefined) {
	return value?.type === 'Literal' ? string(value.value) : undefined;
}

function identifierName(value: Node | undefined) {
	return value?.type === 'Identifier' ? string(value.name) : undefined;
}

function jsxExpression(value: Node | undefined) {
	if (value?.type !== 'JSXExpressionContainer') {
		return undefined;
	}

	const expression = node(value.expression);
	return expression?.type === 'JSXEmptyExpression' ? undefined : expression;
}

function isRoutePatternHref(href: string) {
	return href.includes('[') && href.includes(']');
}

function attributeRemovalRange(code: string, attribute: Node) {
	const range = rangeOf(attribute);
	let start = range.start;

	while (start > 0 && /\s/.test(code[start - 1] ?? '')) {
		start--;
	}

	return { start, end: range.end };
}

function applyEdits(code: string, edits: readonly Edit[]) {
	let transformed = code;

	for (const edit of [...edits].toSorted((left, right) => right.start - left.start)) {
		transformed = transformed.slice(0, edit.start) + edit.text + transformed.slice(edit.end);
	}

	return transformed;
}

function walk(root: Node, visit: (node: Node) => void) {
	const stack: unknown[] = [root];

	while (stack.length > 0) {
		const current = node(stack.pop());
		if (!current) {
			continue;
		}

		visit(current);

		for (const child of Object.values(current)) {
			if (Array.isArray(child)) {
				stack.push(...child);
			} else {
				stack.push(child);
			}
		}
	}
}

function jsxName(name: Node | undefined): string | undefined {
	return name?.type === 'JSXIdentifier' ? string(name.name) : undefined;
}

function slice(code: string, value: Node) {
	const range = rangeOf(value);
	return code.slice(range.start, range.end);
}

function rangeOf(value: Node) {
	const range = value.range;
	if (range) {
		return { start: range[0], end: range[1] };
	}

	return { start: value.start!, end: value.end! };
}

function nodes(value: unknown): Node[] {
	return Array.isArray(value) ? value.filter((item): item is Node => !!node(item)) : [];
}

function node(value: unknown): Node | undefined {
	return typeof value === 'object' && value !== null ? (value as Node) : undefined;
}

function string(value: unknown) {
	return typeof value === 'string' ? value : undefined;
}

function fail(message: string): never {
	throw new Error(message);
}
