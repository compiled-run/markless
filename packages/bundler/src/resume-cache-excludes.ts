import type { ResumeCacheOptions } from './types.ts';

/**
 * A `resumeCache.exclude` entry that matches no async computed would silently stop excluding when a value
 * is renamed, so the build fails instead and names the nearest names it found.
 */
export function unmatchedResumeCacheExcludes(
	options: boolean | ResumeCacheOptions | false | undefined,
	names: ReadonlySet<string>,
): string | undefined {
	const exclude = typeof options === 'object' ? (options.exclude ?? []) : [];
	const unmatched = exclude.filter(
		(pattern) =>
			![...names].some((name) =>
				pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern,
			),
	);
	if (unmatched.length === 0) return undefined;
	return unmatched
		.map((pattern) => {
			const near = [...names]
				.map((name) => [name, distance(pattern.replace(/\*$/, ''), name)] as const)
				.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
				.slice(0, 3)
				.map(([name]) => name);
			return `MARKLESS_RESUME_CACHE_EXCLUDE_UNMATCHED: resumeCache.exclude entry "${pattern}" matches no async computed in this build${near.length ? `. Nearest names: ${near.join(', ')}` : ''}. Name an async computed (computed(async () => ...)) declared in a page or component, or remove the entry.`;
		})
		.join('\n');
}

function distance(a: string, b: string): number {
	let previous = Array.from({ length: b.length + 1 }, (_, at) => at);
	for (let i = 1; i <= a.length; i++) {
		const row = [i];
		for (let j = 1; j <= b.length; j++)
			row[j] = Math.min(previous[j]! + 1, row[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
		previous = row;
	}
	return previous[b.length]!;
}
