import { asNodes, getIdentifierName, type AnyNode } from './nodes.ts';

// Spread attributes carry no name node; callers that iterate named attributes
// must branch on this before reading `attribute.name`.
export function isSpreadAttribute(node: AnyNode): boolean {
	return node.type === 'SpreadAttribute' || node.type === 'JSXSpreadAttribute';
}

// Host decision (TSRX defers component recognition to the host): Markless
// treats these module statements as components — function declarations, and
// const/let declarations whose initializer is an arrow or function expression
// with a TSRX @{...} body. The name comes from the declaration or declarator.
export function getComponentFunction(
	statement: AnyNode,
): { readonly node: AnyNode; readonly name: string } | null {
	const declaration =
		statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration'
			? ((statement.declaration as AnyNode | undefined) ?? statement)
			: statement;
	if (!declaration || typeof declaration !== 'object') return null;

	if (declaration.type === 'FunctionDeclaration') {
		const name = getIdentifierName(declaration.id as AnyNode | undefined);
		if ((declaration.body as AnyNode | undefined)?.type !== 'JSXCodeBlock') return null;
		return name ? { node: declaration, name } : null;
	}

	if (declaration.type === 'VariableDeclaration') {
		const [declarator] = asNodes(declaration.declarations);
		const name = getIdentifierName(declarator?.id as AnyNode | undefined);
		const init = declarator?.init as AnyNode | undefined;
		if (!name || !init) return null;
		const isFunctionForm =
			init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression';
		if (!isFunctionForm) return null;
		// Only TSRX-producing bodies count; plain helper arrows stay helpers.
		if ((init.body as AnyNode | undefined)?.type !== 'JSXCodeBlock') return null;
		return { node: init, name };
	}

	return null;
}

// Dynamic tags author the tag position as an expression container:
// <{expr}>...</{expr}>. Returns the tag expression, or undefined for a
// statically named element.
export function getDynamicTagExpression(node: AnyNode): AnyNode | undefined {
	const name = (node.id ?? (node.openingElement as AnyNode | undefined)?.name) as
		| AnyNode
		| undefined;
	// Only true expression containers are dynamic tags; member-expression
	// names (<ui.Row />) are component references, not runtime tag values.
	if (name?.type === 'JSXExpressionContainer' || name?.type === 'TSRXExpression') {
		return name.expression as AnyNode | undefined;
	}
	return undefined;
}

// True when a template subtree contains only host elements, static text, and
// expression children — the shapes SSR string emission can render without
// component, control-flow, or style handling. Used to gate repeat rows and
// @empty branches, whose element counts must be statically known.
export function isPlainHostTemplateNode(node: AnyNode): boolean {
	if (isStaticTextNode(node)) return true;
	if (node.type === 'JSXExpressionContainer' || node.type === 'TSRXExpression') return true;
	if (node.type !== 'Element' && node.type !== 'JSXElement') return false;
	const tagName = getElementTagName(node);
	if (!tagName || !isHostTagName(tagName)) return false;
	return asNodes(node.children).every(
		(child) => isIgnorableJsxTextNode(child) || isPlainHostTemplateNode(child),
	);
}

// A bare `{expr}` written where markup takes statements - an @if/@switch arm,
// a @for row, a @try arm - parses as a block holding one expression statement,
// not as an expression container. Only call this in those statement positions:
// an arrow handler body `() => { count++ }` has the identical shape and is a
// real block.
export function markupInterpolationExpression(node: AnyNode): AnyNode | undefined {
	if (node.type !== 'BlockStatement') return undefined;
	const body = asNodes(node.body);
	if (body.length !== 1) return undefined;
	const [statement] = body;
	if (statement?.type !== 'ExpressionStatement') return undefined;
	return statement.expression as AnyNode | undefined;
}

export function getElementTagName(node: AnyNode): string | null {
	const name = (node.id ?? (node.openingElement as AnyNode | undefined)?.name) as
		| AnyNode
		| undefined;
	return getIdentifierName(name) ?? memberTagName(name);
}

// <checkbox.root />: the authored dotted path is the component's name.
function memberTagName(node: AnyNode | undefined): string | null {
	if (node?.type !== 'JSXMemberExpression' && node?.type !== 'MemberExpression') return null;
	const object = node.object as AnyNode | undefined;
	const objectName = getIdentifierName(object) ?? memberTagName(object);
	const propertyName = getIdentifierName(node.property as AnyNode | undefined);
	return objectName && propertyName ? `${objectName}.${propertyName}` : null;
}

export function isMemberTagName(name: string): boolean {
	return name.includes('.');
}

// `checkbox` in `checkbox.root`: the binding that must resolve.
export function memberTagRootName(name: string): string {
	return name.split('.')[0] ?? name;
}

export function memberTagPropertyPath(name: string): ReadonlyArray<string> {
	return name.split('.').slice(1);
}

export function getElementAttributes(node: AnyNode): AnyNode[] {
	const directAttributes = asNodes(node.attributes);
	if (directAttributes.length > 0) return directAttributes;

	return asNodes((node.openingElement as AnyNode | undefined)?.attributes);
}

export function unwrapExpressionContainer(node: AnyNode | undefined): AnyNode | undefined {
	if (node?.type === 'JSXExpressionContainer' || node?.type === 'TSRXExpression') {
		return node.expression as AnyNode | undefined;
	}

	return node;
}

export function isHostTagName(name: string): boolean {
	// Dotted tags are components at any case.
	if (isMemberTagName(name)) return false;
	return name.length > 0 && name[0] === name[0].toLowerCase();
}

export function isStaticTextNode(node: AnyNode): boolean {
	return node.type === 'JSXText' || node.type === 'Literal';
}

export function staticTextValue(node: AnyNode): string {
	const value = typeof node.value === 'string' ? node.value : '';
	const normalized = value.replace(/\s+/g, ' ');
	return normalized.trim() ? normalized : '';
}

export function trimmedStaticTextValue(node: AnyNode): string {
	return staticTextValue(node).trim();
}

export function isIgnorableStaticTextNode(node: AnyNode): boolean {
	return isStaticTextNode(node) && !staticTextValue(node);
}

export function isIgnorableJsxTextNode(node: AnyNode): boolean {
	return node.type === 'JSXText' && typeof node.value === 'string' && node.value.trim() === '';
}

export function escapeHtml(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function escapeAttribute(value: string): string {
	return escapeHtml(value).replaceAll('"', '&quot;');
}
