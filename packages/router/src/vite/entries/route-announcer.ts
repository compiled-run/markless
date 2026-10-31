// Tells screen readers which page an in-place navigation landed on, as Next.js's route announcer does.
type Announcer = { readonly region: HTMLElement; timer?: number };
// Kept on the document: the fragment swap and the client renderer can each carry a copy of this module.
const ANNOUNCER = '__marklessRouteAnnouncer';

export function pageName(d: Document): string {
	if (d.title) return d.title;
	const heading = d.querySelector?.('h1') as HTMLElement | null | undefined;
	return heading?.innerText || heading?.textContent || '';
}

// Path, query and a '#/' route hash: an in-page anchor or the same URL again is not a new page.
export function pageAddress(href: string): string {
	const url = new URL(href);
	return url.pathname + url.search + (url.hash.startsWith('#/') ? url.hash : '');
}

export function announcePage(d: Document, leftAddress: string, leftName: string): void {
	const body = d.body;
	const w = d.defaultView;
	if (!body || !w || pageAddress(w.location.href) === leftAddress) return;
	const name = pageName(d);
	if (!name || name === leftName) return;
	const slot = d as unknown as Record<string, Announcer | undefined>;
	let announcer = slot[ANNOUNCER];
	if (!announcer) {
		const host = d.createElement('markless-route-announcer');
		host.style.cssText = 'position:absolute';
		const region = d.createElement('div');
		region.setAttribute('aria-live', 'assertive');
		region.setAttribute('role', 'alert');
		region.style.cssText =
			'position:absolute;border:0;height:1px;margin:-1px;padding:0;width:1px;clip:rect(0 0 0 0);overflow:hidden;white-space:nowrap;word-wrap:normal';
		host.attachShadow({ mode: 'open' }).append(region);
		slot[ANNOUNCER] = announcer = { region };
	}
	const { region } = announcer;
	const host = (region.getRootNode() as ShadowRoot).host;
	w.clearTimeout(announcer.timer);
	if (host.isConnected) {
		region.textContent = name;
		return;
	}
	// Screen readers may skip text a live region is inserted with, so the text lands once the region is in place.
	region.textContent = '';
	body.append(host);
	announcer.timer = w.setTimeout(() => (region.textContent = name), 100);
}
