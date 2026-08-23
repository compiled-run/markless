import { afterEach, expect, test } from 'vitest';
import { dispatchRouteUpdate, startRouteUpdateRenderer } from '@markless/core/router';
import OptionalContextPage from './fixtures/optional-context-page.tsrx?markless-route';

// T115 / D2: a component inside a FALSY @if arm must never execute during a
// client-side render. The org-link defect: the page's settled arm rendered a
// chrome component without its optional `info` prop; the arm's child render
// ran unconditionally, threw on `info.owner.name`, the settle flush aborted,
// and the page showed its @pending arm forever ("endless Loading").

const iframes: HTMLIFrameElement[] = [];

afterEach(() => {
	for (const iframe of iframes.splice(0)) iframe.remove();
});

test('client mount settles when an optional-prop component sits in the falsy @if arm', async () => {
	const iframe = document.createElement('iframe');
	iframe.style.width = '640px';
	iframe.style.height = '480px';
	document.body.appendChild(iframe);
	iframes.push(iframe);
	const routeDocument = iframe.contentDocument;
	if (!routeDocument) throw new Error('Expected the iframe to expose a document.');
	startRouteUpdateRenderer(routeDocument);

	const pageErrors: unknown[] = [];
	iframe.contentWindow?.addEventListener('error', (event) =>
		pageErrors.push(event.error ?? event.message),
	);
	iframe.contentWindow?.addEventListener('unhandledrejection', (event) =>
		pageErrors.push(event.reason),
	);

	dispatchRouteUpdate(routeDocument, {
		page: { default: OptionalContextPage },
		route: {
			file: 'pages/optional-context-page.tsrx',
			params: {},
			status: 200,
			url: 'http://localhost/context',
		},
	});

	// The settled arm must commit: rows render, the @else context row shows,
	// and the pending arm is gone — the pre-fix crash left pending forever.
	// Polling the settled shape, not the first row to appear: one row in the DOM
	// does not mean the flush finished writing the rest.
	await expect
		.poll(() => routeDocument.querySelectorAll('[data-optional-row]').length, { timeout: 5000 })
		.toBe(2);
	await expect
		.poll(() => routeDocument.querySelector('[data-optional-anonymous]')?.textContent, {
			timeout: 5000,
		})
		.toBe('no context');
	expect(routeDocument.querySelector('[data-optional-owner]')).toBeNull();
	expect(routeDocument.querySelector('[data-optional-pending]')).toBeNull();
	expect(pageErrors).toEqual([]);
});
