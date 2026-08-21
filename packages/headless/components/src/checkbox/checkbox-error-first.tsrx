import { checkbox } from '../index.ts';

// The same error, written BEFORE the trigger instead of after it. Seeding is a
// phase that completes before any part renders, so document order does not
// decide what a part reads: the trigger is invalid here too.
export default function ErrorFirstCheckbox() @{
	<checkbox.root required data-testid="root">
		<checkbox.error data-testid="error">Please accept the terms and conditions</checkbox.error>
		<checkbox.label data-testid="label">Accept Terms</checkbox.label>
		<checkbox.trigger data-testid="trigger"><checkbox.indicator data-testid="indicator">Checked</checkbox.indicator></checkbox.trigger>
	</checkbox.root>
}
