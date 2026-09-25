// The swap half of fragment navigation; the inline link bridge (vite/fragment-navigation.ts) fetches, this module commits.
import type { ModulePreloadInput } from '@markless/web/render-to-string';

export interface FragmentNavigationConfig {
	readonly entry: string;
	readonly linkAttribute: string;
	readonly prefetchAttribute: string;
	readonly replaceAttribute: string;
	readonly scrollAttribute: string;
	readonly routeScriptType: string;
	readonly retireProperty: string;
	readonly streamExecutorGlobal: string;
	readonly streamedArmSelector: string;
	readonly requestHeader: string;
	readonly regionEndMarker: string;
	readonly appendMarker: string;
	// 'document' apps swap the whole body: their shell renders from the request URL.
	readonly documentLoads: boolean;
	// A mouse fetches after resting this long on a link; press, focus and touch fetch at once.
	readonly hoverDwellMs: number;
	readonly prefetchTtlMs: number;
	// At most this many unused prefetches may still be streaming; starting another cancels the oldest.
	readonly prefetchConnections: number;
	// Paths the server answers with endpoints, not pages: never fetched before a click or as a fragment.
	readonly endpointPrefixes: readonly string[];
	// At most this many visible-link fragments are fetched at idle on fast connections, and only when the page shows no more than twice as many; 0 keeps HTML to intent only.
	readonly idleFragments: number;
	readonly idleWithoutConnectionInfo: boolean;
	// false: nothing is fetched before a click.
	readonly prefetch: boolean;
	// Every page route's path, dynamic segments as ':' and a catch-all as '**': plain anchors to these navigate by fragment too.
	readonly pages: readonly string[];
}

export type FragmentRouteCode = Record<string, readonly ModulePreloadInput[]>;

export type FragmentFetched = {
	readonly url: string;
	readonly prefix: string;
	readonly doc: Document;
	readonly rest?: ReadableStreamDefaultReader<Uint8Array>;
	readonly tail: string;
};

export type FragmentPrefetch = {
	readonly at: number;
	readonly result: Promise<FragmentFetched>;
	// The response is still arriving, so it holds a connection.
	open: boolean;
	readonly abort: () => void;
};

// What the inline bootstrap leaves on the document for the swap module (entries/fragment-entry.ts).
export type FragmentNavigationState = {
	readonly config: FragmentNavigationConfig;
	readonly routes: Record<string, readonly ModulePreloadInput[]>;
	readonly prefetches: Map<string, FragmentPrefetch>;
	readonly visited: Map<string, string>;
	shown: string;
	readonly eligible: (anchor: Element | null | undefined, forClick?: boolean) => URL | undefined;
	readonly preloadCode: (url: URL, low: boolean) => void;
	// speculative: a prefetch (low priority, `Purpose: prefetch`), not a click.
	readonly request: (url: URL, speculative: boolean) => FragmentPrefetch;
	readonly prefetch: (url: URL) => void;
	readonly parse: (url: string, text: string) => FragmentFetched;
	readonly idleDownloads: boolean;
	// Schedules the idle tier: at idle, download the landing code and a few fragments of the page links in view.
	readonly rescan: () => void;
	readonly scrolled: Set<Element>;
};

export type FragmentScroll =
	| 'reset'
	| 'manual'
	| { readonly x: number; readonly y: number; readonly id?: string };

export type FragmentEntryModule = {
	readonly navigate: (
		d: Document,
		url: URL,
		mode: 'push' | 'replace' | 'traverse',
		scroll: FragmentScroll,
	) => Promise<void>;
};

type FragmentHost = Document & { __marklessFragmentNav?: FragmentNavigationState };
type Session = {
	navigation: number;
	streaming?: AbortController;
	// The history entry on screen, and the last scroll offset seen for every entry this tab visited.
	current?: string;
	readonly positions: Map<string, { readonly x: number; readonly y: number }>;
};

