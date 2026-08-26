import type { PropsOf, Seeded } from '@markless/core';

/**
 * Which side of the trigger the tooltip sits on. `start` and `end` are the
 * writing direction's sides, so they swap in a right-to-left page; `top` and
 * `bottom` are the same everywhere.
 */
export type TooltipSide = 'top' | 'bottom' | 'start' | 'end';

/**
 * The tooltip itself; the trigger and the tip go inside it, in that order. It
 * holds whether the tip is showing, how long the pointer has to rest before it
 * shows, and which side it sits on.
 *
 * The pointer handlers live here rather than on the trigger, so moving the
 * pointer from the trigger onto the tip never counts as leaving.
 */
export type TooltipRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** Whether the tooltip is showing. Omit it and it starts hidden. */
	readonly open?: boolean;
	/**
	 * How long the pointer must rest on the trigger before the tooltip shows, in
	 * milliseconds. Omit it and it is 600. Focus shows it at once, with no wait.
	 */
	readonly delay?: number;
	/**
	 * Where the tooltip sits against the trigger. It is written on
	 * `tooltip.content` as `ui-side`; the placement itself is your CSS.
	 */
	readonly side?: TooltipSide;
	/**
	 * Called with the new value when the tooltip shows or hides, including when
	 * Escape or a press elsewhere hides it.
	 */
	readonly onChange?: (open: boolean) => void;
};

/**
 * The control the tooltip describes. It carries the CSS anchor the tip is
 * placed against, declared in the part's own scoped stylesheet - your `style`
 * and `class` compose untouched.
 *
 * It points at the tip with `aria-describedby` at all times, showing or not: a
 * directly referenced hidden element still contributes its text to the
 * description, so tabbing to the trigger conveys the tip without it ever being
 * shown.
 *
 * An icon-only trigger needs its own accessible name - write `aria-label` on it.
 * The tooltip describes the control; it never names it.
 */
export type TooltipTriggerProps = PropsOf<'button'>;

/**
 * The tip. It is text, not a surface a person can work in: no links, no buttons,
 * nothing to focus.
 *
 * **Write it after `tooltip.trigger`.** A CSS anchor has to be laid out strictly
 * before the element that points at it. An ordinary in-flow trigger satisfies
 * that from anywhere in the markup, so the order is only advice - until you
 * absolutely position the trigger yourself, at which point a tip written first
 * silently lands at its containing block instead of beside it. CSS has no way to
 * report that, so put the tip last and the question never comes up.
 *
 * It stays in the page when the tooltip is hidden - `hidden` decides whether it
 * shows, never an arm - because the trigger points at its minted id and because
 * an elevated element removed from the document while showing leaves the overlay
 * stack's marks behind.
 *
 * Its `position: absolute` and anchor binding live in the part's own scoped
 * stylesheet - your `style` and `class` compose untouched. Everything about
 * where the tip lands - `position-area`, `@position-try`, `position-visibility`,
 * offsets - is your CSS, keyed off `ui-side`.
 */
export type TooltipContentProps = PropsOf<'div'>;

/**
 * The shared instance every tooltip part reads and writes: the root's seeded
 * fields, plus the consumer's `onChange`, stored by the root for `setOpen()` to
 * call.
 */
export type TooltipInstanceState = Seeded<TooltipRootProps, 'open' | 'delay' | 'side'> & {
	onChange?: TooltipRootProps['onChange'];
	/** The pending show timer, zero when nothing is pending. */
	openTimer: number;
	/**
	 * When the resting pointer has waited long enough, as a timestamp, and zero
	 * when nothing is pending.
	 *
	 * A scheduled callback cannot reach the graph, so the timer re-delivers the
	 * crossing instead of showing the tip itself; this is what tells the handler
	 * on its second run that the wait is over. Nothing renders from it, but it
	 * lives in the instance state because that is the only thing a part's handler
	 * may write to.
	 */
	restingUntil: number;
};
