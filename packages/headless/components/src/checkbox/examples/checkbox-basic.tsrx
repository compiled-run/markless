import { checkbox } from '../../index.ts';

// The starter a consumer copies: one labelled checkbox, off to begin with.
export default function Basic() @{
	<checkbox.root data-testid="root">
		<checkbox.trigger data-testid="trigger">
			<checkbox.indicator data-testid="indicator">Checked</checkbox.indicator>
		</checkbox.trigger>
		<checkbox.label data-testid="label">Checkbox Label</checkbox.label>
	</checkbox.root>
}
