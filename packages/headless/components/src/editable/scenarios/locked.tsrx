import { editable } from '../../index.ts';

// The two ways a value refuses to be edited, side by side. `disabled` takes the
// preview out of the tab order; `readonly` leaves it focusable and readable and
// simply never opens a session.
export default function Locked() @{
	<main>
		<editable.root disabled data-testid="off-root" defaultValue="frozen">
			<editable.label data-testid="off-label">Archived name</editable.label>
			<editable.trigger data-testid="off-trigger" />
			<editable.input data-testid="off-input" />
		</editable.root>
		<editable.root readonly data-testid="ro-root" defaultValue="published">
			<editable.label data-testid="ro-label">Published name</editable.label>
			<editable.trigger data-testid="ro-trigger" />
			<editable.input data-testid="ro-input" />
		</editable.root>
	</main>
}
