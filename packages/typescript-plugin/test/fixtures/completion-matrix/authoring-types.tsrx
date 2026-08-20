import type { Children, PropsOf } from '@markless/core';

type TriggerProps = PropsOf<'button'> & {
	readonly pressed?: boolean;
};

export function Trigger({ type, children }: TriggerProps) @{
	<button type={type}>{children}</button>
}

export function Slot({ children }: { readonly children?: Children }) @{
	<span>{children}</span>
}

export function AuthoringTypes() @{
	<Trigger type="submit" onClick={(event) => event.currentTarget.blur()} pressed>press</Trigger>
	<Slot><em>element</em></Slot>
	<Slot>text</Slot>
	<Slot />
}
