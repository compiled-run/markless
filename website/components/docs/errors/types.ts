import type { ErrorArea } from './titles.ts';

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
	/** A file that raises the code, shown above the fix. */
	readonly before: readonly CodeLine[];
};

export type ErrorSource = { readonly id: string; readonly file: string; readonly url: string };

export type ErrorEntry = {
	readonly code: string;
	/** A plain title a reader can scan, leading with what went wrong. */
	readonly title: string;
	readonly area: ErrorArea;
	readonly packageName: string;
	readonly stage: ErrorStage;
	readonly severity: ErrorSeverity;
	readonly description: string;
	/** The lines Markless prints for this code, with case-specific words as `<name>`. */
	readonly printed: readonly string[];
	readonly structured: boolean;
	/** Why Markless raises it, as the diagnostic says, when it says. */
	readonly why?: string;
	/** The diagnostic's own first suggestion, when it has one. */
	readonly suggestion?: string;
	readonly guide?: ErrorGuide;
	/** The `markless-allow` line a compile warning can be silenced with. */
	readonly allow?: readonly CodeLine[];
	readonly sources: readonly ErrorSource[];
	readonly moreSources: number;
};

export type ErrorGroup = {
	readonly area: ErrorArea;
	readonly label: string;
	readonly icon: string;
	readonly blurb: string;
	readonly codes: readonly {
		readonly code: string;
		readonly title: string;
		/** `error` or `warning`, for the card's chip. */
		readonly chip: string;
		readonly kind: string;
		readonly guided: boolean;
		/** The words the filter box matches, lower-cased. */
		readonly words: string;
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
