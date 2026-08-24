import { checkbox } from '../../index.ts';

export default function WithHelp() @{
	<checkbox.root data-testid="root">
		<checkbox.label data-testid="label">Subscribe to newsletter</checkbox.label>
		<checkbox.description data-testid="description">We'll send you updates about new features</checkbox.description>
		<checkbox.trigger data-testid="trigger"><checkbox.indicator data-testid="indicator">Checked</checkbox.indicator></checkbox.trigger>
	</checkbox.root>
}
