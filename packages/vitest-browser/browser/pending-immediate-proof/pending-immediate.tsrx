import { computed, state } from '@markless/core';
import { wait } from './latency-api.ts';

// The top-level Slow is a first client-rendered mount; each row added by the
// button is a newly created row — both are "nothing on screen for that spot"
// cases, never a refresh of settled content.
function Slow() @{
	const value = computed(async () => {
		await wait();
		return 'Loaded';
	});

	<div data-slow>
		@try {
			<span data-content>{value}</span>
		} @pending {
			<span data-pending>Pending</span>
		}
	</div>
}

export default function PendingImmediateProof() @{
	let rows = state<number[]>([]);

	<main>
		<button type="button" data-add onClick={() => (rows = [...rows, rows.length])}>
			Add row
		</button>
		<div data-mount-slot>
			<Slow />
		</div>
		@for (const row of rows; key row) {
			<div data-row-slot>
				<Slow />
			</div>
		}
	</main>
}
