import { shared, state, computed } from '@markless/core';

// A widget family whose factory returns BOTH computed forms: `isChecked` is a
// named const, `label` is written inline in the returned object literal.
export const chk = shared(() => {
	const c = state({ checked: false, disabled: false, name: '' });
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

export function Root({ disabled, name, children }) @{
	const c = chk();
	c.disabled = disabled ?? false;
	c.name = name ?? '';

	<div data-chk-root ui-disabled={c.disabled} ui-checked={c.isChecked}>{children}</div>
}

// A projected part reads the config its widget root seeded: `ui-disabled` and
// `data-name` come from the root's props, not from the factory's initial value.
export function Trigger() @{
	const c = chk();

	<button
		type="button"
		data-chk-trigger
		ui-disabled={c.disabled}
		data-name={c.name}
		onClick={() => c.toggle()}
	>t</button>
}

export function Indicator() @{
	const c = chk();

	<span data-chk-indicator data-label={c.label}>{c.checked}</span>
}
