type CoverageRange = { startOffset: number; endOffset: number; count: number };

export function executedSourceRanges(input: readonly CoverageRange[]) {
	const points = input.flatMap(range => [
		{ at: range.startOffset, opening: true, range },
		{ at: range.endOffset, opening: false, range },
	]).sort((a, b) => a.at - b.at || Number(a.opening) - Number(b.opening) ||
		(a.opening ? b.range.endOffset - a.range.endOffset : b.range.startOffset - a.range.startOffset));
	const active: number[] = [];
	const result: { start: number; end: number }[] = [];
	let previous = 0;
	for (const point of points) {
		if (point.at > previous && (active.at(-1) ?? 0) > 0) {
			const last = result.at(-1);
			if (last?.end === previous) last.end = point.at;
			else result.push({ start: previous, end: point.at });
		}
		if (point.opening) active.push(point.range.count);
		else active.pop();
		previous = point.at;
	}
	return result;
}
