import type {
	FragmentEntryModule,
	FragmentPreload,
	FragmentFetched,
	FragmentNavigationConfig,
	FragmentNavigationState,
	FragmentPrefetch,
	FragmentRouteCode,
} from './entries/fragment-entry.ts';

export type { FragmentNavigationConfig } from './entries/fragment-entry.ts';

// Serialized into the SSR link bridge (must not reference anything outside its own body): the part of fragment navigation that runs at load.
// It only listens; the first link intent, a Back/Forward, or idle loads `runFragmentNavigation` (matching, intent, fetch).
export function startFragmentNavigation(
	d: Document,
	linkAttributeOf: () => string,
	routes: FragmentRouteCode,
	importModule: (href: string) => Promise<unknown>,
	loadRun: () => Promise<FragmentNavigationRun>,
	// What a press may start before the run half arrives; null when the app fetches nothing ahead of a click. A thunk, like the config.
	intentOf: () => FragmentIntent | null,
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
	const arriving = new Map<string, Promise<unknown>>();
	let running: FragmentNavigationApi | undefined;
	let starting: Promise<FragmentNavigationApi> | undefined;
	let pressed: FragmentEarly | undefined;
	const preload = (item: FragmentPreload) => {
		const href = new URL(typeof item === 'string' ? item : item.href, d.baseURI).href;
		if (arriving.has(href)) return;
		const link = d.createElement('link');
		// A destination stylesheet loads beside its page, not once the page has arrived.
		if (typeof item !== 'string' && 'as' in item) {
			link.rel = 'preload';
			link.as = item.as;
		} else {
			link.rel = 'modulepreload';
			link.crossOrigin = 'anonymous';
		}
		link.href = href;
		arriving.set(href, new Promise((done) => (link.onload = link.onerror = done)));
		d.head.appendChild(link);
	};
	const anchorOf = (event: Event) => {
		const target = (event.composedPath()[0] ?? event.target) as Node;
		return (
			target.nodeType === 1 ? (target as Element) : target.parentElement
		)?.closest<HTMLAnchorElement>('a[href]');
	};
	// A same-origin link this tab would follow itself: no download, no other window, not marked external.
	const followed = (anchor: HTMLAnchorElement) => {
		if (anchor.hasAttribute('download') || anchor.relList.contains('external')) return;
		if (anchor.target && anchor.target !== '_self') return;
		const url = new URL(anchor.href, d.baseURI);
		return url.origin === w.location.origin ? url : undefined;
	};
	const here = (url: URL) =>
		url.pathname + url.search === w.location.pathname + w.location.search;
	// A press, or a mouse resting on a link, fetches its page and code at once, alongside the run half.
	const press = (anchor: HTMLAnchorElement) => {
		const intent = intentOf();
		if (!intent || pressed || anchor.getAttribute(intent.prefetchAttribute) === 'none') return;
		const url = followed(anchor);
		const code = url && routes[url.pathname];
		if (!code || here(url)) return;
		const target = new URL(url.href);
		target.hash = '';
		target.pathname = intent.requestPrefix + target.pathname;
		const controller = new AbortController();
		const response = w.fetch(target.href, {
			credentials: 'same-origin',
			headers: { purpose: 'prefetch' },
			signal: controller.signal,
		});
		response.catch(() => {});
		// After the page fetch, so an origin's per-host connection limit never queues the page behind its code.
		for (const item of [...intent.code, ...code]) preload(item);
		pressed = { url: url.href, at: w.performance.now(), controller, response };
	};
	const wake = (event?: Event) => {
		starting ??= loadRun().then((run) => {
			delete host.__marklessFragmentWake;
			return (running = run(d, routes, importModule, scrolled, arriving, pressed));
		});
		starting.then(
			(api) => api.replay(event),
			() => (starting = undefined),
		);
		return starting;
	};
	let rest = 0;
	let at = '';
	const listen = (event: Event) => {
		const target = (event.composedPath()[0] ?? event.target) as Element;
		if (event.type === 'pointermove') {
			const pointer = event as PointerEvent;
			w.clearTimeout(rest);
			if (at === (at = `${pointer.clientX},${pointer.clientY}`)) return;
			const anchor = !running && pointer.pointerType === 'mouse' && anchorOf(event);
			const dwell = anchor && intentOf()?.hoverDwellMs;
			if (dwell) rest = w.setTimeout(() => running || press(anchor), dwell);
		} else if (event.type === 'scroll') {
			if (target !== (d as Node)) scrolled.add(target);
		} else if (event.type === 'popstate')
			void wake().then((api) => api.traverse(event as PopStateEvent));
		else if (!running) {
			const anchor = anchorOf(event);
			if (!anchor) return;
			// A router link is taken ahead of page handlers; a plain anchor after them, once its click reaches the document.
			if (event.type !== 'click') {
				if (event.type !== 'pointerover') press(anchor);
				void wake(event);
			} else if (anchor.hasAttribute(linkAttributeOf())) early(event);
			else
				d.addEventListener('click', (later) => later === event && early(later), {
					once: true,
				});
		}
	};
	for (const type of [
		'pointermove',
		'scroll',
		'pointerover',
		'pointerdown',
		'touchstart',
		'focusin',
		'popstate',
	])
		w.addEventListener(type, listen, { capture: true, passive: true });
	// Not passive: a click this code holds must be able to cancel the browser's own navigation.
	w.addEventListener('click', listen, true);
	// A click that beats the woken code holds the link until it can swap, or follows it as the browser would.
	const early = (event: Event) => {
		const mouse = event as MouseEvent;
		if (running || mouse.defaultPrevented || mouse.button !== 0) return;
		if (mouse.metaKey || mouse.altKey || mouse.ctrlKey || mouse.shiftKey) return;
		const anchor = anchorOf(event)!;
		const url = followed(anchor);
		if (!url || url.hash.startsWith('#/') || (url.hash && here(url))) return;
		event.preventDefault();
		wake().then(
			(api) => api.go(anchor) || w.location.assign(url.href),
			() => w.location.assign(url.href),
		);
	};
	// The idle tier only fetches destinations the server listed, so a page listing none never schedules it.
	if (Object.keys(routes).length) {
		const idle = () =>
			w.requestIdleCallback
				? w.requestIdleCallback(() => wake(), { timeout: 3000 })
				: w.setTimeout(() => wake(), 500);
		if (d.readyState === 'complete') idle();
		else w.addEventListener('load', idle, { once: true });
	}
}

