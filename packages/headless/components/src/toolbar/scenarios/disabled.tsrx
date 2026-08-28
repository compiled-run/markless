import { toggle, toolbar } from '../../index.ts';

// Two kinds of unavailable control, and the bar treats them differently.
//
// `toolbar.item disabled` writes `aria-disabled` and stays focusable, so an arrow
// lands on it and a reader announces it - the APG toolbar rule. A control the
// browser has taken out of the tab order outright, like a disabled
// `toggle.trigger`, cannot take focus at all, so the arrows walk past it.
export default function Disabled() @{
	<toolbar.root data-testid="root">
		<toolbar.label data-testid="label">Revision</toolbar.label>
		<toolbar.item data-testid="undo">Undo</toolbar.item>
		<toolbar.item disabled data-testid="redo">Redo</toolbar.item>
		<toggle.root disabled data-testid="track-root">
			<toggle.label data-testid="track-label">Track changes</toggle.label>
			<toggle.trigger data-testid="track"><toggle.thumb /></toggle.trigger>
		</toggle.root>
		<toolbar.item data-testid="compare">Compare</toolbar.item>
	</toolbar.root>
}
