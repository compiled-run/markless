import { toggle } from '../../index.ts';

// A hint and a validation message at once. The hint is written first and the
// trigger still names the error first, so the order comes from the family rather
// than from where the parts sit in the page.
export default function WithHelpAndError() @{
	<toggle.root required data-testid="root">
		<toggle.label data-testid="label">Enable notifications</toggle.label>
		<toggle.trigger data-testid="trigger"><toggle.thumb data-testid="thumb" /></toggle.trigger>
		<toggle.description data-testid="description">(Receive notifications about important updates)</toggle.description>
		<toggle.error data-testid="error">This field is required</toggle.error>
	</toggle.root>
}
