import { afterEach, expect, test } from 'vitest';
import { dispatchRouteUpdate, startRouteUpdateRenderer } from '@markless/core/router';
import AlphaPage from './fixtures/nav-page-alpha.tsrx?markless-route';
import LedgerPage from './fixtures/async-value-field-route.tsrx?markless-route';

const iframes: HTMLIFrameElement[] = [];

afterEach(() => {
	for (const iframe of iframes.splice(0)) iframe.remove();
});

function createRouteDocument(): Document {
	const iframe = document.createElement('iframe');
	document.body.appendChild(iframe);
	iframes.push(iframe);
	const routeDocument = iframe.contentDocument;
	if (!routeDocument) throw new Error('Expected the iframe to expose a document.');
	startRouteUpdateRenderer(routeDocument);
	return routeDocument;
}

function navigateTo(routeDocument: Document, page: unknown, pathname: string): void {
	dispatchRouteUpdate(routeDocument, {
		page: { default: page },
		route: {
			file: `pages${pathname}.tsrx`,
			params: {},
			status: 200,
			url: `http://localhost${pathname}`,
		},
	});
}

function ledgerView(routeDocument: Document) {
	return {
		value: routeDocument.querySelector('[data-ledger-value]')?.textContent,
		status: routeDocument.querySelector('[data-ledger-status]')?.textContent,
		entries: [...routeDocument.querySelectorAll('[data-ledger-entry]')].map(
			(node) => node.textContent,
		),
	};
}

test('client navigation reads resolved fields named like snapshot keys', async () => {
	const routeDocument = createRouteDocument();
	navigateTo(routeDocument, AlphaPage, '/alpha');
	await expect
		.poll(() => routeDocument.querySelector('[data-nav-settled="alpha"]'))
		.not.toBeNull();

	const settled = { value: 'Ledger route', status: 'open route', entries: ['r1', 'r2'] };
	navigateTo(routeDocument, LedgerPage, '/ledger');
	await expect.poll(() => ledgerView(routeDocument)).toEqual(settled);

	navigateTo(routeDocument, AlphaPage, '/alpha');
	await expect.poll(() => routeDocument.querySelector('[data-ledger-page]')).toBeNull();
	navigateTo(routeDocument, LedgerPage, '/ledger');
	await expect.poll(() => ledgerView(routeDocument)).toEqual(settled);
});
