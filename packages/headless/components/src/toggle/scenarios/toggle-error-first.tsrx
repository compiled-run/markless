import { toggle } from '../../index.ts';

// The same error written BEFORE the trigger. Seeding completes before any part
// renders, so document order does not decide what a part reads.
export default function ErrorBeforeTrigger() @{
	<toggle.root required data-testid="root">
		<toggle.error data-testid="error">This field is required</toggle.error>
		<toggle.label data-testid="label">Enable notifications</toggle.label>
		<toggle.trigger data-testid="trigger"><toggle.thumb data-testid="thumb" /></toggle.trigger>
	</toggle.root>
}
