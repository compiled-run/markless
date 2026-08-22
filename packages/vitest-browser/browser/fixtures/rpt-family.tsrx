import { computed, element, shared, state } from '@markless/core';

// A minimal widget-scoped family shaped like the item families (tabs,
// radio-group, checklist): a root that seeds from its own props, parts that read
// the seed, a gesture that writes, and an element() handle in an IDREF position.
export const rpt = shared(() => {
	const r = state({ checked: false, disabled: false, label: '' });
	const triggerEl = element<HTMLButtonElement>();

	return {
		...r,
		triggerEl,
		mark: computed(() => (r.checked === true ? 'on' : 'off')),
		toggle() {
			r.checked = !r.checked;
		},
	};
}, { scope: 'widget' });

export function Root({ checked, disabled, label, children }) @{
	const r = rpt();
	r.checked = checked ?? false;
	r.disabled = disabled ?? false;
	r.label = label ?? '';

	<div data-rpt-root data-label={r.label} ui-checked={r.checked} ui-disabled={r.disabled}>{children}</div>
}

export function Trigger() @{
	const r = rpt();

	<button
		el={r.triggerEl}
		type="button"
		data-rpt-trigger
		data-label={r.label}
		ui-disabled={r.disabled}
		onClick={() => r.toggle()}
	>t</button>
}

export function Display() @{
	const r = rpt();

	<span data-rpt-display data-label={r.label} data-mark={r.mark}>{r.checked}</span>
}

export function Label() @{
	const r = rpt();

	<label data-rpt-label for={r.triggerEl}>{r.label}</label>
}
