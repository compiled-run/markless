/** One file of a `<Code>` block, as the reader edits it. */
export type CodeFile = { readonly name: string; readonly code: string };

/** Where a static `import`/`export from` names its module, or a whole `import()` call sits. */
export type ImportSite = {
	readonly start: number;
	readonly end: number;
	/** The module name; for a `computed` `import()`, the expression that yields it at run time. */
	readonly specifier: string;
	readonly dynamic: boolean;
	readonly computed?: boolean;
};

export type CompiledModule = {
	readonly id: string;
	readonly kind: 'script' | 'style';
	readonly code: string;
	readonly imports: readonly ImportSite[];
};

/** A problem in the reader's code; `line` and `column` are 1-based, and 0 when it has no place in a file. */
export type CodeDiagnostic = {
	readonly file: string;
	readonly line: number;
	readonly column: number;
	/** The error code and its one-line message. */
	readonly message: string;
	/** Why it is an error and what to do, when the compiler says. */
	readonly detail?: string;
};

export type CompileOutcome =
	| { readonly ok: true; readonly entry: string; readonly modules: readonly CompiledModule[] }
	| { readonly ok: false; readonly diagnostics: readonly CodeDiagnostic[] };

/** Docs page to frame. */
export type FrameRequest =
	| {
			readonly type: 'code:modules';
			readonly id: number;
			readonly entry: string;
			readonly modules: readonly CompiledModule[];
	  }
	| {
			readonly type: 'code:look';
			readonly dark: boolean;
			readonly stylesheets: readonly string[];
			/** The page's viewport-relative custom properties, resolved to pixels on the page. */
			readonly tokens: Readonly<Record<string, string>>;
	  };

/** Frame to docs page. */
export type FrameReply =
	| { readonly type: 'code:ready' }
	| { readonly type: 'code:height'; readonly height: number }
	| {
			readonly type: 'code:result';
			readonly id: number;
			readonly ok: boolean;
			readonly diagnostics: readonly CodeDiagnostic[];
	  };

/** Docs page to compile worker and back; `block` names the block the files belong to. */
export type WorkerRequest = {
	readonly id: number;
	readonly block: string;
	readonly files: readonly CodeFile[];
	/** The starter, compiled while nothing else waits; a real request for the block drops it. */
	readonly warmUp?: boolean;
};
export type WorkerReply = { readonly id: number; readonly outcome: CompileOutcome };
