export type SourceSpan = {
	readonly filename: string;
	readonly start: number;
	readonly end: number;
};

export type DiagnosticSuggestion = {
	readonly message: string;
};

export type CompilerDiagnostic = {
	readonly code: string;
	readonly severity: 'error' | 'warning' | 'info';
	readonly phase:
		| 'parse'
		| 'semantic-graph'
		| 'state-lowering'
		| 'capture-analysis'
		| 'sync-policy'
		| 'public-render'
		| 'serialization'
		| 'payload'
		| 'resume'
		| 'runtime';
	readonly title: string;
	readonly message: string;
	readonly why: string;
	readonly primarySpan?: SourceSpan;
	readonly passId?: string;
	readonly artifactKeys?: ReadonlyArray<string>;
	readonly statePath?: string;
	readonly source?: string;
	readonly symbolId?: string;
	readonly elementLocator?: string;
	readonly suggestions: ReadonlyArray<DiagnosticSuggestion>;
	readonly docsUrl: string;
};
