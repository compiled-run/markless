// The swap half of fragment navigation; the inline link bridge (vite/fragment-navigation.ts) fetches, this module commits.
import type { ModulePreloadInput } from '@markless/web/render-to-string';

export interface FragmentNavigationConfig {
	readonly entry: string;
	readonly entryImports: readonly string[];
	readonly linkAttribute: string;
	readonly prefetchAttribute: string;
	readonly replaceAttribute: string;
	readonly scrollAttribute: string;
	readonly routeScriptType: string;
	readonly servedHtmlAttributesProperty: string;
	readonly servedBodyAttributesProperty: string;
	readonly retireProperty: string;
	readonly streamExecutorGlobal: string;
	readonly streamedArmSelector: string;
	readonly requestPrefix: string;
	readonly regionEndMarker: string;
	readonly appendMarker: string;
	// Close and open the page's nodes when the document's own element is the container; what is outside is the document's.
	readonly pageEndComment: string;
	readonly pageStartComment: string;
	// The container's own attributes, never carried from the leaving page's element to the next one.
	readonly containerAttributes: readonly [container: string, paths: string];
	// 'document' apps swap the whole body: their shell renders from the request URL.
	readonly documentLoads: boolean;
	// A mouse fetches after resting this long on a link; press, focus and touch fetch at once.
	readonly hoverDwellMs: number;
	readonly prefetchTtlMs: number;
	// At most this many unused prefetches may still be streaming; starting another cancels the oldest.
	readonly prefetchConnections: number;
	// Paths the server answers with endpoints, not pages: never fetched before a click or as a fragment.
	readonly endpointPrefixes: readonly string[];
	// At most this many visible-link fragments are fetched at idle on fast connections, in document order; 0 keeps HTML to intent only.
	readonly idleFragments: number;
	// An idle fetch stops once a page's region passes this many bytes, and that page waits for intent.
	readonly idleFragmentBytes: number;
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
	// The writes this page had sent when the fetch began: a later write makes it stale.
	readonly writes: number;
	// When the response's Cache-Control ends its reuse (on arrival for no-store and no-cache).
	expires?: number;
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
	// Writes this page has started or finished: each one makes every page fetched before it stale.
	writes: number;
	readonly fresh: (entry: FragmentPrefetch, now: number) => boolean;
	shown: string;
	readonly eligible: (anchor: Element | null | undefined, forClick?: boolean) => URL | undefined;
	readonly preloadCode: (url: URL, low: boolean) => void;
	// speculative: a prefetch (low priority, `Purpose: prefetch`), not a click.
	readonly request: (url: URL, speculative: boolean) => FragmentPrefetch;
	readonly prefetch: (url: URL) => void;
	readonly parse: (url: string, text: string) => FragmentFetched;
	readonly idleDownloads: boolean;
	// Schedules the idle tier: at idle, fetch a few page fragments of the links in view; their code waits for intent.
	readonly rescan: () => void;
	readonly scrolled: Set<Element>;
	// Code the intent started preloading, by absolute href, settling once each file has arrived.
	readonly arriving: Map<string, Promise<unknown>>;
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
	// Back and Forward restore the page as it was left, never waiting on a newer fetch of it.
	const cached = traverse ? state.visited.get(key) : undefined;
	if (cached !== undefined) {
		existing?.abort();
		const ready = parsedVisits.get(state)?.get(key);
		parsedVisits.get(state)?.delete(key);
		return {
			at: now,
			writes: state.writes,
			result: Promise.resolve(ready ?? state.parse(url.href, cached)),
			open: false,
			abort: () => {},
		};
	}
	if (existing && state.fresh(existing, now)) return existing;
	existing?.abort();
	state.preloadCode(url, false);
	return state.request(url, false);
}

function regionOf(state: FragmentNavigationState, doc: Document): Element | null {
	return (
		(
			doc.querySelector(`script[type="${state.config.routeScriptType}"]`) ??
			doc.querySelector('script[data-markless-router-link-resumer]')
		)?.closest(`[${state.config.containerAttributes[0]}]`) ?? null
	);
}

