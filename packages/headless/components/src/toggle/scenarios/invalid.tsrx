import { toggle } from '../../index.ts';

export default function Invalid() @{
	<toggle.root required data-testid="root">
		<toggle.label data-testid="label">Enable notifications</toggle.label>
		<toggle.trigger data-testid="trigger"><toggle.thumb data-testid="thumb" /></toggle.trigger>
		<toggle.error data-testid="error">This field is required</toggle.error>
	</toggle.root>
}
