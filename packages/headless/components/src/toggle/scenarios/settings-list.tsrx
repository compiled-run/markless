import { toggle } from '../../index.ts';

export default function SettingsList() @{
	<section>
		<toggle.root data-testid="emails-root">
			<toggle.label data-testid="emails-label">Enable notifications</toggle.label>
			<toggle.trigger data-testid="emails-trigger"><toggle.thumb data-testid="emails-thumb" /></toggle.trigger>
		</toggle.root>
		<toggle.root checked data-testid="digest-root">
			<toggle.label data-testid="digest-label">Weekly digest</toggle.label>
			<toggle.trigger data-testid="digest-trigger"><toggle.thumb data-testid="digest-thumb" /></toggle.trigger>
		</toggle.root>
	</section>
}
