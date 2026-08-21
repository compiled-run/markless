import { textbox } from '../index.ts';

// An account field the person may read but not change: every restriction the
// root can carry, set at once.
export default function LockedField() @{
	<textbox.root disabled required readonly data-testid="root">
		<textbox.label data-testid="label">Username</textbox.label>
		<textbox.input data-testid="input" />
	</textbox.root>
}
