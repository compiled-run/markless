/** One file of a `<Code>` block, as the reader edits it. */
export type CodeFile = { readonly name: string; readonly code: string };

/** Where a static `import`/`export from` names its module, or a whole `import()` call sits. */
export type ImportSite = {
	readonly start: number;
	readonly end: number;
	readonly specifier: string;
	readonly dynamic: boolean;
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
	| { readonly type: 'code:run'; readonly id: number; readonly files: readonly CodeFile[] }
	| {
			readonly type: 'code:look';
			readonly dark: boolean;
			readonly stylesheets: readonly string[];
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

/** Frame to compile worker and back. */
export type WorkerRequest = { readonly id: number; readonly files: readonly CodeFile[] };
export type WorkerReply = { readonly id: number; readonly outcome: CompileOutcome };
