import { shared, state } from '@markless/core';

// A widget family whose root seeds the shared instance to a value that is NOT
// the factory's initial, so a gesture after resume can only be right if the
// server carried the seed into the payload.
export const seedchk = shared(() => {
	const c = state({ checked: false });

	return {
		...c,
		toggle() {
			c.checked = !c.checked;
		},
	};
}, { scope: 'widget' });

export function Root({ checked = false, children }) @{
	const c = seedchk();
	c.checked = checked;

	<div data-seed-root ui-checked={c.checked}>{children}</div>
}

export function Trigger() @{
	const c = seedchk();

	<button type="button" data-seed-trigger onClick={() => c.toggle()}>t</button>
}

export function Indicator() @{
	const c = seedchk();

	<span data-seed-indicator>{c.checked}</span>
}
