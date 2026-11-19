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

/** The load-time link bridge's phases: bit 1 = a press fetch is held, bit 2 = the run half is loading. */
export const BRIDGE_PHASE = {
	idle: 0,
	pressed: 1,
	starting: 2,
	startingPressed: 3,
	running: 4,
} as const;

// The bridge's legal moves; self-contained, because the dev bridge carries its source.
export function checkBridgeMove(from: number, to: number): void {
	const moves = [[1, 2], [3], [0, 3, 4], [0, 4], []][from];
	if (!moves?.includes(to))
		throw new Error(`Markless router link bridge: no move from phase ${from} to phase ${to}.`);
}

// Serialized into the SSR link bridge (must not reference anything outside its own body): the part of fragment navigation that runs at load.
// It only listens; the first link intent, a Back/Forward, or idle loads `runFragmentNavigation` (matching, intent, fetch).
export function startFragmentNavigation(
	d: Document,
	linkAttributeOf: () => string,
	// The attribute marking the page's route table, inert JSON `[preloads, destinations]` parsed on first lookup.
	tableAttribute: string,
	importModule: (href: string) => Promise<unknown>,
	loadRun: () => Promise<FragmentNavigationRun>,
	// What a press may start before the run half arrives; null when the app fetches nothing ahead of a click. A thunk, like the config.
	intentOf: () => FragmentIntent | null,
	// How long a failed run-half load waits for pagehide before it loads the clicked page as a document.
	leaveDeadlineMs: number,
	// Development only: throws on a phase move the bridge does not allow. The production bridge passes none.
	checkMove?: (from: number, to: number) => void,
): void {
	const w = d.defaultView as (Window & typeof globalThis) | null;
	if (!w) return;
	const host = d as Document & {
		__marklessFragmentTables?: () => void;
		__marklessFragmentIdle?: Promise<boolean>;
	};
	// A later page's bridge adds its table to the one the first page started.
	if (host.__marklessFragmentTables) return host.__marklessFragmentTables();
	const read = new WeakSet<Element>();
	const table: Record<string, readonly FragmentPreload[]> = {};
	let unread = true;
	host.__marklessFragmentTables = () => void (unread = true);
	const fill = () => {
		if (!unread) return table;
		unread = false;
		for (const script of d.querySelectorAll(`script[${tableAttribute}]`)) {
			if (read.has(script)) continue;
			read.add(script);
			const [preloads, destinations] = JSON.parse(script.textContent!) as [
				FragmentPreload[],
				Record<string, number[]>,
			];
			for (const path in destinations)
				table[path] = destinations[path]!.map((at) => preloads[at]!);
		}
		return table;
	};
	const routes: FragmentRouteCode = new Proxy(table, {
		get: (_, key) => fill()[key as string],
		has: (_, key) => key in fill(),
		ownKeys: () => Reflect.ownKeys(fill()),
		getOwnPropertyDescriptor: (_, key) => Reflect.getOwnPropertyDescriptor(fill(), key),
	});
	// Nothing idle may compete with the page's own first-click code: wait for the load event and every modulepreload it landed with.
	const landed = new Promise<void>((done) => {
		const start = () => {
			const pending = [
				...d.head.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]'),
			].filter((link) => !w.performance.getEntriesByName(link.href, 'resource').length);
			let left = pending.length;
			if (!left) return done();
			const arrived = () => void (--left || done());
			for (const link of pending) {
				link.addEventListener('load', arrived, { once: true });
				link.addEventListener('error', arrived, { once: true });
			}
		};
		if (d.readyState === 'complete') start();
		else w.addEventListener('load', start, { once: true });
	});
	const connection = (
		w.navigator as Navigator & {
			connection?: { effectiveType?: string; saveData?: boolean };
		}
	).connection;
	// Set once the page's own downloads are measured; until then the browser's report stands in.
	let fast: boolean | undefined;
	// Idle downloads need evidence of a fast link: the rate the page's own downloads crossed it at, a lower bound on its speed.
	host.__marklessFragmentIdle = landed.then(() => {
		const intent = intentOf();
		if (!intent) return false;
		let bytes = 0;
		const spans: [number, number][] = [];
		for (const entry of [
			...w.performance.getEntriesByType('navigation'),
			...w.performance.getEntriesByType('resource'),
		] as PerformanceResourceTiming[]) {
			if (!(entry.transferSize > 0)) continue;
			bytes += entry.transferSize;
			spans.push([entry.responseStart, entry.responseEnd]);
		}
		let busy = 0;
		let reach = -Infinity;
		for (const [from, to] of spans.sort((a, b) => a[0] - b[0])) {
			busy += Math.max(0, to - Math.max(from, reach));
			reach = Math.max(reach, to);
		}
		if (bytes && (busy === 0 || (bytes / busy) * 1000 >= intent.idleBytesPerSecond))
			return (fast = true);
		if (bytes >= intent.idleMeasuredBytes) return (fast = false);
		// Too few bytes crossed the link to tell round trips from bandwidth: only a browser reporting a fast connection says so.
		return (fast = connection?.effectiveType === '4g' && connection.saveData !== true);
	});
	const scrolled = new Set<Element>();
	const arriving = new Map<string, Promise<unknown>>();
	// BRIDGE_PHASE, restated because this body is serialized: bit 1 = a press fetch held, bit 2 = the run half loading.
	const IDLE = 0,
		PRESSED = 1,
		STARTING = 2,
		RUNNING = 4;
	let phase = IDLE;
	const move = (next: number) => {
		checkMove?.(phase, next);
		phase = next;
	};
	// Set from STARTING on, cleared when the load fails.
	let starting: Promise<FragmentNavigationApi> | undefined;
	// Held while phase has the PRESSED bit.
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
	// A mouse press starts the click itself, so Save-Data does not hold it back: only guesses wait.
	const press = (anchor: HTMLAnchorElement, clicking = false) => {
		const intent = intentOf();
		if (!intent || phase & PRESSED || anchor.getAttribute(intent.prefetchAttribute) === 'none')
			return;
		// Save-Data and a hidden tab fetch nothing early; 'fast' intent waits for a fast link.
		if (
			!intent.intent ||
			(!clicking &&
				(connection?.saveData ||
					d.visibilityState === 'hidden' ||
					(intent.intent < 2 &&
						!(fast !== false && (!connection || connection.effectiveType === '4g')))))
		)
			return;
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
		move(phase | PRESSED);
	};
	const wake = (event?: Event) => {
		if (!starting) {
			move(phase | STARTING);
			starting = loadRun().then((run) => {
				const api = run(d, routes, importModule, scrolled, arriving, pressed);
				pressed = undefined;
				move(RUNNING);
				return api;
			});
		}
		starting.then(
			(api) => api.replay(event),
			() => {
				if (!(phase & STARTING)) return;
				pressed?.controller.abort();
				starting = pressed = undefined;
				move(IDLE);
			},
		);
		return starting;
	};
	// The one document load a failed run half falls back to; pagehide cancels it, as leaving aborts the import just before.
	let leaving = 0;
	w.addEventListener('pagehide', () => w.clearTimeout(leaving));
	const fall = (load: () => void) => {
		w.clearTimeout(leaving);
		leaving = w.setTimeout(load, leaveDeadlineMs);
	};
	const shown = new URL(w.location.href);
	let rest = 0;
	let at = '';
	const listen = (event: Event) => {
		const target = (event.composedPath()[0] ?? event.target) as Element;
		if (event.type === 'pointermove') {
			const pointer = event as PointerEvent;
			w.clearTimeout(rest);
			if (at === (at = `${pointer.clientX},${pointer.clientY}`)) return;
			const anchor = phase < RUNNING && pointer.pointerType === 'mouse' && anchorOf(event);
			const dwell = anchor && intentOf()?.hoverDwellMs;
			if (dwell) rest = w.setTimeout(() => phase < RUNNING && press(anchor), dwell);
		} else if (event.type === 'scroll') {
			if (target !== (d as Node)) scrolled.add(target);
		} else if (event.type === 'popstate') {
			w.clearTimeout(leaving);
			wake().then(
				(api) => api.traverse(event as PopStateEvent),
				() => here(shown) || fall(() => w.location.reload()),
			);
		} else if (phase < RUNNING) {
			const anchor = anchorOf(event);
			if (!anchor) return;
			// A router link is taken ahead of page handlers; a plain anchor after them, once its click reaches the document.
			if (event.type !== 'click') {
				if (event.type !== 'pointerover')
					press(
						anchor,
						event.type === 'pointerdown' &&
							(event as PointerEvent).pointerType !== 'touch',
					);
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
		if (phase === RUNNING || mouse.defaultPrevented || mouse.button !== 0) return;
		if (mouse.metaKey || mouse.altKey || mouse.ctrlKey || mouse.shiftKey) return;
		const anchor = anchorOf(event)!;
		const url = followed(anchor);
		if (!url || url.hash.startsWith('#/') || (url.href.includes('#') && here(url))) return;
		event.preventDefault();
		// A click on the page shown keeps it; once a navigation was woken, the run half also cancels that one.
		if (here(url) && !(phase & STARTING)) return;
		const at = w.performance.now();
		w.clearTimeout(leaving);
		wake().then(
			(api) => api.go(anchor, at) || w.location.assign(url.href),
			() => fall(() => w.location.assign(url.href)),
		);
	};
	// The idle tier only fetches destinations the server listed, so a page listing none never schedules it.
	if (d.querySelector(`script[${tableAttribute}]`))
		void landed.then(() =>
			w.requestIdleCallback
				? w.requestIdleCallback(() => wake(), { timeout: 3000 })
				: w.setTimeout(() => wake(), 500),
		);
}

export type FragmentIntent = {
	// The swap module and the files it statically imports.
	readonly code: readonly string[];
	// Which networks hover, focus and press fetch on: 0 none, 1 fast, 2 all.
	readonly intent: number;
	readonly hoverDwellMs: number;
	readonly requestPrefix: string;
	readonly prefetchAttribute: string;
	// The slowest link, measured from the page's own downloads, the idle tier fetches on.
	readonly idleBytesPerSecond: number;
	// The page's own downloads must carry this many bytes for a rate under that to count as a slow link.
	readonly idleMeasuredBytes: number;
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
	readonly go: (anchor: Element, askedAt?: number) => boolean;
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
	// Loads the viewport tier's code; the build passes it only to apps that may fetch links in view.
	loadViewport?: () => Promise<typeof watchViewport>,
): FragmentNavigationApi {
	const w = d.defaultView as Window & typeof globalThis;
	const host = d as Document & {
		__marklessFragmentNav?: FragmentNavigationState;
		__marklessFragmentIdle?: Promise<boolean>;
	};
	const location = w.location;
	const connection = (
		w.navigator as Navigator & {
			connection?: { effectiveType?: string; saveData?: boolean };
		}
	).connection;
	const [intentLevel, viewportLevel, idleLevel] = config.prefetchOn;
	let fast: boolean | undefined;
	// A level: 0 never, 1 on a fast link, 2 on any; Save-Data and a hidden tab fetch nothing early.
	// Fast: the browser reports no slower link, and the page's own downloads did not measure it slow.
	const onNetwork = (level: number) =>
		level > 1 ||
		(level === 1 &&
			fast !== false &&
			(connection ? connection.effectiveType === '4g' : config.idleWithoutConnectionInfo));
	const allows = (level: number) =>
		!connection?.saveData && d.visibilityState !== 'hidden' && onNetwork(level);
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
	const decoded = (part: string) => {
		try {
			return decodeURIComponent(part);
		} catch {
			return part;
		}
	};
	// Every link on a large site is checked after each swap: a page with no parameter is one lookup, not one comparison per page.
	const staticPages = new Map<string, boolean[]>();
	const patterns: (readonly [boolean, string[]])[] = [];
	for (const page of config.pages) {
		const segments = page.split('/').filter(Boolean);
		const under = underEndpoints(page);
		if (segments.some((segment) => segment === '**' || segment === ':'))
			patterns.push([under, segments]);
		else {
			const key = JSON.stringify(segments);
			staticPages.set(key, [...(staticPages.get(key) ?? []), under]);
		}
	}
	const known = new Map<string, boolean>();
	// Server endpoints are never fetched ahead of a click or as a fragment: a GET there may have side effects.
	// Only a page file under the endpoint prefix itself (pages/api/) answers a path there.
	const isPage = (pathname: string) => {
		const cached = known.get(pathname);
		if (cached !== undefined) return cached;
		const endpoint = underEndpoints(pathname);
		const parts = pathname.split('/').filter(Boolean).map(decoded);
		const answer =
			!!staticPages.get(JSON.stringify(parts))?.some((under) => !endpoint || under) ||
			patterns.some(([under, page]) => {
				if (endpoint && !under) return false;
				const rest = page.indexOf('**');
				if (rest === -1 ? page.length !== parts.length : parts.length <= rest) return false;
				return page.every(
					(segment, index) =>
						segment === '**' || segment === ':' || segment === parts[index],
				);
			});
		known.set(pathname, answer);
		return answer;
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
			const key = link.getAttribute(config.stylesheetKeyAttribute);
			if (
				[...d.querySelectorAll<HTMLLinkElement>('link[href]')].some(
					(own) => own.href === href,
				) ||
				(key !== null &&
					[...d.head.children].some(
						(own) => own.getAttribute(config.stylesheetKeyAttribute) === key,
					))
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
		const fetched = fragmentOf(url, text);
		void fetched.doc;
		return fetched;
	};
	// An unused prefetch reads the rest of its response itself, so it frees its connection as soon as the server is done.
	const drain = (
		reader: ReadableStreamDefaultReader<Uint8Array>,
		closed: () => void,
		read: (bytes: number) => void,
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
				read(chunk.value.byteLength);
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
	// A fetch ahead of a click: GUESS (idle or viewport, under the byte budget) or WANTED (intent or a click),
	// then ARRIVED once its response ends or GONE once dropped. One phase per entry, moved only by `move`.
	const GUESS = 0,
		WANTED = 1,
		ARRIVED = 2,
		GONE = 3;
	// A move the lifecycle does not allow throws in development; in production it is reported and the state recovers.
	const illegal = (message: string) => {
		const error = new Error(`Markless router: ${message}.`);
		if (config.strictMoves) throw error;
		w.setTimeout(() => {
			throw error;
		});
	};
	const move = (entry: FragmentPrefetch, next: number) => {
		if (entry.phase === next) return;
		if (entry.phase === GONE || (entry.phase === ARRIVED && next !== GONE) || next < entry.phase)
			return illegal(`no prefetch move from ${entry.phase} to ${next}`);
		entry.phase = next;
	};
	// A guess keeps its response as text; the document is parsed when a click or intent wants it.
	const fragmentOf = (
		url: string,
		text: string,
		rest?: ReadableStreamDefaultReader<Uint8Array>,
	): FragmentFetched => {
		const at = text.indexOf(config.regionEndMarker);
		const prefix = at === -1 ? text : text.slice(0, at);
		let doc: Document | undefined;
		return {
			url,
			prefix,
			tail: at === -1 ? '' : text.slice(at + config.regionEndMarker.length),
			rest,
			get doc() {
				if (!doc) {
					doc = parseAsLoaded(prefix);
					preloadStyles(doc);
				}
				return doc;
			},
		};
	};
	// One request: the destination's region document and its resume payload, read as it arrives (no script runs), so the click only swaps.
	const request = (
		url: URL,
		speculative: boolean | 'idle',
		started?: FragmentEarly,
	): FragmentPrefetch => {
		const key = pageKey(url);
		fetched.add(key);
		const controller = started?.controller ?? new AbortController();
		// A guess's bytes count against the budget of the page it was guessed from, however it ends:
		// its declared length, else what Resource Timing saw, else the bytes it read before it stopped.
		const page = speculative === 'idle' ? speculation.page : -1;
		let counted = false;
		let target: URL | undefined;
		let bytes = 0;
		const spend = (wire: number) => {
			if (counted) return;
			counted = true;
			if (speculation.page !== page) return;
			const before = speculation.spent;
			speculation.spent += wire;
			// Tools tell "the budget was spent" apart from "never guessed" by this mark, once per page shown.
			if (before < config.guessBudget && speculation.spent >= config.guessBudget)
				w.performance.mark(config.prefetchMarks[0], {
					detail: { page: location.pathname, bytes: speculation.spent },
				});
		};
		// finished: Resource Timing will record the transfer, a few tasks after the body ends; wait for it briefly.
		const received = (finished = false, tries = 0): void => {
			if (page < 0 || counted) return;
			const timing = target && w.performance.getEntriesByName(target.href).at(-1);
			const wire = (timing as PerformanceResourceTiming | undefined)?.transferSize;
			if (!wire && finished && tries < 5)
				return void w.setTimeout(() => {
					received(true, tries + 1);
					pumpIdle();
				}, 20);
			spend(wire || bytes);
		};
		const read = async (): Promise<FragmentFetched> => {
			const prefix = config.requestPrefix;
			target = new URL(url.href);
			target.hash = '';
			target.pathname = prefix + target.pathname;
			const response = await (started?.response ??
				w.fetch(target.href, {
					credentials: 'same-origin',
					headers: speculative ? { purpose: 'prefetch' } : {},
					// The idle tier never competes with what the page itself still loads.
					priority: speculative === 'idle' ? 'low' : speculative ? 'auto' : 'high',
					signal: controller.signal,
				} as RequestInit));
			// no-store forbids reuse; a positive max-age bounds it. max-age=0, no-cache and must-revalidate only ask
			// an HTTP cache to revalidate, and hosts such as Vercel send them on every dynamic page.
			const cacheControl = response.headers.get('cache-control') ?? '';
			const maxAge = Number(/(?:^|,)\s*max-age\s*=\s*"?(\d+)/i.exec(cacheControl)?.[1]);
			if (/(?:^|,)\s*no-store\b/i.test(cacheControl)) entry.expires = w.performance.now();
			else if (maxAge > 0) entry.expires = entry.at + maxAge * 1000;
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
			// A guess stops past the budget in wire bytes: a declared length is that, an uncompressed body counts as it reads.
			const declared = Number(response.headers.get('content-length') ?? 0);
			// Too big by its own declaration: stopped before its body comes, so it counts only what it received.
			if (entry.phase === GUESS && declared > config.idleFragmentBytes) {
				controller.abort();
				throw new Error('MARKLESS_ROUTER_FRAGMENT_OVER_IDLE_BUDGET');
			}
			if (declared) spend(declared);
			const limit = declared
				? Infinity
				: response.headers.get('content-encoding')
					? config.idleFragmentDecodedBytes
					: config.idleFragmentBytes;
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let text = '';
			for (;;) {
				if (text.includes(config.regionEndMarker)) {
					const arrived = fragmentOf(
						finalUrl.href,
						text,
						speculative ? drain(reader, closed, (more) => (bytes += more)) : reader,
					);
					if (entry.phase === WANTED) void arrived.doc;
					return hold(entry, arrived, text.length);
				}
				const chunk = await reader.read();
				if (chunk.done) {
					closed();
					const arrived = fragmentOf(finalUrl.href, text + decoder.decode());
					if (!speculative) void arrived.doc;
					return hold(entry, arrived, text.length);
				}
				bytes += chunk.value.byteLength;
				if (entry.phase === GUESS && bytes > limit) {
					void reader.cancel();
					throw new Error('MARKLESS_ROUTER_FRAGMENT_OVER_IDLE_BUDGET');
				}
				text += decoder.decode(chunk.value, { stream: true });
			}
		};
		const closed = () => {
			if (entry.phase < ARRIVED) move(entry, ARRIVED);
			received(true);
			queueMicrotask(pumpIdle);
		};
		const entry: FragmentPrefetch = {
			at: started?.at ?? w.performance.now(),
			writes: state.writes,
			phase: speculative === 'idle' ? GUESS : WANTED,
			result: undefined as unknown as Promise<FragmentFetched>,
			want: () => {
				if (entry.phase !== GUESS) return;
				move(entry, WANTED);
				entry.result.then(
					(arrived) => arrived.doc,
					() => {},
				);
			},
			// again: a click dropped it before it arrived, so the next page may guess it again; a guess
			// dropped to make room for intent stays fetched for this page, or it would be downloaded in a loop.
			abort: (again = false) => {
				if (again && entry.phase < ARRIVED) fetched.delete(key);
				received();
				move(entry, GONE);
				controller.abort();
				queueMicrotask(pumpIdle);
			},
		};
		(entry as { result: Promise<FragmentFetched> }).result = read();
		entry.result.catch(() => {
			received();
			if (entry.phase !== GONE) move(entry, GONE);
			queueMicrotask(pumpIdle);
		});
		return entry;
	};
	const inFlight = (entry: FragmentPrefetch) => entry.phase < ARRIVED;
	// Pages fetched ahead are kept as text up to config.heldChars in all; past it the earliest started go first.
	const sizes = new WeakMap<FragmentPrefetch, number>();
	// Pages fetched ahead go first, then the pages the tab showed (at most 8), never the one just added.
	const trim = (spare?: FragmentPrefetch | string) => {
		let held = 0;
		for (const other of state.prefetches.values()) held += sizes.get(other) ?? 0;
		for (const text of state.visited.values()) held += text.length;
		for (const [key, other] of state.prefetches) {
			if (held <= config.heldChars) break;
			if (other === spare || !sizes.has(other)) continue;
			held -= sizes.get(other)!;
			state.prefetches.delete(key);
			other.abort();
		}
		for (const [key, text] of state.visited) {
			if ((held <= config.heldChars && state.visited.size <= 8) || key === spare) break;
			held -= text.length;
			state.visited.delete(key);
		}
	};
	const hold = (entry: FragmentPrefetch, arrived: FragmentFetched, size: number) => {
		sizes.set(entry, size);
		trim(entry);
		return arrived;
	};
	const keep = (key: string, text: string) => {
		state.visited.delete(key);
		state.visited.set(key, text);
		trim(key);
	};
	const prefetch = (url: URL, code = true, started?: FragmentEarly, idle = false) => {
		const key = pageKey(url);
		// A hover timer can fire after its link's page is already shown.
		if (!config.prefetch || key === state.shown) return;
		const existing = state.prefetches.get(key);
		const visit = state.visited.get(key);
		// An idle-fetched page still needs its code on intent, or the swap fetches it a round late.
		// A page the tab showed, prerendered, is swapped in from the copy it keeps: nothing to fetch.
		if (visit && prerendered(visit)) return void (code && preloadCode(url, false));
		if (existing && fresh(existing, w.performance.now())) {
			if (code) {
				existing.want();
				preloadCode(url, false);
			}
			return;
		}
		existing?.abort();
		// Intent is the visitor's own choice: guesses still arriving make room for it, and a click drops them all.
		if (!idle) {
			const guesses = [...state.prefetches].filter(([, entry]) => entry.phase === GUESS);
			let wanted = 0;
			for (const entry of state.prefetches.values()) if (entry.phase === WANTED) wanted += 1;
			for (const [other, entry] of guesses.slice(
				0,
				Math.max(0, guesses.length + wanted + 1 - config.prefetchConnections),
			)) {
				state.prefetches.delete(other);
				entry.abort();
			}
		}
		const entry = request(url, idle ? 'idle' : true, started);
		// A page over the idle budget is left for a hover or a press to fetch whole.
		entry.result.catch(() => {
			if (state.prefetches.get(key) === entry) state.prefetches.delete(key);
		});
		state.prefetches.set(key, entry);
		expire(key, entry);
		if (code) preloadCode(url, false);
	};
	// The timer holds a stamp, not the entry, so a page taken or dropped early frees its text at once.
	const stamps = new WeakMap<FragmentPrefetch, number>();
	let stamped = 0;
	const expire = (key: string, entry: FragmentPrefetch) => {
		const stamp = ++stamped;
		stamps.set(entry, stamp);
		w.setTimeout(() => {
			const current = state.prefetches.get(key);
			if (!current || stamps.get(current) !== stamp) return;
			state.prefetches.delete(key);
			current.abort();
		}, config.prefetchTtlMs);
	};
	// What the page shown may still fetch ahead, one state moved only by `speculate`: PAUSED while a navigation
	// is on its way, then for each page shown SHOWN, ARMED at its first idle moment, and WATCHING once the idle scan ran.
	const PAUSED = 0,
		SHOWN = 1,
		ARMED = 2,
		WATCHING = 3;
	// spent: wire bytes the page shown has guessed so far, against config.guessBudget.
	let speculation = { phase: PAUSED, page: 0, spent: 0 };
	const speculate = (phase: number, page = speculation.page) => {
		if (page === speculation.page && phase !== PAUSED && phase !== speculation.phase + 1) {
			illegal(`no speculation move from ${speculation.phase} to ${phase}`);
			phase = PAUSED;
		}
		speculation = { phase, page, spent: page === speculation.page ? speculation.spent : 0 };
	};
	let idleQueue: URL[] = [];
	const unfetched = (url: URL) =>
		!state.prefetches.has(pageKey(url)) && !fetched.has(pageKey(url));
	// Idle and viewport guesses share the app's concurrency and wait for a free slot rather than cancel one another.
	const pumpIdle = () => {
		if (speculation.phase < ARMED) return;
		for (;;) {
			if (speculation.spent >= config.guessBudget) return;
			let open = 0;
			for (const entry of state.prefetches.values()) if (inFlight(entry)) open += 1;
			if (open >= config.prefetchConnections) return;
			let url: URL | undefined;
			while (!url && idleQueue.length && allows(idleLevel)) {
				const next = idleQueue.shift()!;
				if (unfetched(next)) url = next;
			}
			url ??= viewport?.next();
			if (!url) return;
			prefetch(url, false, undefined, true);
			// Low priority and never evaluated: a modulepreload only fills the cache before a press.
			preloadCode(url, true);
		}
	};
	// Its own file, loaded once the app's config or a link on the page asks for links in view.
	let viewport: FragmentViewport | undefined;
	let viewportLoad: Promise<FragmentViewport> | undefined;
	const startViewport = () =>
		(viewportLoad ??= loadViewport!().then(
			(watch) =>
				(viewport = watch(
					d,
					config.prefetchAttribute,
					viewportLevel,
					(anchor) => {
						const url = eligible(anchor);
						return url && state.routes[url.pathname] ? url : undefined;
					},
					(url, level) => unfetched(url) && allows(level),
					() => previous,
					pumpIdle,
				)),
		));
	d.addEventListener('visibilitychange', () => d.visibilityState === 'visible' && pumpIdle());
	// Links the page adds later (an opened menu, a longer list) join the viewport tier once the page is idle again.
	const more = () =>
		viewport &&
		speculation.phase >= ARMED &&
		(w.requestIdleCallback ?? w.setTimeout)(
			() => speculation.phase >= ARMED && viewport?.watch(true),
		);
	for (const type of ['click', 'keyup']) d.addEventListener(type, more, { passive: true });
	// A click or Back/Forward pauses guessing and cancels every fetch still arriving but its own page's, so none competes with it.
	const settle = (key: string) => {
		speculate(PAUSED);
		idleQueue = [];
		viewport?.stop();
		for (const [other, entry] of state.prefetches)
			if (other !== key && inFlight(entry)) {
				state.prefetches.delete(other);
				entry.abort(true);
			}
	};
	// A page is shown: after a swap, or when a navigation was cancelled and the page it left stays.
	const rescan = () => {
		speculate(SHOWN, speculation.page + 1);
		const page = speculation.page;
		const current = () => speculation.page === page;
		void (host.__marklessFragmentIdle ?? Promise.resolve(false)).then((measured) => {
			fast = measured;
			// A click since this page was shown has paused guessing; its own swap or cancel arms it again.
			if (!current() || speculation.phase !== SHOWN) return;
			// Guessing waits for the main thread's first idle moment after the page is shown: nothing runs in its load.
			const arm = () => {
				if (!current() || speculation.phase !== SHOWN) return;
				speculate(ARMED);
				// Guessing that this page would do but the visitor's settings or link rule out is marked, once, with why.
				const would = (viewportLevel ? ['viewport'] : []).concat(idleLevel ? ['idle'] : []);
				const reason = connection?.saveData
					? 'save-data'
					: d.visibilityState === 'hidden'
						? 'hidden'
						: would.some((trigger) => !onNetwork(trigger === 'idle' ? idleLevel : viewportLevel))
							? 'network'
							: '';
				if (would.length && reason)
					w.performance.mark(config.prefetchMarks[1], {
						detail: { page: location.pathname, reason, triggers: would },
					});
				// A budget of 0 is spent before anything starts: the same mark tells a tool so.
				else if (would.length && !config.guessBudget)
					w.performance.mark(config.prefetchMarks[0], {
						detail: { page: location.pathname, bytes: 0 },
					});
				if (
					loadViewport &&
					(viewportLevel || d.querySelector(`a[href][${config.prefetchAttribute}="viewport"]`))
				)
					startViewport().then(
						(started) => current() && speculation.phase >= ARMED && started.watch(),
						() => {},
					);
				if (!idleLevel || !onNetwork(idleLevel)) return;
				speculate(WATCHING);
				const visible = new Map<string, URL>();
				for (const anchor of d.querySelectorAll('a[href]')) {
					const url = eligible(anchor);
					// Only destinations the server listed as pages: a dead link is never fetched speculatively.
					if (!url || !state.routes[url.pathname]) continue;
					if (anchor.getAttribute(config.prefetchAttribute) === 'intent') continue;
					const box = anchor.getBoundingClientRect();
					if (!box.width || box.bottom < 0 || box.top > w.innerHeight) continue;
					if (box.right < 0 || box.left > w.innerWidth) continue;
					const hit = d.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
					if (!hit || (hit !== anchor && !anchor.contains(hit))) continue;
					visible.set(pageKey(url), url);
				}
				idleQueue = [];
				for (const url of visible.values())
					if (idleQueue.length < config.idleFragments && unfetched(url)) idleQueue.push(url);
				pumpIdle();
			};
			if (w.requestIdleCallback) w.requestIdleCallback(arm, { timeout: 3000 });
			else w.setTimeout(arm, 500);
		});
	};
	// A navigation that ends without a swap leaves the page it started from shown, so guessing resumes for it.
	const resume = () => speculation.phase === PAUSED && rescan();
	// A navigation that threw swapped nothing: the page it started from is still shown.
	const failed = (error: unknown) => {
		resume();
		w.setTimeout(() => {
			throw error;
		});
	};
	// A page left for a document load and brought back from the back/forward cache shows again.
	w.addEventListener('pageshow', (event) => (event as PageTransitionEvent).persisted && resume());
	// A page's text the prerenderer wrote: one file every visitor gets until the next deploy.
	const prerendered = (text: string) => {
		const end = text.indexOf(config.regionEndMarker);
		return text.slice(0, end === -1 ? text.length : end).endsWith(config.prerenderedMarker);
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
		prerendered,
		keep,
		shown: pageKey(new URL(location.href)),
		eligible,
		preloadCode,
		request,
		prefetch,
		parse,
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
	const intend = (url: URL, clicking = false) =>
		(clicking ? intentLevel > 0 : allows(intentLevel)) && prefetch(url);
	let restTimer = 0;
	let resting = '';
	let previous: { x: number; y: number; t: number } | undefined;
	const stopRest = () => {
		w.clearTimeout(restTimer);
		resting = '';
	};
	const hover = (event: Event) => {
		const pointer = event as PointerEvent;
		if (pointer.pointerType !== 'mouse') return;
		const point = { x: pointer.clientX, y: pointer.clientY, t: pointer.timeStamp };
		// A move that went nowhere is the page shifting under a still pointer, unless the same link is still under it.
		if (previous && point.x === previous.x && point.y === previous.y) {
			if (eligible(anchorOf(event))?.href !== resting) stopRest();
			return;
		}
		const gap = previous ? point.t - previous.t : 0;
		const creeping =
			!!previous &&
			gap > 0 &&
			Math.hypot(point.x - previous.x, point.y - previous.y) / gap < 0.1;
		previous = point;
		stopRest();
		const url = eligible(anchorOf(event));
		if (!url) return;
		// Moves arrive about once a frame, so resting means no move for longer than the last gap.
		if (creeping) return intend(url);
		resting = url.href;
		restTimer = w.setTimeout(
			() => {
				resting = '';
				intend(url);
			},
			Math.max(config.hoverDwellMs, gap * 1.5),
		);
	};
	d.addEventListener('pointermove', hover, { passive: true });
	d.addEventListener('pointerout', stopRest, { passive: true });
	const press = (event: Event) => {
		stopRest();
		const anchor = anchorOf(event);
		const url = eligible(anchor);
		if (url)
			intend(
				url,
				event.type === 'pointerdown' && (event as PointerEvent).pointerType !== 'touch',
			);
		if (url || eligible(anchor, true)) void load();
	};
	for (const type of ['pointerdown', 'touchstart', 'focusin'])
		d.addEventListener(type, press, { passive: true });

	// Links are taken in the capture phase, ahead of page handlers; a plain anchor after them, as the browser would follow it.
	const go = (anchor: Element, askedAt = w.performance.now()): boolean => {
		const url = eligible(anchor, true);
		if (!url) return false;
		stopRest();
		// A link to the page already shown keeps it, scroll and state included, as client routers do.
		if (pageKey(url) === pageKey(new URL(location.href))) {
			state.stops = (state.stops ?? 0) + 1;
			resume();
			d.dispatchEvent(new CustomEvent(config.renderedEvent));
			return true;
		}
		settle(pageKey(url));
		const replace = anchor.hasAttribute(config.replaceAttribute);
		const manual = anchor.getAttribute(config.scrollAttribute) === 'manual';
		const stops = state.stops;
		const swap = (entry: FragmentEntryModule) =>
			entry
				.navigate(
					d,
					url,
					replace ? 'replace' : 'push',
					manual ? 'manual' : 'reset',
					stops,
					askedAt,
				)
				.catch(failed);
		if (loaded) void swap(loaded);
		else
			load().then(swap, () => {
				// Leaving the document aborts the import a few ms before pagehide; loading the page then would cancel that navigation.
				let left = false;
				const leave = () => (left = true);
				w.addEventListener('pagehide', leave);
				w.setTimeout(() => {
					w.removeEventListener('pagehide', leave);
					if (!left && stops === state.stops) location.assign(url.href);
				}, config.pendingDeadlineMs);
			});
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
		state.stops = (state.stops ?? 0) + 1;
		const url = new URL(location.href);
		if (url.hash.startsWith('#/') || pageKey(url) === state.shown) return void resume();
		settle(pageKey(url));
		const saved = (
			event.state as { __marklessFragment?: { x: number; y: number; id?: string } } | null
		)?.__marklessFragment;
		load().then(
			(entry) => entry.navigate(d, url, 'traverse', saved ?? { x: 0, y: 0 }).catch(failed),
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

export type FragmentViewport = {
	// Observes the page's page links; with `more`, only links added since, keeping those already seen.
	readonly watch: (more?: boolean) => void;
	readonly stop: () => void;
	// The wanted link in view nearest the pointer, else the viewport's centre.
	readonly next: () => URL | undefined;
};

// Serialized into the run half's bridge file only for apps that fetch links in view (must not reference anything outside its own body).
export function watchViewport(
	d: Document,
	prefetchAttribute: string,
	level: number,
	candidate: (anchor: Element) => URL | undefined,
	wanted: (url: URL, level: number) => boolean,
	pointer: () => { readonly x: number; readonly y: number } | undefined,
	pump: () => void,
): FragmentViewport {
	const w = d.defaultView as Window & typeof globalThis;
	// Each link in view with its page, level and where it was when it came into view: picking never re-measures.
	const inView = new Map<Element, readonly [URL, number, number, number]>();
	const levels = new WeakMap<Element, readonly [URL, number]>();
	let observer: IntersectionObserver | undefined;
	const stop = () => {
		observer?.disconnect();
		observer = undefined;
		inView.clear();
	};
	const watch = (more = false) => {
		if (!more) stop();
		if (!w.IntersectionObserver) return;
		const own = (observer ??= new w.IntersectionObserver((entries) => {
			if (observer !== own) return;
			for (const entry of entries) {
				const known = entry.isIntersecting && levels.get(entry.target);
				const box = entry.boundingClientRect;
				if (known)
					inView.set(entry.target, [
						known[0],
						known[1],
						box.left + box.width / 2,
						box.top + box.height / 2,
					]);
				else inView.delete(entry.target);
			}
			pump();
		}));
		for (const anchor of d.querySelectorAll(
			level ? 'a[href]' : `a[href][${prefetchAttribute}="viewport"]`,
		)) {
			if (more && levels.has(anchor)) continue;
			const asked = anchor.getAttribute(prefetchAttribute);
			const linkLevel = asked === 'viewport' ? Math.max(level, 1) : asked === 'intent' ? 0 : level;
			const url = linkLevel ? candidate(anchor) : undefined;
			if (!url) continue;
			levels.set(anchor, [url, linkLevel]);
			own.observe(anchor);
		}
	};
	const next = () => {
		const at = pointer();
		const x = at?.x ?? w.innerWidth / 2;
		const y = at?.y ?? w.innerHeight / 2;
		let nearest: Element | undefined;
		let distance = Infinity;
		for (const [anchor, [url, linkLevel, left, top]] of inView) {
			if (!wanted(url, linkLevel)) continue;
			const away = Math.hypot(left - x, top - y);
			if (away < distance) [nearest, distance] = [anchor, away];
		}
		if (!nearest) return;
		const [url] = inView.get(nearest)!;
		inView.delete(nearest);
		return url;
	};
	return { watch, stop, next };
}

// A fragment fetch asks for the page path under this prefix, so a cache keyed on the URL, or a host rewrite that drops the query, keeps it apart from the page.
export const FRAGMENT_PATH_PREFIX = '/_markless/fragment';
// Names the stylesheet a page's inline <style> or reference <link> carries, so a navigation keeps one it already has.
export const STYLESHEET_KEY_ATTRIBUTE = 'data-markless-css';
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
// Just before the region end of a fragment the prerenderer wrote: one file every visitor gets until the next deploy.
export const FRAGMENT_PRERENDERED = '<!--markless:prerendered-->';
// Nitro's prerenderer names the route it renders in this request header.
export const NITRO_PRERENDER_HEADER = 'x-nitro-prerender';
export const FRAGMENT_APPEND_END = '<!--markless:append-end-->';
export const FRAGMENT_HOVER_DWELL_MS = 20;
export const FRAGMENT_PREFETCH_TTL_MS = 30_000;
// Unused prefetches still streaming their @pending pieces; older ones are cancelled past this.
export const FRAGMENT_PREFETCH_CONNECTIONS = 2;
// Wire bytes viewport and idle fetches may spend per page shown: about what the Next.js original of the shadcn docs prefetched (1.5 MB).
export const FRAGMENT_GUESS_BUDGET_BYTES = 2 * 1024 * 1024;
/** Performance marks a tool can read: the page's guess budget ran out; guessing was ruled out (detail.reason). */
export const PREFETCH_MARKS = ['markless:prefetch-budget-spent', 'markless:prefetch-skipped'] as const;
export const FRAGMENT_IDLE_FRAGMENTS = 6;
// Characters of page text kept for pages fetched ahead: 8 MB as one-byte strings, 16 MB if a page has text outside Latin-1.
// Parsed documents (pages intent wanted, the page shown) are not counted.
export const FRAGMENT_HELD_CHARS = 8 * 1024 * 1024;
// An idle or viewport fetch of a page past this many bytes on the wire stops there; the page is fetched on intent instead.
export const FRAGMENT_IDLE_FRAGMENT_BYTES = 256 * 1024;
// A compressed fragment with no declared length counts its decoded bytes: docs-site fragments measured 10x to 25x smaller on the wire.
export const FRAGMENT_IDLE_FRAGMENT_DECODED_BYTES = 4 * 1024 * 1024;
// Just above Lighthouse's Slow 4G (1.6 Mbit/s).
export const FRAGMENT_IDLE_BYTES_PER_SECOND = 250_000;
export const FRAGMENT_IDLE_MEASURED_BYTES = 64 * 1024;
// Browsers without the Network Information API (WebKit, Firefox) say nothing about the connection; the idle tier's own gate bounds what they fetch.
export const FRAGMENT_IDLE_WITHOUT_CONNECTION_INFO = true;
