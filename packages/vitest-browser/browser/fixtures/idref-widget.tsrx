import { element, shared, state } from '@markless/core';

// One instance per rendered <Root>: the handle names one element per widget, so
// two widgets on a page must not mint the same id for their triggers.
export const widgetState = shared(
	() => {
		const widget = state({ label: '' });
		const triggerEl = element<HTMLButtonElement>();
		return { ...widget, triggerEl };
	},
	{ scope: 'widget' },
);

export function Root({ label, children }) @{
	const widget = widgetState();
	widget.label = label ?? '';
	<div data-widget-root>{children}</div>
}

export function Trigger() @{
	const widget = widgetState();
	<button type="button" data-widget-trigger el={widget.triggerEl}>{widget.label}</button>
}

export function Lab() @{
	const widget = widgetState();
	<label data-widget-label for={widget.triggerEl}>{widget.label}</label>
}
