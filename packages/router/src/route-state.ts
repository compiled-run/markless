import type { PageProps } from './index.ts';

export const MARKLESS_ROUTER_ROUTE_EVENT = 'marklessrouternavigate';

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
	readonly document?: RouteDocumentModule;
	readonly page: RoutePageModule;
	readonly route: RouteState;
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
