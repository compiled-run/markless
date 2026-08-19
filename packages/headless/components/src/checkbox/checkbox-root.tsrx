type CheckboxRootProps = {
	readonly children?: unknown;
};

// Entry-gate placeholder: the checkbox family lands in the next unit.
export default function CheckboxRoot({ children }: CheckboxRootProps) @{
	<div data-checkbox-root>{children}</div>
}
