import { flushSync, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'octane';
import type { RenderRouteProps } from '@octanejs/vite-plugin';
import './shared/styles.css';
import { ROUTES, SITE_TITLE, documentTitle } from './shared/data.ts';
import type { RouteInfo } from './shared/data.ts';
import { Sidebar } from './Sidebar.tsrx';
import { Overview } from './Overview.tsrx';
import { Records } from './Records.tsrx';
import { Settings } from './Settings.tsrx';

const ENTRANT = 'octane';

function routeFromUrl(url: string): RouteInfo {
	const pathname = new URL(url, 'http://localhost').pathname.replace(/\/+$/, '') || '/';
	return ROUTES.find((route) => route.path === pathname) ?? ROUTES[0];
}

interface HistoryScroll {
	scrollY?: number;
}

export function App(props: RenderRouteProps) @{
	const [route, setRoute] = useState(() => routeFromUrl(props.url ?? '/'));
	const pendingScroll = useRef<number | null>(null);

	const navigate = useCallback((path: string) => {
		history.replaceState({ ...(history.state as HistoryScroll | null), scrollY: window.scrollY }, '');
		history.pushState({ scrollY: 0 }, '', path);
		pendingScroll.current = 0;
		setRoute(routeFromUrl(path));
	}, []);

	useEffect(() => {
		history.scrollRestoration = 'manual';
		const onPopState = (event: PopStateEvent) => {
			pendingScroll.current = (event.state as HistoryScroll | null)?.scrollY ?? 0;
			flushSync(() => setRoute(routeFromUrl(window.location.href)));
		};
		window.addEventListener('popstate', onPopState);
		return () => window.removeEventListener('popstate', onPopState);
	}, []);

	useLayoutEffect(() => {
		if (pendingScroll.current === null) return;
		window.scrollTo(0, pendingScroll.current);
		pendingScroll.current = null;
	}, [route]);

	<>
		<title>{documentTitle(route)}</title>
		<meta name="benchmark:entrant" content={ENTRANT} />
		<meta name="benchmark:build" content={__BENCHMARK_BUILD_ID__} />
		<div class="app">
			<header class="app-header">
				<span class="app-brand">{SITE_TITLE}</span>
				<nav class="app-nav" aria-label="Main">
					@for (const entry of ROUTES; key entry.id) {
						<a
							data-testid={entry.navTestId}
							href={entry.path}
							aria-current={entry.id === route.id ? 'page' : undefined}
							onClick={(event: MouseEvent) => {
								if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
								event.preventDefault();
								navigate(entry.path);
							}}
						>
							{entry.title}
						</a>
					}
				</nav>
			</header>
			<div class="app-body">
				<Sidebar key={route.id} />
				<main class="main">
					<h1 class="page-title" data-testid="page-title">{route.title}</h1>
					@if (route.id === 'overview') {
						<Overview />
					} @else if (route.id === 'records') {
						<Records />
					} @else {
						<Settings />
					}
				</main>
			</div>
		</div>
	</>
}
