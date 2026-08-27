import { select } from '../../index.ts';
import * as toolbar from '../index.ts';

// A stacked bar: Up and Down walk it, Left and Right do nothing.
//
// The select is last on purpose. Its own ArrowDown opens its listbox, so it takes
// the key this bar walks on - the APG's rule for a control that needs the
// toolbar's arrow pair is to allow at most one and put it at the end.
export default function Vertical() @{
	<toolbar.root orientation="vertical" data-testid="root">
		<toolbar.label data-testid="label">Layers</toolbar.label>
		<toolbar.item data-testid="up">Move up</toolbar.item>
		<toolbar.item data-testid="down">Move down</toolbar.item>
		<select.root data-testid="blend-root">
			<select.label data-testid="blend-label">Blend</select.label>
			<select.trigger data-testid="blend">Normal</select.trigger>
			<select.content data-testid="blend-content">
				<select.item value="normal" data-testid="normal">
					<select.itemlabel>Normal</select.itemlabel>
				</select.item>
				<select.item value="multiply" data-testid="multiply">
					<select.itemlabel>Multiply</select.itemlabel>
				</select.item>
			</select.content>
		</select.root>
	</toolbar.root>
}
