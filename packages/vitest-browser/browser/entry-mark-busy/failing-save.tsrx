import { computed, state } from '@markless/core';

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// A handler whose save rejects before its write: the mark clears, and nothing refetches either.
export function FailingSave() @{
	let reload = state(0);
	let shouldFail = state(true);
	const total = computed(async () => {
		reload;
		await delay(10);
		return 20 + reload;
	});

	<div>
		<button type="button" data-allow onClick={() => (shouldFail = false)}>Allow</button>
		<button
			type="button"
			data-save
			onClick={async () => {
				await delay(20);
				if (shouldFail) throw new Error('save failed');
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
