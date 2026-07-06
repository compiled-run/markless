import { toHtml } from 'hast-util-to-html';
import type { Plugin } from 'vite';
import { extname } from 'pathe';
import {
	createMdxHastHandle,
	defineHastPlugin,
	dropHandle,
	HastReader,
	materializeHastTree,
	resolveHastSubscriptions,
	serializeHandle,
	type EstreeProgram,
	type HastNode,
	visitHastHandle,
} from 'satteri';
import { decodePath, parseURL } from 'ufo';

export function mdxTransformPlugin(): Plugin {
	return {
		name: 'markless-router:mdx',
		enforce: 'pre',
		transform: {
			order: 'pre',
			async handler(code, id) {
				if (!isMdxFile(id)) {
					return;
				}

				return {
					code: await transformMdxRoute(code, id),
					map: null,
				};
			},
		},
	};
}

export async function transformMdxRoute(source: string, id: string) {
	const route = parseMdxRoute(source, id);
	const html = route.parts.map((part) => (part.kind === 'html' ? part.html : '')).join('');
	if (route.components.length === 0) {
		return [
			'const marklessMdxPage = {',
			'  renderSsr() {',
			`    return { html: ${JSON.stringify(html)} };`,
			'  }',
			'};',
			'export default marklessMdxPage;',
			'',
		].join('\n');
	}

	return emitComposedMdxRoute(route);
}

type MdxRoute = {
	readonly imports: ReadonlyArray<string>;
	readonly components: ReadonlyArray<MdxComponent>;
	readonly parts: ReadonlyArray<MdxPart>;
};

type MdxComponent = {
	readonly localName: string;
	readonly specifier: string;
	readonly prefix: string;
	readonly props: ReadonlyArray<MdxProp>;
};

type MdxProp = {
	readonly name: string;
	readonly valueExpression: string;
};

type MdxImportedComponent = {
	readonly localName: string;
	readonly specifier: string;
};

type MdxPart =
	| {
			readonly kind: 'html';
			readonly html: string;
			readonly elementCount: number;
	  }
	| {
			readonly kind: 'component';
			readonly componentIndex: number;
	  };

function emitComposedMdxRoute(route: MdxRoute): string {
	return [
			`import { resumeEventOnlyFromPayloadDocument } from '@markless/core/web/event-only-resume';`,
		`import { composeMdxState, composeMdxView, loadMdxSymbol, renderMdxChild, replaceMdxChild, rootFromMdxHtml } from '@markless/router/vite/runtime/mdx-route';`,
		...route.imports,
		'',
		`const marklessMdxParts = ${JSON.stringify(route.parts)};`,
		`const marklessMdxSymbolLoaders = ${renderSymbolLoaders(route.components)};`,
		'',
		'const marklessMdxPage = {',
		'  async renderSsr(props = {}) {',
		'    const marklessMdxChildren = [];',
		`    const html = ${renderHtmlExpression(route, 'ssr')};`,
		'    const state = composeMdxState(marklessMdxChildren);',
		'    const view = composeMdxView(marklessMdxParts, marklessMdxChildren, 0);',
		'    return { html, ...(state ? { state } : {}), ...(view ? { view } : {}) };',
		'  },',
		'  renderCsr(props = {}) {',
		'    const marklessMdxChildren = [];',
		`    const root = rootFromMdxHtml(${renderCsrHtml(route)});`,
		...route.components.flatMap((component, index) => [
			`    const marklessMdxChild${index} = ${component.localName}.renderCsr?.(${componentPropsExpression(component)});`,
			`    replaceMdxChild(root, ${index}, marklessMdxChild${index}?.root);`,
			`    if (marklessMdxChild${index}) marklessMdxChildren.push({ componentIndex: ${index}, hostPrefix: ${JSON.stringify(component.prefix)}, symbolPrefix: ${JSON.stringify(component.prefix)}, output: marklessMdxChild${index} });`,
		]),
		'    const state = composeMdxState(marklessMdxChildren);',
		'    const view = composeMdxView(marklessMdxParts, marklessMdxChildren, 1);',
		'    return {',
		'      root,',
		'      ...(state ? { state } : {}),',
		'      ...(view ? { view } : {}),',
		'      loadSymbol(symbolId) { return marklessMdxLoadSymbol(symbolId, marklessMdxChildren); },',
		'      connectRuntime(context) { for (const child of marklessMdxChildren) child.output?.connectRuntime?.(context); },',
		'    };',
		'  },',
		...renderMdxPreload(route.components),
		'};',
		'export default marklessMdxPage;',
		'',
		'export async function resumeContainerEvent(input) {',
		'  await resumeEventOnlyFromPayloadDocument({',
		'    document: input.root,',
		'    root: input.root,',
		'    event: input.event,',
		'    element: input.element,',
		'    eventRecord: input.eventRecord,',
		'    loadSymbol: marklessMdxLoadSymbol,',
		'  });',
		'}',
		'',
		'function marklessMdxLoadSymbol(symbolId, children = []) {',
		'  return loadMdxSymbol(symbolId, children, marklessMdxSymbolLoaders);',
		'}',
		'',
	].join('\n');
}

