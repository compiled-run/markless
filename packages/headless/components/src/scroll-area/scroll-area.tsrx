import type {
	ScrollAreaRootProps,
	ScrollAreaScrollbarProps,
	ScrollAreaThumbProps,
	ScrollAreaViewportProps,
} from './scroll-area-types.ts';

// No shared state and no handlers: at these tiers the family is markup plus
// CSS, so there is nothing to seed, nothing to resume, and no listener to
// register. See note.md for the tier boundary.

export function ScrollAreaRoot({ children, ...rest }: ScrollAreaRootProps) @{
	<div {...rest}>{children}</div>
}

export function ScrollAreaViewport({ children, ...rest }: ScrollAreaViewportProps) @{
	// A scroll container with no focusable children cannot be reached or scrolled
	// by keyboard, so the tabindex is the family's one hard obligation; the role
	// is what lets the consumer's name be announced. The name itself is the
	// consumer's, and none is invented here.
	<div {...rest} tabindex={0} role="region">{children}</div>
}

export function ScrollAreaScrollbar({ orientation, children, ...rest }: ScrollAreaScrollbarProps) @{
	// Paint over a control that is already operable by keyboard, wheel, touch and
	// find-in-page, so it is decoration: exposing it would put a second, redundant
	// scrollbar in the accessibility tree. The default is written as the fallback
	// here rather than as a destructuring default, which a template position
	// cannot read (note.md, limit 1).
	<div
		{...rest}
		aria-hidden="true"
		ui-vertical={orientation !== 'horizontal'}
		ui-horizontal={orientation === 'horizontal'}
	>{children}</div>
}

export function ScrollAreaThumb({ ...rest }: ScrollAreaThumbProps) @{
	<div {...rest} aria-hidden="true" />
}
