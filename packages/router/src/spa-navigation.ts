import {
	buildRouteManifestFromFileIds,
	matchRouteManifest,
	type RouteManifest,
} from './route-manifest.ts';
import { dispatchRouteUpdate, type RouteDocumentModule } from './route-state.ts';

const STARTED = '__marklessRouterSpaNavigationStarted';
const LINK_ATTRIBUTE = 'data-markless-router-link';
const REPLACE_ATTRIBUTE = 'data-markless-router-replace';
const SCROLL_ATTRIBUTE = 'data-markless-router-scroll';
const LINK_INFO = '__marklessRouterLink';

export type MarklessRouterNavigationRuntime = Pick<Navigation, 'addEventListener' | 'navigate'>;

export interface MarklessRouterNavigationWindow {
	readonly document: Document;
	readonly location: Location;
	navigation?: MarklessRouterNavigationRuntime;
	addEventListener(
		type: 'click',
		listener: (event: MouseEvent) => void,
		options?: boolean | AddEventListenerOptions,
	): void;
}

export interface MarklessRouterNavigationPolyfillModule {
	applyPolyfill(options: {
		readonly interceptEvents: boolean;
		readonly window: MarklessRouterNavigationWindow;
	}): unknown;
}

export interface StartSpaNavigationOptions {
	readonly documentModuleLoader?: () => Promise<unknown>;
	readonly loadPolyfill?: () => Promise<MarklessRouterNavigationPolyfillModule>;
	readonly mode?: 'path' | 'hash';
	readonly pageModuleLoaders: Record<string, () => Promise<unknown>>;
	readonly preloadRouteModule?: (file: string) => unknown;
	readonly routeFileIds: readonly string[];
	readonly window?: MarklessRouterNavigationWindow;
}

interface NavigationContext {
	readonly documentModuleLoader?: () => Promise<unknown>;
	readonly manifest: RouteManifest;
	// 'hash' routes by location.hash paths (#/r/x -> /r/x) for apps whose URLs
	// live in the fragment; 'path' (default) routes by pathname.
	readonly mode?: 'path' | 'hash';
	readonly pageModuleLoaders: Record<string, () => Promise<unknown>>;
	readonly preloadRouteModule?: (file: string) => unknown;
	readonly window: MarklessRouterNavigationWindow;
}

// The route-table path for a destination URL under the context's routing mode.
function routePathname(url: URL, context: NavigationContext): string {
	if (context.mode !== 'hash') return url.pathname;
	const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
	if (hash === '') return '/';
	return hash.startsWith('/') ? hash : `/${hash}`;
}

export async function __marklessRouterStartSpaNavigation(options: StartSpaNavigationOptions) {
	const runtimeWindow = options.window ?? browserWindow();
	const state = runtimeWindow as unknown as Record<string, unknown>;
	if (state[STARTED]) {
		return;
	}
	state[STARTED] = true;

	const context: NavigationContext = {
		documentModuleLoader: options.documentModuleLoader,
		manifest: buildRouteManifestFromFileIds(options.routeFileIds),
		mode: options.mode,
		pageModuleLoaders: options.pageModuleLoaders,
		preloadRouteModule: options.preloadRouteModule,
		window: runtimeWindow,
	};
	const navigation = await ensureNavigationRuntime(runtimeWindow, options.loadPolyfill);

	runtimeWindow.addEventListener(
		'click',
		(event) => handleLinkClick(event, context, navigation),
		true,
	);
	navigation.addEventListener('navigate', (event) => {
		handleNavigateEvent(event, context);
	});

	// Hash apps land on /#/some/route while the server rendered the root shell:
	// swap to the hash's route on boot so deep links work.
	if (context.mode === 'hash') {
		const bootUrl = parseSameOriginUrl(
			runtimeWindow.location.href,
			runtimeWindow.location.href,
		);
		const bootPath = bootUrl ? routePathname(bootUrl, context) : '/';
		if (bootUrl && bootPath !== '/' && matchRouteManifest(bootPath, context.manifest)) {
			void renderRoute(bootUrl, context);
		}
	}
}

export async function ensureNavigationRuntime(
	runtimeWindow: MarklessRouterNavigationWindow = browserWindow(),
	loadPolyfill?: () => Promise<MarklessRouterNavigationPolyfillModule>,
) {
	if (!runtimeWindow.navigation) {
		const { applyPolyfill } = (await (loadPolyfill?.() ??
			import('@virtualstate/navigation'))) as MarklessRouterNavigationPolyfillModule;
		runtimeWindow.navigation = applyPolyfill({
			interceptEvents: false,
			window: runtimeWindow,
		}) as MarklessRouterNavigationRuntime;
	}

	return runtimeWindow.navigation;
}