function retire(state: FragmentNavigationState, root: Element): void {
	for (const container of [
		root,
		...root.querySelectorAll(`[${state.config.containerAttributes[0]}]`),
	]) {
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

// The JavaScript MIME types of the HTML spec, which a browser runs as classic scripts.
const JAVASCRIPT_TYPE =
	/^(?:|(?:text|application)\/(?:x-)?(?:java|ecma)script|text\/(?:javascript1\.[0-5]|jscript|livescript))$/;

function scriptKind(script: HTMLScriptElement): 'classic' | 'module' | undefined {
	const type = script.getAttribute('type');
	const language = script.getAttribute('language');
	const essence = (type ?? (language ? `text/${language}` : ''))
		.split(';')[0]!
		.trim()
		.toLowerCase();
	if (essence === 'module') return 'module';
	if (!JAVASCRIPT_TYPE.test(essence) || script.hasAttribute('nomodule')) return undefined;
	return 'classic';
}

// A parsed or adopted script never runs; a fresh element with its attributes and text does.
function runnable(d: Document, script: HTMLScriptElement): HTMLScriptElement {
	const clone = d.createElement('script');
	for (const attribute of script.attributes) clone.setAttribute(attribute.name, attribute.value);
	clone.textContent = script.textContent;
	return clone;
}

const settles = (script: HTMLScriptElement) =>
	new Promise<unknown>((done) => {
		script.addEventListener('load', done, { once: true });
		script.addEventListener('error', done, { once: true });
	});

// External files this document already ran: a page that includes one again keeps the loaded copy.
const ranFiles = new WeakMap<Document, Set<string>>();

function filesRan(d: Document): Set<string> {
	let files = ranFiles.get(d);
	if (!files) ranFiles.set(d, (files = new Set()));
	for (const script of d.scripts) if (script.src && scriptKind(script)) files.add(script.src);
	return files;
}

type LoadListener = {
	readonly target: EventTarget;
	readonly type: string;
	readonly listener: EventListenerOrEventListenerObject;
};

// The document fired DOMContentLoaded and load already: listeners the page's scripts add are called once those scripts ran.
function captureLoadListeners(d: Document, w: Window, into: LoadListener[]): () => void {
	const targets: Array<readonly [EventTarget, string]> = [];
	if (d.readyState !== 'loading') targets.push([d, 'DOMContentLoaded']);
	if (d.readyState === 'complete') targets.push([w, 'load']);
	const restores = targets.map(([target, type]) => {
		const own = Object.getOwnPropertyDescriptor(target, 'addEventListener');
		const add = target.addEventListener;
		target.addEventListener = function (
			this: EventTarget,
			kind: string,
			listener: EventListenerOrEventListenerObject | null,
			options?: boolean | AddEventListenerOptions,
		) {
			if (kind === type && listener && this === target) into.push({ target, type, listener });
			return add.call(this, kind, listener, options);
		};
		return () => {
			if (own) Object.defineProperty(target, 'addEventListener', own);
			else delete (target as { addEventListener?: unknown }).addEventListener;
		};
	});
	return () => {
		for (const restore of restores) restore();
	};
}

function callLoadListeners(listeners: readonly LoadListener[], type: string): void {
	const event = new Event(type);
	for (const entry of listeners) {
		if (entry.type !== type) continue;
		try {
			if (typeof entry.listener === 'function') entry.listener.call(entry.target, event);
			else entry.listener.handleEvent(event);
		} catch (error) {
			reportAsync(error);
		}
	}
}

// A landing's order: blocking classic scripts one by one, async as they arrive, then deferred and module scripts, then load listeners.
async function runScripts(
	d: Document,
	scripts: readonly HTMLScriptElement[],
	ran: Set<string>,
	current: () => boolean,
): Promise<void> {
	const w = d.defaultView!;
	const listeners: LoadListener[] = [];
	const release = captureLoadListeners(d, w, listeners);
	try {
		const deferred: HTMLScriptElement[] = [];
		for (const script of scripts) {
			const kind = scriptKind(script);
			if (!kind || !script.isConnected) continue;
			const src = script.hasAttribute('src') ? script.src : '';
			if (src && ran.has(src)) continue;
			if (src) ran.add(src);
			const async = script.hasAttribute('async') && (src !== '' || kind === 'module');
			if (!async && (kind === 'module' || (src && script.hasAttribute('defer')))) {
				deferred.push(script);
				continue;
			}
			const clone = runnable(d, script);
			if (async || !src) {
				script.replaceWith(clone);
				continue;
			}
			clone.async = false;
			const done = settles(clone);
			script.replaceWith(clone);
			await done;
			if (!current()) return;
		}
		let last: Promise<unknown> | undefined;
		let tail: HTMLScriptElement | undefined;
		for (const script of deferred) {
			if (!script.isConnected) continue;
			const clone = runnable(d, script);
			clone.async = false;
			last = clone.src ? settles(clone) : undefined;
			tail = clone;
			script.replaceWith(clone);
		}
		// An inline module fires no load event, so a marker queued after the last one says when it ran.
		if (tail && !last) {
			const key = `__marklessScriptsRan${Math.random().toString(36).slice(2)}`;
			const host = w as unknown as Record<string, unknown>;
			last = new Promise((done) => (host[key] = done));
			const marker = d.createElement('script');
			marker.type = 'module';
			marker.async = false;
			if (tail.nonce) marker.nonce = tail.nonce;
			marker.textContent = `window.${key}();`;
			d.head.append(marker);
			await last;
			delete host[key];
			marker.remove();
		} else await last;
		if (!current()) return;
		callLoadListeners(listeners, 'DOMContentLoaded');
		callLoadListeners(listeners, 'load');
	} finally {
		release();
	}
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
			// A kept head script already ran on this document; only one the destination adds runs.
			if (node.localName === 'script') scripts.push(node as HTMLScriptElement);
		}
		cursor = node;
	}
	const stale: Element[] = [];
	for (const element of [...current.values()].flat()) {
		const rel = element.localName === 'link' ? (element as HTMLLinkElement).rel : '';
		if (rel === 'modulepreload' || rel === 'preload') continue;
		if (rel === 'stylesheet' || element.localName === 'style') stale.push(element);
		else if ((element as HTMLScriptElement).type !== 'importmap') element.remove();
	}
	await loaded(d.defaultView!, stylesheets);
	return { stale, scripts };
}

