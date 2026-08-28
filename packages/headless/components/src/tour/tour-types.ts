import type { PropsOf, Seeded } from '@markless/core';

/**
 * The tour itself; the spotlight and every step's card go inside it. It holds
 * whether the tour is showing and which step it is on.
 *
 * The root deliberately carries no anchor scope. A tour's target is an element
 * the consumer owns, somewhere else on the page entirely, so confining the
 * anchor name to this subtree would hide it from the card that needs it.
 */
export type TourRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** Whether the tour is showing. Omit it and the tour starts closed. */
	readonly open?: boolean;
	/** Whether the last step advances to the first and the first goes back to the last. Off by default: a tour has a beginning and an end. */
	readonly loop?: boolean;
	/**
	 * Whether a press outside the card closes the tour. On by default.
	 *
	 * A press inside the current step's own target never closes it whatever this
	 * says - the tour just told the person to click that.
	 */
	readonly closeOnInteractOutside?: boolean;
	/** Whether the tour refuses to move. The card still shows the step it is on. */
	readonly disabled?: boolean;
	/** Called with the new step's position when the tour moves. */
	readonly onChange?: (step: number) => void;
	/** Called with the new value when the tour opens or closes - including when Escape or a press outside closes it. */
	readonly onOpenChange?: (open: boolean) => void;
};

/**
 * One step: the card the person reads, and the element on the page it is about.
 *
 * Where the step comes in the tour is where you wrote it. There is no `index`:
 * the step's place is its place among the cards the tour has bound, and the
 * tour's length is how many of them there are, so a reorder or a loop cannot
 * make a hand-written number lie.
 *
 * The card is placed by CSS anchoring against the target, so it holds while the
 * page scrolls and reflows with no script. Placement is CSS, never a prop: the
 * card ships a default `position-area` of `block-end` inside `@layer markless`,
 * and one unlayered rule of yours replaces it -
 * `.my-card { position-area: block-start }`. A step with no `target` anchors to
 * nothing, which leaves the `position-area` inert and the card wherever your own
 * ungated rule puts it - `inset: 0; margin: auto` for a centred step.
 */
export type TourItemProps = PropsOf<'div'> & {
	/**
	 * The element this step is about, as an `element()` handle you bound on it.
	 *
	 * Pass the handle itself, never inside an array or an object: a handle only
	 * crosses a component edge as a bare prop.
	 */
	readonly target?: HTMLElement;
};

/** The card is a non-modal dialog: it carries no `aria-modal`, so the page behind it stays reachable and the target stays clickable. */
export type TourCardProps = PropsOf<'div'>;

/**
 * The spotlight. It is not a layer with a hole in it - it *is* the hole, sized
 * and placed by the anchor, and the dim is its own `box-shadow` spread. The
 * colour, the corner radius and any transition are ordinary CSS of yours.
 *
 * It takes no pointer events, so the target underneath stays pressable.
 */
export type TourBackdropProps = PropsOf<'div'>;

/** The step's name. Mounting it is what names the card. */
export type TourTitleProps = PropsOf<'h2'>;

/** A sentence the reader announces after the name. Say which element the step means in words - the dim is not accessible, the description is. */
export type TourDescriptionProps = PropsOf<'p'>;

/** Where the person is up to. Renders "2 of 5" unless you write your own text inside it. */
export type TourValueLabelProps = PropsOf<'span'>;

/** A consumer's `onClick` runs after the tour has closed. */
export type TourCloseProps = PropsOf<'button'>;

/** The previous step. Disabled on the first step unless the tour loops. */
export type TourBackTriggerProps = PropsOf<'button'>;

/** The next step. Disabled on the last step unless the tour loops. */
export type TourForwardTriggerProps = PropsOf<'button'>;

/**
 * The shared instance every tour part reads and writes: the root's seeded
 * fields, the consumer's callbacks, and the current step's target.
 */
export type TourInstanceState = Seeded<
	TourRootProps,
	'open' | 'loop' | 'closeOnInteractOutside' | 'disabled'
> & {
	/** Which step is showing, counting from zero. */
	step: number;
	/**
	 * The current step's target element, or `undefined` for a centred step.
	 *
	 * The only raw element on any family's public surface, and it is here because
	 * a consumer drawing their own highlight has no other way to reach it. It is
	 * written when a card takes focus, so it is a handler-time reading rather than
	 * a render-time one.
	 */
	target?: HTMLElement;
	onChange?: TourRootProps['onChange'];
	onOpenChange?: TourRootProps['onOpenChange'];
};

/** One instance per rendered `tour.item`, holding that step's own target. */
export type TourItemInstanceState = {
	target?: TourItemProps['target'];
};
