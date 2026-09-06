// Editor-style hover docs for the TSRX tokens that appear in the site's code
// samples. Every sentence is written for a TypeScript developer who has not
// used a UI framework before, and describes what Markless actually does.
//
// Sources for the wording: goals/compiled-website/notes/T001-authoring-surface.md
// section 1, and specs/framework/12-arm-rendering.md (the @pending deadline rule).

export type TokenDoc = {
	/** Short label for what kind of thing the token is. */
	readonly kind: string;
	/** One plain sentence saying what it does. */
	readonly doc: string;
};

/** Tokens written with a leading `@`: the constructs built into TSRX. */
export const CONSTRUCT_DOCS: Readonly<Record<string, TokenDoc>> = {
	'@{': {
		kind: 'Component body',
		doc: 'Opens the body of a component, where ordinary statements and the markup they produce sit together.',
	},
	'@if': {
		kind: 'Conditional',
		doc: 'Renders the block that follows only while its condition is true.',
	},
	'@else': {
		kind: 'Fallback branch',
		doc: 'Renders when the condition on the matching @if is false.',
	},
	'@else if': {
		kind: 'Chained conditional',
		doc: 'Tests another condition when the branch before it did not match.',
	},
	'@for': {
		kind: 'List',
		doc: 'Renders its block once per item, with an optional key clause naming the stable identity of each row.',
	},
	'@empty': {
		kind: 'Empty list branch',
		doc: 'Renders when the list it belongs to has no items at all.',
	},
	'@switch': {
		kind: 'Value match',
		doc: 'Renders the one @case block whose value matches the expression it is given.',
	},
	'@case': {
		kind: 'Match branch',
		doc: 'Renders when the value handed to @switch equals this case.',
	},
	'@default': {
		kind: 'Match fallback',
		doc: 'Renders when no @case matched the value.',
	},
	'@try': {
		kind: 'Settled content',
		doc: 'Holds the content shown once the data it awaits has arrived.',
	},
	'@pending': {
		kind: 'Waiting content',
		doc: 'Holds the content shown while @try is still waiting, and it appears only once the wait is long enough to be worth showing.',
	},
	'@catch': {
		kind: 'Failure content',
		doc: 'Holds the content shown when the awaited work fails instead of settling.',
	},
};

/** Framework calls and element props that are worth explaining in a sample. */
export const IDENTIFIER_DOCS: Readonly<Record<string, TokenDoc>> = {
	state: {
		kind: 'Watched value',
		doc: 'Declares a variable the page follows, which you read and assign exactly like any other variable.',
	},
	computed: {
		kind: 'Derived value',
		doc: 'Declares a value worked out from other values, which is recalculated for you whenever one of those inputs changes.',
	},
	shared: {
		kind: 'Shared definition',
		doc: 'Declares data that several components resolve by calling it, instead of passing the data down through props.',
	},
	storage: {
		kind: 'Saved value',
		doc: 'Works like state, and also saves the value in the browser so it is still there after a reload.',
	},
	element: {
		kind: 'Element handle',
		doc: 'Creates a handle you bind with el, so that later code can reach the real DOM node and call methods on it.',
	},
	el: {
		kind: 'Element binding',
		doc: 'Binds one element() handle to this element, which is how later code gets hold of the node.',
	},
	style: {
		kind: 'Scoped styles',
		doc: 'A style block written inside a component, whose rules the compiler scopes to that component with a build-hashed class.',
	},
	children: {
		kind: 'Projected content',
		doc: 'The content written inside this component where it was used, which you may render, wrap or pass on, but not inspect or count.',
	},
	Html: {
		kind: 'Document root',
		doc: 'The root element of document.tsrx, which lets the router put the built asset tags and its pre-paint script in the head for you.',
	},
	Link: {
		kind: 'Route link',
		doc: 'Renders a real anchor and navigates on the client, taking the route pattern as its href and the pieces of the path as params.',
	},
	PageProps: {
		kind: 'Page props',
		doc: 'The props the router hands a page: params for the bracketed parts of the path, url for the address that was asked for, and status.',
	},
	attach: {
		kind: 'Element behaviour',
		doc: 'Installs longer lived code on this element, and may return a cleanup function that runs when the element goes away.',
	},
};

const HANDLER_DOC: TokenDoc = {
	kind: 'Event handler',
	doc: 'Runs when this element fires the matching DOM event, and receives the native event object.',
};

/** The doc for one already-recognised token, or undefined if there is none. */
export function docForToken(token: string): TokenDoc | undefined {
	return (
		CONSTRUCT_DOCS[token] ??
		IDENTIFIER_DOCS[token] ??
		(/^on[A-Z][A-Za-z]*$/.test(token) ? HANDLER_DOC : undefined)
	);
}

/** Every token this module can explain, longest first so `@else if` wins over `@else`. */
export function knownTokens(): readonly string[] {
	return [...Object.keys(CONSTRUCT_DOCS), ...Object.keys(IDENTIFIER_DOCS)].sort(
		(left, right) => right.length - left.length,
	);
}

export function tooltipTitle(token: string, doc: TokenDoc): string {
	return `${token} · ${doc.kind}`;
}

export function tooltipLabel(token: string, doc: TokenDoc): string {
	return `${token}: ${doc.kind}. ${doc.doc}`;
}