function renderMdxPreload(components: ReadonlyArray<MdxComponent>): string[] {
	const localNames = [...new Set(components.map((component) => component.localName))];
	return [
		'  preload() {',
		`    return Promise.all([${localNames
			.map((localName) => `${localName}.preload?.()`)
			.join(', ')}].filter(Boolean));`,
		'  },',
	];
}

function isMdxFile(id: string) {
	return extname(decodePath(parseURL(id).pathname)) === '.mdx';
}

function parseMdxRoute(source: string, id: string): MdxRoute {
	const imports: string[] = [];
	const importedComponents = new Map<string, MdxImportedComponent>();
	const components: MdxComponent[] = [];

	const handle = createMdxHastHandle(source);
	let root: HastNode;
	try {
		const importCollector = defineHastPlugin({
			name: 'markless-router-mdx-imports',
			mdxjsEsm(node) {
				for (const imported of tsrxImportsFromProgram(node.parseExpression(), id)) {
					if (!importedComponents.has(imported.localName)) {
						importedComponents.set(imported.localName, imported);
						imports.push(
							`import ${imported.localName} from ${JSON.stringify(imported.specifier)};`,
						);
					}
				}
			},
		});
		visitHastHandle(
			handle,
			importCollector,
			resolveHastSubscriptions(importCollector),
			source,
			id,
		);
		root = materializeHastTree(new HastReader(serializeHandle(handle)));
	} finally {
		dropHandle(handle);
	}

	const parts = routePartsFromHast(root.children ?? [], {
		components,
		id,
		importedComponents,
	});

	return { imports, components, parts };
}

function tsrxImportsFromProgram(program: EstreeProgram | null, id: string): MdxImportedComponent[] {
	const imports: MdxImportedComponent[] = [];
	if (!program) {
		throw new Error(`Markless Router MDX could not parse ESM import syntax: ${id}`);
	}

	for (const statement of program.body) {
		if (statement.type !== 'ImportDeclaration') {
			throw new Error(
				`Markless Router MDX only supports importing TSRX components before content: ${id}`,
			);
		}

		const specifier = statement.source.value;
		const defaultImport = statement.specifiers.find(
			(importSpecifier): importSpecifier is EstreeImportDefaultSpecifier =>
				importSpecifier.type === 'ImportDefaultSpecifier',
		);

		if (
			typeof specifier !== 'string' ||
			!specifier.endsWith('.tsrx') ||
			!defaultImport ||
			statement.specifiers.length !== 1
		) {
			throw new Error(
				`Markless Router MDX currently supports default imports from .tsrx files only: ${id}`,
			);
		}

		imports.push({ localName: defaultImport.local.name, specifier });
	}

	return imports;
}

type EstreeImportDefaultSpecifier = Extract<
	EstreeProgram['body'][number],
	{ type: 'ImportDeclaration' }
>['specifiers'][number] & {
	readonly type: 'ImportDefaultSpecifier';
	readonly local: {
		readonly name: string;
	};
};

function routePartsFromHast(nodes: readonly HastNode[], context: RoutePartsContext): MdxPart[] {
	const parts: MdxPart[] = [];
	let staticNodes: HastNode[] = [];

	for (const node of nodes) {
		if (isMdxEsm(node)) {
			continue;
		}

		if (isMdxJsxFlowElement(node)) {
			appendHtmlPart(parts, staticNodes, context.id);
			staticNodes = [];
			parts.push(componentPart(node, context));
			continue;
		}

		staticNodes.push(node);
	}

	appendHtmlPart(parts, staticNodes, context.id);
	return parts;
}

function componentPart(node: MdxJsxElementNode, context: RoutePartsContext): MdxPart {
	const name = node.name;
	const imported = name ? context.importedComponents.get(name) : undefined;
	if (!imported) {
		throw new Error(`Markless Router MDX component is not imported from .tsrx: ${name}`);
	}

	const componentIndex = context.components.length;
	const props = componentProps(node, context.id);
	const children = renderStaticHtml(node.children, context.id);
	context.components.push({
		...imported,
		prefix: `m${componentIndex}:`,
		props: children
			? [
					...props,
					{
						name: 'children',
						valueExpression: JSON.stringify(children),
					},
				]
			: props,
	});
	return { kind: 'component', componentIndex };
}

