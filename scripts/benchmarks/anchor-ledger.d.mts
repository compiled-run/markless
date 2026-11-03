export type AnchorChange = {
	readonly surface: string;
	readonly path: readonly string[];
	readonly reason: string;
	readonly date?: string;
} & (
	| { readonly delta: number }
	| { readonly set: unknown }
	| { readonly remove: true }
	| { readonly append: readonly unknown[] }
);
export type ChangeFile = { readonly name: string; readonly changes: readonly AnchorChange[] };

export const CHANGES_DIR: string;
export const FIXTURE_RUNTIME_ANCHORS_PATH: string;
export const SURFACES: Record<string, { readonly path: string }>;
export function formatChange(entry: AnchorChange): string;
export function readChangeFiles(dir?: string): ChangeFile[];
export function applyChanges<T>(base: T, files: readonly ChangeFile[], surface: string): T;
export function diffAnchors(
	before: unknown,
	after: unknown,
): Omit<AnchorChange, 'surface' | 'reason'>[];
export function changeName(env?: Record<string, string | undefined>): string;
export function readAnchorsWithChanges(
	surface: string,
	options?: { readonly exclude?: string; readonly dir?: string; readonly base?: unknown },
): any;
export function labelOf(entry: AnchorChange): { guard: string; subject: string };
export function recordChange<T>(
	surface: string,
	measured: {
		readonly head: (anchors: T) => T;
		readonly base: (anchors: T) => T;
		readonly covers: (entry: AnchorChange) => boolean;
	},
	options: {
		readonly reason: string;
		readonly name?: string;
		readonly dir?: string;
		readonly basePath?: string;
		readonly date?: string;
	},
): { file: string; changes: AnchorChange[] };
export function mergeBaseRef(env?: Record<string, string | undefined>): string;
export function openMergeBaseCheckout(options?: {
	readonly rev?: string;
	readonly log?: (message: string) => void;
}): { root: string; rev: string; close: () => void };
export function fold(options?: {
	readonly dir?: string;
	readonly surfaces?: Record<string, { readonly path: string }>;
	readonly date?: string;
}): { files: string[]; folded: Record<string, unknown> };
