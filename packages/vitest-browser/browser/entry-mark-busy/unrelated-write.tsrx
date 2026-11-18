import { computed, state } from '@markless/core';

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// A handler that writes a state no visible async value's key reads: nothing is ever marked.
export function UnrelatedWrite() @{
	let reload = state(0);
	let note = state('idle');
	const total = computed(async () => {
		reload;
		await delay(10);
		return 30 + reload;
	});

	<div>
		<button
			type="button"
			data-note
			onClick={async () => {
				await delay(20);
				note = 'noted';
			}}
		>
			Note
		</button>
		<p data-note-text>{note}</p>
		@try {
			<p data-total>{total}</p>
		} @pending {
			<p data-pending>Loading</p>
		} @catch {
			<p data-failed>Failed</p>
		}
	</div>
}