export type FragmentIntent = {
	// The swap module and the files it statically imports.
	readonly code: readonly string[];
	readonly hoverDwellMs: number;
	readonly requestPrefix: string;
	readonly prefetchAttribute: string;
};

// A page fetch a press started before the run half arrived; the run half adopts it as its prefetch.
export type FragmentEarly = {
	readonly url: string;
	readonly at: number;
	readonly controller: AbortController;
	readonly response: Promise<Response>;
};

export type FragmentNavigationApi = {
	readonly traverse: (event: PopStateEvent) => void;
	readonly replay: (event: Event | undefined) => void;
	readonly go: (anchor: Element) => boolean;
};

// The run half with its config bound: the bridge file that holds it carries the config, the page bridge does not.
export type FragmentNavigationRun = (
	d: Document,
	routes: FragmentRouteCode,
	importModule: (href: string) => Promise<unknown>,
	scrolled: Set<Element>,
	arriving: Map<string, Promise<unknown>>,
	early: FragmentEarly | undefined,
) => FragmentNavigationApi;

// Serialized into its own static bridge file, loaded on the first link intent or at idle: everything that happens before the swap.
export function runFragmentNavigation(
	d: Document,
	config: FragmentNavigationConfig,
	routes: FragmentRouteCode,
	importModule: (href: string) => Promise<unknown>,
	scrolled: Set<Element>,
	arriving: Map<string, Promise<unknown>>,
	early: FragmentEarly | undefined,
): FragmentNavigationApi {
	const w = d.defaultView as Window & typeof globalThis;
	const host = d as Document & { __marklessFragmentNav?: FragmentNavigationState };
	const location = w.location;
	const connection = (
		w.navigator as Navigator & {
			connection?: { effectiveType?: string; saveData?: boolean };
		}
	).connection;
	const pageKey = (url: URL) => url.pathname + url.search;
	// Pages this tab already fetched, for any reason: the idle tier never downloads one again; a hover or a press still does.
	const fetched = new Set<string>();
	let module: Promise<FragmentEntryModule> | undefined;
	// Even a loaded module's import() resolves a task later, after the next paint: a click on a pressed link calls it directly.
	let loaded: FragmentEntryModule | undefined;
	const load = () => {
		if (!module) {
			module = importModule(config.entry) as Promise<FragmentEntryModule>;
			module.then(
				(entry) => (loaded = entry),
				() => (module = undefined),
			);
		}
		return module;
	};
	// A same-origin anchor, router Link or plain, counts only when its path names one of the app's pages.
	const underEndpoints = (pathname: string) =>
		config.endpointPrefixes.some((prefix) => (pathname + '/').startsWith(prefix + '/'));
	const pages = config.pages.map(
		(page) => [underEndpoints(page), page.split('/').filter(Boolean)] as const,
	);
	// Server endpoints are never fetched ahead of a click or as a fragment: a GET there may have side effects.
	// Only a page file under the endpoint prefix itself (pages/api/) answers a path there.
	const isPage = (pathname: string) => {
		const endpoint = underEndpoints(pathname);
		const parts = pathname.split('/').filter(Boolean);
		return pages.some(([under, page]) => {
			if (endpoint && !under) return false;
			const rest = page.indexOf('**');
			if (rest === -1 ? page.length !== parts.length : parts.length <= rest) return false;
			return page.every((segment, index) => {
				if (segment === '**' || segment === ':') return true;
				try {
					return segment === decodeURIComponent(parts[index]!);
				} catch {
					return segment === parts[index];
				}
			});
		});
	};
	const eligible = (anchor: Element | null | undefined, forClick = false): URL | undefined => {
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
		for (const item of [
			config.entry,
			...config.entryImports,
			...(state.routes[url.pathname] ?? []),
		]) {
			const entry = typeof item === 'string' ? { href: item } : item;
			const href = new URL(entry.href, d.baseURI).href;
			if (present.has(href) || arriving.has(href)) continue;
			present.add(href);
			const link = d.createElement('link');
			if ('as' in entry) {
				link.rel = 'preload';
				link.as = entry.as;
			} else {
				link.rel = 'modulepreload';
				link.crossOrigin = entry.crossOrigin ?? 'anonymous';
			}
			link.href = href;
			if (low) link.fetchPriority = 'low';
			arriving.set(
				href,
				new Promise((done) => {
					link.addEventListener('load', done, { once: true });
					link.addEventListener('error', done, { once: true });
				}),
			);
			d.head.appendChild(link);
		}
	};
	// DOMParser parses with scripting off, where <noscript> holds elements (and, in <head>, spills them into <body>); a load parses it as raw text.
	const parseAsLoaded = (html: string): Document => {
		const raw: string[] = [];
		const emptied = html.replace(
			/<!--[\s\S]*?-->|<(script|style|textarea|title)\b[^>]*>[\s\S]*?<\/\1\s*>|<noscript\b([^>]*)>([\s\S]*?)<\/noscript\s*>/gi,
			(match, _rawText, attributes: string | undefined, content: string | undefined) => {
				if (content === undefined) return match;
				raw.push(content);
				return `<noscript${attributes ?? ''}></noscript>`;
			},
		);
		if (!raw.length) return new DOMParser().parseFromString(html, 'text/html');
		const doc = new DOMParser().parseFromString(emptied, 'text/html');
		const tags = doc.getElementsByTagName('noscript');
		if (tags.length !== raw.length) return new DOMParser().parseFromString(html, 'text/html');
		for (let index = 0; index < tags.length; index++) tags[index]!.textContent = raw[index]!;
		return doc;
	};
	// A stylesheet the next page adds is preloaded once its HTML arrives: the swap waits for it, a click should not.
	const preloadStyles = (doc: Document) => {
		for (const link of doc.head.querySelectorAll<HTMLLinkElement>(
			'link[rel="stylesheet"][href]',
		)) {
			const href = new URL(link.getAttribute('href')!, d.baseURI).href;
			if (
				[...d.querySelectorAll<HTMLLinkElement>('link[href]')].some(
					(own) => own.href === href,
				)
			)
				continue;
			const preload = d.createElement('link');
			preload.rel = 'preload';
			preload.as = 'style';
			preload.href = href;
			for (const name of ['media', 'crossorigin', 'integrity'])
				if (link.hasAttribute(name)) preload.setAttribute(name, link.getAttribute(name)!);
			d.head.append(preload);
		}
	};
	const parse = (url: string, text: string): FragmentFetched => {
		const at = text.indexOf(config.regionEndMarker);
		const prefix = at === -1 ? text : text.slice(0, at);
		const doc = parseAsLoaded(prefix);
		preloadStyles(doc);
		return {
			url,
			prefix,
			doc,
			tail: at === -1 ? '' : text.slice(at + config.regionEndMarker.length),
		};
	};
	// An unused prefetch reads the rest of its response itself, so it frees its connection as soon as the server is done.
	const drain = (
		reader: ReadableStreamDefaultReader<Uint8Array>,
		closed: () => void,
	): ReadableStreamDefaultReader<Uint8Array> => {
		const chunks: Uint8Array[] = [];
		let ended = false;
		let wake = () => {};
		const end = () => {
			ended = true;
			closed();
			wake();
		};
		void (async () => {
			for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
				chunks.push(chunk.value);
				wake();
			}
		})().then(end, end);
		return {
			read: async () => {
				while (!chunks.length && !ended) await new Promise<void>((done) => (wake = done));
				return chunks.length
					? { done: false, value: chunks.shift()! }
					: { done: true, value: undefined };
			},
			cancel: () => reader.cancel(),
		} as ReadableStreamDefaultReader<Uint8Array>;
	};
	// One request: the destination's region document and its resume payload, parsed on arrival (no script runs), so the click only swaps.
	// budget: an idle fetch stops once the page's region passes this many bytes, leaving that page to intent.
	const request = (
		url: URL,
		speculative: boolean,
		started?: FragmentEarly,
		budget = Infinity,
	): FragmentPrefetch => {
		fetched.add(pageKey(url));
		const controller = started?.controller ?? new AbortController();
		const read = async (): Promise<FragmentFetched> => {
			const prefix = config.requestPrefix;
			const target = new URL(url.href);
			target.hash = '';
			target.pathname = prefix + target.pathname;
			const response = await (started?.response ??
				w.fetch(target.href, {
					credentials: 'same-origin',
					headers: speculative ? { purpose: 'prefetch' } : {},
					priority: speculative ? 'auto' : 'high',
					signal: controller.signal,
				} as RequestInit));
			const cacheControl = response.headers.get('cache-control') ?? '';
			const maxAge = /(?:^|,)\s*max-age\s*=\s*"?(\d+)/i.exec(cacheControl);
			if (/(?:^|,)\s*no-(?:store|cache)\b/i.test(cacheControl))
				entry.expires = w.performance.now();
			else if (maxAge) entry.expires = entry.at + Number(maxAge[1]) * 1000;
			const type = response.headers.get('content-type') ?? '';
			if (!response.ok || !type.includes('text/html') || !response.body)
				throw new Error(`MARKLESS_ROUTER_FRAGMENT_UNAVAILABLE: ${response.status}`);
			const finalUrl = new URL(response.url || target.href);
			if (finalUrl.origin !== location.origin)
				throw new Error('MARKLESS_ROUTER_FRAGMENT_OFF_ORIGIN');
			// A redirect off the fragment path answered with a whole document.
			if (!finalUrl.pathname.startsWith(`${prefix}/`))
				throw new Error('MARKLESS_ROUTER_FRAGMENT_UNAVAILABLE: redirected');
			finalUrl.pathname = finalUrl.pathname.slice(prefix.length);
			finalUrl.hash = url.hash;
			const declared = Number(response.headers.get('content-length') ?? 0);
			if (declared > budget) throw new Error('MARKLESS_ROUTER_FRAGMENT_OVER_IDLE_BUDGET');
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let text = '';
			let bytes = 0;
			for (;;) {
				if (text.includes(config.regionEndMarker))
					return {
						...parse(finalUrl.href, text),
						rest: speculative ? drain(reader, closed) : reader,
					};
				const chunk = await reader.read();
				if (chunk.done) {
					closed();
					return parse(finalUrl.href, text + decoder.decode());
				}
				bytes += chunk.value.byteLength;
				if (bytes > budget) {
					void reader.cancel();
					throw new Error('MARKLESS_ROUTER_FRAGMENT_OVER_IDLE_BUDGET');
				}
				text += decoder.decode(chunk.value, { stream: true });
			}
		};
		const closed = () => {
			entry.open = false;
			queueMicrotask(pumpIdle);
		};
		const entry: FragmentPrefetch = {
			at: started?.at ?? w.performance.now(),
			writes: state.writes,
			result: read(),
			open: true,
			abort: () => {
				closed();
				controller.abort();
			},
		};
		entry.result.catch(closed);
		return entry;
	};
	// An unused prefetch still streaming holds a connection: drop it once stale, and keep only a few open,
	// or an HTTP/1.1 origin's per-host connection limit stalls the next click behind them.
	const prefetch = (url: URL, code = true, started?: FragmentEarly, budget = Infinity) => {
		const key = pageKey(url);
		// A hover timer can fire after its link's page is already shown.
		if (!config.prefetch || key === state.shown) return;
		const existing = state.prefetches.get(key);
		// An idle-fetched page still needs its code on intent, or the swap fetches it a round late.
		if (existing && fresh(existing, w.performance.now()))
			return void (code && preloadCode(url, false));
		existing?.abort();
		const open = [...state.prefetches].filter(([, entry]) => entry.open);
		for (const [stale, entry] of open.slice(
			0,
			Math.max(0, open.length + 1 - config.prefetchConnections),
		)) {
			state.prefetches.delete(stale);
			entry.abort();
		}
		const entry = request(url, true, started, budget);
		// A page over the idle budget is left for a hover or a press to fetch whole.
		entry.result.catch(() => {
			if (state.prefetches.get(key) === entry) state.prefetches.delete(key);
		});
		state.prefetches.set(key, entry);
		w.setTimeout(() => {
			if (state.prefetches.get(key) !== entry) return;
			state.prefetches.delete(key);
			entry.abort();
		}, config.prefetchTtlMs);
		if (code) preloadCode(url, false);
	};
	// Idle tier, fast unmetered connections only: fetch the HTML of a few links in view and preload their code, one round.
	let scanning = false;
	let idleQueue: URL[] = [];
	// Idle fetches wait for a free connection rather than cancel one another.
	const pumpIdle = () => {
		while (idleQueue.length) {
			let open = 0;
			for (const entry of state.prefetches.values()) if (entry.open) open += 1;
			if (open >= config.prefetchConnections) return;
			const url = idleQueue.shift()!;
			if (state.prefetches.has(pageKey(url)) || fetched.has(pageKey(url))) continue;
			prefetch(url, false, undefined, config.idleFragmentBytes);
			// Low priority and never evaluated: a modulepreload only fills the cache before a press.
			preloadCode(url, true);
		}
	};
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
				const hit = d.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
				if (!hit || (hit !== anchor && !anchor.contains(hit))) continue;
				visible.set(pageKey(url), url);
			}
			idleQueue = [];
			for (const [key, url] of visible)
				if (
					idleQueue.length < config.idleFragments &&
					!state.prefetches.has(key) &&
					!fetched.has(key)
				)
					idleQueue.push(url);
			pumpIdle();
		};
		const idle = () =>
			w.requestIdleCallback
				? w.requestIdleCallback(run, { timeout: 3000 })
				: w.setTimeout(run, 500);
		if (d.readyState === 'complete') idle();
		else w.addEventListener('load', idle, { once: true });
	};
	const fresh = (entry: FragmentPrefetch, now: number) =>
		entry.writes === state.writes &&
		now - entry.at < config.prefetchTtlMs &&
		(entry.expires === undefined || now < entry.expires);
	const state: FragmentNavigationState = {
		config,
		routes,
		prefetches: new Map(),
		visited: new Map(),
		writes: 0,
		fresh,
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
		arriving,
	};
	host.__marklessFragmentNav = state;
	if (early) prefetch(new URL(early.url), true, early);

	// A write may change any page, so a submitted form or a fetch that is not a read, as it starts and as it ends, drops every page fetched ahead.
	const wrote = () => {
		state.writes++;
		for (const entry of state.prefetches.values()) entry.abort();
		state.prefetches.clear();
		state.visited.clear();
	};
	d.addEventListener('submit', wrote, true);
	const read = new Set(['GET', 'HEAD', 'OPTIONS']);
	const send = w.fetch;
	// The page's own fetch, unchanged: the same arguments go to the browser's fetch and its promise comes back as is.
	w.fetch = function fetch(input: RequestInfo | URL, init?: RequestInit) {
		const response = send.call(w, input, init);
		const request = input instanceof Request ? input : undefined;
		const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
		if (!read.has(method)) {
			let same = false;
			try {
				same =
					new URL(request?.url ?? String(input), location.href).origin ===
					location.origin;
			} catch {}
			if (same) {
				wrote();
				response.then(wrote, wrote);
			}
		}
		return response;
	};

	// Intent: press, touch and keyboard focus fetch at once. A mouse fetches once it rests on a link:
	// a pointer crossing a list of links on its way somewhere never rests on the ones it crosses.
	let restTimer = 0;
	let previous: { x: number; y: number; t: number } | undefined;
	const hover = (event: Event) => {
		const pointer = event as PointerEvent;
		if (pointer.pointerType !== 'mouse') return;
		const point = { x: pointer.clientX, y: pointer.clientY, t: pointer.timeStamp };
		// A move that went nowhere is the page shifting under a still pointer, not the pointer resting on a link.
		if (previous && point.x === previous.x && point.y === previous.y)
			return void w.clearTimeout(restTimer);
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
			restTimer = w.setTimeout(() => prefetch(url), Math.max(config.hoverDwellMs, gap * 1.5));
	};
	d.addEventListener('pointermove', hover, { passive: true });
	d.addEventListener('pointerout', () => w.clearTimeout(restTimer), { passive: true });
	const press = (event: Event) => {
		w.clearTimeout(restTimer);
		const anchor = anchorOf(event);
		const url = eligible(anchor);
		if (url) prefetch(url);
		if (url || eligible(anchor, true)) void load();
	};
	for (const type of ['pointerdown', 'touchstart', 'focusin'])
		d.addEventListener(type, press, { passive: true });

	// Links are taken in the capture phase, ahead of page handlers; a plain anchor after them, as the browser would follow it.
	const go = (anchor: Element): boolean => {
		const url = eligible(anchor, true);
		if (!url) return false;
		const current = new URL(location.href);
		w.clearTimeout(restTimer);
		const replace = anchor.hasAttribute(config.replaceAttribute) || url.href === current.href;
		const manual = anchor.getAttribute(config.scrollAttribute) === 'manual';
		const swap = (entry: FragmentEntryModule) =>
			entry.navigate(d, url, replace ? 'replace' : 'push', manual ? 'manual' : 'reset');
		if (loaded) void swap(loaded);
		else load().then(swap, () => location.assign(url.href));
		return true;
	};
	const follow = (routedPhase: boolean) => (event: Event) => {
		const mouse = event as MouseEvent;
		if (mouse.defaultPrevented || mouse.button !== 0) return;
		if (mouse.metaKey || mouse.altKey || mouse.ctrlKey || mouse.shiftKey) return;
		const anchor = anchorOf(event);
		if (!anchor || anchor.hasAttribute(config.linkAttribute) !== routedPhase) return;
		if (go(anchor)) event.preventDefault();
	};
	d.addEventListener('click', follow(true), true);
	d.addEventListener('click', follow(false));
	rescan();
	const traverse = (event: PopStateEvent) => {
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
	// The event that woke this code: a press or hover on a link acts as it would have had this code been running.
	const replay = (event: Event | undefined) => {
		if (event?.type === 'pointerover') hover(event);
		else if (event && event.type !== 'popstate') press(event);
	};
	return { traverse, replay, go };
}

