import { render } from '@markless/web/render';
import { holdNavigationSwapUntilSettled, type NavigationHoldRuntime } from './navigation-hold.ts';
import {
	MARKLESS_ROUTER_RENDERER_STARTED,
	MARKLESS_ROUTER_ROUTE_EVENT,
	routePageProps,
	type RouteUpdate,
} from './route-state.ts';

export function startRouteUpdateRenderer(document: Document = window.document): void {
	const state = document as unknown as Record<string, unknown>;
	if (state[MARKLESS_ROUTER_RENDERER_STARTED]) return;
	state[MARKLESS_ROUTER_RENDERER_STARTED] = true;

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
	try {
		const artifact = update.page.default as ClientPageArtifact | undefined;
		if (!artifact || update.signal?.aborted) return;

		const props = routePageProps(update.route);
		if (typeof artifact.renderCsr === 'function') {
			// D8 navigation transition: the destination renders fully live but
			// unmounted (its boundary runners already run); the outgoing page
			// stays interactive in the document until the hold commits.
			await render(
				{
					renderCsr: () => artifact.renderCsr?.(props),
				} as never,
				{
					target: document.body,
					// The D8 hold/deadline/min-duration state machine lives in
					// navigation-hold.ts (pure, fake-clock property-tested).
					beforeMount: (container) =>
						holdNavigationSwapUntilSettled({
							runtime: container.runtime as NavigationHoldRuntime,
							signal: update.signal,
							bootSwap: update.bootSwap,
						}),
				},
			);
			return;
		}

		if (typeof artifact.renderSsr === 'function') {
			document.body.innerHTML = (await artifact.renderSsr(props)).html;
		}
	} finally {
		update.onRendered?.();
	}
}
