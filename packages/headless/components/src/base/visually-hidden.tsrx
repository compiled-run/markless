import type { VisuallyHiddenProps } from './base-types.ts';

// Hidden from sight, still read by assistive tech. The style is inline and no class
// ships, so no consumer stylesheet can collide with it.
// Technique: https://www.scottohara.me/blog/2017/04/14/inclusively-hidden.html
export default function VisuallyHidden({ children }: VisuallyHiddenProps) @{
	<span
		style="clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px;"
	>{children}</span>
}
