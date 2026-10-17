import { state } from '@markless/core';

export function Row({ label, onActions }: { readonly label: string; readonly onActions: () => void }) @{
	let open = state(false);
	let after = state(0);
	<div>
		<button data-trigger={label} type="button" onPointerdown={() => {
			open = !open;
			onActions();
			after = after + 1;
		}}>{label}</button>
		<output data-open={label}>{open ? 'open' : 'closed'}</output>
		<output data-after={label}>{after}</output>
	</div>
}