// A swap applies only what the server changed between its documents; a script's own changes (a theme class) stay.
type ServedAttributes = ReadonlyMap<string, string>;
const servedAttributes = {
	html: new WeakMap<Document, ServedAttributes>(),
	body: new WeakMap<Document, ServedAttributes>(),
};

const attributePairs = (element: Element): ServedAttributes =>
	new Map(Array.from(element.attributes, (attribute) => [attribute.name, attribute.value]));

// What the served document gave <html> or <body>: the last swap's incoming, else the landing's own record.
function servedBefore(
	d: Document,
	which: 'html' | 'body',
	servedProperty: string,
): ServedAttributes {
	return (
		servedAttributes[which].get(d) ??
		new Map(
			(
				d.documentElement as unknown as Record<
					string,
					readonly [string, string][] | undefined
				>
			)[servedProperty],
		)
	);
}

function applyServedChanges(
	d: Document,
	target: HTMLElement,
	served: ServedAttributes,
	incoming: ServedAttributes,
): void {
	for (const name of new Set([...served.keys(), ...incoming.keys()])) {
		const before = served.get(name) ?? null;
		const after = incoming.get(name) ?? null;
		if (before !== after) applyServedChange(d, target, name, before, after);
	}
}

function syncHtmlAttributes(d: Document, next: Document, servedProperty: string): void {
	const incoming = attributePairs(next.documentElement);
	applyServedChanges(d, d.documentElement, servedBefore(d, 'html', servedProperty), incoming);
	servedAttributes.html.set(d, incoming);
}

