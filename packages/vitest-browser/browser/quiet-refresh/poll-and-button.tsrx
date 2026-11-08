import { computed, state } from '@markless/core';

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Timer ticks refresh quietly and a click loudly; the fetch outlasts the settle deadline and the poll interval outlasts the fetch.
export function PollAndButton() @{
	let poll = state(0);
	const orders = computed(async () => {
		const key = poll;
		await delay(300);
		return 100 + key;
	});

	<div>
		<button
			type="button"
			data-start-poll
			onClick={() => {
				setInterval(() => (poll = poll + 1), 1_000);
			}}
		>
			Start polling
		</button>
		<button type="button" data-refresh onClick={() => (poll = poll + 1)}>
			Refresh now
		</button>
		@try {
			<p data-orders>{orders}</p>
		} @pending {
			<p data-pending>Loading</p>
		}
	</div>
}
