import { computed, state } from '@markless/core';

export default function NestedTryStreamedPage() @{
	let round = state(0);
	const harbor = computed(async () => {
		const at = round;
		await new Promise((resolve) => setTimeout(resolve, 60));
		return { name: 'Harbor ' + at };
	});
	const tide = computed(async () => {
		const at = round;
		await new Promise((resolve) => setTimeout(resolve, 160));
		return { level: 'Tide ' + at };
	});
	<main>
		<button type="button" data-round onClick={() => (round = round + 1)}>Next</button>
		@try {
			<section>
				<h2 data-harbor>{harbor.name}</h2>
				@try {
					<p data-tide>{tide.level}</p>
				} @pending {
					<p data-tide-wait>charting tide</p>
				}
			</section>
		} @pending {
			<p data-harbor-wait>mapping harbor</p>
		}
		@if (round > 0) {
			<em data-after>after round {round}</em>
		}
	</main>
}
