import type { PropsOf } from '@markless/core';

/**
 * Content that is hidden from sight but still reached by screen readers and
 * still focusable. The clipping style is written inline and no class ships, so
 * no consumer stylesheet can collide with it.
 */
type VisuallyHiddenProps = Pick<PropsOf<'span'>, 'children'>;

// Hidden from sight, still read by assistive tech. The style is inline and no class
// ships, so no consumer stylesheet can collide with it.
// Technique: https://www.scottohara.me/blog/2017/04/14/inclusively-hidden.html
export default function VisuallyHidden({ children }: VisuallyHiddenProps) @{
	<span
		style="clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px;"
	>{children}</span>
}
