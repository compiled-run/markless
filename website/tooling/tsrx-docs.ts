import { MARKLESS_PENDING_REFRESH_STALL_MS } from '@markless/web/fns/pending-timing';

// Hover docs for the TSRX tokens in the site's code samples; tsrx-docs.test.ts pins each fact it can check.

export type TokenDoc = {
	/** Short label for what kind of thing the token is. */
	readonly kind: string;
	/** One or two plain sentences saying what it does. */
	readonly doc: string;
};

const STALL_SECONDS = MARKLESS_PENDING_REFRESH_STALL_MS / 1000;

/** Tokens written with a leading `@`: the constructs built into TSRX. */
export const CONSTRUCT_DOCS: Readonly<Record<string, TokenDoc>> = {
	'@{': {
		kind: 'Instructions',
		doc: 'Holds instructions: statements that run top to bottom, ending with the one element that shows up. It opens a component body, and opens again among the elements when you need a few more steps there.',
	},
	'@if': {
		kind: 'Conditional',
		doc: 'Puts its block on the page while the test in the parentheses is true, and takes it off again when the test turns false.',
	},
	'@else': {
		kind: 'Fallback branch',
		doc: 'Shows its block while the test on the matching @if is false.',
	},
	'@else if': {
		kind: 'Chained conditional',
		doc: 'Tests another condition, checked only when every test before it in the chain was false.',
	},
	'@for': {
		kind: 'List',
		doc: 'Shows its block once per item. Every @for needs a key in its header, naming what keeps a row the same row when the list changes.',
	},
	'@empty': {
		kind: 'Empty list branch',
		doc: 'Shows when the list of the @for before it has no items.',
	},
	'@switch': {
		kind: 'Value match',
		doc: 'Shows the one @case whose value is === to the value in the parentheses, or @default when none is.',
	},
	'@case': {
		kind: 'Match branch',
		doc: 'Shows when the @switch value is === to this one.',
	},
	'@default': {
		kind: 'Match fallback',
		doc: 'Shows when no @case matched the value.',
	},
	'@try': {
		kind: 'Async block',
		doc: 'Holds what shows once the async values read inside it are ready; every read of an async value needs one around it. While a newer answer loads, the shown content stays, marked aria-busy.',
	},
	'@pending': {
		kind: 'Waiting content',
		doc: `Holds what shows while there is no answer yet, and a fast answer skips it. On a refresh the old content stays, and @pending takes over only if the newest request waits more than ${STALL_SECONDS} seconds. A block the server rendered keeps its content however long the refresh takes.`,
	},
	'@catch': {
		kind: 'Failure content',
		doc: 'Holds what shows when the async recipe throws or its promise rejects. Write @catch (error) to read the error.',
	},
};

/** Framework calls and element props that are worth explaining in a sample. */
export const IDENTIFIER_DOCS: Readonly<Record<string, TokenDoc>> = {
	state: {
		kind: 'Watched value',
		doc: 'Declares a variable the page watches. You read and assign it like any other variable, and the page keeps up.',
	},
	computed: {
		kind: 'Derived value',
		doc: 'Declares a value worked out from other values by a recipe, worked out again whenever one of them changes. Give it an async recipe and read it inside @try.',
	},
	shared: {
		kind: 'Shared definition',
		doc: 'Defines state once for several components. Each component that calls the definition gets the same copy, and scope decides how far that copy reaches.',
	},
	storage: {
		kind: 'Saved value',
		doc: 'String state saved in the browser\'s localStorage, so it survives a reload. Each change also sets a data- attribute on <html> that your CSS can read.',
	},
	element: {
		kind: 'Element handle',
		doc: 'Creates a handle that el={…} points at an element. In handlers and attach the handle is that element, or undefined while it is not on the page.',
	},
	el: {
		kind: 'Element binding',
		doc: 'Points an element() handle at this element, so handlers and attach can reach it.',
	},
	style: {
		kind: 'Scoped styles',
		doc: 'A <style> block inside a component. The build gives the file its own class and adds it to every selector, so the rules reach only the elements this file renders.',
	},
	children: {
		kind: 'Content passed in',
		doc: 'The elements written between this component\'s tags. You can place them, wrap them or pass them on, but mapping, counting or indexing them stops the build.',
	},
	Html: {
		kind: 'Document root',
		doc: 'Stands in for the <html> tag in document.tsrx. The router writes the real <html> tag with the attributes you give Html, and adds the tags the page needs to your <head>.',
	},
	Link: {
		kind: 'Route link',
		doc: 'Renders a plain <a href>. Give it a route pattern and params, and the build writes the real address and checks it against your routes. A click swaps in the next page without a full reload.',
	},
	PageProps: {
		kind: 'Page props',
		doc: 'The props the router hands a page: params from the bracketed parts of the path, url, status, and http, the request and response, on the server only.',
	},
	attach: {
		kind: 'Element setup',
		doc: 'Runs your function with this element, for setup like an observer. A function it returns runs when the element leaves the page. On a server-rendered page it waits until a handler on the element runs, or onVisible or onIdle fires.',
	},
	onVisible: {
		kind: 'Visibility handler',
		doc: 'Runs once, the first time this element scrolls into view.',
	},
	onIdle: {
		kind: 'Idle handler',
		doc: 'Runs once, after the page has loaded and the browser is idle.',
	},
};

export const HANDLER_DOC: TokenDoc = {
	kind: 'Event handler',
	doc: 'Runs when this element gets the DOM event named after on, with the browser\'s own event object.',
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
