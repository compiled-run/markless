import type {
	FragmentEntryModule,
	FragmentFetched,
	FragmentNavigationConfig,
	FragmentNavigationState,
	FragmentPrefetch,
	FragmentRouteCode,
} from './entries/fragment-entry.ts';

export type { FragmentNavigationConfig } from './entries/fragment-entry.ts';

// Serialized into the SSR link bridge (must not reference anything outside its own body): everything that happens before the click.
// At load only the wake listeners below run; `start` (matching, intent, fetch) is evaluated on the first link intent or at idle.
export function startFragmentNavigation(
	d: Document,
	// A thunk: the config is only read once the page shows link intent or goes idle.
	configOf: () => FragmentNavigationConfig,
	routes: FragmentRouteCode,
	importModule: (href: string) => Promise<unknown>,
): void {
	const w = d.defaultView as (Window & typeof globalThis) | null;
	if (!w) return;
	const host = d as Document & {
		__marklessFragmentNav?: FragmentNavigationState;
		__marklessFragmentWake?: FragmentRouteCode;
	};
	const known = host.__marklessFragmentNav?.routes ?? host.__marklessFragmentWake;
	if (known) return void Object.assign(known, routes);
	host.__marklessFragmentWake = routes;
	const scrolled = new Set<Element>();
	let traverse: ((event: PopStateEvent) => void) | undefined;
	const wake = () => (traverse ??= start());
	// Listeners the woken code adds to the document still see the event that woke it: the window capture phase runs first.
	const listen = (event: Event) => {
		const target = (event.composedPath()[0] ?? event.target) as Element;
		if (event.type === 'scroll') {
			if (target !== (d as Node)) scrolled.add(target);
		} else if (event.type === 'popstate') wake()(event as PopStateEvent);
		else if (!traverse && target.closest?.('a[href]')) wake();
	};
	for (const type of [
		'scroll',
		'pointerover',
		'pointerdown',
		'touchstart',
		'focusin',
		'click',
		'popstate',
	])
		w.addEventListener(type, listen, { capture: true, passive: true });
	// The idle tier only fetches destinations the server listed, so a page listing none never schedules it.
	if (Object.keys(routes).length) {
		const idle = () =>
			w.requestIdleCallback
				? w.requestIdleCallback(wake, { timeout: 3000 })
				: w.setTimeout(wake, 500);
		if (d.readyState === 'complete') idle();
		else w.addEventListener('load', idle, { once: true });
	}

	const start = (): ((event: PopStateEvent) => void) => {
		delete host.__marklessFragmentWake;
		const config = configOf();
		const location = w.location;
		const connection = (
			w.navigator as Navigator & {
				connection?: { effectiveType?: string; saveData?: boolean };
			}
		).connection;
		const pageKey = (url: URL) => url.pathname + url.search;
		let module: Promise<FragmentEntryModule> | undefined;
		const load = () => {
			module ??= importModule(config.entry) as Promise<FragmentEntryModule>;
			module.catch(() => (module = undefined));
			return module;
		};
		// A same-origin anchor, router Link or plain, counts only when its path names one of the app's pages.
		const pages = config.pages.map((page) => page.split('/').filter(Boolean));
		// Server endpoints are never fetched ahead of a click or as a fragment: a GET there may have side effects.
		const isPage = (pathname: string) => {
			if (config.endpointPrefixes.some((prefix) => (pathname + '/').startsWith(prefix + '/')))
				return false;
			const parts = pathname.split('/').filter(Boolean);
			return pages.some((page) => {
				const rest = page.indexOf('**');
				if (rest === -1 ? page.length !== parts.length : parts.length <= rest) return false;
				return page.every(
					(segment, index) =>
						segment === '**' || segment === ':' || segment === parts[index],
				);
			});
		};
		const eligible = (
			anchor: Element | null | undefined,
			forClick = false,
		): URL | undefined => {
			if (!anchor || anchor.localName !== 'a') return;
			const link = anchor as HTMLAnchorElement;
			if (link.hasAttribute('download') || link.relList.contains('external')) return;
			if (link.target && link.target !== '_self') return;
			if (!forClick && link.getAttribute(config.prefetchAttribute) === 'none') return;
			let url: URL;
			try {
				url = new URL(link.href, d.baseURI);
			} catch {
				return;
			}
			if (url.origin !== location.origin || url.hash.startsWith('#/')) return;
			if (!isPage(url.pathname)) return;
			// A fragment of this document (href="#", "#top", "/here#top") is the browser's to scroll to.
			const here = forClick ? pageKey(new URL(location.href)) : state.shown;
			if (pageKey(url) === here && (!forClick || url.href.includes('#'))) return;
			return url;
		};
		const anchorOf = (event: Event): Element | null | undefined => {
			const target = (event.composedPath?.()[0] ?? event.target) as Node | null;
			const element =
				target && target.nodeType === 1 ? (target as Element) : target?.parentElement;
			return element?.closest('a[href]');
		};
		// The destination's landing plan plus the swap module: what the page needs once it is in.
		const preloadCode = (url: URL, low: boolean) => {
			const present = new Set(
				[...d.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]')].map(
					(link) => link.href,
				),
			);
			for (const item of [config.entry, ...(state.routes[url.pathname] ?? [])]) {
				const entry = typeof item === 'string' ? { href: item } : item;
				const href = new URL(entry.href, d.baseURI).href;
				if (present.has(href)) continue;
				present.add(href);
				const link = d.createElement('link');
				link.rel = 'modulepreload';
				link.href = href;
				link.crossOrigin = entry.crossOrigin ?? 'anonymous';
				if (low) link.fetchPriority = 'low';
				d.head.appendChild(link);
			}
		};
		const parse = (url: string, text: string): FragmentFetched => {
			const at = text.indexOf(config.regionEndMarker);
			const prefix = at === -1 ? text : text.slice(0, at);
			return {
				url,
				prefix,
				doc: new DOMParser().parseFromString(prefix, 'text/html'),
				tail: at === -1 ? '' : text.slice(at + config.regionEndMarker.length),
			};
		};
		// One request: the destination's region document and its resume payload, parsed on arrival (no script runs), so the click only swaps.
		const request = (url: URL, speculative: boolean): FragmentPrefetch => {
			const controller = new AbortController();
			const read = async (): Promise<FragmentFetched> => {
				const response = await w.fetch(url.href, {
					credentials: 'same-origin',
					headers: speculative
						? { [config.requestHeader]: '1', purpose: 'prefetch' }
						: { [config.requestHeader]: '1' },
					priority: speculative ? 'auto' : 'high',
					signal: controller.signal,
				} as RequestInit);
				const type = response.headers.get('content-type') ?? '';
				if (!response.ok || !type.includes('text/html') || !response.body)
					throw new Error(`MARKLESS_ROUTER_FRAGMENT_UNAVAILABLE: ${response.status}`);
				const finalUrl = new URL(response.url || url.href);
				if (finalUrl.origin !== location.origin)
					throw new Error('MARKLESS_ROUTER_FRAGMENT_OFF_ORIGIN');
				finalUrl.hash = url.hash;
				const reader = response.body.getReader();
				const decoder = new TextDecoder();
				let text = '';
				for (;;) {
					if (text.includes(config.regionEndMarker))
						return { ...parse(finalUrl.href, text), rest: reader };
					const chunk = await reader.read();
					if (chunk.done) {
						entry.open = false;
						return parse(finalUrl.href, text + decoder.decode());
					}
					text += decoder.decode(chunk.value, { stream: true });
				}
			};
			const entry: FragmentPrefetch = {
				at: w.performance.now(),
				result: read(),
				open: true,
				abort: () => {
					entry.open = false;
					controller.abort();
				},
			};
			entry.result.catch(() => (entry.open = false));
			return entry;
		};
		// An unused prefetch still streaming holds a connection: drop it once stale, and keep only a few open,
		// or an HTTP/1.1 origin's per-host connection limit stalls the next click behind them.
		const prefetch = (url: URL) => {
			const key = pageKey(url);
			// A hover timer can fire after its link's page is already shown.
			if (!config.prefetch || key === state.shown) return;
			const existing = state.prefetches.get(key);
			if (existing && w.performance.now() - existing.at < config.prefetchTtlMs) return;
			existing?.abort();
			const open = [...state.prefetches].filter(([, entry]) => entry.open);
			for (const [stale, entry] of open.slice(
				0,
				Math.max(0, open.length + 1 - config.prefetchConnections),
			)) {
				state.prefetches.delete(stale);
				entry.abort();
			}
			const entry = request(url, true);
			state.prefetches.set(key, entry);
			w.setTimeout(() => {
				if (state.prefetches.get(key) !== entry) return;
				state.prefetches.delete(key);
				entry.abort();
			}, config.prefetchTtlMs);
			preloadCode(url, true);
		};
		// Idle tier, fast unmetered connections only: preload (never run) the swap module and the landing code of links in view, one round.
		let scanning = false;
		const rescan = () => {
			if (!state.idleDownloads || scanning) return;
			scanning = true;
			const run = () => {
				scanning = false;
				const visible = new Map<string, URL>();
				for (const anchor of d.querySelectorAll('a[href]')) {
					const url = eligible(anchor);
					// Only destinations the server listed as pages: a dead link is never fetched speculatively.
					if (!url || !state.routes[url.pathname]) continue;
					const box = anchor.getBoundingClientRect();
					if (!box.width || box.bottom < 0 || box.top > w.innerHeight) continue;
					if (box.right < 0 || box.left > w.innerWidth) continue;
					const hit = d.elementFromPoint(
						box.left + box.width / 2,
						box.top + box.height / 2,
					);
					if (!hit || (hit !== anchor && !anchor.contains(hit))) continue;
					visible.set(pageKey(url), url);
				}
				// HTML is fetched at idle only while the next click is at least as likely as not to use it.
				const fragments =
					visible.size <= config.idleFragments * 2 ? config.idleFragments : 0;
				let fetched = 0;
				for (const [key, url] of visible) {
					preloadCode(url, true);
					if (fetched >= fragments || state.prefetches.has(key)) continue;
					fetched += 1;
					state.prefetch(url);
				}
			};
			const idle = () =>
				w.requestIdleCallback
					? w.requestIdleCallback(run, { timeout: 3000 })
					: w.setTimeout(run, 500);
			if (d.readyState === 'complete') idle();
			else w.addEventListener('load', idle, { once: true });
		};
		const state: FragmentNavigationState = {
			config,
			routes,
			prefetches: new Map(),
			visited: new Map(),
			shown: pageKey(new URL(location.href)),
			eligible,
			preloadCode,
			request,
			prefetch,
			parse,
			idleDownloads:
				config.prefetch &&
				(connection
					? connection.effectiveType === '4g' && connection.saveData !== true
					: config.idleWithoutConnectionInfo),
			rescan,
			scrolled,
		};
		host.__marklessFragmentNav = state;

		// Intent: press, touch and keyboard focus fetch at once. A mouse fetches once it rests on a link:
		// a pointer crossing a list of links on its way somewhere never rests on the ones it crosses.
		let restTimer = 0;
		let previous: { x: number; y: number; t: number } | undefined;
		d.addEventListener(
			'pointermove',
			(event) => {
				const pointer = event as PointerEvent;
				if (pointer.pointerType !== 'mouse') return;
				const point = { x: pointer.clientX, y: pointer.clientY, t: pointer.timeStamp };
				const gap = previous ? point.t - previous.t : 0;
				const creeping =
					!!previous &&
					gap > 0 &&
					Math.hypot(point.x - previous.x, point.y - previous.y) / gap < 0.1;
				previous = point;
				w.clearTimeout(restTimer);
				const url = eligible(anchorOf(event));
				if (!url) return;
				// Moves arrive about once a frame, so resting means no move for longer than the last gap.
				if (creeping) prefetch(url);
				else
					restTimer = w.setTimeout(
						() => prefetch(url),
						Math.max(config.hoverDwellMs, gap * 1.5),
					);
			},
			{ passive: true },
		);
		d.addEventListener('pointerout', () => w.clearTimeout(restTimer), { passive: true });
		for (const type of ['pointerdown', 'touchstart', 'focusin'])
			d.addEventListener(
				type,
				(event) => {
					w.clearTimeout(restTimer);
					const url = eligible(anchorOf(event));
					if (url) prefetch(url);
				},
				{ passive: true },
			);

		// Links are taken in the capture phase, ahead of page handlers; a plain anchor after them, as the browser would follow it.
		const follow = (routedPhase: boolean) => (event: Event) => {
			const mouse = event as MouseEvent;
			if (mouse.defaultPrevented || mouse.button !== 0) return;
			if (mouse.metaKey || mouse.altKey || mouse.ctrlKey || mouse.shiftKey) return;
			const anchor = anchorOf(event);
			if (!anchor || anchor.hasAttribute(config.linkAttribute) !== routedPhase) return;
			const url = eligible(anchor, true);
			if (!url) return;
			const current = new URL(location.href);
			w.clearTimeout(restTimer);
			event.preventDefault();
			const replace =
				anchor.hasAttribute(config.replaceAttribute) || url.href === current.href;
			const manual = anchor.getAttribute(config.scrollAttribute) === 'manual';
			load().then(
				(entry) =>
					entry.navigate(
						d,
						url,
						replace ? 'replace' : 'push',
						manual ? 'manual' : 'reset',
					),
				() => location.assign(url.href),
			);
		};
		d.addEventListener('click', follow(true), true);
		d.addEventListener('click', follow(false));
		rescan();
		return (event) => {
			const url = new URL(location.href);
			if (url.hash.startsWith('#/') || pageKey(url) === state.shown) return;
			const saved = (
				event.state as { __marklessFragment?: { x: number; y: number; id?: string } } | null
			)?.__marklessFragment;
			load().then(
				(entry) => entry.navigate(d, url, 'traverse', saved ?? { x: 0, y: 0 }),
				() => location.reload(),
			);
		};
	};
}

// Request header a fragment fetch carries; page responses vary on it.
export const FRAGMENT_REQUEST_HEADER = 'x-markless-fragment';
// The response's region document ends here; each streamed @pending arm after it ends with the append marker.
export const FRAGMENT_REGION_END = '<!--markless:region-end-->';
export const FRAGMENT_APPEND_END = '<!--markless:append-end-->';
export const FRAGMENT_HOVER_DWELL_MS = 20;
export const FRAGMENT_PREFETCH_TTL_MS = 30_000;
// Unused prefetches still streaming their @pending pieces; older ones are cancelled past this.
export const FRAGMENT_PREFETCH_CONNECTIONS = 2;
export const FRAGMENT_IDLE_FRAGMENTS = 2;
// Browsers without the Network Information API (WebKit, Firefox) say nothing about the connection; the idle tier's own gate bounds what they fetch.
export const FRAGMENT_IDLE_WITHOUT_CONNECTION_INFO = true;
