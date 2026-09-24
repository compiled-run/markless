import { computed, state } from '@markless/core';

function Stamp({ label }) @{
	let hits = state(0);
	const shown = computed(() => `${label}-${hits}`);

	<b data-stamp onClick={() => hits = hits + 1}>{shown}</b>
}

export function App() @{
	let armed = state(false);
	const ledger = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 10));
		return { value: 'Ledger flip', status: 'open flip' };
	});

	<section>
		<button type="button" data-arm onClick={() => armed = !armed}>Arm</button>
		@try {
			<h2 data-ledger-value>{ledger.value}</h2>
			<em data-ledger-status>{ledger.status}</em>
			@if (armed) { <Stamp label="stamp" /> }
		} @pending {
			<p data-ledger-wait>Counting</p>
		}
	</section>
}
