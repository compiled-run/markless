/**
 * The body of a `<style>` or `<script>` element as written, which the parser keeps as text,
 * or null when the body is an expression instead.
 */
export function rawElementText(element: object): string | null {
	const children = (element as { readonly children?: unknown }).children;
	let text = '';
	if (!Array.isArray(children)) return text;
	for (const child of children as Array<{ type?: unknown; value?: unknown }>) {
		if (child?.type !== 'JSXText' || typeof child.value !== 'string') return null;
		text += child.value;
	}
	return text;
}
