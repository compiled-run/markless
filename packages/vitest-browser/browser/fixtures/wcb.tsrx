import { element, shared, state } from '@markless/core';

// A widget family with a callback SLOT: the root fills it from its own prop, and
// a part dispatches through it. The slot is never a graph node.
export const wcb = shared(
	() => {
		const s = state({ label: '', on: false });
		const triggerEl = element<HTMLButtonElement>();

		return {
			...s,
			triggerEl,
			onChange: undefined as ((next: boolean) => void) | undefined,
			toggle() {
				const next = s.on === true ? false : true;
				s.on = next;
				s.onChange?.(next);
			},
		};
	},
	{ scope: 'widget' },
);

export function WcbRoot({ label = '', on = false, onChange, children }) @{
	const s = wcb();
	s.onChange = onChange;
	s.label = label;
	s.on = on;

	<div data-wcb-root data-label={s.label}>{children}</div>
}

export function WcbTrigger() @{
	const s = wcb();

	<button
		type="button"
		el={s.triggerEl}
		data-wcb-trigger
		data-label={s.label}
		onClick={() => s.toggle()}
	>{s.on}</button>
}

export function WcbLabel({ children }) @{
	const s = wcb();

	<label data-wcb-label for={s.triggerEl}>{children}</label>
}
