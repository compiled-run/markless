import type { PropsOf, Seeded } from '@markless/core';

/** Which axis the slides run along. */
export type CarouselOrientation = 'horizontal' | 'vertical';

/** Where a slide comes to rest inside the viewport. */
export type CarouselAlign = 'start' | 'center' | 'end';

/**
 * How many slides a back or forward trigger moves. A number moves that many;
 * `"view"` moves a whole viewport's worth, measured from the slides themselves.
 */
export type CarouselMove = number | 'view';

/** How far the slides travel for a given drag distance, per pointer kind. */
export type CarouselSensitivity = {
	readonly mouse?: number;
	readonly touch?: number;
};

export type CarouselRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/**
	 * The value of the slide showing now. A slide is named by its `value`, and
	 * nothing counts positions for you, so name the slide that should show.
	 */
	readonly value?: string;
	/** Slides advance on their own. Start it from a `carousel.playtrigger`. */
	readonly autoplay?: boolean;
	/** A drag moves the slides. Omit it and dragging is on. */
	readonly draggable?: boolean;
	/** Where a slide comes to rest in the viewport. Omit it and slides rest at the start. */
	readonly align?: CarouselAlign;
	/** Moving past the last slide lands on the first. Omit it and the ends stop. */
	readonly rewind?: boolean;
	/** The slides run in an endless ring. Omit it and the ends stop. */
	readonly loop?: boolean;
	/** How long each slide is shown while autoplay runs, in milliseconds. */
	readonly autoplayInterval?: number;
	/** How far the slides travel for a given drag distance. */
	readonly sensitivity?: CarouselSensitivity;
	/** How many slides a back or forward trigger moves. */
	readonly move?: CarouselMove;
	/** Which axis the slides run along. Omit it and they run left to right. */
	readonly orientation?: CarouselOrientation;
	/** The wheel moves the slides. Omit it and the wheel scrolls the page. */
	readonly mousewheel?: boolean;
	/** Called with the new value whenever the showing slide changes. */
	readonly onChange?: (value: string) => void;
};

/**
 * One slide. It carries `role="group"` and `aria-roledescription="slide"`, or
 * `role="tabpanel"` when the carousel has a nav list to pick slides with.
 */
export type CarouselItemProps = PropsOf<'div'> & {
	/** Names the slide. A `carousel.navtrigger` with the same value shows it. Required. */
	readonly value: string;
};

/** One slide picker. `role="tab"` inside the nav list's `role="tablist"`. */
export type CarouselNavTriggerProps = PropsOf<'button'> & {
	/** Names the slide this picker shows. Required. */
	readonly value: string;
};

/** The carousel's heading. Mounting it names the carousel for a screen reader. */
export type CarouselTitleProps = PropsOf<'div'>;

/** The window the slides move behind, and the element a drag is measured on. */
export type CarouselScrollAreaProps = PropsOf<'div'>;

/** The row of slide pickers. `role="tablist"`. */
export type CarouselNavListProps = PropsOf<'div'>;

/** Moves back one step. Labelled "Previous slide" unless you say otherwise. */
export type CarouselBackTriggerProps = PropsOf<'button'>;

/** Moves forward one step. Labelled "Next slide" unless you say otherwise. */
export type CarouselForwardTriggerProps = PropsOf<'button'>;

/** Starts and stops autoplay. Its label says which one the press will do. */
export type CarouselPlayTriggerProps = PropsOf<'button'>;

/**
 * The shared instance every carousel part reads and writes: the root's seeded
 * props, the handles the slide engine drives, and the rules the parts call.
 */
export type CarouselInstanceState = Seeded<
	CarouselRootProps,
	| 'value'
	| 'autoplay'
	| 'draggable'
	| 'align'
	| 'rewind'
	| 'loop'
	| 'autoplayInterval'
	| 'move'
	| 'orientation'
	| 'mousewheel'
> & {
	/** How far the slides travel per pointer kind, defaulted by the root. */
	mouseSensitivity: number;
	touchSensitivity: number;
	/** A `carousel.title` mounted, so the root names itself from it. */
	isTitled: boolean;
	/** A `carousel.navtrigger` mounted, so the slides are tab panels. */
	isTabbed: boolean;
	/** A drag is in flight, so the reactive move must keep its hands off. */
	isDragging: boolean;
	/** The running autoplay interval, or 0. A number, so the graph can hold it. */
	autoplayTimer: number;
	onChange?: CarouselRootProps['onChange'];
};

/** One instance per rendered slide and per rendered picker, holding its own value. */
export type CarouselPartInstanceState = Seeded<CarouselItemProps, 'value'>;
