import type { PropsOf } from '@markless/core';

type ButtonProps = Pick<PropsOf<'button'>, 'children' | 'disabled'>;

export default function Button({ disabled, children }: ButtonProps) @{
	<button type="button" disabled={disabled}>{children}</button>
}
