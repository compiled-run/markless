type TextHost = {
	readonly childNodes: ArrayLike<{ readonly nodeType?: number }>;
	readonly ownerDocument?: { createTextNode(data: string): unknown } | null;
	insertBefore(node: unknown, before: unknown): unknown;
};

/**
 * The one child text node a text write owns when its element holds other
 * children too. `at` counts child nodes from the start, or back from the end
 * when negative. An empty value renders no node, so the first write puts one there.
 */
export function marklessTextNode(host: unknown, at: number): unknown {
	const parent = host as TextHost;
	const nodes = parent.childNodes;
	const index = at < 0 ? nodes.length + at : at;
	const found = nodes[index];
	if (found?.nodeType === 3) return found;
	const text = parent.ownerDocument!.createTextNode('');
	parent.insertBefore(text, (at < 0 ? nodes[index + 1] : found) ?? null);
	return text;
}

type SiblingHost = {
	readonly previousSibling: { readonly nodeType?: number } | null;
	readonly nextSibling: { readonly nodeType?: number } | null;
	readonly ownerDocument?: { createTextNode(data: string): unknown } | null;
	readonly parentNode: { insertBefore(node: unknown, before: unknown): unknown } | null;
};

/**
 * The text node right before or after the host, which a text write owns when the
 * two are projected side by side into another component's element. An empty
 * value renders no node, so the first write puts one there.
 */
export function marklessSiblingText(host: unknown, side: 'previous' | 'next'): unknown {
	const element = host as SiblingHost;
	const found = side === 'previous' ? element.previousSibling : element.nextSibling;
	if (found?.nodeType === 3) return found;
	const text = element.ownerDocument!.createTextNode('');
	element.parentNode!.insertBefore(text, side === 'previous' ? host : element.nextSibling);
	return text;
}
