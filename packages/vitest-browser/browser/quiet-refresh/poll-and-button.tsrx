import { computed, state } from '@markless/core';

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// submit-quiet-design.md Q2: a write a timer makes starts a quiet refresh (no busy, no
// announcement); the same value refreshed by a click starts a loud one, same as before.
// Starting the timer happens inside a click too, but that click's own turn ends (and its
// mark clears) long before any later tick runs, so the ticks themselves stay quiet.
// The fetch is slow enough (over the 250ms pending-settle deadline) that a one-off loud
// refresh renders "Updating…" before it renders "Updated"; the poll interval is slower
// still, so a tick's own fetch always lands before the next tick starts a new one.
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
