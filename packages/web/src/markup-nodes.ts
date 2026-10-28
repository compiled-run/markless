type MarkupHolder = { readonly firstChild?: unknown; readonly childNodes?: ArrayLike<unknown> };
type MarkupTemplate = { innerHTML: string; readonly content?: MarkupHolder | null };

export type MarkupParent = { readonly localName?: string } | null;

// A detached <template> parses HTML, so markup bound for an <svg> is parsed inside one: its elements and xlink:/xml: attributes land in their namespaces.
export function markupNodes<Node>(
	template: MarkupTemplate,
	html: string,
	parent?: MarkupParent | undefined,
): ReadonlyArray<Node> {
	const svg = !!parent && 'ownerSVGElement' in parent && parent.localName !== 'foreignObject';
	template.innerHTML = svg ? `<svg>${html}</svg>` : html;
	const holder = svg ? (template.content?.firstChild as MarkupHolder) : template.content;
	const nodes = Array.from(holder?.childNodes ?? []) as ReadonlyArray<Node>;
	(
		globalThis as { __marklessPropertySeeds?: (nodes: ArrayLike<unknown>) => void }
	).__marklessPropertySeeds?.(nodes);
	return nodes;
}
