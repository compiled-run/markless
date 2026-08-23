// A family-like module: ONE widget-scoped shared definition plus the parts that
// resolve it. The barrel next to this file aliases `nscShared` to `state`, which
// is the consumer surface a namespace-member call reaches.
import { shared, state } from '@markless/core';

export const nscShared = shared(() => {
	const s = state({ open: false });

	return {
		...s,
		toggle() {
			s.open = !s.open;
		},
	};
}, { scope: 'widget' });

export function Root({ children }) @{
	const s = nscShared();

	<div data-nsc-root ui-open={s.open}>{children}</div>
}

export function Trigger() @{
	const s = nscShared();

	<button type="button" data-nsc-trigger onClick={() => s.toggle()}>Toggle</button>
}
