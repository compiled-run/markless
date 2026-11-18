import { computed, state } from '@markless/core';

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// A heartbeat that waits on the network each tick, so one of its ticks is always mid-await.
async function ping(): Promise<void> {
	await delay(2_000);
}

// A filter click (a listener the attach added, as a widget library would) made while a poll's tick is still waiting is marked and announced.
export function PollAwaiting() @{
	let filter = state('all');
	const orders = computed(async () => {
		const shown = filter;
		await delay(600);
		return 'orders: ' + shown;
	});

	<div>
		<button
			type="button"
			data-start-poll
			onClick={() => {
				setInterval(async () => {
					await ping();
				}, 50);
			}}
		>
			Start heartbeat
		</button>
		<button
			type="button"
			data-open
			attach={(element: HTMLElement) => {
				const open = () => (filter = 'open');
				element.addEventListener('click', open);
				element.setAttribute('data-listening', '');
				return () => element.removeEventListener('click', open);
			}}
			onVisible={() => {}}
		>
			Open only
		</button>
		@try {
			<p data-orders>{orders}</p>
		} @pending {
			<p data-pending>Loading</p>
		}
	</div>
}
