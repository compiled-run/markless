import { state } from '@markless/core';
import { Entry } from './entry.tsrx';

export default function Ledger() @{
	let round = state(1);
	let accounts = state([
		{ code: 'x9', name: 'Rent' },
		{ code: 'k2', name: 'Food' },
	]);

	<div>
		<ol>
			@for (const account of accounts; key account.code) {
				<Entry round={round} name={account.name} code={account.code} />
			}
		</ol>
		<button data-open-account onClick={() => (accounts = [{ code: `q${accounts.length}`, name: accounts.length > 2 ? 'Broken' : 'Travel' }, ...accounts])}>Open</button>
		<button data-recount onClick={() => round++}>Recount</button>
	</div>
}
