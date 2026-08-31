import type { PropsOf } from '@markless/core';

// A plain wrapper that renders whatever it is given: the "preview shell" shape a
// docs page puts a demo inside.
export default function WrapperFrame({ children, ...rest }: PropsOf<'div'>) @{
	<div {...rest} data-testid="frame">{children}</div>
}
