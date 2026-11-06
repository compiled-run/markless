import type { Children } from '@markless/core';
import { computed, state } from '@markless/core';

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function Inner({ onClick, children }: { readonly onClick?: () => void; readonly children?: Children }) @{
	<button type="button" data-save onClick={onClick}>{children}</button>
}

// Two forwarding hops: Outer hands the same prop to Inner, which is the one that finally
// forwards it onto the native element.
function Outer({ onClick, children }: { readonly onClick?: () => void; readonly children?: Children }) @{
	<Inner onClick={onClick}>{children}</Inner>
}

export function NestedWrappers() @{
	let reload = state(0);
	const balance = computed(async () => {
		reload;
		await delay(10);
		return 100 + reload;
	});

	<div>
		<Outer
			onClick={async () => {
				await delay(40);
				reload = reload + 1;
			}}
		>
			Save
		</Outer>
		@try {
			<p data-balance>{balance}</p>
		} @pending {
			<p data-pending>Loading</p>
		} @catch {
			<p data-failed>Failed</p>
		}
	</div>
}
