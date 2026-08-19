import { state } from '@markless/core';

// A headless-library shape: the stepper owns its state and only reports it
// through an optional callback prop. The label stays a static attribute so the
// visible text depends on child state alone.
export function ImportedStepper({ name, onChange }) @{
	let steps = state(0);

	<button type="button" data-imported-stepper={name} onClick={() => {
		steps++;
		onChange?.(steps);
	}}>{steps}</button>
}
