import { state } from '@markless/core';

export default function ToggleRow({ name }: { readonly name: string }) @{
	let open = state(true);
	<div class="row">
		<span data-toggle onClick={() => (open = !open)}>{open ? '[-]' : '[+]'}</span>
		<div data-toggled hidden={!open}>{name}</div>
	</div>
}
