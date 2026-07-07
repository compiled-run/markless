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
	readonly pageModuleLoaders: Record<string, () => Promise<unknown>>;
	readonly preloadRouteModule?: (file: string) => unknown;
	readonly routeFileIds: readonly string[];
	readonly window?: MarklessRouterNavigationWindow;
}

interface NavigationContext {
	readonly documentModuleLoader?: () => Promise<unknown>;
	readonly manifest: RouteManifest;
	readonly pageModuleLoaders: Record<string, () => Promise<unknown>>;
	readonly preloadRouteModule?: (file: string) => unknown;
	readonly window: MarklessRouterNavigationWindow;
}

// A '#/...' hash is unambiguously a route path (in-page anchors never start
// with '/'), so hash paths are first-class alongside pathnames — no modes.
function hashRoutePath(url: URL): string | undefined {
	return url.hash.startsWith('#/') ? url.hash.slice(1) : undefined;
}

// Route-table path for a destination URL: a '#/' hash wins (it is the
// deepest-specified route intent); otherwise the pathname routes.
function routePathname(url: URL, _context?: NavigationContext): string {
	return hashRoutePath(url) ?? url.pathname;
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

	// Deep links land on /#/some/route while the server rendered the shell for
	// the pathname: swap to the hash route on boot.
	{
		const bootUrl = parseSameOriginUrl(
			runtimeWindow.location.href,
			runtimeWindow.location.href,
		);
		const bootHashPath = bootUrl ? hashRoutePath(bootUrl) : undefined;
		if (bootUrl && bootHashPath && matchRouteManifest(bootHashPath, context.manifest)) {
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

	// Route swaps render the destination page CLIENT-SIDE: load its page
	// module, dispatch a route update, and let the route renderer run
	// renderCsr — async boundaries settle interactively through commitArm.
	// (No hydration is violated only by re-executing components over existing
	// server HTML; rendering NEW pages in the browser is the D7 model.)
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
	const destination = parseSameOriginUrl(event.destination.url, context.window.location.href);
	// A hash change toward a '#/...' route path is a route navigation (hash apps
	// navigate with plain anchors, so link info is not required); any other hash
	// change is an in-page anchor and stays with the browser.
	const hashRouteNavigation =
		event.hashChange === true && !!destination && hashRoutePath(destination) !== undefined;
	if (
		(!isMarklessRouterNavigation(event) && !hashRouteNavigation) ||
		event.canIntercept === false ||
		event.navigationType === 'reload' ||
		(event.hashChange && !hashRouteNavigation) ||
		event.downloadRequest != null ||
		event.formData != null
	) {
		return undefined;
	}

	return destination && matchRouteManifest(routePathname(destination), context.manifest)
		? destination
		: undefined;
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