// A fragment fetch asks for the page path under this prefix, so a cache keyed on the URL, or a host rewrite that drops the query, keeps it apart from the page.
export const FRAGMENT_PATH_PREFIX = '/_markless/fragment';
/** Set on every fragment response, so a redirect it answers can be pointed back at a fragment. */
export const FRAGMENT_RESPONSE_HEADER = 'x-markless-fragment';

export function fragmentRequestUrl(url: string | URL): URL {
	const target = new URL(url);
	target.pathname = FRAGMENT_PATH_PREFIX + target.pathname;
	return target;
}

// The page URL a fragment request names, or undefined for any other request.
export function fragmentPageUrl(url: URL): URL | undefined {
	if (!url.pathname.startsWith(`${FRAGMENT_PATH_PREFIX}/`)) return undefined;
	const page = new URL(url);
	page.pathname = url.pathname.slice(FRAGMENT_PATH_PREFIX.length);
	return page;
}

// The response's region document ends here; each streamed @pending arm after it ends with the append marker.
export const FRAGMENT_REGION_END = '<!--markless:region-end-->';
export const FRAGMENT_APPEND_END = '<!--markless:append-end-->';
export const FRAGMENT_HOVER_DWELL_MS = 20;
export const FRAGMENT_PREFETCH_TTL_MS = 30_000;
// Unused prefetches still streaming their @pending pieces; older ones are cancelled past this.
export const FRAGMENT_PREFETCH_CONNECTIONS = 2;
export const FRAGMENT_IDLE_FRAGMENTS = 6;
// An idle fetch of a page whose region runs past this many bytes stops there; the page is fetched on intent instead.
export const FRAGMENT_IDLE_FRAGMENT_BYTES = 256 * 1024;
// Browsers without the Network Information API (WebKit, Firefox) say nothing about the connection; the idle tier's own gate bounds what they fetch.
export const FRAGMENT_IDLE_WITHOUT_CONNECTION_INFO = true;
