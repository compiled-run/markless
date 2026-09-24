export type ByteBreakdown = Record<string, number>;
export type PayPerUseResult = {
	readonly pageMaps: string[];
	readonly shipped: number;
	readonly judged: 'all features' | 'capabilities' | 'none';
	readonly demandedFeatures: string[];
	readonly undemanded: string[];
};

export const CATEGORIES: readonly string[];
export function readBuildJson(publicDir: string, asset: string): unknown;
export function readAttribution(publicDir: string): unknown;
export function readDemand(publicDir: string): unknown;
export function attributeFiles(
	paths: readonly string[],
	attribution: unknown,
	read: (path: string) => { readonly gzipBytes: number } | null | undefined,
	base: string,
): { readonly byCategory: ByteBreakdown; readonly runtimeModules: string[] };
export function runtimeModuleSizes(attribution: unknown): Record<string, number>;
export function runtimeFeatureIndex(demand: unknown): Record<string, string[]>;
export function undemandedRuntimeModules(input: {
	readonly paths: readonly string[];
	readonly attribution: unknown;
	readonly demand: unknown;
	readonly appDir: string;
	readonly base: string;
}): PayPerUseResult;
export function withoutDemand(demand: unknown, id: string): unknown;
