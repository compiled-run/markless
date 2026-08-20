export type AnyNode = {
	readonly type?: string;
	readonly start?: number;
	readonly end?: number;
	readonly [key: string]: unknown;
};

const ignoredWalkKeys = new Set([
	'closingElement',
	'comments',
	'id',
	'leadingComments',
	'loc',
	'metadata',
	'openingElement',
	'parent',
	'range',
	'trailingComments',
]);

export function walkNode(node: AnyNode | null | undefined, visit: (node: AnyNode) => void): void {
	if (!node || typeof node !== 'object') return;

	visit(node);

	for (const child of childNodes(node)) {
		walkNode(child, visit);
	}
}

export function childNodes(node: AnyNode): AnyNode[] {
	const children: AnyNode[] = [];

	for (const [key, value] of Object.entries(node)) {
		if (ignoredWalkKeys.has(key)) continue;

		if (Array.isArray(value)) {
			for (const item of value) {
				if (isNode(item)) children.push(item);
			}
			continue;
		}

		if (isNode(value)) children.push(value);
	}

	return children;
}

export function asNodes(value: unknown): AnyNode[] {
	return Array.isArray(value) ? value.filter(isNode) : [];
}

export function isNode(value: unknown): value is AnyNode {
	return (
		typeof value === 'object' && value !== null && typeof (value as AnyNode).type === 'string'
	);
}

export function getIdentifierName(node: AnyNode | undefined | null): string | null {
	return typeof node?.name === 'string' ? node.name : null;
}

const typeAssertionTypes = new Set([
	'TSAsExpression',
	'TSSatisfiesExpression',
	'TSNonNullExpression',
	'TSTypeAssertion',
	'TSInstantiationExpression',
	// The yuku parser keeps authored parentheses as nodes, so `(x satisfies T)`
	// hides its cast behind one.
	'ParenthesizedExpression',
]);

// `false as boolean | 'mixed'` is the value `false` wearing a type. Every pass
// that reads a value out of the AST must see through the assertion, or the
// value looks unknowable and its lowering silently degrades.
export function unwrapTypeAssertion(node: AnyNode | undefined): AnyNode | undefined {
	let current = node;
	while (current && typeAssertionTypes.has(current.type ?? '')) {
		current = current.expression as AnyNode | undefined;
	}
	return current;
}
