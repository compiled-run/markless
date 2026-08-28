import { togglegroup } from '../../index.ts';

// A stacked group: the up and down arrows walk it, and left and right are
// somebody else's axis. `loop` brings the ends round.
export default function Vertical() @{
	<togglegroup.root orientation="vertical" loop value="high" data-testid="root">
		<togglegroup.label data-testid="label">Priority</togglegroup.label>
		<togglegroup.item value="high" data-testid="high">High</togglegroup.item>
		<togglegroup.item value="normal" data-testid="normal">Normal</togglegroup.item>
		<togglegroup.item value="low" data-testid="low">Low</togglegroup.item>
	</togglegroup.root>
}
