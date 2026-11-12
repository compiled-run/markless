import { computed, state } from '@markless/core';

async function findCustomer(id: number): Promise<{ name: string; plan: { tier: string } } | null> {
	await new Promise((resolve) => setTimeout(resolve, 20));
	return id === 0 ? null : { name: `customer ${id}`, plan: { tier: `tier ${id}` } };
}

export default function CustomerCard() @{
	let id = state(1);
	const customer = computed(async () => await findCustomer(id));

	<article>
		<button type="button" data-next onClick={() => id++}>Next</button>
		<button type="button" data-none onClick={() => (id = 0)}>None</button>
		@try {
			<p data-optional>{customer?.name}</p>
		} @pending {
			<p data-optional-loading>Loading</p>
		}
		@try {
			<p data-asserted title={customer!.plan.tier}>{customer!.plan.tier}</p>
		} @pending {
			<p data-asserted-loading>Loading</p>
		}
	</article>
}
