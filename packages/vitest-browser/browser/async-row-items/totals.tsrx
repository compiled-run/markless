import { computed } from '@markless/core';
import { balanceOf } from './fetch-accounts.ts';

function Total({ name }: { name: string }) @{
	const total = computed(async () => await balanceOf(name, 3));

	@try {
		<span data-total>{total}</span>
	} @pending {
		<em data-total-pending>adding</em>
	} @catch {
		<b data-total-failed>failed</b>
	}
}

export default function Totals() @{
	<main>
		<Total name="Rent" />
		<Total name="Broken" />
		<Total name="Food" />
	</main>
}