// A <body> kept in place takes only the server's changes to its attributes; its own container attributes are as served.
function syncBodyAttributes(
	d: Document,
	served: Element,
	servedProperty: string,
	own: readonly string[] = [],
): void {
	const incoming = attributePairs(served);
	applyServedChanges(d, d.body, servedBefore(d, 'body', servedProperty), incoming);
	syncOwnAttributes(d.body, served, own);
	servedAttributes.body.set(d, incoming);
}

function syncOwnAttributes(element: Element, served: Element, own: readonly string[]): void {
	for (const name of own) {
		const value = served.getAttribute(name);
		if (value === null) element.removeAttribute(name);
		else if (element.getAttribute(name) !== value) element.setAttribute(name, value);
	}
}

// class and style are merged a token and a declaration at a time, so a script's own tokens are never dropped.
function applyServedChange(
	d: Document,
	root: HTMLElement,
	name: string,
	before: string | null,
	after: string | null,
): void {
	if (name === 'class') {
		const was = classTokens(before);
		const will = classTokens(after);
		const removed = [...was].filter((token) => !will.has(token));
		const added = [...will].filter((token) => !was.has(token));
		if (removed.length) root.classList.remove(...removed);
		if (added.length) root.classList.add(...added);
	} else if (name === 'style') {
		const was = declarations(d, before);
		const will = declarations(d, after);
		for (const property of was.keys())
			if (!will.has(property)) root.style.removeProperty(property);
		for (const [property, [value, priority]] of will) {
			const old = was.get(property);
			if (old?.[0] !== value || old[1] !== priority)
				root.style.setProperty(property, value, priority);
		}
	} else if (after === null) root.removeAttribute(name);
	else root.setAttribute(name, after);
	if (after === null && !root.getAttribute(name)?.trim()) root.removeAttribute(name);
}

const classTokens = (value: string | null): Set<string> =>
	new Set(value?.split(/\s+/).filter(Boolean));

function declarations(d: Document, value: string | null): Map<string, [string, string]> {
	const style = d.createElement('div').style;
	style.cssText = value ?? '';
	const result = new Map<string, [string, string]>();
	for (let index = 0; index < style.length; index++) {
		const property = style.item(index);
		result.set(property, [
			style.getPropertyValue(property),
			style.getPropertyPriority(property),
		]);
	}
	return result;
}

// Set from the page's config at the start of every swap.
let containerAttribute = '';

const isContainer = (node: Node): boolean =>
	node.nodeType === 1 && (node as Element).hasAttribute(containerAttribute);

function pageEnd(host: Node, data: string): Comment | undefined {
	for (let node = host.lastChild; node; node = node.previousSibling)
		if (node.nodeType === 8 && (node as Comment).data === data) return node as Comment;
	return undefined;
}

function pageStart(host: Node, data: string): Comment | undefined {
	for (let node = host.firstChild; node; node = node.nextSibling)
		if (node.nodeType === 8 && (node as Comment).data === data) return node as Comment;
	return undefined;
}

function nodesBetween(parent: Node, after: Node | undefined, before: Node | null): ChildNode[] {
	const nodes: ChildNode[] = [];
	for (
		let node = after ? after.nextSibling : parent.firstChild;
		node && node !== before;
		node = node.nextSibling
	)
		nodes.push(node);
	return nodes;
}

const scriptsIn = (element: Element): Element[] =>
	element.localName === 'script' ? [element] : [...element.querySelectorAll('script')];

const serverHostAttributes = new WeakMap<Document, Set<string>>();

// A container kept in place takes the server's attributes; one a script set on it, and the server never served, stays.
function syncHostAttributes(
	d: Document,
	host: Element,
	served: Element,
	own: readonly string[],
): void {
	const server = serverHostAttributes.get(d);
	serverHostAttributes.set(d, new Set(served.getAttributeNames()));
	for (const name of host.getAttributeNames())
		if (!served.hasAttribute(name) && (server?.has(name) || own.includes(name)))
			host.removeAttribute(name);
	for (const attribute of served.attributes)
		if (host.getAttribute(attribute.name) !== attribute.value)
			host.setAttribute(attribute.name, attribute.value);
}

