import { element, shared, state } from '@markless/core';

// A widget family whose parts mint and name one element() handle. The handle is
// what proves WHICH rendered widget a part resolved to: the label's `for` and
// the trigger's `id` are the same minted id only when both read one instance.
export const pwr = shared(
	() => {
		const s = state({ label: '', on: false });
		const triggerEl = element<HTMLButtonElement>();

		return {
			...s,
			triggerEl,
			toggle() {
				s.on = !s.on;
			},
		};
	},
	{ scope: 'widget' },
);

export function PwrRoot({ label = '', children }) @{
	const s = pwr();
	s.label = label;

	<div data-pwr-root data-label={s.label}>{children}</div>
}

export function PwrTrigger() @{
	const s = pwr();

	<button
		type="button"
		el={s.triggerEl}
		data-pwr-trigger
		data-label={s.label}
		onClick={() => s.toggle()}
	>{s.on}</button>
}

export function PwrLabel({ children }) @{
	const s = pwr();

	<label data-pwr-label data-label={s.label} for={s.triggerEl}>{children}</label>
}
