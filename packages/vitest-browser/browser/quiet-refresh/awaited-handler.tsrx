import { computed, state } from '@markless/core';

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// A write after the handler's own `await` is still the user's action, so its refresh is loud; the fetch outlasts the settle deadline.
export function AwaitedHandler() @{
	let reload = state(0);
	const total = computed(async () => {
		const key = reload;
		await delay(300);
		return 100 + key;
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
		}
	</div>
}
