import type { PropsOf, Seeded } from '@markless/core';

/**
 * Which side of the trigger the surface is placed on. `start` and `end` are the
 * writing direction's sides, so they swap in a right-to-left page; `top` and
 * `bottom` are the same everywhere.
 */
export type PopoverSide = 'top' | 'bottom' | 'start' | 'end';

/**
 * The popover itself; the trigger and the surface go inside it. It holds whether
 * the surface is showing and which side it is placed on, and it is the anchor
 * end of the CSS anchor placement, which lives in the part's own scoped
 * stylesheet - your `style` and `class` compose untouched.
 */
export type PopoverRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** Whether the surface is showing. Omit it and the popover starts closed. */
	readonly open?: boolean;
	/**
	 * Where the surface is placed against the trigger. It is also written on
	 * `popover.content` as `ui-side`, so styling can follow the placement.
	 *
	 * The placement is a CSS anchor, so it holds while the page scrolls and
	 * reflows without any script. The anchor binding and one default
	 * `position-area` per side ship in the parts' own scoped stylesheets, inside
	 * `@layer markless` - so any unlayered rule of yours keyed off `ui-side`
	 * replaces the default without a specificity fight. `--ui-anchor` on
	 * `popover.content` names the anchor for your own `anchor()` geometry.
	 */
	readonly side?: PopoverSide;
	/**
	 * Called with the new value when the popover opens or closes - including when
	 * Escape or a press outside closes it. Omit it and the popover still opens and
	 * closes; the call site simply does nothing.
	 */
	readonly onChange?: (open: boolean) => void;
};

/** A consumer's `onClick` runs after the popover has opened or closed. */
export type PopoverTriggerProps = PropsOf<'button'>;

/**
 * The surface. It is not modal: it carries no `aria-modal`, so the page behind it
 * stays reachable, keeps its focus, and is never made inert.
 *
 * It stays in the page when the popover is closed - `hidden` decides whether it
 * shows, never an arm - because an elevated element removed from the document
 * while it is showing leaves the overlay stack's marks behind.
 *
 * A consumer's `onDismiss` runs after the family has closed the popover, so a
 * handler can see which way the family went.
 */
export type PopoverContentProps = PropsOf<'div'>;

/** The surface's name. Mounting it is what names the surface. */
export type PopoverTitleProps = PropsOf<'h2'>;

/** A sentence the reader announces after the name. */
export type PopoverDescriptionProps = PropsOf<'p'>;

/** A consumer's `onClick` runs after the popover has closed. */
export type PopoverCloseProps = PropsOf<'button'>;

/**
 * The shared instance every popover part reads and writes: the root's seeded
 * fields, plus the consumer's `onChange`, stored by the root for `setOpen()` to
 * call.
 */
export type PopoverInstanceState = Seeded<PopoverRootProps, 'open' | 'side'> & {
	onChange?: PopoverRootProps['onChange'];
	/**
	 * When the trigger's next click is ignored, as a timestamp.
	 *
	 * A press on the trigger of an open popover is an outside press, so it closes
	 * the surface before the click that follows reaches the trigger. Without the
	 * grace that click re-opens what the press just shut. Nothing renders from it,
	 * but it lives in the instance state because that is the only thing a part's
	 * handler may write to.
	 */
	graceUntil: number;
};
