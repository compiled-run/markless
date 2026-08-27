import { element, shared, state } from '@markless/core';

// An IDREF names an element, so the attribute belongs to the instance whose
// handle actually has a bound host - not to every instance of the module.
export const widgetState = shared(
	() => {
		const widget = state({ armed: false, label: '' });
		const rootEl = element<HTMLDivElement>();
		const panelEl = element<HTMLDivElement>();

		return { ...widget, rootEl, panelEl };
	},
	{ scope: 'widget' },
);

export function Widget({ label = '', children }) @{
	const widget = widgetState();
	widget.label = label;

	<div
		data-widget
		data-label={widget.label}
		el={widget.rootEl}
		role="button"
		tabindex={0}
		aria-controls={widget.panelEl}
	>{children}</div>
}

export function Panel({ children }) @{
	const widget = widgetState();

	<div data-panel data-for={widget.label} el={widget.panelEl} role="region">{children}</div>
}
