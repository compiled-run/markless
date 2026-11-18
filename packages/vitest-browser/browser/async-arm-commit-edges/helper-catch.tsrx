import { computed, state } from '@markless/core';
import { tally } from './gated.ts';

function Tally({ label, round }: { label: string; round: number }) @{
	const total = computed(async () => await tally(label, round));
	@try {
		<b data-total>{total}</b>
	} @pending {
		<i>adding</i>
	} @catch (error, reset) {
		<p data-error>
			<span data-message>{error.message}</span>
			<button data-retry onClick={reset}>retry</button>
		</p>
	}
}

export default function HelperCatch() @{
	let round = state(0);
	<main>
		<button data-again onClick={() => round++}>again</button>
		<input data-field />
		<Tally label="rent" round={round} />
	</main>
}
