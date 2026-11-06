import type { Children } from '@markless/core';
import { computed, state } from '@markless/core';

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function Button({ onClick, children }: { readonly onClick?: () => void; readonly children?: Children }) @{
	<button type="button" data-save onClick={onClick}>{children}</button>
}

// A handler that returns before writing, authored on a forwarded prop: the mark still clears,
// and nothing refetches.
export function WrapperEarlyReturn() @{
	let ok = state(true);
	let reload = state(0);
	const total = computed(async () => {
		reload;
		await delay(10);
		return 10 + reload;
	});

	<div>
		<button type="button" data-toggle onClick={() => (ok = !ok)}>Toggle</button>
		<Button
			onClick={async () => {
				await delay(30);
				if (!ok) return;
				reload = reload + 1;
			}}
		>
			Save
		</Button>
		@try {
			<p data-total>{total}</p>
		} @pending {
			<p data-pending>Loading</p>
		} @catch {
			<p data-failed>Failed</p>
		}
	</div>
}