const sessions = new WeakMap<Document, Session>();
const parsedVisits = new WeakMap<FragmentNavigationState, Map<string, FragmentFetched>>();

function sessionFor(d: Document): Session {
	let session = sessions.get(d);
	if (session) return session;
	const created: Session = { navigation: 0, positions: new Map() };
	sessions.set(d, created);
	const w = d.defaultView!;
	w.addEventListener(
		'scroll',
		() => {
			if (created.current)
				created.positions.set(created.current, { x: w.scrollX, y: w.scrollY });
		},
		{ passive: true },
	);
	w.addEventListener('pagehide', () => {
		if (created.current) saveScroll(w, created.current);
		w.history.scrollRestoration = 'auto';
	});
	w.addEventListener('pageshow', (event) => {
		if ((event as PageTransitionEvent).persisted && w.history.state?.__marklessFragment)
			w.history.scrollRestoration = 'manual';
	});
	return created;
}

function saveScroll(w: Window, id: string): void {
	w.history.replaceState(
		{ ...w.history.state, __marklessFragment: { id, x: w.scrollX, y: w.scrollY } },
		'',
	);
}

// The entry the document landed on carries no id until it is left; naming it saves a history write per navigation.
const LANDING_ENTRY = '@landing';

const entryId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

const pageKey = (url: URL) => url.pathname + url.search;

function take(
	state: FragmentNavigationState,
	url: URL,
	traverse: boolean,
	now: number,
): FragmentPrefetch {
	const key = pageKey(url);
	const existing = state.prefetches.get(key);
	state.prefetches.delete(key);
	if (existing && now - existing.at < state.config.prefetchTtlMs) return existing;
	existing?.abort();
	const cached = traverse ? state.visited.get(key) : undefined;
	if (cached !== undefined) {
		const ready = parsedVisits.get(state)?.get(key);
		parsedVisits.get(state)?.delete(key);
		return {
			at: now,
			result: Promise.resolve(ready ?? state.parse(url.href, cached)),
			open: false,
			abort: () => {},
		};
	}
	state.preloadCode(url, false);
	return state.request(url, false);
}

function regionOf(state: FragmentNavigationState, doc: Document): Element | null {
	return (
		(
			doc.querySelector(`script[type="${state.config.routeScriptType}"]`) ??
			doc.querySelector('script[data-markless-router-link-resumer]')
		)?.closest('[data-async-container]') ?? null
	);
}

function retire(state: FragmentNavigationState, root: Element): void {
	for (const container of [root, ...root.querySelectorAll('[data-async-container]')]) {
		const retireContainer = (container as unknown as Record<string, unknown>)[
			state.config.retireProperty
		];
		if (typeof retireContainer !== 'function') continue;
		try {
			retireContainer();
		} catch (error) {
			reportAsync(error);
		}
	}
}

function reportAsync(error: unknown): void {
	setTimeout(() => {
		throw error;
	});
}

function execute(d: Document, script: HTMLScriptElement): void {
	const type = script.type;
	if (type && type !== 'module' && type !== 'text/javascript') return;
	const clone = d.createElement('script');
	for (const attribute of script.attributes) clone.setAttribute(attribute.name, attribute.value);
	clone.textContent = script.textContent;
	script.replaceWith(clone);
}

function loaded(w: Window, links: readonly HTMLLinkElement[]): Promise<unknown> {
	if (links.length === 0) return Promise.resolve();
	return Promise.race([
		Promise.all(
			links.map(
				(link) =>
					new Promise((resolve) => {
						link.addEventListener('load', resolve, { once: true });
						link.addEventListener('error', resolve, { once: true });
					}),
			),
		),
		new Promise((resolve) => w.setTimeout(resolve, 3000)),
	]);
}

