import { state, type Children, type PropsOf } from '@markless/core';

type CheckboxTriggerProps = {
	readonly disabled?: PropsOf<'button'>['disabled'];
	readonly children?: Children;
};

// Minimal own-state toggle: the family's shared checked state (root-owned,
// controlled/uncontrolled, aria wiring) lands with the checkbox behaviour unit.
export default function CheckboxTrigger({ disabled, children }: CheckboxTriggerProps) @{
	let checked = state(false);

	<button
		type="button"
		disabled={disabled}
		ui-disabled={disabled}
		ui-checked={checked}
		onClick={() => { checked = !checked; }}
	>{children}</button>
}
