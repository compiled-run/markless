import { state, type Children } from '@markless/core';

export default function Drawer({ label, children }: { readonly label: string; readonly children?: Children }) @{
	let expanded = state(false);

	<div class="drawer">
		<button data-drawer={label} aria-expanded={expanded ? 'true' : 'false'} onClick={() => (expanded = !expanded)}>{label}</button>
		<div data-drawer-panel={label} hidden={!expanded}>{children}</div>
	</div>
}
