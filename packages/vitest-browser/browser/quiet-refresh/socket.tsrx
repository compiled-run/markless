import { computed, state } from '@markless/core';

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// A socket message callback is not a repeating timer, so its refresh is loud; the fetch outlasts the settle deadline.
export function Socket() @{
	let tick = state(0);
	const feed = computed(async () => {
		const key = tick;
		await delay(300);
		return 'live-' + key;
	});

	<div>
		<button
			type="button"
			data-connect
			onClick={() => {
				window.addEventListener('mock-socket-message', () => (tick = tick + 1));
			}}
		>
			Connect
		</button>
		@try {
			<p data-feed>{feed}</p>
		} @pending {
			<p data-pending>Loading</p>
		}
	</div>
}
