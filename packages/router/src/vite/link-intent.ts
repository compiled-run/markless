import type { ModulePreloadInput } from '@markless/web/render-to-string';

// These functions are serialized into the SSR bridge and virtual client entry.
export function listenForLinkIntent(
	root: Document | Element,
	linkAttribute: string,
	preload: (url: URL) => void,
	prefetchAttribute?: string,
): () => void {
	const listener = (event: Event) => {
		if (event.defaultPrevented) return;
		const target = event.composedPath()[0] ?? event.target;
		const element = target instanceof Element ? target : (target as Node)?.parentElement;
		const anchor = element?.closest<HTMLAnchorElement>('a[href]');
		if (!anchor?.hasAttribute(linkAttribute) || anchor.hasAttribute('download')) return;
		if (prefetchAttribute && anchor.getAttribute(prefetchAttribute) === 'none') return;
		if (anchor.target && anchor.target !== '_self') return;
		if (anchor.relList.contains('external')) return;
		const url = new URL(anchor.href, anchor.ownerDocument.baseURI);
		if (url.origin !== new URL(anchor.ownerDocument.URL).origin) return;
		preload(url);
	};
	const events = ['pointerover', 'focusin', 'pointerdown'];
	for (const event of events) root.addEventListener(event, listener, { passive: true });
	return () => {
		for (const event of events) root.removeEventListener(event, listener);
	};
}

export function appendModulePreloads(
	document: Document | undefined,
	items: readonly ModulePreloadInput[] | undefined,
): string[] {
	if (!document?.head || !items?.length) return [];
	const absolute = (href: string) => new URL(href, document.baseURI).href;
	const seen = new Set(
		[...document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]')].map((link) =>
			absolute(link.getAttribute('href') || link.href),
		),
	);
	const appended: string[] = [];
	for (const item of items) {
		const href = typeof item === 'string' ? item : item.href;
		if (!href || seen.has(absolute(href))) continue;
		const link = document.createElement('link');
		link.rel = 'modulepreload';
		link.href = href;
		link.crossOrigin =
			typeof item === 'string' ? 'anonymous' : (item.crossOrigin ?? 'anonymous');
		if (typeof item !== 'string' && item.fetchPriority) link.fetchPriority = item.fetchPriority;
		document.head.appendChild(link);
		seen.add(absolute(href));
		appended.push(href);
	}
	return appended;
}

type ViewportPrefetchState = { scan(destinations: ViewportDestinations): void };
type ViewportDestinations = (url: URL) => readonly ModulePreloadInput[] | undefined;

// Serialized into the SSR bridge and virtual client entry. On-screen link targets download
// (never run) at low priority, two at a time, once the page's own preloads settled after load
// or the first interaction; each new interaction pauses the queue until the page is idle again.
export function startViewportPrefetch(
	document: Document,
	linkAttribute: string,
	prefetchAttribute: string,
	everyLink: boolean,
	destinations: ViewportDestinations,
): void {
	const host = document as Document & {
		__marklessRouterViewportPrefetch?: ViewportPrefetchState;
	};
	if (host.__marklessRouterViewportPrefetch) {
		host.__marklessRouterViewportPrefetch.scan(destinations);
		return;
	}
	const view = document.defaultView;
	const connection = (
		view?.navigator as
			| { connection?: { saveData?: boolean; effectiveType?: string } }
			| undefined
	)?.connection;
	if (!view?.IntersectionObserver || connection?.saveData) return;
	if (connection?.effectiveType?.endsWith('2g')) return;
	const resolvers: ViewportDestinations[] = [destinations];
	const requested = new Set<string>();
	const queue: ModulePreloadInput[] = [];
	let open = false;
	let started = false;
	let pauseToken = 0;
	let inFlight = 0;
	const absolute = (href: string) => new URL(href, document.baseURI).href;
	const idle = (run: () => void) => {
		if (view.requestIdleCallback) view.requestIdleCallback(run, { timeout: 2000 });
		else view.setTimeout(run, 200);
	};
	const pump = () => {
		if (!open || pauseToken < 0) return;
		const present = new Set(
			[...document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]')].map(
				(link) => absolute(link.getAttribute('href') || link.href),
			),
		);
		while (inFlight < 2 && queue.length > 0) {
			const item = queue.shift()!;
			const href = typeof item === 'string' ? item : item.href;
			if (!href || present.has(absolute(href))) continue;
			const link = document.createElement('link');
			link.rel = 'modulepreload';
			link.href = href;
			link.crossOrigin =
				typeof item === 'string' ? 'anonymous' : (item.crossOrigin ?? 'anonymous');
			link.fetchPriority = 'low';
			let settled = false;
			const done = () => {
				if (settled) return;
				settled = true;
				inFlight -= 1;
				pump();
			};
			link.addEventListener('load', done, { once: true });
			link.addEventListener('error', done, { once: true });
			inFlight += 1;
			present.add(absolute(href));
			document.head.appendChild(link);
		}
	};
	const observer = new view.IntersectionObserver((entries) => {
		for (const entry of entries) {
			if (!entry.isIntersecting) continue;
			observer.unobserve(entry.target);
			const url = new URL((entry.target as HTMLAnchorElement).href, document.baseURI);
			if (requested.has(url.pathname)) continue;
			for (const resolve of resolvers) {
				const items = resolve(url);
				if (!items?.length) continue;
				requested.add(url.pathname);
				queue.push(...items);
				break;
			}
		}
		pump();
	});
	const scan = () => {
		observer.disconnect();
		const origin = new URL(document.URL).origin;
		for (const anchor of document.querySelectorAll<HTMLAnchorElement>(
			`a[href][${linkAttribute}]`,
		)) {
			const choice = anchor.getAttribute(prefetchAttribute);
			if (choice !== 'viewport' && (!everyLink || choice === 'none' || choice === 'intent'))
				continue;
			if (anchor.hasAttribute('download') || anchor.relList.contains('external')) continue;
			if (anchor.target && anchor.target !== '_self') continue;
			const url = new URL(anchor.href, document.baseURI);
			if (url.origin === origin && !requested.has(url.pathname)) observer.observe(anchor);
		}
	};
	const pagePreloadsSettled = () =>
		Promise.all(
			[...document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]')]
				.filter(
					(link) => view.performance.getEntriesByName(link.href, 'resource').length === 0,
				)
				.map(
					(link) =>
						new Promise((resolve) => {
							link.addEventListener('load', resolve, { once: true });
							link.addEventListener('error', resolve, { once: true });
							view.setTimeout(resolve, 10000);
						}),
				),
		);
	const begin = () => {
		if (started) return;
		started = true;
		void pagePreloadsSettled().then(() =>
			idle(() => {
				open = true;
				scan();
				pump();
			}),
		);
	};
	const interact = () => {
		const token = Math.abs(pauseToken) + 1;
		pauseToken = -token;
		view.setTimeout(
			() =>
				idle(() => {
					if (pauseToken !== -token) return;
					pauseToken = token;
					begin();
					pump();
				}),
			0,
		);
	};
	for (const type of ['pointerdown', 'pointerup', 'keydown', 'keyup']) {
		document.addEventListener(type, interact, { capture: true, passive: true });
	}
	host.__marklessRouterViewportPrefetch = {
		scan(next) {
			if (!resolvers.includes(next)) resolvers.unshift(next);
			if (open) scan();
		},
	};
	if (document.readyState === 'complete') begin();
	else view.addEventListener('load', begin, { once: true });
}
