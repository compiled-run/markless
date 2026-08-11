// Authored expression values reach these helpers unconstrained; each one
// narrows the value itself before use.
export type MarklessPublicPath = ReadonlyArray<string | number>;
type MarklessAttributeValues = Readonly<Record<string, unknown>> | null | undefined;

export function marklessCsrText(value: unknown) {
	return marklessCsrEscape(value == null ? '' : String(value));
}
export function marklessCsrChildrenHtml(value: unknown) {
	return value == null ? '' : String(value);
}
export function marklessCsrAttribute(name: string, value: unknown) {
	return ` ${name}="${marklessCsrEscape(value == null ? '' : String(value))}"`;
}
export function marklessCsrDynamicTagName(value: unknown) {
	if (value === null || value === undefined || value === false || value === '') return null;
	const tag = String(value);
	if (!/^[a-zA-Z][a-zA-Z0-9:_.-]*$/.test(tag))
		throw new Error('MARKLESS_DYNAMIC_TAG_INVALID: ' + tag);
	return tag;
}
export function marklessCsrSpreadAttributes(values: MarklessAttributeValues, scopeClass?: string) {
	let html = '';
	let classSeen = false;
	for (const key of Object.keys(values ?? {})) {
		if (
			!/^[A-Za-z_][\w.:-]*$/.test(key) ||
			/^on[A-Z]/.test(key) ||
			key === 'attach' ||
			key === 'el' ||
			key === 'children'
		)
			continue;
		const value = values?.[key];
		if (value === null || value === undefined || value === false) continue;
		if (key === 'class' && scopeClass) {
			classSeen = true;
			html += marklessCsrAttribute(
				'class',
				(value === true ? '' : String(value)) + ' ' + scopeClass,
			);
			continue;
		}
		html += value === true ? ` ${key}=""` : marklessCsrAttribute(key, value);
	}
	if (scopeClass && !classSeen) html += ` class="${scopeClass}"`;
	return html;
}
export function marklessCsrEscape(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}
export function marklessSsrText(value: unknown) {
	return marklessSsrEscape(value == null ? '' : String(value));
}
export function marklessSsrChildrenHtml(value: unknown) {
	return value == null ? '' : String(value);
}
export function marklessSsrAttribute(name: string, value: unknown) {
	return ` ${name}="${marklessSsrEscape(value == null ? '' : String(value))}"`;
}
export function marklessSsrDynamicTagName(value: unknown) {
	if (value === null || value === undefined || value === false || value === '') return null;
	const tag = String(value);
	if (!/^[a-zA-Z][a-zA-Z0-9:_.-]*$/.test(tag))
		throw new Error('MARKLESS_DYNAMIC_TAG_INVALID: ' + tag);
	return tag;
}
export function marklessSsrSpreadAttributes(values: MarklessAttributeValues, scopeClass?: string) {
	let html = '';
	let classSeen = false;
	for (const key of Object.keys(values ?? {})) {
		if (
			!/^[A-Za-z_][\w.:-]*$/.test(key) ||
			/^on[A-Z]/.test(key) ||
			key === 'attach' ||
			key === 'el' ||
			key === 'children'
		)
			continue;
		const value = values?.[key];
		if (value === null || value === undefined || value === false) continue;
		if (key === 'class' && scopeClass) {
			classSeen = true;
			html += marklessSsrAttribute(
				'class',
				(value === true ? '' : String(value)) + ' ' + scopeClass,
			);
			continue;
		}
		html += value === true ? ` ${key}=""` : marklessSsrAttribute(key, value);
	}
	if (scopeClass && !classSeen) html += ` class="${scopeClass}"`;
	return html;
}
export function marklessSsrEscape(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}
export function readMarklessPublicPath(value: unknown, path: MarklessPublicPath): unknown {
	let current = value;
	for (const key of path) current = (current as MarklessAttributeValues)?.[key];
	return current;
}
export function marklessSsrReadPublicPath(value: unknown, path: MarklessPublicPath): unknown {
	let current = value;
	for (const key of path) current = (current as MarklessAttributeValues)?.[key];
	return current;
}
