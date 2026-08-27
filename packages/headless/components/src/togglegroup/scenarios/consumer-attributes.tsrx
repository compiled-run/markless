import { togglegroup } from '../../index.ts';

// A consumer writing the attributes the family owns. `{...rest}` is spread
// first, so the family's own role and state win.
export default function ConsumerAttributes() @{
	<togglegroup.root role="presentation" value="left" data-testid="root">
		<togglegroup.label data-testid="label">Text alignment</togglegroup.label>
		<togglegroup.item value="left" aria-pressed="false" type="submit" data-testid="left">
			Left
		</togglegroup.item>
		<togglegroup.item value="right" tabindex={0} data-testid="right">Right</togglegroup.item>
	</togglegroup.root>
}