// Kept nodes keep hover, focus, scroll and running transitions; inside a container scripts are always fresh, so the page boots again.
function morphChildren(d: Document, from: Node, to: Node, fresh: Element[], page = false): void {
	morphRange(d, from, from.firstChild, null, Array.from(to.childNodes), fresh, page);
}

const sameKind = (from: ChildNode, to: ChildNode): boolean =>
	from.nodeType === to.nodeType &&
	from.nodeName === to.nodeName &&
	isContainer(from) === isContainer(to) &&
	(from.nodeType !== 1 || (from as Element).id === (to as Element).id);

function morphRange(
	d: Document,
	parent: Node,
	cursor: ChildNode | null,
	stop: Node | null,
	incoming: readonly ChildNode[],
	fresh: Element[],
	page: boolean,
): void {
	for (const next of incoming) {
		// A node the next page dropped from a list: the one after it is the match.
		if (cursor && cursor !== stop && !sameKind(cursor, next)) {
			const after = cursor.nextSibling;
			if (after && after !== stop && sameKind(after, next)) {
				cursor.remove();
				cursor = after;
			}
		}
		if (cursor && cursor !== stop && sameKind(cursor, next)) {
			const after = cursor.nextSibling;
			morphNode(d, cursor, next, fresh, page);
			cursor = after;
			continue;
		}
		const node = d.adoptNode(next);
		parent.insertBefore(node, cursor && cursor !== stop ? cursor : stop);
		if (node.nodeType === 1) fresh.push(node as Element);
	}
	while (cursor && cursor !== stop) {
		const after: ChildNode | null = cursor.nextSibling;
		cursor.remove();
		cursor = after;
	}
}

function morphNode(
	d: Document,
	from: ChildNode,
	to: ChildNode,
	fresh: Element[],
	page: boolean,
): void {
	if (from.nodeType !== 1) {
		if ((from as CharacterData).data !== (to as CharacterData).data)
			(from as CharacterData).data = (to as CharacterData).data;
		return;
	}
	const element = from as Element;
	const incoming = to as Element;
	const name = element.localName;
	page ||= isContainer(element);
	// A template's content is not its children, so a morph cannot see it; a custom element owns its own state.
	if (
		name === 'template' ||
		(name === 'script' && (page || !element.isEqualNode(incoming))) ||
		(name.includes('-') && !element.isEqualNode(incoming))
	) {
		const node = d.adoptNode(incoming);
		element.replaceWith(node);
		fresh.push(node);
		return;
	}
	if (!page && element.isEqualNode(incoming)) return;
	for (const attribute of element.getAttributeNames())
		if (!incoming.hasAttribute(attribute)) element.removeAttribute(attribute);
	for (const attribute of incoming.attributes)
		if (element.getAttribute(attribute.name) !== attribute.value)
			element.setAttribute(attribute.name, attribute.value);
	if (page) resetControl(element);
	if (name !== 'script') morphChildren(d, element, incoming, fresh, page);
}

// A kept control shows what the server rendered for the next page, as a landing would.
function resetControl(element: Element): void {
	const name = element.localName;
	if (name === 'input') {
		const input = element as HTMLInputElement;
		if (input.checked !== input.defaultChecked) input.checked = input.defaultChecked;
		if (input.value !== input.defaultValue) input.value = input.defaultValue;
	} else if (name === 'textarea') {
		const area = element as HTMLTextAreaElement;
		if (area.value !== area.defaultValue) area.value = area.defaultValue;
	} else if (name === 'option') {
		const option = element as HTMLOptionElement;
		if (option.selected !== option.defaultSelected) option.selected = option.defaultSelected;
	}
}

