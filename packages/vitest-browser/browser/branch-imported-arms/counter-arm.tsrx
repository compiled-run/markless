import { state } from '@markless/core';

export function CounterArm({ label, onBump }: { label: string; onBump: () => void }) @{
	let clicks = state(0);
	<div data-counter>
		<span data-label title={label}>{label}</span>
		<button type="button" data-inc onClick={() => (clicks = clicks + 1)}>{clicks}</button>
		<button type="button" data-bump onClick={() => onBump()}>bump</button>
	</div>
}
