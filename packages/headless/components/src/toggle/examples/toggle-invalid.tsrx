import { toggle } from '../../index.ts';

// A required switch a submitted form flagged. Mounting the error part at all is
// what is meant to mark the trigger invalid.
export default function InvalidToggle() @{
	<toggle.root required data-testid="root">
		<toggle.label data-testid="label">Enable notifications</toggle.label>
		<toggle.trigger data-testid="trigger"><toggle.thumb data-testid="thumb" /></toggle.trigger>
		<toggle.error data-testid="error">This field is required</toggle.error>
	</toggle.root>
}
