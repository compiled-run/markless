export declare function largestByLabel(
	procs: ReadonlyArray<{ readonly pid: number; readonly rss: number }>,
	labelOf: (proc: { readonly pid: number }) => string,
	limit?: number,
): string;
