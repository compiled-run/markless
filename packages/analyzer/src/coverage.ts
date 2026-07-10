export interface CoverageRange {
	readonly startOffset: number;
	readonly endOffset: number;
}

export interface V8CoverageEntry {
	readonly url: string;
	readonly source?: string;
	readonly functions: readonly {
		readonly ranges: readonly (CoverageRange & { readonly count: number })[];
	}[];
}

export function mergeCoverageRanges(ranges: readonly CoverageRange[]): CoverageRange[] {
	const sorted = ranges
		.filter((range) => range.endOffset > range.startOffset)
		.toSorted(
			(left, right) =>
				left.startOffset - right.startOffset || left.endOffset - right.endOffset,
		);
	const merged: CoverageRange[] = [];
	for (const range of sorted) {
		const previous = merged.at(-1);
		if (!previous || range.startOffset > previous.endOffset) merged.push({ ...range });
		else if (range.endOffset > previous.endOffset)
			merged[merged.length - 1] = { ...previous, endOffset: range.endOffset };
	}
	return merged;
}

export function countExecutedUtf8Bytes(source: string, ranges: readonly CoverageRange[]): number {
	const encoder = new TextEncoder();
	return ranges.reduce(
		(total, range) =>
			total + encoder.encode(source.slice(range.startOffset, range.endOffset)).byteLength,
		0,
	);
}

function subtractCoverageRanges(
	executed: readonly CoverageRange[],
	unexecuted: readonly CoverageRange[],
): CoverageRange[] {
	const nested = mergeCoverageRanges(
		unexecuted.filter((zero) =>
			executed.some(
				(positive) =>
					zero.startOffset >= positive.startOffset &&
					zero.endOffset <= positive.endOffset,
			),
		),
	);
	return executed.flatMap((positive) => {
		const remaining: CoverageRange[] = [];
		let cursor = positive.startOffset;
		for (const zero of nested) {
			if (zero.endOffset <= cursor || zero.startOffset >= positive.endOffset) continue;
			if (zero.startOffset > cursor)
				remaining.push({ startOffset: cursor, endOffset: zero.startOffset });
			cursor = Math.max(cursor, zero.endOffset);
		}
		if (cursor < positive.endOffset)
			remaining.push({ startOffset: cursor, endOffset: positive.endOffset });
		return remaining;
	});
}

export function executedJavaScriptBytes(
	entries: readonly V8CoverageEntry[],
	pageOrigin: string,
): number {
	let total = 0;
	for (const entry of entries) {
		if (
			entry.url &&
			(!entry.url.startsWith(pageOrigin) || /^(?:chrome|moz)-extension:/.test(entry.url))
		)
			continue;
		if (entry.source === undefined)
			throw new Error(
				`Missing CDP source for same-origin coverage entry ${entry.url || '<inline>'}`,
			);
		const ranges = entry.functions.flatMap((fn) => fn.ranges);
		const executed = mergeCoverageRanges(ranges.filter((range) => range.count > 0));
		const effective = subtractCoverageRanges(
			executed,
			ranges.filter((range) => range.count === 0),
		);
		total += countExecutedUtf8Bytes(entry.source, effective);
	}
	return total;
}
