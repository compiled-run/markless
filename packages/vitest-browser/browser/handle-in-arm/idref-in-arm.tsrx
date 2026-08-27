import { element, shared, state } from '@markless/core';

// A trigger naming a panel the arm holds. The id is minted for the rendered
// widget, so the flip cannot respell it: the render resolves it onto the branch
// record, and the trigger's aria-controls follows the arm rather than being
// served naming an element that is not there.
export const panelState = shared(
	() => {
		const panel = state({ open: false });
		const rootEl = element<HTMLDivElement>();
		const panelEl = element<HTMLDivElement>();

		return { ...panel, rootEl, panelEl };
	},
	{ scope: 'widget' },
);

export function Disclosure({ startOpen = false, label }) @{
	const panel = panelState();
	panel.open = startOpen;

	<div data-widget data-label={label} el={panel.rootEl}>
		<button
			data-toggle
			type="button"
			aria-expanded={panel.open}
			aria-controls={panel.panelEl}
			onClick={() => {
				panel.open = !panel.open;
			}}
		>toggle {label}</button>
		@if (panel.open) {
			<div data-panel el={panel.panelEl}>panel body {label}</div>
		}
	</div>
}
