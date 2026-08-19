type CheckboxTriggerProps = {
	readonly children?: unknown;
};

// Entry-gate placeholder: the checkbox family lands in the next unit.
export default function CheckboxTrigger({ children }: CheckboxTriggerProps) @{
	<button type="button" data-checkbox-trigger>{children}</button>
}
