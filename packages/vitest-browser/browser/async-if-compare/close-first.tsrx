import { computed, state } from '@markless/core';

async function findOrder(round: number): Promise<{ code: string } | null> {
	await new Promise((resolve) => setTimeout(resolve, 20));
	return round % 2 === 0 ? null : { code: `order ${round}` };
}

export default function OrderPane() @{
	let round = state(1);
	const order = computed(async () => await findOrder(round));

	<article>
		<button type="button" data-next onClick={() => round++}>Next</button>
		@try {
			<div>
				@if (order !== null) {
					<p data-strict>{order?.code}</p>
				} @else {
					<p data-strict-else>none</p>
				}
				<section>
					@if (order != null) {
						<p data-loose>some</p>
					}
				</section>
			</div>
		} @pending {
			<p data-loading>Loading</p>
		}
	</article>
}
