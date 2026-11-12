import { computed, state } from '@markless/core';

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// A poll the attach starts, with no click: its ticks refresh quietly.
export function AttachPoll() @{
	let tick = state(0);
	const feed = computed(async () => {
		const key = tick;
		await delay(600);
		return 100 + key;
	});

	<div
		attach={() => {
			const id = setInterval(() => (tick = tick + 1), 1_000);
			return () => clearInterval(id);
		}}
		onVisible={() => {}}
	>
		@try {
			<p data-feed>{feed}</p>
		} @pending {
			<p data-pending>Loading</p>
		}
	</div>
}
