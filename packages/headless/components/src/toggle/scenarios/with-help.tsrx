import { toggle } from '../../index.ts';

export default function WithHelp() @{
	<toggle.root data-testid="root">
		<toggle.label data-testid="label">Enable notifications</toggle.label>
		<toggle.trigger data-testid="trigger"><toggle.thumb data-testid="thumb" /></toggle.trigger>
		<toggle.description data-testid="description">(Receive notifications about important updates)</toggle.description>
	</toggle.root>
}
