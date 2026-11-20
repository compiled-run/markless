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
export declare function descendants(
	rootPid: number,
	pageSize: number,
): Array<{ readonly pid: number; readonly ppid: number; readonly rss: number }>;
export declare function suiteKey(budget: { readonly suite?: unknown }): string | null;
export declare const SLOT_HOLDER_MB: number;
export declare const SLOT_HOLDER_FAIL_MB: number;
export declare const SLOT_HOLDER_STALE_MB: number;
export declare const SLOT_HELD_SHARE: number;
export type SlotReading = { readonly holding: Set<string>; readonly wholeFile: boolean };
export declare function readSlots(
	slotsDir: string,
	fileOf: ReadonlyMap<number, string>,
): SlotReading;
export declare function recordSample(
	state: {
		filePeaks: Map<string, number>;
		unslottedPeaks: Map<string, number>;
		wholeFileHeldSamples: number;
	},
	groups: readonly PeakGroup[],
	before: SlotReading,
	after: SlotReading,
): void;
