import { toggle } from '../../index.ts';
import * as toolbar from '../index.ts';

// Two bars on one page, and a switch standing outside both.
//
// Each bar's roster holds only its own controls: a control's registration is
// qualified to the instance its `toolbar.state()` read resolved to. The loose
// switch resolves to no instance, so it joins neither roster and keeps the
// ordinary tab stop a switch has anywhere else on the page.
export default function TwoBars() @{
	<div>
		<toolbar.root data-testid="first-root">
			<toolbar.label data-testid="first-label">Text</toolbar.label>
			<toolbar.item data-testid="bold">Bold</toolbar.item>
			<toolbar.item data-testid="italic">Italic</toolbar.item>
		</toolbar.root>

		<toolbar.root data-testid="second-root">
			<toolbar.label data-testid="second-label">Table</toolbar.label>
			<toolbar.item data-testid="row">Add row</toolbar.item>
			<toolbar.item data-testid="column">Add column</toolbar.item>
			<toolbar.item data-testid="merge">Merge</toolbar.item>
		</toolbar.root>

		<toggle.root data-testid="loose-root">
			<toggle.label data-testid="loose-label">Show grid</toggle.label>
			<toggle.trigger data-testid="loose"><toggle.thumb /></toggle.trigger>
		</toggle.root>
	</div>
}
