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
