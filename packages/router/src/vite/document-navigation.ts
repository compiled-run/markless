import { parseModule } from '@tsrx/yuku';

// 'document' = route changes need a fresh server document because the shell
// renders from the request URL; 'client' = the shell is the same on every route.
export type DocumentNavigation = 'client' | 'document';

type Node = {
	readonly type?: string;
	readonly [key: string]: unknown;
};

// Props the router passes Document that never vary by route.
const ROUTE_INVARIANT_DOCUMENT_PROPS = new Set(['children']);

export function documentNavigationFor(source: string | undefined, id: string): DocumentNavigation {
	if (source === undefined) return 'client';
	let program: Node;
	try {
		program = parseModule(source, id) as unknown as Node;
	} catch {
		return 'document';
	}
	const body = nodes(program.body);
	if (body.some(exportsHtmlAttributesHook)) return 'document';
	const component = defaultExportedFunction(body);
	if (!component) return 'document';
	return readsOnlyRouteInvariantProps(nodes(component.params)) ? 'client' : 'document';
}

function readsOnlyRouteInvariantProps(params: readonly Node[]): boolean {
	if (params.length === 0) return true;
	if (params.length > 1) return false;
	const [param] = params;
	const pattern = param?.type === 'AssignmentPattern' ? node(param.left) : param;
	if (pattern?.type !== 'ObjectPattern') return false;
	return nodes(pattern.properties).every((property) => {
		if (property.type !== 'Property' || property.computed === true) return false;
		const key = node(property.key);
		const name = key?.type === 'Identifier' ? key.name : key?.value;
		return typeof name === 'string' && ROUTE_INVARIANT_DOCUMENT_PROPS.has(name);
	});
}

function defaultExportedFunction(body: readonly Node[]): Node | undefined {
	const exported = node(body.find((statement) => statement.type === 'ExportDefaultDeclaration'));
	const declaration = node(exported?.declaration);
	if (isFunction(declaration)) return declaration;
	if (declaration?.type !== 'Identifier') return undefined;
	const name = declaration.name;
	for (const statement of body) {
		const local =
			statement.type === 'ExportNamedDeclaration' ? node(statement.declaration) : statement;
		if (local?.type === 'FunctionDeclaration' && node(local.id)?.name === name) return local;
		if (local?.type !== 'VariableDeclaration') continue;
		for (const declarator of nodes(local.declarations)) {
			if (node(declarator.id)?.name !== name) continue;
			const init = node(declarator.init);
			return isFunction(init) ? init : undefined;
		}
	}
	return undefined;
}

function exportsHtmlAttributesHook(statement: Node): boolean {
	if (statement.type !== 'ExportNamedDeclaration') return false;
	const declaration = node(statement.declaration);
	const declaredNames = [
		node(declaration?.id)?.name,
		...nodes(declaration?.declarations).map((declarator) => node(declarator.id)?.name),
		...nodes(statement.specifiers).map((specifier) => node(specifier.exported)?.name),
	];
	return declaredNames.includes('__marklessRouterHtmlAttributes');
}

function isFunction(value: Node | undefined): boolean {
	return (
		value?.type === 'FunctionDeclaration' ||
		value?.type === 'FunctionExpression' ||
		value?.type === 'ArrowFunctionExpression'
	);
}

function node(value: unknown): Node | undefined {
	return typeof value === 'object' && value !== null ? (value as Node) : undefined;
}

function nodes(value: unknown): Node[] {
	return Array.isArray(value) ? (value.filter((item) => node(item)) as Node[]) : [];
}
