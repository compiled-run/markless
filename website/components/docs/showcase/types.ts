/** A byte count before (old app) and after (Markless), as a range when a route covers several pages. */
export type BytesRange = { readonly min: number; readonly max: number };
export type BeforeAfter = { readonly before: BytesRange; readonly after: BytesRange };

/** One role's view of one route pattern, from the published check report. */
export type ShowcaseRow = {
	/** `null` when the app has no sign-in. */
	readonly role: string | null;
	readonly pages: number;
	readonly green: number;
	/** Checks (the report's dimensions) summed over every page of the pattern. */
	readonly checksPassed: number;
	readonly checksTotal: number;
	readonly redChecks: readonly string[];
	/** JavaScript downloaded, measured as `ShowcaseApp.downloadedBasis` says. */
	readonly downloaded: BeforeAfter | null;
	/** JavaScript run at load (Chromium coverage, uncompressed). */
	readonly runAtLoad: BeforeAfter | null;
};

export type ShowcaseRoute = {
	readonly pattern: string;
	readonly kind: 'page' | 'not-found' | 'slash-redirect';
	readonly switched: boolean;
	/** Set when the route was switched to the new app while its checks were still red. */
	readonly forcedReason: string | null;
	readonly rows: readonly ShowcaseRow[];
};

export type ShowcaseAccepted = {
	readonly reason: string;
	readonly by: string;
	readonly count: number;
	readonly checks: readonly string[];
	readonly routes: readonly string[];
};

export type ShowcaseGap = { readonly title: string; readonly detail: string };

/** How many routes of the old site the new app has, from the coverage run. */
export type ShowcaseCoverage = {
	readonly ported: number;
	readonly total: number;
	/** Routes the new app lacks, when the report lists them. */
	readonly missing: readonly string[];
	/** The run checked only part of the site, or some routes did not answer. */
	readonly partial: boolean;
	/** Only signed-out routes were counted, on an app that has sign-in. */
	readonly signedOutOnly: boolean;
	readonly measuredAt: string;
};

export type ShowcaseApp = {
	readonly slug: string;
	readonly name: string;
	readonly builtWith: string;
	readonly access: 'source' | 'url-only';
	readonly signIn: boolean;
	/** `done` only when every route is ported, every check is green (or accepted) and every page is switched. */
	readonly status: 'done' | 'in-progress';
	/** `null` when no coverage run has been recorded. */
	readonly coverage: ShowcaseCoverage | null;
	readonly checkedAt: string;
	readonly pagesGreen: number;
	readonly pagesChecked: number;
	readonly routes: readonly ShowcaseRoute[];
	/** Each check (a report dimension) counted over every page the report checked. */
	readonly checks: readonly {
		readonly name: string;
		readonly passed: number;
		readonly failed: number;
		readonly skipped: number;
	}[];
	/** Paths sent to the new app that are not pages, so the check has nothing to compare. */
	readonly switchedWithoutCheck: readonly { readonly route: string; readonly reason: string }[];
	readonly accepted: readonly ShowcaseAccepted[];
	/** Failures nobody accepted, one entry per route and check, with the first failure as an example. */
	readonly red: readonly {
		readonly route: string;
		readonly check: string;
		readonly count: number;
		readonly example: string;
	}[];
	readonly gaps: readonly ShowcaseGap[];
	readonly downloadedBasis: string;
	/** `null` when the check measured no JavaScript on the home page. */
	readonly headline: { readonly route: string; readonly before: number; readonly after: number } | null;
	readonly links: {
		readonly frontDoor: string;
		readonly old: string;
		readonly markless: string;
		readonly report: string;
		readonly port: string;
		readonly originalRepo: string | null;
		readonly originalSite: string | null;
		readonly licence: string | null;
	};
	readonly shot: string;
};
