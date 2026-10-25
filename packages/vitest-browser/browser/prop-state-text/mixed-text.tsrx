import { state } from '@markless/core';

export default function MixedText({ label, count }: { readonly label: string; readonly count: number }) @{
	let open = state(true);
	<p class="mixed" onClick={() => (open = !open)}>{label} {open ? '[-]' : `[+${count}]`}</p>
}
