import type { PropsOf } from '@markless/core';

export function Btn({ children, ...rest }: PropsOf<'button'>) @{
	<button {...rest} type="button">{children}</button>
}
