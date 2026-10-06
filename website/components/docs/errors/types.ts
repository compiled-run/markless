/** One piece of a sentence: plain text, inline code, or a link. */
export type Segment = {
	readonly id: string;
	readonly text: string;
	readonly code?: true;
	readonly href?: string;
};

/** One coloured run of a highlighted line: shiki's light colour in `color`, the dark one in `--shiki-dark`. */
export type CodeRun = { readonly id: string; readonly text: string; readonly style: string };

export type CodeLine = { readonly id: string; readonly runs: readonly CodeRun[] };

export type ErrorStage = 'compile' | 'build' | 'runtime';

export type ErrorSeverity = 'error' | 'warning' | 'info' | 'error-or-warning';

/** A hand-written guide, already split into segments and highlighted by the generator. */
export type ErrorGuide = {
	readonly summary: string;
	readonly what: readonly Segment[];
	readonly how: readonly Segment[];
	readonly example: readonly CodeLine[];
};

export type ErrorSource = { readonly id: string; readonly file: string; readonly url: string };

export type ErrorEntry = {
	readonly code: string;
	readonly packageName: string;
	readonly stage: ErrorStage;
	readonly severity: ErrorSeverity;
	readonly description: string;
	/** The lines Markless prints for this code, with case-specific words as `<name>`. */
	readonly printed: readonly string[];
	readonly structured: boolean;
	readonly guide?: ErrorGuide;
	/** The `markless-allow` line a compile warning can be silenced with. */
	readonly allow?: readonly CodeLine[];
	readonly sources: readonly ErrorSource[];
	readonly moreSources: number;
};

export type ErrorGroup = {
	readonly packageName: string;
	readonly codes: readonly {
		readonly code: string;
		readonly kind: string;
		readonly guided: boolean;
	}[];
};

/** What /errors renders, kept apart from the entries so that page does not carry every message. */
export type ErrorIndex = {
	readonly total: number;
	readonly guided: number;
	readonly groups: readonly ErrorGroup[];
};

export type ErrorData = {
	readonly entries: readonly ErrorEntry[];
	readonly index: ErrorIndex;
};
