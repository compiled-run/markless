import { marklessAttributeValue } from '../dom-attribute.ts';

/**
 * The HTML a rebuilt @if/@switch arm writes for one attribute binding, by the
 * same presence rule every render path uses. `alwaysPresent` means the name and
 * quotes are already written around it, so only the escaped value goes out.
 */
export function marklessAttributeHtml(
	name: string,
	value: unknown,
	alwaysPresent?: boolean,
): string {
	const text = marklessAttributeValue(name, value);
	if (alwaysPresent) return text === null ? '' : escapeAttribute(text);
	return text === null ? '' : ` ${name}="${escapeAttribute(text)}"`;
}

function escapeAttribute(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}
