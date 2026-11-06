// What a block's boot loads, listed by the build so the served page can download it before the reader acts; nothing runs until boot.

/** The lists `tooling/code-prefetch.ts` builds; the server render reads them from `virtual:code-prefetch`. */
export type CodePrefetchManifest = {
	/** The session, editor and highlighter modules the page imports. */
	readonly session: readonly string[];
	/** The live checklist's modules, for blocks with steps or update washes. */
	readonly live: readonly string[];
	/** The compile worker and the result frame with its static imports, which load outside the page's module map. */
	readonly cache: readonly string[];
	/** Each block's runtime modules its result frame imports, and the grammars its files need, by `codeBlockKey`. */
	readonly blocks: Readonly<Record<string, readonly string[]>>;
};
