import { buttongroup } from '../../index.ts';

// A consumer writing the attributes the family owns. `{...rest}` is spread
// first, so the family's own role and state win.
export default function ConsumerAttributes() @{
	<buttongroup.root role="presentation" value="left" data-testid="root">
		<buttongroup.label data-testid="label">Text alignment</buttongroup.label>
		<buttongroup.item value="left" aria-pressed="false" type="submit" data-testid="left">
			Left
		</buttongroup.item>
		<buttongroup.item value="right" tabindex={0} data-testid="right">Right</buttongroup.item>
	</buttongroup.root>
}
