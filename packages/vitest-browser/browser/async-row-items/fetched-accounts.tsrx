import { computed } from '@markless/core';
import { balanceOf, listAccounts } from './fetch-accounts.ts';

export default function FetchedAccounts() @{
	const accounts = computed(async () => await listAccounts());

	<main>
		@try {
			<ul>
				@for (const account of accounts; key account.id) {
					<Holding account={account} />
				}
			</ul>
		} @pending {
			<p data-accounts-pending>loading</p>
		}
	</main>
}

function Holding({ account }: { account: { id: string; name: string } }) @{
	const worth = computed(async () => await balanceOf(account.name, 1));

	<li data-holding={account.id}>
		@try {
			<span data-worth>{worth}</span>
		} @pending {
			<em>valuing</em>
		}
	</li>
}
