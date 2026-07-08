import { afterEach, expect, test } from 'vitest';
import { dispatchRouteUpdate, startRouteUpdateRenderer } from '@markless/core/router';
import { cleanup, render } from '../src/index.ts';
import HarborPage from './fixtures/harbor-page.tsrx';
import HarborRoute from './fixtures/harbor-route.tsrx';
import SquallPage from './fixtures/squall-page.tsrx';

// Shell-decomposition T003 reproducer: a composed child that owns TWO async
// boundaries (its own computed per boundary). On a CSR mount every boundary
// must settle — observed against @markless/*@0.1.1: the child's boundary:0
// settles but boundary:1+ never commit (pending arm stays forever) while the
// SSR/streamed path settles all of them. The dashboard restructure works
// around it with single-boundary chrome components; this test pins the gap.
afterEach(() => cleanup());

test('CSR: BOTH boundaries of one composed child settle (boundary:0 and boundary:1)', async () => {
	const screen = await render(HarborPage);
	const container = screen.container as HTMLElement;

	// CSR mount paints all pending arms.
	expect(container.querySelector('[data-temp-wait]')?.textContent).toBe('reading');
	expect(container.querySelector('[data-wind-wait]')?.textContent).toBe('reading');

	// The page boundary and the child's FIRST boundary settle.
	await expect.poll(() => container.querySelector('[data-tide]')?.textContent).toBe('high');
	await expect
		.poll(() => container.querySelector('[data-temp]')?.textContent)
		.toBe('21C:north-pier');

	// The child's SECOND boundary must settle too (the gap under test).
	await expect
		.poll(() => container.querySelector('[data-wind]')?.textContent, { timeout: 3000 })
		.toBe('9kn:north-pier');
});

test('ROUTE SWAP: BOTH boundaries of one composed child settle after a client route swap', async () => {
	// The route renderer targets a dedicated iframe document (same harness as
	// navigation-transitions.test.ts) — this is the path the dashboard's hash
	// boot swap takes, including the D8 hold and settle tracker.
	const iframe = document.createElement('iframe');
	iframe.style.width = '640px';
	iframe.style.height = '480px';
	document.body.appendChild(iframe);
	const routeDocument = iframe.contentDocument;
	if (!routeDocument) throw new Error('Expected the iframe to expose a document.');
	try {
		startRouteUpdateRenderer(routeDocument);
		dispatchRouteUpdate(routeDocument, {
			page: { default: HarborRoute },
			route: {
				file: 'pages/harbor/[pier].tsrx',
				params: { pier: 'north-pier' },
				status: 200,
				url: 'http://localhost/harbor/north-pier',
			},
		});
		const body = () => routeDocument.body;
		await expect.poll(() => body().querySelector('[data-tide]')?.textContent).toBe('high:north-pier');
		await expect
			.poll(() => body().querySelector('[data-temp]')?.textContent)
			.toBe('21C:north-pier');
		await expect
			.poll(() => body().querySelector('[data-wind]')?.textContent, { timeout: 3000 })
			.toBe('9kn:north-pier');
	} finally {
		iframe.remove();
	}
});

// LEDGERED compiler gap (flips this test loudly when fixed — then inline the
// shape back into gauge-strip and delete this pin): state lowering misses a
// prop read nested inside an optional-chained call
// (`squallOf(x, params.pier)?.force`), so the emitted runner symbol references
// `params` raw and rejects with ReferenceError on CSR runs. SSR masks it
// because component bodies execute inline with props in scope. The dashboard
// hoists such reads to statements (`const repo = repoOf(view, params.repo)`),
// which lowering handles correctly.
test.fails('LEDGERED: prop read inside an optional-chained call lowers into the runner symbol', async () => {
	const screen = await render(SquallPage);
	const container = screen.container as HTMLElement;
	await expect
		.poll(() => container.querySelector('[data-squall]')?.textContent, { timeout: 2000 })
		.toBe('7');
});
