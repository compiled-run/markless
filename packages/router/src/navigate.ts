import { LINK_ATTRIBUTE, REPLACE_ATTRIBUTE, SCROLL_ATTRIBUTE } from './link-attributes.ts';
import { MARKLESS_ROUTER_RENDERED_EVENT } from './route-state.ts';

export interface NavigateOptions {
	/** Replace the current history entry instead of adding one. */
	readonly replace?: boolean;
	/** `false` keeps the scroll position. */
	readonly scroll?: boolean;
}

/**
 * Navigates to `href` exactly as a click on `<Link href={href}>` would: a page of this app swaps in
 * place, anything else loads as a document. The promise resolves once the new page is in place; a
 * navigation that loads a new document leaves this page, so its promise never settles.
 * Runs in the browser only.
 */
export function navigate(href: string | URL, options: NavigateOptions = {}): Promise<void> {
	if (typeof document === 'undefined')
		throw new Error(
			'MARKLESS_ROUTER_NAVIGATE_SERVER: navigate() runs in the browser. Call it from an event handler or other browser code, not while the page renders on the server.',
		);
	const d = document;
	const w = d.defaultView ?? window;
	const url = new URL(href, d.baseURI);
	const rendered = new Promise<void>((resolve) =>
		d.addEventListener(MARKLESS_ROUTER_RENDERED_EVENT, () => resolve(), { once: true }),
	);
	// The router takes the click the way it takes a Link's; the window's bubble listener runs after it.
	const anchor = d.createElement('a');
	anchor.href = url.href;
	anchor.hidden = true;
	anchor.setAttribute(LINK_ATTRIBUTE, '');
	if (options.replace) anchor.setAttribute(REPLACE_ATTRIBUTE, '');
	if (options.scroll === false) anchor.setAttribute(SCROLL_ATTRIBUTE, 'manual');
	let reached = false;
	let routed = false;
	const last = (event: Event) => {
		if (event.target !== anchor) return;
		reached = true;
		routed = event.defaultPrevented;
		event.preventDefault();
	};
	w.addEventListener('click', last);
	d.body.append(anchor);
	try {
		anchor.dispatchEvent(
			new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0 }),
		);
	} finally {
		anchor.remove();
		w.removeEventListener('click', last);
	}
	if (routed || !reached) return rendered;
	const inPage = url.hash !== '' && withoutHash(url.href) === withoutHash(w.location.href);
	if (options.replace) w.location.replace(url.href);
	else w.location.assign(url.href);
	return inPage ? Promise.resolve() : new Promise(() => {});
}

function withoutHash(href: string): string {
	const at = href.indexOf('#');
	return at === -1 ? href : href.slice(0, at);
}
