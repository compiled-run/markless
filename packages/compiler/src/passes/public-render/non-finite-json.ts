import { nonFiniteName } from '@markless/serializer';

/**
 * A value printed as the JavaScript that denotes it, where JSON would print a
 * non-finite number as `null`.
 *
 * The emitted modules are JavaScript, so the name the serializer already gives
 * `Infinity` / `-Infinity` / `NaN` denotes those values exactly. A payload with
 * no non-finite number returns `JSON.stringify`'s own bytes, and `undefined`
 * where `JSON.stringify` returns nothing.
 */
export function jsonSourceWithNonFiniteNumbers(value: unknown): string | undefined {
	let found = false;
	const json = JSON.stringify(value, (_key, entry: unknown) => {
		if (typeof entry === 'number' && !Number.isFinite(entry)) found = true;
		return entry;
	});
	if (!found) return json;

	const tokens: string[] = [];
	let placeholder = ' markless-non-finite';
	while (json !== undefined && json.includes(placeholder)) placeholder += '_';
	const tagged = JSON.stringify(value, (_key, entry: unknown) => {
		if (typeof entry !== 'number' || Number.isFinite(entry)) return entry;
		tokens.push(nonFiniteName(entry));
		return `${placeholder}${String(tokens.length - 1)}`;
	});
	if (tagged === undefined) return undefined;
	return tokens.reduce(
		(source, name, index) =>
			source.replace(JSON.stringify(`${placeholder}${String(index)}`), name),
		tagged,
	);
}
