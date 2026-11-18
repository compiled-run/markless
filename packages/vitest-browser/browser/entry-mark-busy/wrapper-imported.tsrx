import { computed, state } from '@markless/core';
import { Button } from './button-part.tsrx';

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function WrapperImported() @{
	let reload = state(0);
	const balance = computed(async () => {
		reload;
		await delay(10);
		return 100 + reload;
	});

	<div>
		<Button
			onClick={async () => {
				await delay(40);
				reload = reload + 1;
			}}
		>
			Save
		</Button>
		@try {
			<p data-balance>{balance}</p>
		} @pending {
			<p data-pending>Loading</p>
		} @catch {
			<p data-failed>Failed</p>
		}
	</div>
}
