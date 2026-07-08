import { describe, expect, it } from 'vite-plus/test';
import { startRouteUpdateRenderer } from '../src/route-renderer.ts';
import { dispatchRouteUpdate } from '../src/route-state.ts';

describe('route update renderer', () => {
	it('does not run page artifact preloads during router CSR route render', async () => {
		let mounted: unknown;
		const document = Object.assign(new EventTarget(), {
			body: {
				replaceChildren(root: unknown) {
					mounted = root;
				},
			},
		}) as Document;
		let preloadCalls = 0;
		let renderedPathname = '';

		startRouteUpdateRenderer(document);
		dispatchRouteUpdate(document, {
			page: {
				default: {
					preload() {
						preloadCalls++;
					},
					renderCsr(props: { readonly url: { readonly pathname: string } }) {
						renderedPathname = props.url.pathname;
						return {
							graph: {},
							root: 'root',
							runtime: { dispatch: async () => {} },
						};
					},
				},
			},
			route: {
				file: 'pages/docs.tsrx',
				params: {},
				status: 200,
				url: 'http://markless.test/docs',
			},
		});
		await Promise.resolve();

		expect(preloadCalls).toBe(0);
		expect(renderedPathname).toBe('/docs');
		expect(mounted).toBe('root');
	});

	// T004 (shell-decomposition): the boot swap replaces a live SSR'd document,
	// so a deadline expiry must keep holding instead of mounting @pending
	// fallback over it. The test controls the settle promise, so the deadline
	// (real 250ms timer) has deterministically fired long before settle.
	it('holds a bootSwap route update past the deadline until the destination settles', async () => {
		let mounted: unknown;
		const document = Object.assign(new EventTarget(), {
			body: {
				replaceChildren(root: unknown) {
					mounted = root;
				},
			},
		}) as Document;
		let settle!: () => void;
		const settled = new Promise<void>((resolve) => {
			settle = resolve;
		});
		let pendingHolds = 0;

		startRouteUpdateRenderer(document);
		dispatchRouteUpdate(document, {
			bootSwap: true,
			page: {
				default: {
					renderCsr() {
						return {
							graph: {},
							root: 'destination-root',
							runtime: {
								dispatch: async () => {},
								whenAsyncBoundariesSettled: () => settled,
								holdPendingSettleCommits: () => {
									pendingHolds++;
								},
							},
						};
					},
				},
			},
			route: {
				file: 'pages/r/[repo]/issues.tsrx',
				params: { repo: 'alpha' },
				status: 200,
				url: 'http://markless.test/#/r/alpha/issues',
			},
		});

		// Well past MARKLESS_NAV_SETTLE_DEADLINE_MS (250): a navigation would have
		// swapped to @pending by now; the boot swap must still be holding.
		await new Promise((resolve) => setTimeout(resolve, 350));
		expect(mounted).toBeUndefined();
		expect(pendingHolds).toBe(0);

		settle();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(mounted).toBe('destination-root');
		expect(pendingHolds).toBe(0);
	});
});
