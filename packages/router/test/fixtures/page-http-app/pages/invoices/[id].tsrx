import { state } from '@markless/core';
import type { PageProps } from '@markless/router';
import { findInvoice } from '../../src/invoices.ts';

export default function Invoice({ params, http }: PageProps<{ id: string }>) @{
	const invoice = findInvoice(params.id);
	if (!invoice) {
		http.response.status = 404;
		http.response.headers.set('cache-control', 'no-store');
	}
	http.response.headers.set('x-invoice', params.id);
	const title = invoice ? `Invoice ${invoice.number}` : `No invoice ${params.id}`;
	const requestId = (http.locals as { requestId?: string }).requestId ?? 'none';
	let taps = state(0);

	<main data-page="invoice">
		<h1 data-title>{title}</h1>
		<p data-request-id>{requestId}</p>
		<button type="button" data-tap onClick={() => console.log(params.id, taps++)}>
			{taps}
		</button>
	</main>
}
