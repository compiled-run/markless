import { togglegroup } from '../../index.ts';

// A segmented control: one of these is always on, so pressing the pressed one
// does nothing. The multi-select group beside it keeps its last pressed item for
// the same reason.
export default function Required() @{
	<section>
		<togglegroup.root required value="grid" data-testid="root">
			<togglegroup.label data-testid="label">Layout</togglegroup.label>
			<togglegroup.item value="grid" data-testid="grid">Grid</togglegroup.item>
			<togglegroup.item value="list" data-testid="list">List</togglegroup.item>
		</togglegroup.root>
		<togglegroup.root required multiple value={['email']} data-testid="many-root">
			<togglegroup.label data-testid="many-label">Notify me by</togglegroup.label>
			<togglegroup.item value="email" data-testid="email">Email</togglegroup.item>
			<togglegroup.item value="sms" data-testid="sms">SMS</togglegroup.item>
		</togglegroup.root>
	</section>
}
