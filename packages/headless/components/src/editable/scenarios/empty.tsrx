// Registration is a follow-up unit, so the barrel has no `editable` export yet.
import * as editable from '../index.ts';

// An uncontrolled editable with nothing in it: the placeholder is what the
// preview button says, and it is what gives that button an accessible name.
export default function Empty() @{
	<main>
		<editable.root data-testid="root" placeholder="Name this list" defaultValue="">
			<editable.label data-testid="label">List name</editable.label>
			<editable.trigger data-testid="trigger" />
			<editable.input data-testid="input" />
			<editable.field data-testid="field" />
		</editable.root>
	</main>
}
