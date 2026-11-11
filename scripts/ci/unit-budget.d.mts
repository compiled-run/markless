export type PeakGroup = {
	readonly file: string;
	readonly mb: number;
	readonly parts: Readonly<Record<string, number>>;
};
export declare function attribute(
	procs: ReadonlyArray<{ readonly pid: number; readonly ppid: number; readonly rss: number }>,
	fileOf: ReadonlyMap<number, string>,
	label?: (proc: { readonly pid: number }) => string,
): PeakGroup[];
export declare function describePeak(
	measurement: {
		readonly shard: string;
		readonly peakRssMb: number;
		readonly atPeak?: { readonly atS: number; readonly groups: readonly PeakGroup[] } | null;
	},
	limit?: number,
): string;
export declare function processLabel(args: readonly string[]): string;
