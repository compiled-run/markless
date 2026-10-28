import { state } from '@markless/core';

export default function VisibleLabel({ label }: { label: string }) @{
	let count = state(0);
	<div attach={() => { setTimeout(() => (count = 3), 50); }} onVisible={() => {}}>
		<p data-label-probe>{label} {count}</p>
	</div>
}
