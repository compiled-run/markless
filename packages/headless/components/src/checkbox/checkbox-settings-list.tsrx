import { checkbox } from '../index.ts';

// A settings page: three independent options, one off, one on, and one in the
// third state a "some selected" parent shows. This is what proves a click lands
// in one instance only, and where the tri-state transitions are exercised.
export default function SettingsList() @{
	<section>
		<checkbox.root data-testid="emails-root">
			<checkbox.trigger data-testid="emails-trigger">
				<checkbox.indicator data-testid="emails-indicator">Checked</checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label data-testid="emails-label">Product emails</checkbox.label>
		</checkbox.root>
		<checkbox.root checked data-testid="digest-root">
			<checkbox.trigger data-testid="digest-trigger">
				<checkbox.indicator data-testid="digest-indicator">Checked</checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label data-testid="digest-label">Weekly digest</checkbox.label>
		</checkbox.root>
		<checkbox.root checked="mixed" data-testid="alerts-root">
			<checkbox.trigger data-testid="alerts-trigger">
				<checkbox.indicator data-testid="alerts-indicator">Checked</checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label data-testid="alerts-label">All alerts</checkbox.label>
		</checkbox.root>
	</section>
}
