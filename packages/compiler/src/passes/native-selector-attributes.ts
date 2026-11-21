import { parse as parseCss } from 'yuku-css';

/** The attribute names the selectors of a stylesheet test (`[aria-label]`, `:is([ui-open])`), lowercased as HTML matches them. */
export function selectorAttributes(cssText: string): ReadonlySet<string> {
	const found = new Set<string>();
	const visit = (node: unknown): void => {
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (node === null || typeof node !== 'object') return;
		const record = node as { readonly type?: unknown; readonly name?: { readonly name?: unknown } };
		if (record.type === 'AttributeSelector' && typeof record.name?.name === 'string')
			found.add(record.name.name.toLowerCase());
		for (const value of Object.values(node)) visit(value);
	};
	visit(parseCss(cssText).ast);
	return found;
}
