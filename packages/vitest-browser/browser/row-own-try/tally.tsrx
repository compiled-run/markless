import { state } from '@markless/core';

export function Tally({ label }: { label: string }) @{
	let taps = state(0);

	<button data-tally onClick={() => taps++}>{label} {taps}</button>
}
