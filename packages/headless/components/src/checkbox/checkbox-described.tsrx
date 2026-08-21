import { checkbox } from '../index.ts';

// A checkbox with a description part. No error is mounted, so the trigger is valid.
export default function DescribedCheckbox() @{
	<checkbox.root data-testid="root">
		<checkbox.label data-testid="label">Subscribe to newsletter</checkbox.label>
		<checkbox.description data-testid="description">We'll send you updates about new features</checkbox.description>
		<checkbox.trigger data-testid="trigger">
			<checkbox.indicator data-testid="indicator">Checked</checkbox.indicator>
		</checkbox.trigger>
	</checkbox.root>
}
