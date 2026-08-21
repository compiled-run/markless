import { checkbox } from '../index.ts';
import type { CheckboxRootProps } from './checkbox-types.ts';

// The example a consumer copies: one checkbox, every part named by its role.
// The state examples beside this file are this component under different props.
// A consumer callback is NOT forwarded here: a prop hop through this example
// registers a widget-callback capture slot that collides with a root's own
// onChange elsewhere in the suite. checkbox-controlled.tsrx owns that scenario.
export default function BasicCheckbox({
	checked,
	disabled,
	required,
	name,
	value,
}: CheckboxRootProps) @{
	<checkbox.root
		checked={checked}
		disabled={disabled}
		required={required}
		name={name}
		value={value}
		data-testid="root"
	>
		<checkbox.trigger data-testid="trigger">
			<checkbox.indicator data-testid="indicator">Checked</checkbox.indicator>
		</checkbox.trigger>
		<checkbox.label data-testid="label">Checkbox Label</checkbox.label>
	</checkbox.root>
}
