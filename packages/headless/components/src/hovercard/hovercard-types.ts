import type { PropsOf, Seeded } from '@markless/core';

/**
 * The hover card itself; the trigger and the card go inside it, in that order.
 * It holds whether the card is showing, how long the pointer has to rest or
 * focus has to stay before it shows, and how long it lingers after the pointer
 * leaves. Where the card sits is your CSS, never a prop.
 *
 * The pointer and focus handlers live here rather than on the trigger, so moving
 * from the trigger into the card - with the pointer or with Tab - never counts
 * as leaving.
 */
export type HovercardRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** Whether the card is showing. Omit it and it starts hidden. */
	readonly open?: boolean;
	/**
	 * How long the pointer must rest on the trigger, or focus must stay on it,
	 * before the card shows, in milliseconds. Omit it and it is 700. Focus waits
	 * the same time as the pointer: a person tabbing through a paragraph of links
	 * has declared no interest in any one of them.
	 */
	readonly delay?: number;
	/**
	 * How long the card stays after the pointer leaves, in milliseconds. Omit it
	 * and it is 300. It is what lets the pointer cross the gap between the trigger
	 * and the card without the card going away.
	 */
	readonly closeDelay?: number;
	/**
	 * Called with the new value when the card shows or hides, including when
	 * Escape or a press elsewhere hides it.
	 */
	readonly onChange?: (open: boolean) => void;
};

/**
 * The link the card previews. It renders an `<a>` and only an `<a>`, because the
 * card is a shortcut to where the link goes: **never put anything in the card
 * that is not also behind the link.** That is what makes the family defensible
 * for a person on a touch screen, or reading with a virtual cursor, who will
 * never see the card at all - they follow the link and get everything.
 *
 * It carries `aria-expanded` and `aria-controls` pointing at the card, so a
 * reader is told the surface exists and can be entered. Tab from the trigger
 * moves into the card, because the card is the trigger's next DOM sibling and
 * nothing takes it out of the tab order.
 *
 * It also carries the CSS anchor the card is placed against, declared in the
 * part's own scoped stylesheet - your `style` and `class` compose untouched.
 */
export type HovercardTriggerProps = PropsOf<'a'>;

/**
 * The card. Unlike a tooltip's tip this is a surface a person can work in: put
 * links, buttons and images in it freely.
 *
 * It carries no `role`. It is not a description of the trigger and not a dialog;
 * its contents are read as themselves. Nothing here writes `aria-describedby`,
 * which would flatten the whole card into one run-on string with every link
 * welded together and none of them reachable.
 *
 * **Write it after `hovercard.trigger`.** A CSS anchor has to be laid out
 * strictly before the element that points at it. An ordinary in-flow trigger
 * satisfies that from anywhere in the markup, so the order is only advice -
 * until you absolutely position the trigger yourself, at which point a card
 * written first silently lands at its containing block instead of beside it. CSS
 * has no way to report that, so put the card last and the question never comes
 * up.
 *
 * It stays in the page when the card is hidden - `hidden` decides whether it
 * shows, never an arm - because the trigger points at its minted id, because
 * `hidden` is what takes its links out of the tab order, and because an elevated
 * element removed from the document while showing leaves the overlay stack's
 * marks behind.
 *
 * Its `position: absolute`, anchor binding and a default `position-area` of
 * `block-end` live in the part's own scoped stylesheet, inside
 * `@layer markless` - your `style` and `class` compose untouched. One unlayered
 * rule of your own moves it: `.my-card { position-area: block-start }`. Everything
 * else about where the card lands - `@position-try`, `position-visibility`,
 * offsets - is your CSS too.
 */
export type HovercardContentProps = PropsOf<'div'>;

/**
 * The shared instance every hovercard part reads and writes: the root's seeded
 * fields, plus the consumer's `onChange`, stored by the root for `setOpen()` to
 * call.
 */
export type HovercardInstanceState = Seeded<
	HovercardRootProps,
	'open' | 'delay' | 'closeDelay'
> & {
	onChange?: HovercardRootProps['onChange'];
	/** The pending show timer, zero when nothing is pending. */
	openTimer: number;
	/**
	 * When the resting pointer or the settled focus has waited long enough, as a
	 * timestamp, and zero when nothing is pending.
	 *
	 * A scheduled callback cannot reach the graph, so the timer re-delivers the
	 * crossing instead of showing the card itself; this is what tells the handler
	 * on its second run that the wait is over. Nothing renders from it, but it
	 * lives in the instance state because that is the only thing a part's handler
	 * may write to.
	 */
	restingUntil: number;
	/** The pending hide timer, zero when nothing is pending. */
	closeTimer: number;
	/** When the leaving pointer's grace runs out, as a timestamp, and zero when nothing is pending. */
	closingUntil: number;
};
