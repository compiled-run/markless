import {
	buildRouteManifestFromFileIds,
	matchRouteManifest,
	type RouteManifest,
} from './route-manifest.ts';
import { dispatchRouteUpdate, type RouteDocumentModule } from './route-state.ts';

const STARTED = '__arcadeRouterSpaNavigationStarted';
const LINK_ATTRIBUTE = 'data-arcade-router-link';
const REPLACE_ATTRIBUTE = 'data-arcade-router-replace';
const SCROLL_ATTRIBUTE = 'data-arcade-router-scroll';
const LINK_INFO = '__arcadeRouterLink';

export type ArcadeRouterNavigationRuntime = Pick<Navigation, 'addEventListener' | 'navigate'>;

export interface ArcadeRouterNavigationWindow {
	readonly document: Document;
	readonly location: Location;
	navigation?: ArcadeRouterNavigationRuntime;
	addEventListener(
		type: 'click',
		listener: (event: MouseEvent) => void,
		options?: boolean | AddEventListenerOptions,
	): void;
}

export interface ArcadeRouterNavigationPolyfillModule {
	applyPolyfill(options: {
		readonly interceptEvents: boolean;
		readonly window: ArcadeRouterNavigationWindow;
	}): unknown;
}

export interface StartSpaNavigationOptions {
	readonly documentModuleLoader?: () => Promise<unknown>;
	readonly loadPolyfill?: () => Promise<ArcadeRouterNavigationPolyfillModule>;
	readonly pageModuleLoaders: Record<string, () => Promise<unknown>>;
	readonly preloadRouteModule?: (file: string) => unknown;
	readonly routeFileIds: readonly string[];
	readonly window?: ArcadeRouterNavigationWindow;
}

interface NavigationContext {
	readonly documentModuleLoader?: () => Promise<unknown>;
	readonly manifest: RouteManifest;
	readonly pageModuleLoaders: Record<string, () => Promise<unknown>>;
	readonly preloadRouteModule?: (file: string) => unknown;
	readonly window: ArcadeRouterNavigationWindow;
}

export async function __arcadeRouterStartSpaNavigation(options: StartSpaNavigationOptions) {
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
}

export async function ensureNavigationRuntime(
	runtimeWindow: ArcadeRouterNavigationWindow = browserWindow(),
	loadPolyfill?: () => Promise<ArcadeRouterNavigationPolyfillModule>,
) {
	if (!runtimeWindow.navigation) {
		const { applyPolyfill } = (await (loadPolyfill?.() ??
			import('@virtualstate/navigation'))) as ArcadeRouterNavigationPolyfillModule;
		runtimeWindow.navigation = applyPolyfill({
			interceptEvents: false,
			window: runtimeWindow,
		}) as ArcadeRouterNavigationRuntime;
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

async function renderRoute(url: URL, context: NavigationContext, signal: AbortSignal) {
	if (signal.aborted) {
		return;
	}

	const match = matchRouteManifest(url.pathname, context.manifest);
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
	if (signal.aborted) {
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
	navigation: ArcadeRouterNavigationRuntime,
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
	const match = url && matchRouteManifest(url.pathname, context.manifest);
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
		!isArcadeRouterNavigation(event) ||
		event.canIntercept === false ||
		event.navigationType === 'reload' ||
		event.hashChange ||
		event.downloadRequest != null ||
		event.formData != null
	) {
		return undefined;
	}

	const url = parseSameOriginUrl(event.destination.url, context.window.location.href);
	return url && matchRouteManifest(url.pathname, context.manifest) ? url : undefined;
}

function isArcadeRouterNavigation(event: NavigateEvent) {
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

function browserWindow(): ArcadeRouterNavigationWindow {
	return window as unknown as ArcadeRouterNavigationWindow;
}
