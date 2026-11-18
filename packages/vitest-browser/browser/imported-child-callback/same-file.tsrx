import { state } from '@markless/core';

function LocalClicker({ onTick }: { readonly onTick?: () => void }) @{
	<button type="button" data-click onClick={() => onTick?.()}>click</button>
}

function LocalTicker({ onTick }: { readonly onTick?: () => void }) @{
	<button
		type="button"
		data-timer
		onClick={() => {
			setTimeout(() => onTick?.(), 10);
		}}
	>
		timer
	</button>
}

export default function SameFilePage() @{
	let count = state(0);
	<div>
		<LocalClicker onTick={() => (count = count + 1)} />
		<LocalTicker onTick={() => (count = count + 2)} />
		<span data-count>{count}</span>
	</div>
}
