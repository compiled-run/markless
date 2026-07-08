import { render } from '@markless/web/render';
import {
	MARKLESS_NAV_PENDING_MIN_MS,
	MARKLESS_NAV_SETTLE_DEADLINE_MS,
} from './navigation-timing.ts';
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

// The settle-transition surface a rendered page's runtime may expose
// (@markless/web ResumeRuntime); pages without async boundaries mount as-is.
interface TransitionRuntime {
	readonly whenAsyncBoundariesSettled?: () => Promise<void>;
	readonly holdPendingSettleCommits?: (minVisibleMs: number) => Promise<void> | void;
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
					beforeMount: (container) =>
						holdRouteSwapUntilSettled(container.runtime as TransitionRuntime, update.signal),
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

// Hold the swap until the destination's boundaries settle or the navigation
// deadline passes (spec D8: nothing visible is ever replaced by fallback UI).
// Past the deadline the swap shows honest @pending — which then stays visible
// at least the pending minimum before its settle commits. A superseded
// navigation cancels the mount entirely.
async function holdRouteSwapUntilSettled(
	runtime: TransitionRuntime,
	signal: AbortSignal | undefined,
): Promise<boolean | void> {
	const settled = runtime.whenAsyncBoundariesSettled?.();
	if (settled) {
		const outcome = await Promise.race([
			// A settle failure fails loudly in the page's own flush; for the
			// hold it only means "commit the swap now".
			settled.then(
				() => 'settled' as const,
				() => 'settled' as const,
			),
			waitMs(MARKLESS_NAV_SETTLE_DEADLINE_MS).then(() => 'deadline' as const),
		]);
		if (outcome === 'deadline') {
			await runtime.holdPendingSettleCommits?.(MARKLESS_NAV_PENDING_MIN_MS);
		}
	}
	if (signal?.aborted) return false;
}

function waitMs(durationMs: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, durationMs));
}
