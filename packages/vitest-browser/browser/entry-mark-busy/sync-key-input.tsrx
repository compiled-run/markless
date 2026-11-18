import { computed, state } from '@markless/core';

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// The write reaches the key through a sync computed between it and the async recipe.
export function SyncKeyInput() @{
	let page = state(1);
	const pageKey = computed(() => 'p' + page);
	const rows = computed(async () => {
		const key = pageKey;
		await delay(10);
		return 'rows-' + key;
	});

	<div>
		<button
			type="button"
			data-next
			onClick={async () => {
				await delay(25);
				page = page + 1;
			}}
		>
			Next
		</button>
		@try {
			<p data-rows>{rows}</p>
		} @pending {
			<p data-pending>Loading</p>
		} @catch {
			<p data-failed>Failed</p>
		}
	</div>
}
