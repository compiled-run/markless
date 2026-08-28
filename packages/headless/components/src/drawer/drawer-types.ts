import type { PropsOf, Seeded } from '@markless/core';

/**
 * Which axis the drawer travels on. The one enum shape the part-naming spec
 * blesses: it selects an axis, it does not fork the component. Which of the
 * axis's two edges the drawer is anchored to is the `start` boolean.
 */
export type DrawerOrientation = 'horizontal' | 'vertical';

/**
 * Why the overlay behaviour reported a dismissal.
 *
 * The vocabulary is owned by `OverlayDismissReason` in
 * `packages/web/src/fns/overlay.ts` and is restated here only because
 * `@markless/ui` does not depend on `@markless/web`.
 */
export type DrawerDismissReason = 'escape' | 'outside-press';

/** The event the overlay behaviour delivers on the enlisted backdrop. */
export type DrawerDismissEvent = CustomEvent<{ readonly reason: DrawerDismissReason }>;

/**
 * A dialog that slides in from an edge and can be swiped back out. The trigger,
 * backdrop, surface, naming parts and close control all go inside it.
 *
 * The root renders no elevated layer of its own - `drawer.backdrop` is the
 * element that is elevated, the same division `drawer.modal` uses.
 */
export type DrawerRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** Whether the drawer is showing. Omit it and the drawer starts closed. */
	readonly open?: boolean;
	/**
	 * The page behind cannot be reached, read or scrolled while the drawer shows.
	 * Defaults to true. Turning it off keeps the surface elevated and dismissible
	 * and leaves the rest of the page live.
	 */
	readonly modal?: boolean;
	/**
	 * The axis the drawer travels on. `vertical` (the default) is the bottom
	 * sheet every reference defaults to; `horizontal` is the side panel.
	 */
	readonly orientation?: DrawerOrientation;
	/**
	 * Anchor the drawer at the start edge of its axis - block-start for a
	 * vertical drawer, inline-start for a horizontal one - rather than the end
	 * edge. Logical, so a right-to-left page gets the correct side without a
	 * second prop.
	 */
	readonly start?: boolean;
	/**
	 * The rest positions the drawer settles at, as fractions of the drawer's own
	 * size along its axis. A value above 1 is read as pixels instead. Defaults to
	 * `[1]`: one position, fully open. Order does not matter.
	 */
	readonly snapPoints?: readonly number[];
	/**
	 * The rest position the drawer is at now, as one of the values in
	 * `snapPoints`. Passing this makes the snap point controlled: a gesture
	 * reports through `onSnapPointChange` and nothing moves until the new value
	 * comes back in.
	 */
	readonly snapPoint?: number;
	/** The rest position an uncontrolled drawer starts at. Defaults to the largest. */
	readonly defaultSnapPoint?: number;
	/**
	 * How far past its lowest rest position the drawer has to be pulled before
	 * releasing closes it, as a fraction of that position. Defaults to 0.25.
	 */
	readonly closeThreshold?: number;
	/**
	 * Called with the new value when the drawer opens or closes - including when
	 * a dismissal or a swipe closes it.
	 */
	readonly onChange?: (open: boolean) => void;
	/** Called with the authored snap point value once a gesture or a key settles on it. */
	readonly onSnapPointChange?: (snapPoint: number) => void;
};

/** A consumer's `onClick` runs after the drawer has opened. */
export type DrawerTriggerProps = PropsOf<'button'>;

/** A consumer's `onClick` runs after the drawer has closed. */
export type DrawerCloseProps = PropsOf<'button'>;

/**
 * The dimming layer, and the element that is actually elevated: it carries the
 * `overlay` mark, the `hidden` gating, and the dismissal reports the overlay
 * behaviour delivers. It wraps `drawer.content` rather than sitting beside it.
 *
 * A consumer's `onDismiss` runs after the family has applied its own policy.
 */
export type DrawerBackdropProps = PropsOf<'div'>;

/**
 * The drawer surface, and the thing a swipe moves. It stays in the page when the
 * drawer is closed - `hidden` on the backdrop decides whether it shows - because
 * the overlay behaviour marks the background off an attached element.
 *
 * The family owns this element's `style` attribute to carry `--offset`, the
 * unitless fraction of the drawer's own size by which it is currently displaced
 * along its axis. Style the surface from a stylesheet rather than a `style` prop.
 */
export type DrawerContentProps = PropsOf<'div'>;

/** The drawer's name. Mounting it is what names the surface. */
export type DrawerTitleProps = PropsOf<'h2'>;

/** A sentence the reader announces after the name. */
export type DrawerDescriptionProps = PropsOf<'p'>;

/**
 * The shared instance every drawer part reads and writes: the root's seeded
 * fields, the consumer's callbacks, and the gesture in flight.
 *
 * The gesture's cells live here rather than in a module because they render -
 * `--offset` and `ui-dragging` are read off them - unlike modal's press guard,
 * which renders nothing and therefore stays out of the graph.
 */
export type DrawerInstanceState = Seeded<
	DrawerRootProps,
	'open' | 'modal' | 'orientation' | 'start' | 'snapPoints' | 'closeThreshold'
> & {
	onChange?: DrawerRootProps['onChange'];
	onSnapPointChange?: DrawerRootProps['onSnapPointChange'];
	/** The controlled snap point, when the consumer passes one. */
	given: number | undefined;
	/** The snap point an uncontrolled drawer starts at. */
	seed: number | undefined;
	/** The snap point the last gesture or key settled on. */
	own: number | undefined;
	/**
	 * Whether the trigger part is what opened the drawer that is showing now. It
	 * decides where focus goes when the drawer closes, exactly as it does in
	 * `src/modal/`.
	 */
	isTriggerOpened: boolean;
	/** A swipe is in flight. */
	dragging: boolean;
	/** The pointer that owns the swipe, or -1. */
	pointerId: number;
	/** The surface's size along its axis, measured when the swipe began. */
	size: number;
	/** Where along the axis the pointer went down, in client pixels. */
	grabAt: number;
	/** How much of the drawer was hidden when the pointer went down, as a fraction. */
	grabHidden: number;
	/** How much of the drawer is hidden now, as a fraction. Only read while dragging. */
	dragHidden: number;
	/** The last client coordinate the swipe reported, and when. */
	lastAt: number;
	lastTime: number;
	/** Signed pixels per millisecond toward closed, from the last two moves. */
	velocity: number;
	/** Whether the axis runs right to left, read from the surface when the swipe began. */
	flipped: boolean;
};
