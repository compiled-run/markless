import { buttongroup } from '../../index.ts';

// A segmented control: one of these is always on, so pressing the pressed one
// does nothing. The multi-select group beside it keeps its last pressed item for
// the same reason.
export default function Required() @{
	<section>
		<buttongroup.root required value="grid" data-testid="root">
			<buttongroup.label data-testid="label">Layout</buttongroup.label>
			<buttongroup.item value="grid" data-testid="grid">Grid</buttongroup.item>
			<buttongroup.item value="list" data-testid="list">List</buttongroup.item>
		</buttongroup.root>
		<buttongroup.root required multiple value={['email']} data-testid="many-root">
			<buttongroup.label data-testid="many-label">Notify me by</buttongroup.label>
			<buttongroup.item value="email" data-testid="email">Email</buttongroup.item>
			<buttongroup.item value="sms" data-testid="sms">SMS</buttongroup.item>
		</buttongroup.root>
	</section>
}
