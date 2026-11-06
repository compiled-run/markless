import { computed, state } from '@markless/core';

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Two clicks during the same wait both count: the mark never drops between them.
export function TwoClicks() @{
	let reload = state(0);
	const total = computed(async () => {
		reload;
		await delay(15);
		return 40 + reload;
	});

	<div>
		<button
			type="button"
			data-save
			onClick={async () => {
				await delay(20);
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
