import { element, shared, state } from '@markless/core';

// One widget per rendered `Disclosure`. The element that carries the role is the
// element of the component that ROOTS the family, so the ids its own attributes
// mint have to name the instance it starts - not the one it was placed in.
export const disclosureState = shared(
	() => {
		const disclosure = state({ open: false, label: '' });
		const rootEl = element<HTMLDivElement>();
		const panelEl = element<HTMLDivElement>();

		return { ...disclosure, rootEl, panelEl };
	},
	{ scope: 'widget' },
);

export function Disclosure({ label = '', children }) @{
	const disclosure = disclosureState();
	disclosure.label = label;

	<div
		data-disclosure
		data-label={disclosure.label}
		el={disclosure.rootEl}
		role="button"
		tabindex={0}
		aria-expanded={disclosure.open ? 'true' : 'false'}
		aria-controls={disclosure.panelEl}
	>{children}</div>
}

export function Panel({ children }) @{
	const disclosure = disclosureState();

	<div
		data-panel
		data-for={disclosure.label}
		el={disclosure.panelEl}
		role="region"
		aria-labelledby={disclosure.rootEl}
	>{children}</div>
}
