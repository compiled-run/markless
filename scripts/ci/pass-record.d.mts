export declare function workingTree(root: string): string;
export declare function indexTree(root: string): string;
export declare function recordPass(root: string, tree: string, selected: string[] | null): void;
export interface Pass {
	tree: string;
	at: string;
	selected: string[] | null;
}
export declare function findPass(root: string, tree: string): Pass | null;
export declare function passCovers(
	pass: Pass | null,
	selection: { runAll?: string | null; selected?: string[] | null } | null,
): boolean;
