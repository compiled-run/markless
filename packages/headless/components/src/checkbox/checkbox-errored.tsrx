import { checkbox } from '../index.ts';

// Mounting the error part at all is what marks the trigger invalid; nothing
// else in the family says so.
export default function ErroredCheckbox() @{
	<checkbox.root required data-testid="root">
		<checkbox.label data-testid="label">Accept Terms</checkbox.label>
		<checkbox.description data-testid="description">Read our terms and conditions before accepting</checkbox.description>
		<checkbox.trigger data-testid="trigger"><checkbox.indicator data-testid="indicator">Checked</checkbox.indicator></checkbox.trigger>
		<checkbox.error data-testid="error">Please accept the terms and conditions</checkbox.error>
	</checkbox.root>
}
