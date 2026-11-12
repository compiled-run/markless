import { computed, state } from '@markless/core';

export default function TallyCard() @{
	let round = state(1);
	const tally = computed(async () => {
		const at = round;
		await new Promise((resolve) => setTimeout(resolve, at === 1 ? 10 : 700));
		return { sum: at * 10 };
	});
	const label = computed(() => 'Total ' + tally.sum);

	<div>
		<button type="button" data-round onClick={() => (round = 2)}>Next round</button>
		@try {
			<>
				<h3 data-label>{label}</h3>
				<p data-rules>Highest wins</p>
			</>
		} @catch {
			<p data-failed>Tally failed</p>
		}
	</div>
}
