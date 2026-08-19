import type { Children, PropsOf } from '@markless/core';

type CheckboxTriggerProps = {
	readonly disabled?: PropsOf<'button'>['disabled'];
	readonly children?: Children;
};

// Entry-gate placeholder: the checkbox family lands in the next unit.
export default function CheckboxTrigger({ disabled, children }: CheckboxTriggerProps) @{
	<button type="button" disabled={disabled} ui-disabled={disabled}>{children}</button>
}
