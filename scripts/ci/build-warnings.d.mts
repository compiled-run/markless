export declare const GUARDED_BUILDS: readonly string[];
export declare const ALLOWED_WARNINGS: ReadonlyArray<{
	readonly build: string;
	readonly pattern: RegExp;
	readonly reason: string;
}>;
export declare function buildWarnings(stderr: string, build?: string): string[];
