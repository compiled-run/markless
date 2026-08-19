import type { Children } from '@markless/core';

type CheckboxRootProps = {
	readonly children?: Children;
};

// Entry-gate placeholder: the checkbox family lands in the next unit.
export default function CheckboxRoot({ children }: CheckboxRootProps) @{
	<div>{children}</div>
}
