import { computed } from '@markless/core';
import { lookUpBalance } from './fetch-shelf.ts';

export function Entry({ code, name, round }: { code: string; name: string; round: number }) @{
	const balance = computed(async () => await lookUpBalance(name, round));

	<li data-entry={code}>
		@try {
			<span data-balance>{balance}</span>
		} @pending {
			<em data-balance-pending>counting</em>
		} @catch {
			<b data-balance-failed>failed</b>
		}
	</li>
}
