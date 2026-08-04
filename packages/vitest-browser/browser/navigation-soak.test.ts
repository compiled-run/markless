import { expect, test } from 'vitest';
import { dispatchRouteUpdate, startRouteUpdateRenderer } from '@markless/core/router';
import SlowPage from './fixtures/nav-page-slow.tsrx?markless-route';
import AlphaPage from './fixtures/nav-soak-alpha.tsrx?markless-route';
import BetaPage from './fixtures/nav-soak-beta.tsrx?markless-route';

// T116 best-effort 6 — SOAK: many nav/settle cycles through the full D8
// route-swap machinery (hold -> settle -> swap commit) must not accumulate
// document/window-level listeners or DOM. Per-element listeners die with
// their replaced page roots; what CAN leak across swaps are registrations on
// the long-lived document/window and stray body children — so those are the
// asserted invariants. INTEGRATION-ONLY: ordering/counting assertions, no
// real-wait duration assertions (timing semantics live in the fake-clock
// suites, see packages/router/test/navigation-hold.test.ts).
//
// Dedicated 1ms fixtures keep all 300 fast round-trips cheap while crossing
// a macrotask, which is load-bearing: synchronous or microtask-only settle
// would skip the destination hold machinery. A smaller deadline-branch soak
// also alternates through the existing slow fixture so honest @pending swaps
// and their later settle commits are covered by the same flatness checks.
const SOAK_CYCLES = 300;
const SLOW_SOAK_CYCLES = 10;

test(
	'navigation soak: document/window listeners and DOM stay flat across swap cycles',
	{ timeout: 120_000 },
	async () => {
		const iframe = document.createElement('iframe');
		iframe.style.width = '640px';
		iframe.style.height = '480px';
		document.body.appendChild(iframe);
		try {
			const routeDocument = iframe.contentDocument;
			const routeWindow = iframe.contentWindow as (Window & typeof globalThis) | null;
			if (!routeDocument || !routeWindow) throw new Error('Expected a live iframe document.');

			// Net registration accounting on the LONG-LIVED targets only.
			let netListeners = 0;
			for (const target of [routeDocument, routeWindow] as const) {
				const originalAdd = target.addEventListener.bind(target);
				const originalRemove = target.removeEventListener.bind(target);
				(target as EventTarget).addEventListener = ((
					...args: Parameters<EventTarget['addEventListener']>
				) => {
					netListeners++;
					return originalAdd(...args);
				}) as EventTarget['addEventListener'];
				(target as EventTarget).removeEventListener = ((
					...args: Parameters<EventTarget['removeEventListener']>
				) => {
					netListeners--;
					return originalRemove(...args);
				}) as EventTarget['removeEventListener'];
			}

			startRouteUpdateRenderer(routeDocument);

			const settle = async (marker: string) => {
				const startedAt = performance.now();
				while (performance.now() - startedAt < 10_000) {
					if (routeDocument.body.innerHTML.includes(marker)) return;
					await new Promise((resolve) => setTimeout(resolve, 4));
				}
				throw new Error(`Soak cycle timed out waiting for ${marker}.`);
			};
			const navigate = (page: unknown, pathname: string) =>
				dispatchRouteUpdate(routeDocument, {
					page: { default: page },
					route: {
						file: `pages${pathname}.tsrx`,
						params: {},
						status: 200,
						url: `http://localhost${pathname}`,
					},
				});

			navigate(AlphaPage, '/alpha');
			await settle('data-nav-settled="soak-alpha"');

			// Fast-path warmup also proves the destination crosses a macrotask:
			// synchronously after dispatch, it is not settled and the outgoing
			// page remains mounted under the navigation hold.
			navigate(BetaPage, '/beta');
			expect(routeDocument.body.innerHTML).not.toContain(
				'data-nav-settled="soak-beta"',
			);
			expect(routeDocument.body.innerHTML).toContain('data-nav-page="soak-alpha"');
			await settle('data-nav-settled="soak-beta"');
			navigate(AlphaPage, '/alpha');
			expect(routeDocument.body.innerHTML).not.toContain(
				'data-nav-settled="soak-alpha"',
			);
			expect(routeDocument.body.innerHTML).toContain('data-nav-page="soak-beta"');
			await settle('data-nav-settled="soak-alpha"');

			// Warm the deadline-fired path before capturing baselines. Seeing the
			// slow pending arm before its settled arm directly proves this route
			// missed the deadline and committed honest pending UI.
			navigate(SlowPage, '/slow');
			await settle('data-nav-pending="slow"');
			expect(routeDocument.body.innerHTML).not.toContain('data-nav-settled="slow"');
			await settle('data-nav-settled="slow"');
			navigate(AlphaPage, '/alpha');
			await settle('data-nav-settled="soak-alpha"');

			// Baselines AFTER one fast and one slow round-trip (lazy runtimes warmed).
			const listenerBaseline = netListeners;
			const nodeBaseline = routeDocument.body.querySelectorAll('*').length;
			const bodyChildBaseline = routeDocument.body.childNodes.length;

			for (let cycle = 0; cycle < SOAK_CYCLES; cycle++) {
				navigate(BetaPage, '/beta');
				await settle('data-nav-settled="soak-beta"');
				navigate(AlphaPage, '/alpha');
				await settle('data-nav-settled="soak-alpha"');
			}

			for (let cycle = 0; cycle < SLOW_SOAK_CYCLES; cycle++) {
				navigate(SlowPage, '/slow');
				if (cycle === 0) {
					await settle('data-nav-pending="slow"');
					expect(routeDocument.body.innerHTML).not.toContain(
						'data-nav-settled="slow"',
					);
				}
				await settle('data-nav-settled="slow"');
				navigate(AlphaPage, '/alpha');
				await settle('data-nav-settled="soak-alpha"');
			}

			// Flat, not merely sub-linear: swaps must not add ANY lasting
			// document/window listeners or body nodes once warmed.
			expect(netListeners - listenerBaseline, 'document/window listener growth').toBe(0);
			expect(routeDocument.body.querySelectorAll('*').length, 'element count').toBe(
				nodeBaseline,
			);
			expect(routeDocument.body.childNodes.length, 'body child count').toBe(
				bodyChildBaseline,
			);
		} finally {
			iframe.remove();
		}
	},
);
