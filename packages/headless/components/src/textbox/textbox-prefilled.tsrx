import { textbox } from '../index.ts';

// An edit form opened on an existing record: the field arrives already filled,
// so the root starts out of its empty state.
export default function PrefilledField() @{
	<textbox.root value="test value" data-testid="root">
		<textbox.label data-testid="label">Username</textbox.label>
		<textbox.input data-testid="input" />
	</textbox.root>
}