// Existing head nodes stay where they are (moving a stylesheet re-applies it); new ones go in the destination's order.
async function mergeHead(d: Document, next: Document) {
	const current = new Map<string, Element[]>();
	for (const element of d.head.children) {
		const list = current.get(element.outerHTML);
		if (list) list.push(element);
		else current.set(element.outerHTML, [element]);
	}
	const stylesheets: HTMLLinkElement[] = [];
	const scripts: HTMLScriptElement[] = [];
	let cursor: Element | null = null;
	for (const element of Array.from(next.head.children)) {
		const reused = current.get(element.outerHTML)?.shift();
		const node = reused ?? d.adoptNode(element);
		if (!reused) {
			if (cursor) cursor.after(node);
			else d.head.prepend(node);
			if (node.localName === 'link' && (node as HTMLLinkElement).rel === 'stylesheet')
				stylesheets.push(node as HTMLLinkElement);
			// A kept inline script already ran on this document; only one the destination adds runs.
			if (node.localName === 'script' && !(node as HTMLScriptElement).src)
				scripts.push(node as HTMLScriptElement);
		}
		cursor = node;
	}
	const stale: Element[] = [];
	for (const element of [...current.values()].flat()) {
		const rel = element.localName === 'link' ? (element as HTMLLinkElement).rel : '';
		if (rel === 'modulepreload' || rel === 'preload') continue;
		if (rel === 'stylesheet' || element.localName === 'style') stale.push(element);
		else element.remove();
	}
	await loaded(d.defaultView!, stylesheets);
	return { stale, scripts };
}

// Only attributes a server document set are the server's to remove: scripts own the rest (a theme class).
const serverHtmlAttributes = new WeakMap<Document, Set<string>>();

function syncHtmlAttributes(d: Document, next: Document): void {
	const root = d.documentElement;
	const incoming = next.documentElement;
	for (const name of serverHtmlAttributes.get(d) ?? [])
		if (!incoming.hasAttribute(name)) root.removeAttribute(name);
	for (const attribute of incoming.attributes)
		if (root.getAttribute(attribute.name) !== attribute.value)
			root.setAttribute(attribute.name, attribute.value);
	serverHtmlAttributes.set(d, new Set(incoming.getAttributeNames()));
}

const isContainer = (node: Node): boolean =>
	node.nodeType === 1 && (node as Element).hasAttribute('data-async-container');

// A document app's shell has no runtime, so it is morphed in place: unchanged chrome keeps its nodes.
// Containers are always replaced whole: their DOM is the new page's resume payload's to locate.
function morphChildren(d: Document, from: Element, to: Element, fresh: Element[]): void {
	let cursor = from.firstChild;
	const skipContainers = () => {
		while (cursor && isContainer(cursor)) {
			const next: ChildNode | null = cursor.nextSibling;
			cursor.remove();
			cursor = next;
		}
	};
	for (const incoming of Array.from(to.childNodes)) {
		skipContainers();
		if (
			cursor &&
			cursor.nodeType === incoming.nodeType &&
			cursor.nodeName === incoming.nodeName &&
			!isContainer(cursor) &&
			!isContainer(incoming)
		) {
			const next = cursor.nextSibling;
			morphNode(d, cursor, incoming, fresh);
			cursor = next;
			continue;
		}
		const node = d.adoptNode(incoming);
		from.insertBefore(node, cursor);
		if (node.nodeType === 1) fresh.push(node as Element);
	}
	while (cursor) {
		const next = cursor.nextSibling;
		cursor.remove();
		cursor = next;
	}
}

function morphNode(d: Document, from: ChildNode, to: ChildNode, fresh: Element[]): void {
	if (from.nodeType !== 1) {
		if ((from as CharacterData).data !== (to as CharacterData).data)
			(from as CharacterData).data = (to as CharacterData).data;
		return;
	}
	if (from.isEqualNode(to)) return;
	const element = from as Element;
	const incoming = to as Element;
	if (element.localName === 'script' || element.localName.includes('-')) {
		const node = d.adoptNode(incoming);
		element.replaceWith(node);
		fresh.push(node);
		return;
	}
	for (const name of element.getAttributeNames())
		if (!incoming.hasAttribute(name)) element.removeAttribute(name);
	for (const attribute of incoming.attributes)
		if (element.getAttribute(attribute.name) !== attribute.value)
			element.setAttribute(attribute.name, attribute.value);
	morphChildren(d, element, incoming, fresh);
}

