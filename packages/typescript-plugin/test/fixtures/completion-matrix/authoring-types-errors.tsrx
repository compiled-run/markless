import type { PropsOf } from '@markless/core';

type TriggerProps = PropsOf<'button'> & {
	readonly pressed?: boolean;
};

export function Trigger({ children }: TriggerProps) @{
	<button type="button">{children}</button>
}

export function AuthoringTypesErrors() @{
	<Trigger href="anchor-only">not a button prop</Trigger>
}
