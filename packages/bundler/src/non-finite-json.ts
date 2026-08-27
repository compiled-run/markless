import { nonFiniteName, type NonFiniteNumberName } from '@markless/serializer';

/** The escaped spelling a marker takes once it is inside a JSON string. */
function markerInJson(marker: string): string {
	return JSON.stringify(marker).slice(1, -1);
}

/**
 * A payload printed as the JavaScript the emitted module actually is.
 *
 * JSON has no form for a non-finite number and prints one as `null`, so a folded
 * `1e400` reached the page as a silent wrong number. The name the serializer
 * already gives that value denotes it exactly in JavaScript. A payload holding
 * no non-finite number prints byte for byte as `JSON.stringify`, which is what
 * the emitted-byte pins on this module depend on.
 */
export function jsonSourceWithNonFiniteNumbers(value: unknown): string {
	let found = false;
	const json = JSON.stringify(value, (_key, item: unknown) => {
		if (typeof item === 'number' && !Number.isFinite(item)) found = true;
		return item;
	});
	if (!found) return json;

	const names: NonFiniteNumberName[] = [];
	// An authored string spelling the marker would otherwise be rewritten as a number.
	let marker = '\u0000markless-non-finite';
	while (json.includes(markerInJson(marker))) marker += '_';

	const tagged = JSON.stringify(value, (_key, item: unknown) => {
		if (typeof item !== 'number' || Number.isFinite(item)) return item;
		names.push(nonFiniteName(item));
		return `${marker}${String(names.length - 1)}`;
	});
	return names.reduce(
		(source, name, index) =>
			source.replace(JSON.stringify(`${marker}${String(index)}`), name),
		tagged,
	);
}
