import { state } from '@markless/core';

export function Panel({ label }: { readonly label: string }) @{
	let open = state(false);
	<button type="button" data-panel data-label={open ? label + ' (open)' : label} onClick={() => open = !open}>{open ? 'v' : '>'}</button>
}
