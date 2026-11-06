import { computed, state } from '@markless/core';

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// submit-quiet-design.md Q2: the write a handler makes after its own `await` is still the
// user's action, so the refresh it starts is loud, same as a write made before any `await`.
// The fetch is slow enough (over the 250ms pending-settle deadline) to render "Updating…"
// before it renders "Updated".
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
