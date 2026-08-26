import { togglegroup } from '../../index.ts';

// The starter a consumer copies: three alignments, one pressed, one at a time.
export default function Basic() @{
	<togglegroup.root value="left" data-testid="root">
		<togglegroup.label data-testid="label">Text alignment</togglegroup.label>
		<togglegroup.item value="left" data-testid="left">Left</togglegroup.item>
		<togglegroup.item value="center" data-testid="center">Center</togglegroup.item>
		<togglegroup.item value="right" data-testid="right">Right</togglegroup.item>
	</togglegroup.root>
}
