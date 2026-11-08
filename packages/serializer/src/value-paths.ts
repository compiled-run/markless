import { isPlainObject } from './value.ts';

/**
 * The value with only what `paths` reach kept, so the page ships the fields
 * browser code reads and not the whole value. An empty path keeps it whole; an
 * array read only for its length keeps its length; any other built-in (a Map's
 * `size`, a Date) is kept whole, since its fields are not own data.
 */
export function valueAlongPaths(
	value: unknown,
	paths: ReadonlyArray<ReadonlyArray<string>>,
): unknown {
	if (value === null || typeof value !== 'object' || paths.some((path) => path.length === 0))
		return value;
	const rests = new Map<string, Array<ReadonlyArray<string>>>();
	for (const [key, ...rest] of paths) {
		if (key === undefined) continue;
		const known = rests.get(key) ?? [];
		known.push(rest);
		rests.set(key, known);
	}
	if (Array.isArray(value)) {
		const indices = [...rests.keys()]
			.map(Number)
			.filter((index) => Number.isInteger(index) && index >= 0 && index < value.length);
		const length = rests.has('length')
			? value.length
			: indices.length > 0
				? Math.max(...indices) + 1
				: 0;
		const kept: unknown[] = Array.from({ length }, () => null);
		for (const index of indices)
			kept[index] = valueAlongPaths(value[index], rests.get(String(index)) ?? []);
		return kept;
	}
	if (!isPlainObject(value)) return value;
	const kept: Record<string, unknown> = {};
	for (const [key, rest] of rests)
		if (Object.hasOwn(value, key))
			Object.defineProperty(kept, key, {
				value: valueAlongPaths((value as Record<string, unknown>)[key], rest),
				enumerable: true,
				writable: true,
				configurable: true,
			});
	return kept;
}
