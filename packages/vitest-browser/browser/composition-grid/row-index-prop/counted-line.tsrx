import { state } from '@markless/core';

export default function CountedLine({ label, place }: { label: string; place: number }) @{
	let taps = state(0);
	<p data-r={label}>
		<span data-text>{place}. {label}</span>
		<b data-taps>{taps}</b>
		<button data-tap onClick={() => taps++}>tap</button>
	</p>
}