function appendHtmlPart(parts: MdxPart[], nodes: readonly HastNode[], id: string) {
	if (nodes.length === 0) {
		return;
	}
	const staticNodes = normalizeStaticHastNodes(nodes, id);
	const html = toHtml({ type: 'root', children: staticNodes }, { allowDangerousHtml: true });
	if (html) {
		parts.push({ kind: 'html', html, elementCount: countHastElements(staticNodes) });
	}
}

function renderStaticHtml(nodes: readonly HastNode[], id: string): string {
	if (nodes.length === 0) {
		return '';
	}
	return toHtml(
		{ type: 'root', children: normalizeStaticHastNodes(nodes, id) },
		{ allowDangerousHtml: true },
	);
}

function normalizeStaticHastNodes(nodes: readonly HastNode[], id: string): HastNode[] {
	return nodes.flatMap((node) => normalizeStaticHastNode(node, id));
}

function normalizeStaticHastNode(node: HastNode, id: string): HastNode[] {
	if (isMdxEsm(node)) {
		return [];
	}
	if (isMdxJsxFlowElement(node) || isMdxJsxTextElement(node)) {
		throw new Error(
			`Markless Router MDX only supports imported TSRX components as route-level MDX elements or static markdown children: ${id}`,
		);
	}
	if (isMdxExpression(node)) {
		const value = literalSafeExpressionValue(node.value, id);
		return [{ type: 'text', value: value == null ? '' : String(value) } as HastNode];
	}
	if ('children' in node && Array.isArray(node.children)) {
		return [
			{
				...node,
				children: normalizeStaticHastNodes(node.children as HastNode[], id),
			} as HastNode,
		];
	}
	return [node];
}

function componentProps(node: MdxJsxElementNode, id: string): MdxProp[] {
	return node.attributes.map((attribute) => componentProp(attribute, id));
}

function componentProp(attribute: MdxJsxAttributeNode, id: string): MdxProp {
	if (attribute.type === 'mdxJsxExpressionAttribute') {
		throw new Error(
			`Markless Router MDX cannot lower spread attributes because they depend on MDX JavaScript scope that Markless does not execute during resume: ${id}`,
		);
	}
	const value = attribute.value;
	if (value == null) {
		return { name: attribute.name, valueExpression: 'true' };
	}
	if (typeof value === 'string') {
		return { name: attribute.name, valueExpression: JSON.stringify(value) };
	}
	return {
		name: attribute.name,
		valueExpression: literalValueExpression(literalSafeExpressionValue(value.value, id), id),
	};
}

function literalSafeExpressionValue(source: string, id: string): unknown {
	const program = parseMdxExpressionValue(source, id);
	if (!program) {
		throw new Error(
			`Markless Router MDX only supports literal-safe expressions in attributes and markdown: ${id}`,
		);
	}
	const statement = program.body[0] as EstreeNode | undefined;
	if (program.body.length !== 1 || statement?.type !== 'ExpressionStatement') {
		throw new Error(
			`Markless Router MDX only supports literal-safe expressions in attributes and markdown: ${id}`,
		);
	}
	return evaluateLiteralExpression(statement.expression as EstreeNode, id);
}

function parseMdxExpressionValue(source: string, id: string): EstreeProgram | null {
	const handle = createMdxHastHandle(`{${source}}`);
	let program: EstreeProgram | null = null;
	try {
		const expressionParser = defineHastPlugin({
			name: 'markless-router-mdx-expression',
			mdxFlowExpression(node) {
				program = node.parseExpression();
			},
			mdxTextExpression(node) {
				program = node.parseExpression();
			},
		});
		visitHastHandle(
			handle,
			expressionParser,
			resolveHastSubscriptions(expressionParser),
			`{${source}}`,
			id,
		);
		return program;
	} finally {
		dropHandle(handle);
	}
}

function evaluateLiteralExpression(node: EstreeNode | undefined, id: string): unknown {
	if (!node) {
		throw literalExpressionError(id);
	}
	if (node.type === 'Literal') {
		const value = node.value;
		if (
			typeof value === 'string' ||
			typeof value === 'number' ||
			typeof value === 'boolean' ||
			value === null
		) {
			return value;
		}
		throw literalExpressionError(id);
	}
	if (node.type === 'UnaryExpression') {
		const value = evaluateLiteralExpression(node.argument as EstreeNode, id);
		if (node.operator === '-' && typeof value === 'number') return -value;
		if (node.operator === '+' && typeof value === 'number') return value;
		if (node.operator === '!') return !value;
		throw literalExpressionError(id);
	}
	if (node.type === 'ArrayExpression') {
		return (node.elements as ReadonlyArray<EstreeNode | null>).map((element) =>
			evaluateLiteralExpression(element ?? undefined, id),
		);
	}
	if (node.type === 'ObjectExpression') {
		const value: Record<string, unknown> = {};
		for (const property of node.properties as ReadonlyArray<EstreeNode>) {
			if (
				property.type !== 'Property' ||
				property.kind !== 'init' ||
				property.method ||
				property.computed
			) {
				throw literalExpressionError(id);
			}
			const key = property.key as EstreeNode;
			const name =
				key.type === 'Identifier'
					? key.name
					: key.type === 'Literal' && typeof key.value === 'string'
						? key.value
						: undefined;
			if (!name) throw literalExpressionError(id);
			value[name] = evaluateLiteralExpression(property.value as EstreeNode, id);
		}
		return value;
	}
	if (node.type === 'TemplateLiteral' && (node.expressions as readonly unknown[]).length === 0) {
		return (
			node.quasis as ReadonlyArray<{ readonly value?: { readonly cooked?: string | null } }>
		)
			.map((quasi) => quasi.value?.cooked ?? '')
			.join('');
	}
	throw literalExpressionError(id);
}

