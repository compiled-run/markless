import type { Children } from '@markless/core';

type CheckboxTriggerProps = {
	readonly children?: Children;
};

// Entry-gate placeholder: the checkbox family lands in the next unit.
export default function CheckboxTrigger({ children }: CheckboxTriggerProps) @{
	<button type="button">{children}</button>
}
