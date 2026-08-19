import type { PropsOf } from '@markless/core';

// Only children: the class and the clipping style are this part's whole contract.
type VisuallyHiddenProps = Pick<PropsOf<'span'>, 'children'>;

// Hidden from sight, still read by assistive tech.
// Source: https://www.scottohara.me/blog/2017/04/14/inclusively-hidden.html
export default function VisuallyHidden({ children }: VisuallyHiddenProps) @{
	<span
		class="visually-hidden"
		style="clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px;"
	>{children}</span>
}
