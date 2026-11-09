import { state } from '@markless/core';
import { AccountRow } from './account-row.tsrx';

export default function ImportedAccounts() @{
	let accounts = state([
		{ id: 'a1', name: 'Rent' },
		{ id: 'b2', name: 'Food' },
	]);

	<main>
		<ul>
			@for (const account of accounts; key account.id) {
				<AccountRow account={account} />
			}
		</ul>
		<button data-add onClick={() => (accounts = [...accounts, { id: `n${accounts.length}`, name: 'Travel' }])}>Add</button>
	</main>
}
