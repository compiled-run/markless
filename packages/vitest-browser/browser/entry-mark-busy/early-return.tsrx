import { computed, state } from '@markless/core';

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// A handler that returns before reaching its write: the mark clears, and nothing refetches.
export function EarlyReturn() @{
	let ok = state(true);
	let reload = state(0);
	const total = computed(async () => {
		reload;
		await delay(10);
		return 10 + reload;
	});

	<div>
		<button type="button" data-toggle onClick={() => (ok = !ok)}>Toggle</button>
		<button
			type="button"
			data-save
			onClick={async () => {
				await delay(30);
				if (!ok) return;
				reload = reload + 1;
			}}
		>
			Save
		</button>
		@try {
			<p data-total>{total}</p>
		} @pending {
			<p data-pending>Loading</p>
		} @catch {
			<p data-failed>Failed</p>
		}
	</div>
}
