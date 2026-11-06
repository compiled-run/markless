import { computed, state } from '@markless/core';

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// submit-quiet-design.md Q1 option 1: `await save(); reload++` marks the balance busy from the click.
export function SubmitMark() @{
	let reload = state(0);
	const balance = computed(async () => {
		reload;
		await delay(10);
		return 100 + reload;
	});

	<div>
		<button
			type="button"
			data-save
			onClick={async () => {
				await delay(40);
				reload = reload + 1;
			}}
		>
			Save
		</button>
		@try {
			<p data-balance>{balance}</p>
		} @pending {
			<p data-pending>Loading</p>
		} @catch {
			<p data-failed>Failed</p>
		}
	</div>
}
