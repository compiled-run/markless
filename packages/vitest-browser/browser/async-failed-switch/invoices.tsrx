import { computed, state } from '@markless/core';
import { getInvoices } from './gate.ts';

export default function Invoices({ reload }: { reload: number }) @{
	const view = state({ page: 1, usd: false, selected: [] as string[] });
	const invoices = computed(async () => await getInvoices(view.page, reload));
	const pageLabel = computed(() => `Page ${invoices.page} of ${invoices.pages}`);
	const nav = computed(() => ({ hasPrev: invoices.page > 1, hasNext: invoices.page < invoices.pages }));
	const switchState = computed(() => (view.usd ? 'checked' : 'unchecked'));

	<div>
		<button role="switch" aria-checked={view.usd ? 'true' : 'false'} data-state={switchState} onClick={() => (view.usd = !view.usd)}>usd</button>
		<table>
			<tbody>
				@try {
					@for (const invoice of invoices.rows; key invoice.id) {
						<tr data-state={view.selected.includes(invoice.id) ? 'selected' : 'idle'}>
							<td>
								<button
									role="checkbox"
									aria-checked={view.selected.includes(invoice.id) ? 'true' : 'false'}
									aria-label={`Select ${invoice.id}`}
									onClick={() =>
										(view.selected = view.selected.includes(invoice.id)
											? view.selected.filter((other) => other !== invoice.id)
											: [...view.selected, invoice.id])}
								>
									<span>x</span>
								</button>
							</td>
							<td data-id>{invoice.id}</td>
							<td data-amount>{view.usd ? invoice.usd : invoice.eur}</td>
						</tr>
					}
				} @pending {
					<tr><td>loading</td></tr>
				} @catch {
					<tr><td data-alert>Couldn't load the next page.</td></tr>
				}
			</tbody>
		</table>
		@try {
			<span data-page-label>{pageLabel}</span>
		} @pending {
			<span>Page</span>
		}
		@try {
			<button data-prev disabled={!nav.hasPrev} onClick={() => (view.page = invoices.page - 1)}>Previous</button>
		} @pending {
			<button disabled>Previous</button>
		}
		@try {
			<button data-next disabled={!nav.hasNext} onClick={() => (view.page = invoices.page + 1)}>Next</button>
		} @pending {
			<button disabled>Next</button>
		}
	</div>
}
