import { element } from '@markless/core';

// Reads the target's CURRENT state, not the value its own render was handed.
export function SpotStep({ target }) @{
	const stepEl = element<HTMLDivElement>();

	<div
		data-tg-spot-step
		el={stepEl}
		onClick={() => {
			const root = stepEl;
			if (!root || !target) return;
			const step = target.getAttribute('data-tg-step');
			root.setAttribute('data-tg-step-seen', step === null ? 'none' : step);
		}}
	>measure</div>
}
