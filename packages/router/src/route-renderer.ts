import { render } from '@markless/web/render';
import type { CsrRenderArtifact, RenderTarget } from '@markless/web/render';
import { routeMountTarget } from './route-dom.ts';
import { holdNavigationSwapUntilSettled, type NavigationHoldRuntime } from './navigation-hold.ts';
import {
	MARKLESS_ROUTER_RENDERER_STARTED,
	MARKLESS_ROUTER_ROUTE_EVENT,
	routePageProps,
	type RouteUpdate,
} from './route-state.ts';

const CURRENT_ROUTE_CONTAINER = '__marklessRouterCurrentRouteContainer';

export function startRouteUpdateRenderer(document: Document = window.document): void {
	const state = document as unknown as Record<string, unknown>;
	if (state[MARKLESS_ROUTER_RENDERER_STARTED]) return;
	state[MARKLESS_ROUTER_RENDERER_STARTED] = true;

	document.addEventListener(MARKLESS_ROUTER_ROUTE_EVENT, (event) => {
		void renderRouteUpdate(document, (event as CustomEvent<RouteUpdate>).detail);
	});
}

interface ClientPageArtifact {
	readonly renderData?: CsrRenderArtifact['renderData'];
	readonly loadSymbol?: (symbolId: string) => unknown | Promise<unknown>;
}

async function renderRouteUpdate(document: Document, update: RouteUpdate): Promise<void> {
	try {
		const artifact = update.page.default as ClientPageArtifact | undefined;
		if (!artifact || update.signal?.aborted) return;
		if (!artifact.renderData) {
			throw new Error(
				`MARKLESS_ROUTER_RENDER_DATA_MISSING: Navigated route ${JSON.stringify(update.route.file)} has no linked render-data module.`,
			);
		}

		const props = routePageProps(update.route);
		const state = document as unknown as Record<string, unknown>;
		const outgoing = state[CURRENT_ROUTE_CONTAINER] as
			| { readonly root?: Element; readonly runtime?: { readonly dispose?: () => void } }
			| undefined;
		const container = await render(
			{
				renderData: artifact.renderData,
				loadSymbol: artifact.loadSymbol as never,
				props,
			},
			{
				target: routeMountTarget(document, outgoing?.root) as RenderTarget,
				beforeMount: async (incoming) => {
					const commit = await holdNavigationSwapUntilSettled({
						runtime: incoming.runtime as NavigationHoldRuntime,
						signal: update.signal,
					});
					if (commit === false) return false;
					outgoing?.runtime?.dispose?.();
					return true;
				},
			},
		);
		if (!update.signal?.aborted) state[CURRENT_ROUTE_CONTAINER] = container;
	} finally {
		update.onRendered?.();
	}
}
