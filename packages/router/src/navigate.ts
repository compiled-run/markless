import { LINK_ATTRIBUTE, REPLACE_ATTRIBUTE, SCROLL_ATTRIBUTE } from './link-attributes.ts';
import { MARKLESS_ROUTER_RENDERED_EVENT } from './route-state.ts';

export interface NavigateOptions {
	/** Replace the current history entry instead of adding one. */
	readonly replace?: boolean;
	/** `false` keeps the scroll position. */
	readonly scroll?: boolean;
}

// Each routed navigate() still waiting for its page; a newer one that keeps the page shown settles them.
const waiting = new Set<() => void>();

/**
 * Navigates to `href` exactly as a click on `<Link href={href}>` would: a page of this app swaps in
 * place, anything else loads as a document. The promise resolves once the page the user ends up on is
 * in place: at once for the page already shown, and, when a later navigation replaces this one, once
 * that page is shown. A navigation that loads a new document leaves this page, so its promise never settles.
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
	// The router keeps the page shown for a link to its path and query; a '#/' hash names a client route.
	const here = w.location;
	const kept =
		url.pathname + url.search === here.pathname + here.search &&
		hashRoute(url.hash) === hashRoute(here.hash);
	// The router takes the click the way it takes a Link's; the window's bubble listener runs after it.
	const anchor = d.createElement('a');
	anchor.href = url.href;
	anchor.hidden = true;
	anchor.setAttribute(LINK_ATTRIBUTE, '');
	if (options.replace) anchor.setAttribute(REPLACE_ATTRIBUTE, '');
	if (options.scroll === false) anchor.setAttribute(SCROLL_ATTRIBUTE, 'manual');
	let followed = false;
	const last = (event: Event) => {
		if (event.target !== anchor) return;
		followed = !event.defaultPrevented;
		event.preventDefault();
	};
	const click = new MouseEvent('click', {
		bubbles: true,
		cancelable: true,
		composed: true,
		button: 0,
	});
	w.addEventListener('click', last);
	d.body.append(anchor);
	try {
		anchor.dispatchEvent(click);
	} finally {
		anchor.remove();
		w.removeEventListener('click', last);
	}
	if (!followed) {
		if (kept) {
			for (const settle of waiting) settle();
			return Promise.resolve();
		}
		return new Promise((resolve) => {
			const settle = () => {
				waiting.delete(settle);
				d.removeEventListener(MARKLESS_ROUTER_RENDERED_EVENT, settle);
				resolve();
			};
			waiting.add(settle);
			d.addEventListener(MARKLESS_ROUTER_RENDERED_EVENT, settle);
		});
	}
	const inPage = url.hash !== '' && withoutHash(url.href) === withoutHash(w.location.href);
	if (options.replace) w.location.replace(url.href);
	else w.location.assign(url.href);
	return inPage ? Promise.resolve() : new Promise(() => {});
}

function hashRoute(hash: string): string {
	return hash.startsWith('#/') ? hash : '';
}

function withoutHash(href: string): string {
	const at = href.indexOf('#');
	return at === -1 ? href : href.slice(0, at);
}
