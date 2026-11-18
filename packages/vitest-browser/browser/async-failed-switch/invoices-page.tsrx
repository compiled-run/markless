import { state } from '@markless/core';
import Invoices from './invoices.tsrx';

export default function InvoicesPage() @{
	let reload = state(0);

	<main>
		<button data-reload onClick={() => reload++}>reload</button>
		<Invoices reload={reload} />
	</main>
}