function literalValueExpression(value: unknown, id: string): string {
	if (typeof value === 'number' && !Number.isFinite(value)) {
		throw literalExpressionError(id);
	}
	const json = JSON.stringify(value);
	if (json === undefined) {
		throw literalExpressionError(id);
	}
	return json;
}

function literalExpressionError(id: string) {
	return new Error(
		`Markless Router MDX only supports literal-safe expressions in attributes and markdown: ${id}`,
	);
}

function renderHtmlExpression(route: MdxRoute, mode: 'ssr' | 'csr'): string {
	return joinExpressions(
		route.parts.map((part) => {
			if (part.kind === 'html') return JSON.stringify(part.html);
			if (mode === 'csr')
				return JSON.stringify(
					`<span data-markless-mdx-child="${part.componentIndex}"></span>`,
				);

			const component = route.components[part.componentIndex]!;
			return `(await renderMdxChild(marklessMdxChildren, ${component.localName}, ${componentPropsExpression(component)}, { componentIndex: ${part.componentIndex}, hostPrefix: ${JSON.stringify(component.prefix)}, symbolPrefix: ${JSON.stringify(component.prefix)} }))`;
		}),
	);
}

function componentPropsExpression(component: MdxComponent): string {
	if (component.props.length === 0) {
		return '{}';
	}
	return `{ ${component.props
		.map((prop) => `${JSON.stringify(prop.name)}: ${prop.valueExpression}`)
		.join(', ')} }`;
}

function renderCsrHtml(route: MdxRoute): string {
	return `"<main data-markless-mdx-root>" + ${renderHtmlExpression(route, 'csr')} + "</main>"`;
}

function joinExpressions(expressions: ReadonlyArray<string>): string {
	const filtered = expressions.filter((expression) => expression !== '""');
	return filtered.length === 0 ? '""' : filtered.join(' + ');
}

function countHastElements(nodes: readonly HastNode[]): number {
	let count = 0;
	for (const node of nodes) {
		if (node.type === 'element') {
			count += 1;
		}
		if ('children' in node && Array.isArray(node.children)) {
			count += countHastElements(node.children as HastNode[]);
		}
	}
	return count;
}

function renderSymbolLoaders(components: ReadonlyArray<MdxComponent>): string {
	return `[${components
		.map(
			(component) =>
				`{ prefix: ${JSON.stringify(component.prefix)}, loadSymbol(symbolId) { return import(${JSON.stringify(`${component.specifier}?markless-symbols`)}).then((mod) => mod.loadSymbol(symbolId.slice(${component.prefix.length}))); } }`,
		)
		.join(', ')}]`;
}

function isMdxEsm(node: HastNode): node is Extract<HastNode, { type: 'mdxjsEsm' }> {
	return node.type === 'mdxjsEsm';
}

function isMdxJsxFlowElement(
	node: HastNode,
): node is Extract<HastNode, { type: 'mdxJsxFlowElement' }> {
	return node.type === 'mdxJsxFlowElement';
}

function isMdxJsxTextElement(
	node: HastNode,
): node is Extract<HastNode, { type: 'mdxJsxTextElement' }> {
	return node.type === 'mdxJsxTextElement';
}

function isMdxExpression(node: HastNode) {
	return node.type === 'mdxFlowExpression' || node.type === 'mdxTextExpression';
}

type MdxJsxElementNode = Extract<HastNode, { type: 'mdxJsxFlowElement' | 'mdxJsxTextElement' }>;
type MdxJsxAttributeNode = MdxJsxElementNode['attributes'][number];
type EstreeNode = {
	readonly type: string;
	readonly [key: string]: unknown;
};

type RoutePartsContext = {
	readonly components: MdxComponent[];
	readonly id: string;
	readonly importedComponents: ReadonlyMap<string, MdxImportedComponent>;
};
