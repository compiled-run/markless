import { shared, state, computed } from '@markless/core';

// A widget family whose factory returns BOTH computed forms: `isChecked` is a
// named const, `label` is written inline in the returned object literal.
export const chk = shared(() => {
	const c = state({ checked: false, disabled: false });
	const isChecked = computed(() => c.checked === true);

	return {
		...c,
		isChecked,
		label: computed(() => (c.checked === true ? 'on' : 'off')),
		toggle() {
			c.checked = !c.checked;
		},
	};
}, { scope: 'widget' });

export function Root({ disabled, children }) @{
	const c = chk();
	c.disabled = disabled ?? false;

	<div data-chk-root ui-disabled={c.disabled} ui-checked={c.isChecked}>{children}</div>
}

export function Trigger() @{
	const c = chk();

	<button type="button" data-chk-trigger onClick={() => c.toggle()}>t</button>
}

export function Indicator() @{
	const c = chk();

	<span data-chk-indicator data-label={c.label}>{c.checked}</span>
}
