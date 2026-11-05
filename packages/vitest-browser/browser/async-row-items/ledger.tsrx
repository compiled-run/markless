import { computed, state } from '@markless/core';
import { balanceOf } from './fetch-accounts.ts';

function Entry({ account, round }: { account: { code: string; name: string }; round: number }) @{
	const balance = computed(async () => await balanceOf(account.name, round));

	<li data-entry={account.code}>
		@try {
			<span data-balance>{balance}</span>
		} @pending {
			<em data-balance-pending>counting</em>
		} @catch {
			<b data-balance-failed>failed</b>
		}
	</li>
}

export default function Ledger() @{
	let round = state(1);
	let accounts = state([
		{ code: 'x9', name: 'Rent' },
		{ code: 'k2', name: 'Food' },
	]);

	<div>
		<ol>
			@for (const account of accounts; key account.code) {
				<Entry account={account} round={round} />
			}
		</ol>
		<button data-open onClick={() => (accounts = [...accounts, { code: `q${accounts.length}`, name: accounts.length > 2 ? 'Broken' : 'Travel' }])}>Open</button>
		<button data-recount onClick={() => round++}>Recount</button>
	</div>
}