export function handleNavigateEvent(event: NavigateEvent, context: NavigationContext) {
	const url = routeUrl(event, context);
	if (!url) {
		return false;
	}

	event.intercept({
		focusReset: 'after-transition',
		scroll: navigationScroll(event),
		handler: () => renderRoute(url, context, event.signal),
	});
	return true;
}

async function renderRoute(url: URL, context: NavigationContext, signal?: AbortSignal) {
	if (signal?.aborted) {
		return;
	}

	const match = matchRouteManifest(routePathname(url, context), context.manifest);
	const loadPageModule = match && context.pageModuleLoaders[match.route.file];
	if (!match || !loadPageModule) {
		context.window.location.assign(url.href);
		return;
	}

	preloadRouteModule(context, match.route.file);
	const [page, document] = await Promise.all([
		loadPageModule(),
		context.documentModuleLoader?.(),
	]);
	if (signal?.aborted) {
		return;
	}

	dispatchRouteUpdate(context.window.document, {
		document: document as RouteDocumentModule | undefined,
		page: page as never,
		route: {
			file: match.route.file,
			params: match.params,
			status: 200,
			url: url.href,
		},
	});
}

function handleLinkClick(
	event: MouseEvent,
	context: NavigationContext,
	navigation: MarklessRouterNavigationRuntime,
) {
	if (
		event.defaultPrevented ||
		event.button !== 0 ||
		event.metaKey ||
		event.altKey ||
		event.ctrlKey ||
		event.shiftKey
	) {
		return;
	}

	const anchor = sourceAnchor(event);
	if (!anchor || !anchor.hasAttribute(LINK_ATTRIBUTE) || !isEligibleLink(anchor)) {
		return;
	}

	const url = parseSameOriginUrl(anchor.href, context.window.location.href);
	const match = url && matchRouteManifest(routePathname(url, context), context.manifest);
	if (!match) {
		return;
	}

	preloadRouteModule(context, match.route.file);
	event.preventDefault();
	navigation.navigate(url.href, {
		history: anchor.hasAttribute(REPLACE_ATTRIBUTE) ? 'replace' : 'push',
		info: {
			[LINK_INFO]: true,
			scroll: anchor.getAttribute(SCROLL_ATTRIBUTE) === 'manual' ? 'manual' : undefined,
		},
	});
}

function preloadRouteModule(context: NavigationContext, file: string): void {
	try {
		context.preloadRouteModule?.(file);
	} catch {
		// Route preloads are opportunistic; navigation still imports the route module.
	}
}

function routeUrl(event: NavigateEvent, context: NavigationContext) {
	if (
		!isMarklessRouterNavigation(event) ||
		event.canIntercept === false ||
		event.navigationType === 'reload' ||
		(event.hashChange && context.mode !== 'hash') ||
		event.downloadRequest != null ||
		event.formData != null
	) {
		return undefined;
	}

	const url = parseSameOriginUrl(event.destination.url, context.window.location.href);
	return url && matchRouteManifest(routePathname(url, context), context.manifest) ? url : undefined;
}

function isMarklessRouterNavigation(event: NavigateEvent) {
	const info = event.info as Record<string, unknown> | undefined;
	return info?.[LINK_INFO] === true || event.navigationType === 'traverse';
}

function navigationScroll(event: NavigateEvent): NavigationScrollBehavior {
	const info = event.info as Record<string, unknown> | undefined;
	return info?.[LINK_INFO] === true && info.scroll === 'manual' ? 'manual' : 'after-transition';
}

function parseSameOriginUrl(href: string, base: string) {
	try {
		const current = new URL(base);
		const url = new URL(href, current);
		return url.origin === current.origin ? url : undefined;
	} catch {
		return undefined;
	}
}

function sourceAnchor(event: Event) {
	const target = (event.composedPath?.()[0] ?? event.target) as
		| {
				readonly closest?: (selector: string) => Element | null;
				readonly parentElement?: {
					readonly closest?: (selector: string) => Element | null;
				} | null;
		  }
		| null
		| undefined;

	return (target?.closest?.('a[href]') ?? target?.parentElement?.closest?.('a[href]')) as
		| HTMLAnchorElement
		| null
		| undefined;
}

function isEligibleLink(anchor: HTMLAnchorElement) {
	const target = anchor.getAttribute('target');
	return (
		(!target || target === '_self') &&
		!anchor.hasAttribute('download') &&
		!anchor.relList?.contains('external')
	);
}

function browserWindow(): MarklessRouterNavigationWindow {
	return window as unknown as MarklessRouterNavigationWindow;
}