// A kept node takes the next page's classes in one step: a CSS transition between two pages' styles shows as morphing.
// Transitions are off while the swap's styles are computed once, then on again; that change itself starts none.
function withoutTransitions(d: Document): () => void {
	const rule = '*,*::before,*::after{transition:none!important}';
	const Sheet = d.defaultView?.CSSStyleSheet;
	// A constructed sheet passes a strict style-src policy and adds no node a page script could observe.
	if (Sheet && 'adoptedStyleSheets' in d) {
		const sheet = new Sheet();
		sheet.replaceSync(rule);
		d.adoptedStyleSheets = [...d.adoptedStyleSheets, sheet];
		return () => {
			void d.documentElement.offsetHeight;
			d.adoptedStyleSheets = d.adoptedStyleSheets.filter((own) => own !== sheet);
		};
	}
	const style = d.createElement('style');
	style.textContent = rule;
	d.head.append(style);
	return () => {
		void d.documentElement.offsetHeight;
		style.remove();
	};
}

// Drops the leaving page's runtime state (the framework names its own `__m*`) and gives each container a new page lifetime.
function forgetRuntimeState(root: Element): void {
	const forget = (node: Node) => {
		for (const key of Object.keys(node))
			if (key.startsWith('__m')) delete (node as unknown as Record<string, unknown>)[key];
		if (isContainer(node)) (node as unknown as Record<string, unknown>).__mL = {};
	};
	forget(root);
	const walker = root.ownerDocument.createTreeWalker(root, 129);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) forget(node);
}

// Scrolled boxes (a sidebar) keep their offset when the same box is there after the swap:
// at its old place in the tree, or else by its id when the next page wraps it differently.
type ScrolledBox = {
	readonly path: string | undefined;
	readonly id: string;
	readonly kind: string;
	readonly top: number;
	readonly left: number;
};

const boxKind = (element: Element) =>
	`${element.localName}#${element.id}.${element.getAttribute('class') ?? ''}[${element.getAttribute('aria-label') ?? ''}]`;

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

