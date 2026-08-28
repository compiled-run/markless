import { buttongroup } from '../../index.ts';

// A stacked group: the up and down arrows walk it, and left and right are
// somebody else's axis. `loop` brings the ends round.
export default function Vertical() @{
	<buttongroup.root orientation="vertical" loop value="high" data-testid="root">
		<buttongroup.label data-testid="label">Priority</buttongroup.label>
		<buttongroup.item value="high" data-testid="high">High</buttongroup.item>
		<buttongroup.item value="normal" data-testid="normal">Normal</buttongroup.item>
		<buttongroup.item value="low" data-testid="low">Low</buttongroup.item>
	</buttongroup.root>
}
