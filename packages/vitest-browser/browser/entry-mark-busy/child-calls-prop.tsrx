import type { Children } from '@markless/core';
import { computed, state } from '@markless/core';

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// `Button` never forwards the prop onto an attribute by name: its own click handler calls it.
function Button({ onSave, children }: { readonly onSave?: () => void; readonly children?: Children }) @{
	<button type="button" data-save onClick={() => { onSave?.(); }}>{children}</button>
}

export function ChildCallsProp() @{
	let reload = state(0);
	const balance = computed(async () => {
		reload;
		await delay(10);
		return 100 + reload;
	});

	<div>
		<Button
			onSave={async () => {
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