function sameBox(root: Element, box: ScrolledBox): Element | undefined {
	const placed = box.path === undefined ? undefined : elementAt(root, box.path);
	if (placed) return placed;
	const named = box.id ? root.ownerDocument.getElementById(box.id) : null;
	return named && root.contains(named) && boxKind(named) === box.kind ? named : undefined;
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
	if ((end as Comment).data !== state.config.pageEndComment) end.parentNode?.removeChild(end);
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
	containerAttribute = state.config.containerAttributes[0];
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
	// A prefetch is shared by every link to the page, so the address takes the clicked link's #fragment.
	const landed = new URL(fetched.url);
	landed.hash = url.hash;
	const next = fetched.doc;
	const documentLoads = state.config.documentLoads;
	const incoming = documentLoads ? next.body : regionOf(state, next);
	const outgoing = documentLoads ? d.body : regionOf(state, d);
	const scope = documentLoads && !isContainer(d.body) ? d.body : outgoing?.parentElement;
	if (!incoming || !outgoing || !scope) {
		fallback(landed.href);
		return;
	}
	// The destination shows once its own code has arrived, so its first interaction never waits on a fetch.
	const code = [...next.head.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]')].map(
		(link) => state.arriving.get(new URL(link.getAttribute('href') ?? '', d.baseURI).href),
	);
	for (const item of state.routes[url.pathname] ?? [])
		code.push(
			state.arriving.get(
				new URL(typeof item === 'string' ? item : item.href, d.baseURI).href,
			),
		);
	const ranFiles = filesRan(d);
	const head = await mergeHead(d, next);
	await Promise.race([Promise.all(code), new Promise((resolve) => w.setTimeout(resolve, 3000))]);
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
		if (mode === 'push') w.history.pushState(entry, '', landed.href);
		else w.history.replaceState(entry, '', landed.href);
	}
	let region!: Element;
	let end!: Comment;
	let scripts: Element[] = [];
	const commit = (): boolean => {
		if (id !== session.navigation) return false;
		const settle = withoutTransitions(d);
		const offsets: ScrolledBox[] = [];
		for (const element of state.scrolled) {
			if (!element.isConnected || !scope.contains(element)) continue;
			if (element.scrollTop || element.scrollLeft)
				offsets.push({
					path: elementPath(scope, element),
					id: element.id,
					kind: boxKind(element),
					top: element.scrollTop,
					left: element.scrollLeft,
				});
		}
		state.scrolled.clear();
		retire(state, outgoing);
		forgetRuntimeState(outgoing);
		(w as unknown as Record<string, unknown>)[state.config.streamExecutorGlobal] = undefined;
		for (const element of d.querySelectorAll(state.config.streamedArmSelector))
			element.remove();
		state.shown = pageKey(new URL(w.location.href));
		if (documentLoads) syncHtmlAttributes(d, next, state.config.servedHtmlAttributesProperty);
		const fresh: Element[] = [];
		region = outgoing;
		if (documentLoads && !isContainer(d.body)) {
			syncBodyAttributes(d, next.body, state.config.servedBodyAttributesProperty);
			morphChildren(d, region, incoming, fresh);
			region.append((end = d.createComment('')));
		} else {
			const own = state.config.containerAttributes;
			if (outgoing === d.body)
				syncBodyAttributes(d, incoming, state.config.servedBodyAttributesProperty, own);
			else syncHostAttributes(d, outgoing, incoming, own);
			const leavingEnd = pageEnd(outgoing, state.config.pageEndComment);
			if (leavingEnd) {
				const arrivingEnd = pageEnd(incoming, state.config.pageEndComment) ?? null;
				const arrivingStart = pageStart(incoming, state.config.pageStartComment);
				let leavingStart = pageStart(outgoing, state.config.pageStartComment);
				if (!leavingStart && arrivingStart)
					leavingStart = outgoing.insertBefore(
						d.createComment(state.config.pageStartComment),
						outgoing.firstChild,
					);
				morphRange(
					d,
					outgoing,
					leavingStart ? leavingStart.nextSibling : outgoing.firstChild,
					leavingEnd,
					nodesBetween(incoming, arrivingStart, arrivingEnd),
					fresh,
					true,
				);
				end = leavingEnd;
				// The document's own nodes around the page stay; a document app morphs them to its next shell.
				if (documentLoads) {
					morphRange(
						d,
						outgoing,
						leavingEnd.nextSibling,
						null,
						arrivingEnd ? nodesBetween(incoming, arrivingEnd, null) : [],
						fresh,
						false,
					);
					if (leavingStart)
						morphRange(
							d,
							outgoing,
							outgoing.firstChild,
							leavingStart,
							arrivingStart ? nodesBetween(incoming, undefined, arrivingStart) : [],
							fresh,
							false,
						);
				}
			} else {
				morphRange(
					d,
					outgoing,
					outgoing.firstChild,
					null,
					Array.from(incoming.childNodes),
					fresh,
					true,
				);
				outgoing.after((end = d.createComment('')));
			}
		}
		scripts = fresh.flatMap(scriptsIn);
		// 'instant': a `scroll-behavior: smooth` page would otherwise animate every landing.
		for (const box of offsets)
			sameBox(scope, box)?.scrollTo({ top: box.top, left: box.left, behavior: 'instant' });
		for (const element of head.stale) element.remove();
		if (next.title && d.title !== next.title) d.title = next.title;
		settle();
		return true;
	};
	const committed = commit();
	if (!committed) return;
	const ran = runScripts(
		d,
		[...head.scripts, ...(scripts as HTMLScriptElement[])],
		ranFiles,
		() => id === session.navigation,
	);
	const active = d.activeElement as HTMLElement | null;
	if (active && active !== d.body && !region.contains(active)) active.blur?.();
	(region.querySelector('[autofocus]') as HTMLElement | null)?.focus();
	if (restore === 'reset') {
		const target = url.hash ? d.getElementById(decodeURIComponent(url.hash.slice(1))) : null;
		if (target) target.scrollIntoView({ behavior: 'instant' });
		else w.scrollTo({ top: 0, left: 0, behavior: 'instant' });
	} else if (restore !== 'manual')
		w.scrollTo({ top: restore.y, left: restore.x, behavior: 'instant' });
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
	await ran;
}
