import { state } from '@markless/core';

export default function VipBadge({ label }: { label: string }) @{
	let taps = state(0);
	<p data-badge>
		<span data-badge-label>{label}</span>
		<button data-tap onClick={() => taps++}>{taps}</button>
	</p>
}
