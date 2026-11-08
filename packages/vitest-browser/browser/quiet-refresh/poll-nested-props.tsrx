import { computed, state } from '@markless/core';

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// `onTick` is an unfilled callback slot reached through capture-slot dispatch, whoever calls it.
function Child({ onTick }: { readonly onTick?: () => void }) @{
	<div>
		<button
			type="button"
			data-start-poll
			onClick={() => {
				setInterval(() => {
					onTick?.();
				}, 1_000);
			}}
		>
			Start polling
		</button>
		<button
			type="button"
			data-connect
			onClick={() => {
				window.addEventListener('mock-socket-message', () => {
					onTick?.();
				});
			}}
		>
			Connect
		</button>
		<button type="button" data-refresh onClick={() => onTick?.()}>
			Refresh now
		</button>
		<button
			type="button"
			data-refresh-later
			onClick={async () => {
				await delay(30);
				onTick?.();
			}}
		>
			Refresh after a wait
		</button>
	</div>
}

function Outer({ onTick }: { readonly onTick?: () => void }) @{
	<Child onTick={onTick} />
}

// The same callers two forwarding hops away, with a callback that itself awaits before writing.
export function PollThroughNestedProps() @{
	let poll = state(0);
	const orders = computed(async () => {
		const key = poll;
		await delay(300);
		return 100 + key;
	});

	<div>
		<Outer
			onTick={async () => {
				await delay(20);
				poll = poll + 1;
			}}
		/>
		@try {
			<p data-orders>{orders}</p>
		} @pending {
			<p data-pending>Loading</p>
		}
	</div>
}
