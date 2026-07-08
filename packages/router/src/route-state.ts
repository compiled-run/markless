import type { PageProps } from './index.ts';

export const MARKLESS_ROUTER_ROUTE_EVENT = 'marklessrouternavigate';

// Set on the document by startRouteUpdateRenderer: navigation code awaits the
// renderer's onRendered callback only when a renderer is actually listening.
export const MARKLESS_ROUTER_RENDERER_STARTED = '__marklessRouterRouteRendererStarted';

export interface RouteState {
	readonly file: string;
	readonly params: Readonly<Record<string, string>>;
	readonly status: number;
	readonly url: string;
}

export interface RoutePageModule {
	readonly default?: unknown;
}

export interface RouteDocumentModule {
	readonly default?: unknown;
}

export interface RouteUpdate {
	// True for the hash deep-link swap at boot: the outgoing document is live
	// SSR'd UI nobody clicked away from, so the D8 hold never commits @pending
	// fallback over it — it holds until the destination settles (T004).
	readonly bootSwap?: boolean;
	readonly document?: RouteDocumentModule;
	readonly page: RoutePageModule;
	readonly route: RouteState;
	// Aborts when a newer navigation supersedes this one: a held swap must
	// never commit a stale destination (D8 navigation transitions).
	readonly signal?: AbortSignal;
	// Called by the route renderer once the swap committed (or was cancelled):
	// the navigation's intercept handler finishes at the real transition end,
	// so after-transition focus/scroll applies to the committed page.
	readonly onRendered?: () => void;
}

export function routePageProps(route: RouteState): PageProps {
	const url = new URL(route.url);
	return {
		params: route.params,
		status: route.status,
		url: {
			href: url.href,
			pathname: url.pathname,
			search: url.search,
		},
	};
}

export function dispatchRouteUpdate(document: Document, update: RouteUpdate): void {
	document.dispatchEvent(
		new CustomEvent<RouteUpdate>(MARKLESS_ROUTER_ROUTE_EVENT, {
			detail: update,
		}),
	);
}
