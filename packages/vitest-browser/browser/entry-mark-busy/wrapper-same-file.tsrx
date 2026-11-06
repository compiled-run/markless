import type { Children } from '@markless/core';
import { computed, state } from '@markless/core';

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function Button({ onClick, children }: { readonly onClick?: () => void; readonly children?: Children }) @{
	<button type="button" data-save onClick={onClick}>{children}</button>
}

// The handler that writes `reload` is authored on `Button`'s `onClick` prop, one component away
// from the native element `Button` forwards it onto by name.
export function WrapperSameFile() @{
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