// Scrolled boxes (a sidebar) keep their offset when the same box, by position in the tree, is there after the swap.
function elementPath(root: Element, element: Element): string | undefined {
	const steps: string[] = [];
	for (let node: Element | null = element; node && node !== root; node = node.parentElement) {
		const parent: Element | null = node.parentElement;
		if (!parent) return undefined;
		steps.push(`${[...parent.children].indexOf(node)}${node.localName}`);
	}
	return steps.reverse().join('/');
}

function elementAt(root: Element, path: string): Element | undefined {
	let node: Element | undefined = root;
	for (const step of path ? path.split('/') : []) {
		const index = Number.parseInt(step, 10);
		const child: Element | undefined = node?.children[index];
		if (!child || `${index}${child.localName}` !== step) return undefined;
		node = child;
	}
	return node;
}

// Streamed @pending arms arrive after the region, one delimited piece each, and run exactly as on a landing.
async function streamAppends(
	d: Document,
	state: FragmentNavigationState,
	fetched: FragmentFetched,
	end: Node,
	signal: AbortSignal,
): Promise<string | undefined> {
	const marker = state.config.appendMarker;
	const decoder = new TextDecoder();
	let text = fetched.tail;
	let all = fetched.tail;
	const insert = (piece: string) => {
		const parent = end.parentNode;
		if (signal.aborted || !piece.trim() || !parent) return;
		const range = d.createRange();
		range.selectNodeContents(parent);
		parent.insertBefore(range.createContextualFragment(piece), end);
	};
	const flush = (final: boolean) => {
		const pieces = text.split(marker);
		text = final ? '' : pieces.pop()!;
		for (const piece of pieces) insert(piece);
	};
	if (fetched.rest) {
		flush(false);
		for (;;) {
			const chunk = await fetched.rest.read();
			if (signal.aborted) {
				void fetched.rest.cancel().catch(() => {});
				break;
			}
			if (chunk.done) break;
			const decoded = decoder.decode(chunk.value, { stream: true });
			text += decoded;
			all += decoded;
			flush(false);
		}
	}
	flush(true);
	end.parentNode?.removeChild(end);
	return signal.aborted ? undefined : all;
}

