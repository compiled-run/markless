import { render } from '@markless/web/render';
import { MARKLESS_ROUTER_ROUTE_EVENT, routePageProps, type RouteUpdate } from './route-state.ts';

const ROUTE_RENDERER_STARTED = '__marklessRouterRouteRendererStarted';

export function startRouteUpdateRenderer(document: Document = window.document): void {
	const state = document as unknown as Record<string, unknown>;
	if (state[ROUTE_RENDERER_STARTED]) return;
	state[ROUTE_RENDERER_STARTED] = true;

	document.addEventListener(MARKLESS_ROUTER_ROUTE_EVENT, (event) => {
		void renderRouteUpdate(document, (event as CustomEvent<RouteUpdate>).detail);
	});
}

interface ClientPageArtifact {
	readonly renderCsr?: (props?: unknown) => unknown;
	// MaybePromise: compiled renderSsr is async — the sync type let an
	// unawaited .html read pass vp check (fourth missed call site of the
	// async migration).
	readonly renderSsr?: (
		props?: unknown,
	) => { readonly html: string } | Promise<{ readonly html: string }>;
}

async function renderRouteUpdate(document: Document, update: RouteUpdate): Promise<void> {
	const artifact = update.page.default as ClientPageArtifact | undefined;
	if (!artifact) return;

	const props = routePageProps(update.route);
	if (typeof artifact.renderCsr === 'function') {
		await render(
			{
				renderCsr: () => artifact.renderCsr?.(props),
			} as never,
			{ target: document.body },
		);
		return;
	}

	if (typeof artifact.renderSsr === 'function') {
		document.body.innerHTML = (await artifact.renderSsr(props)).html;
	}
}
