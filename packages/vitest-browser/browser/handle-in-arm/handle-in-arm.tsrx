import { element, shared, state } from '@markless/core';

// An element() handle bound inside a flippable @if arm: the binding is filed
// when the arm renders and unfiled when the arm goes away, so a handler reading
// the handle sees the element exactly while it is mounted.
export const widgetState = shared(
	() => {
		const widget = state({ open: false, mark: 'never', probes: 0 });
		const panelEl = element<HTMLDivElement>();

		return { ...widget, panelEl };
	},
	{ scope: 'widget' },
);

export function Widget({ startOpen = false, children }) @{
	const widget = widgetState();
	widget.open = startOpen;

	<div data-widget data-open={widget.open} data-mark={widget.mark} data-probes={widget.probes}>
		<button
			data-toggle
			type="button"
			onClick={() => {
				widget.open = !widget.open;
			}}
		>toggle</button>
		<button
			data-probe
			type="button"
			onClick={() => {
				const panel = widget.panelEl;
				widget.probes = widget.probes + 1;
				widget.mark = panel === undefined ? 'unbound' : 'bound';
				panel?.setAttribute('data-probed', String(widget.probes));
			}}
		>probe</button>
		@if (widget.open) {
			<div data-panel el={widget.panelEl}>panel body</div>
		}
		{children}
	</div>
}
