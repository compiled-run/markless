import { state } from '@markless/core';

export default function Tally({ label, children }: { readonly label: string; readonly children?: unknown }) @{
	let taps = state(0);
	<button data-tally={label} onClick={() => taps++}>
		{children}
		<span data-taps>{taps}</span>
	</button>;
}
