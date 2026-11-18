import { computed } from '@markless/core';
import { balanceOf } from './fetch-accounts.ts';

export function AccountRow({ account }: { account: { id: string; name: string } }) @{
	const balance = computed(async () => await balanceOf(account.name, 1));

	<li data-account={account.id}>
		@try {
			<span data-account-balance>{balance}</span>
		} @pending {
			<em>counting</em>
		}
	</li>
}