export async function navigate(
	d: Document,
	url: URL,
	mode: 'push' | 'replace' | 'traverse',
	scroll: FragmentScroll,
): Promise<void> {
	const state = (d as FragmentHost).__marklessFragmentNav;
	const w = d.defaultView;
	if (!state || !w) return;
	const session = sessionFor(d);
	const id = ++session.navigation;
	session.streaming?.abort();
	const fallback = (href: string) => {
		if (mode === 'traverse') w.location.reload();
		else w.location.assign(href);
	};
	const taken = take(state, url, mode === 'traverse', w.performance.now());
	let fetched: FragmentFetched;
	try {
		fetched = await taken.result;
	} catch {
		if (id === session.navigation) fallback(url.href);
		return;
	}
	if (id !== session.navigation) return taken.abort();
	const next = fetched.doc;
	const documentLoads = state.config.documentLoads;
	const incoming = documentLoads ? next.body : regionOf(state, next);
	const outgoing = documentLoads ? d.body : regionOf(state, d);
	const scope = documentLoads ? d.body : outgoing?.parentElement;
	if (!incoming || !outgoing || !scope) {
		fallback(fetched.url);
		return;
	}
	const head = await mergeHead(d, next);
	if (id !== session.navigation) return taken.abort();
	let restore = scroll;
	if (mode === 'traverse') {
		const key = (typeof scroll === 'object' ? scroll.id : undefined) ?? LANDING_ENTRY;
		const saved = session.positions.get(key);
		if (saved) restore = saved;
		session.current = key;
	} else {
		const leaving =
			session.current ??
			(w.history.state as { __marklessFragment?: { id?: string } } | null)?.__marklessFragment
				?.id ??
			LANDING_ENTRY;
		session.positions.set(leaving, { x: w.scrollX, y: w.scrollY });
		w.history.scrollRestoration = 'manual';
		session.current = entryId();
		const entry = { __marklessFragment: { id: session.current, x: 0, y: 0 } };
		if (mode === 'push') w.history.pushState(entry, '', fetched.url);
		else w.history.replaceState(entry, '', fetched.url);
	}
	const offsets: Array<readonly [string, number, number]> = [];
	for (const element of state.scrolled) {
		const path =
			element.isConnected && scope.contains(element)
				? elementPath(scope, element)
				: undefined;
		if (path !== undefined && (element.scrollTop || element.scrollLeft))
			offsets.push([path, element.scrollTop, element.scrollLeft]);
	}
	state.scrolled.clear();
	retire(state, outgoing);
	(w as unknown as Record<string, unknown>)[state.config.streamExecutorGlobal] = undefined;
	for (const element of d.querySelectorAll(state.config.streamedArmSelector)) element.remove();
	state.shown = pageKey(new URL(w.location.href));
	if (documentLoads) syncHtmlAttributes(d, next);
	const fresh: Element[] = [];
	let region: Element;
	if (documentLoads) {
		region = d.body;
		morphChildren(d, region, incoming, fresh);
	} else {
		region = d.adoptNode(incoming);
		outgoing.replaceWith(region);
		fresh.push(region);
	}
	for (const [path, top, left] of offsets) {
		const element = elementAt(scope, path);
		if (!element) continue;
		element.scrollTop = top;
		element.scrollLeft = left;
	}
	const end = d.createComment('');
	if (documentLoads) region.append(end);
	else region.after(end);
	for (const element of head.stale) element.remove();
	if (next.title && d.title !== next.title) d.title = next.title;
	for (const script of head.scripts) execute(d, script);
	for (const element of fresh)
		for (const script of element.localName === 'script'
			? [element]
			: element.querySelectorAll('script'))
			execute(d, script as HTMLScriptElement);
	const active = d.activeElement as HTMLElement | null;
	if (active && active !== d.body && !region.contains(active)) active.blur?.();
	(region.querySelector('[autofocus]') as HTMLElement | null)?.focus();
	if (restore === 'reset') {
		const target = url.hash ? d.getElementById(decodeURIComponent(url.hash.slice(1))) : null;
		if (target) target.scrollIntoView();
		else w.scrollTo(0, 0);
	} else if (restore !== 'manual') w.scrollTo(restore.x, restore.y);
	d.dispatchEvent(new CustomEvent('marklessrouterrendered'));
	state.rescan();
	const controller = new AbortController();
	session.streaming = controller;
	const key = state.shown;
	void streamAppends(d, state, fetched, end, controller.signal).then((rest) => {
		if (rest === undefined) return;
		state.visited.delete(key);
		const text = `${fetched.prefix}${state.config.regionEndMarker}${rest}`;
		state.visited.set(key, text);
		while (state.visited.size > 8) state.visited.delete(state.visited.keys().next().value!);
		const parsed = parsedVisits.get(state) ?? new Map<string, FragmentFetched>();
		parsedVisits.set(state, parsed);
		// Parsing runs no page code; done at idle, a Back to this page only swaps.
		const idle = () => {
			if (state.visited.get(key) === text) parsed.set(key, state.parse(fetched.url, text));
			for (const other of parsed.keys()) if (!state.visited.has(other)) parsed.delete(other);
		};
		if (w.requestIdleCallback) w.requestIdleCallback(idle, { timeout: 2000 });
		else w.setTimeout(idle, 200);
	}, reportAsync);
}
