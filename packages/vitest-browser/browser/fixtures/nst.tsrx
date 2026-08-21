import { shared, state } from '@markless/core';

// A widget family whose root can be nested inside another root of the SAME
// family. Every root is an instance boundary: the parts placed in a root's
// children belong to the INNERMOST root that encloses them.
export const nst = shared(() => {
	const s = state({ open: false, label: '' });

	return {
		...s,
		toggle() {
			s.open = !s.open;
		},
	};
}, { scope: 'widget' });

export function Root({ label, children }) @{
	const s = nst();
	s.label = label ?? '';

	<div data-nst-root data-label={s.label}>{children}</div>
}

// The trigger renders the label its own widget root seeded, so the label proves
// which instance the part resolved to.
export function Trigger() @{
	const s = nst();

	<button type="button" data-nst-trigger data-label={s.label} onClick={() => s.toggle()}>t</button>
}

export function Display() @{
	const s = nst();

	<span data-nst-display data-label={s.label}>{s.open}</span>
}
