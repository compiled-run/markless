import { computed, state } from '@markless/core';
import Pill from './pill.tsrx';
import { getInvoices } from './gate.ts';

export default function Pager({ reload }: { reload: number }) @{
	let page = state(1);
	const invoices = computed(async () => await getInvoices(page, reload));

	<div>
		@try {
			<span data-shown>{invoices.page}</span>
		} @pending {
			<span>wait</span>
		}
		@try {
			<Pill tone="next" disabled={invoices.page >= invoices.pages} onClick={() => (page = invoices.page + 1)}>Next</Pill>
		} @pending {
			<Pill tone="wait" disabled>Next</Pill>
		}
	</div>
}
