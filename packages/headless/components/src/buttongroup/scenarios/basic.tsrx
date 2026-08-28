import { buttongroup } from '../../index.ts';

// The starter a consumer copies: three alignments, one pressed, one at a time.
export default function Basic() @{
	<buttongroup.root value="left" data-testid="root">
		<buttongroup.label data-testid="label">Text alignment</buttongroup.label>
		<buttongroup.item value="left" data-testid="left">Left</buttongroup.item>
		<buttongroup.item value="center" data-testid="center">Center</buttongroup.item>
		<buttongroup.item value="right" data-testid="right">Right</buttongroup.item>
	</buttongroup.root>
}
