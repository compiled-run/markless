import { computed, state } from '@markless/core';

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// A failed quiet refresh keeps content with @catch after it and still announces, since a silently broken poll is worse.
export function FailingPoll() @{
	let poll = state(0);
	const orders = computed(async () => {
		const key = poll;
		await delay(10);
		if (key === 1) throw new Error('orders down');
		return 100 + key;
	});

	<div>
		<button
			type="button"
			data-start-poll
			onClick={() => {
				setInterval(() => (poll = poll + 1), 20);
			}}
		>
			Start polling
		</button>
		@try {
			<p data-orders>{orders}</p>
		} @pending {
			<p data-pending>Loading</p>
		} @catch {
			<p data-failed>Failed</p>
		}
	</div>
}
