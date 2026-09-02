import { computed, element, shared, state } from '@markless/core';
import { capturePointer, moveToValue, slideEngine } from './carousel-engine.ts';
import {
	autoplayValue,
	keyValue,
	reachableValues,
	slideValues,
	stepValue,
} from './carousel-navigation.ts';
import type {
	CarouselAlign,
	CarouselBackTriggerProps,
	CarouselForwardTriggerProps,
	CarouselInstanceState,
	CarouselItemProps,
	CarouselMove,
	CarouselNavListProps,
	CarouselNavTriggerProps,
	CarouselOrientation,
	CarouselPartInstanceState,
	CarouselPlayTriggerProps,
	CarouselRootProps,
	CarouselScrollAreaProps,
	CarouselTitleProps,
} from './carousel-types.ts';

export const carouselState = shared(
	() => {
		const carousel: CarouselInstanceState = state({
			value: '',
			autoplay: false,
			draggable: true,
			align: 'start' as CarouselAlign,
			rewind: false,
			loop: false,
			autoplayInterval: 3000,
			move: 1 as CarouselMove,
			orientation: 'horizontal' as CarouselOrientation,
			mousewheel: false,
			mouseSensitivity: 1.5,
			touchSensitivity: 1.25,
			isTitled: false,
			isTabbed: false,
			isDragging: false,
			autoplayTimer: 0,
			vertical: false,
			horizontal: true,
			hoverPaused: false,
			reducedMotion: false,
		});
		const rootEl = element<HTMLDivElement>();
		const titleEl = element<HTMLDivElement>();
		const scrollEl = element<HTMLDivElement>();
		const viewportEl = element<HTMLDivElement>();
		const slideEls = element<HTMLDivElement[]>();
		const navEls = element<HTMLButtonElement[]>();

		return {
			...carousel,
			rootEl,
			titleEl,
			scrollEl,
			viewportEl,
			slideEls,
			navEls,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((value: string) => void) | undefined,

			/** Shows a slide: the graph records it, the engine moves to it. */
			show(next: string) {
				if (next === '') return;

				const slides = slideEls ?? [];
				if (slideValues(slides).indexOf(next) < 0) return;

				if (carousel.value !== next) {
					carousel.value = next;
					carousel.onChange?.(next);
				}

				moveToValue(scrollEl, viewportEl, carousel.orientation, slides, next, carousel.align);
			},

			/** One step forward or back, by whatever `move` says a step is. */
			step(direction: number) {
				const slides = slideEls ?? [];
				const engine = slideEngine(scrollEl, viewportEl, carousel.orientation);
				const perView = engine ? engine.slidesPerView(slides, carousel.move) : 1;
				const reachable = reachableValues(slides, perView, carousel.move, carousel.loop);
				const isWrapping = carousel.rewind || carousel.loop;

				const next = stepValue(reachable, carousel.value, direction, isWrapping);
				if (next === undefined) return;
				if (carousel.value !== next) {
					carousel.value = next;
					carousel.onChange?.(next);
				}

				moveToValue(scrollEl, viewportEl, carousel.orientation, slides, next, carousel.align);
			},

			/** Where an arrow, Home or End lands, and the picker that gets the focus. */
			walk(key: string) {
				const slides = slideEls ?? [];
				const engine = slideEngine(scrollEl, viewportEl, carousel.orientation);
				const perView = engine ? engine.slidesPerView(slides, carousel.move) : 1;
				const reachable = reachableValues(slides, perView, carousel.move, carousel.loop);
				const isWrapping = carousel.rewind || carousel.loop;

				const next = keyValue(reachable, carousel.value, key, isWrapping, carousel.vertical);
				if (next === undefined) return;
				if (carousel.value !== next) {
					carousel.value = next;
					carousel.onChange?.(next);
				}

				moveToValue(scrollEl, viewportEl, carousel.orientation, slides, next, carousel.align);

				// The picker for the slide showing, by its own value: with `move` above one the reachable slides and the pickers do not line up by index.
				const pickers = navEls ?? [];
				pickers.find((picker) => picker.getAttribute('ui-value') === next)?.focus();
			},

			/** The APG's rule: focus inside stops the rotation, and only the rotation control starts it again. */
			stopAutoplay() {
				if (carousel.autoplayTimer !== 0) window.clearInterval(carousel.autoplayTimer);
				carousel.autoplayTimer = 0;
				carousel.autoplay = false;
				carousel.hoverPaused = false;
			},

			/** The pointer resting over the carousel holds the rotation without ending it. */
			pauseAutoplay() {
				if (carousel.autoplay !== true) return;
				if (carousel.autoplayTimer !== 0) window.clearInterval(carousel.autoplayTimer);
				carousel.autoplayTimer = 0;
				carousel.hoverPaused = true;
			},

			/** Starts, or gives back what a pause held: the pointer leaving asks for this only while a pause is on. */
			startAutoplay() {
				if (carousel.autoplayTimer !== 0) window.clearInterval(carousel.autoplayTimer);
				carousel.autoplayTimer = 0;

				// Refused out loud: the control says it is unavailable and the root says why, so the press is never swallowed.
				const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
				carousel.reducedMotion = isReducedMotion;
				if (isReducedMotion) return;

				carousel.autoplay = true;
				carousel.hoverPaused = false;
				carousel.autoplayTimer = window.setInterval(() => {
					const slides = slideEls ?? [];
					const engine = slideEngine(scrollEl, viewportEl, carousel.orientation);
					const perView = engine ? engine.slidesPerView(slides, carousel.move) : 1;
					const reachable = reachableValues(slides, perView, carousel.move, carousel.loop);

					const next = autoplayValue(reachable, carousel.value);
					if (next === undefined) return;

					carousel.value = next;
					carousel.onChange?.(next);
					moveToValue(scrollEl, viewportEl, carousel.orientation, slides, next, carousel.align);
				}, carousel.autoplayInterval);
			},

			beginDrag(along: number, pointerId: number, isTouch: boolean) {
				if (!carousel.draggable) return;

				const engine = slideEngine(scrollEl, viewportEl, carousel.orientation);
				const track = scrollEl;
				if (!engine || !track) return;

				// Pointer capture rather than window listeners: the gesture keeps arriving here once the pointer leaves the carousel.
				capturePointer(track, pointerId);
				carousel.isDragging = true;
				engine.beginDrag(along, isTouch ? carousel.touchSensitivity : carousel.mouseSensitivity);
			},

			dragTo(along: number) {
				if (!carousel.isDragging) return;

				const engine = slideEngine(scrollEl, viewportEl, carousel.orientation);
				if (!engine) return;

				engine.dragTo(along);
			},

			endDrag(along: number) {
				if (!carousel.isDragging) return;
				carousel.isDragging = false;

				const engine = slideEngine(scrollEl, viewportEl, carousel.orientation);
				if (!engine) return;

				const slides = slideEls ?? [];
				const landed = engine.endDrag(along, slides, carousel.align);
				if (landed === null) return;

				const next = slideValues(slides)[landed];
				if (next === undefined) return;
				if (carousel.value === next) return;

				carousel.value = next;
				carousel.onChange?.(next);
			},
		};
	},
	{ scope: 'widget' },
);

export function CarouselRoot({
	value = '',
	autoplay = false,
	draggable = true,
	align = 'start',
	rewind = false,
	loop = false,
	autoplayInterval = 3000,
	sensitivity,
	move = 1,
	orientation = 'horizontal',
	mousewheel = false,
	onChange,
	onFocusin,
	onPointerover,
	onPointerout,
	children,
	...rest
}: CarouselRootProps) @{
	const carousel = carouselState();
	carousel.onChange = onChange;
	carousel.value = value;
	carousel.autoplay = autoplay;
	carousel.draggable = draggable;
	carousel.align = align;
	carousel.rewind = rewind;
	carousel.loop = loop;
	carousel.autoplayInterval = autoplayInterval;
	carousel.move = move;
	carousel.orientation = orientation;
	carousel.vertical = orientation === 'vertical';
	carousel.horizontal = orientation !== 'vertical';
	carousel.mousewheel = mousewheel;
	carousel.mouseSensitivity = sensitivity?.mouse ?? 1.5;
	carousel.touchSensitivity = sensitivity?.touch ?? 1.25;
	// Live only while nothing is rotating: a pause under the pointer is not rotating.
	const liveness = computed(() =>
		carousel.autoplay === true && carousel.hoverPaused !== true ? 'off' : 'polite',
	);

	<div
		{...rest}
		el={carousel.rootEl}
		role="group"
		aria-roledescription="carousel"
		aria-live={liveness}
		aria-atomic="false"
		ui-vertical={carousel.orientation === 'vertical'}
		ui-loop={carousel.loop}
		ui-reduced-motion={carousel.reducedMotion}
		onFocusin={(event) => {
			carousel.stopAutoplay();
			onFocusin?.(event);
		}}
		onPointerover={(event) => {
			carousel.pauseAutoplay();
			onPointerover?.(event);
		}}
		onPointerout={(event) => {
			// Crossing between parts fires this too; only a pointer leaving the whole carousel resumes, and only what its arrival paused.
			const root = carousel.rootEl;
			const went = event.relatedTarget as Node | null;
			const isAway = root !== undefined && (went === null || root.contains(went) !== true);
			if (isAway && carousel.autoplay === true && carousel.hoverPaused === true) {
				carousel.startAutoplay();
			}
			onPointerout?.(event);
		}}
	>{children}</div>
}

export function CarouselTitle({ children, ...rest }: CarouselTitleProps) @{
	const carousel = carouselState();
	carousel.isTitled = true;

	<div {...rest} el={carousel.titleEl}>{children}</div>
}

export function CarouselScrollArea({
	children,
	onPointerdown,
	onPointermove,
	onPointerup,
	onWheel,
	...rest
}: CarouselScrollAreaProps) @{
	const carousel = carouselState();

	// Two elements: the consumer's props land on the window they place and size, while the track behind it is what the engine writes its transform on.
	<div
		{...rest}
		el={carousel.viewportEl}
		ui-vertical={carousel.orientation === 'vertical'}
		ui-draggable={carousel.draggable}
		ui-align={carousel.align}
		onPointerdown={(event) => {
			if (event.button === 0) {
				const along = carousel.orientation === 'vertical' ? event.clientY : event.clientX;
				carousel.beginDrag(along, event.pointerId, event.pointerType === 'touch');
			}
			onPointerdown?.(event);
		}}
		onPointermove={(event) => {
			const along = carousel.orientation === 'vertical' ? event.clientY : event.clientX;
			carousel.dragTo(along);
			onPointermove?.(event);
		}}
		onPointerup={(event) => {
			const along = carousel.orientation === 'vertical' ? event.clientY : event.clientX;
			carousel.endDrag(along);
			onPointerup?.(event);
		}}
		onWheel={(event) => {
			if (carousel.mousewheel) carousel.step(event.deltaY > 0 ? 1 : -1);
			onWheel?.(event);
		}}
	>
		<div el={carousel.scrollEl} ui-track ui-vertical={carousel.orientation === 'vertical'}>
			{children}
		</div>
	</div>
}

export function CarouselItem({ value, children, ...rest }: CarouselItemProps) @{
	const carousel = carouselState();
	// The slide's own value as a graph cell: compared against the prop instead, the comparison stops refreshing once the page has resumed.
	const slide: CarouselPartInstanceState = state({ value });
	// One computed() cell - the same comparison written inline in an attribute renders once and then goes stale.
	const isCurrent = computed(() => carousel.value === slide.value);

	// No focus handler here: focusin bubbles, and the root already stops the rotation for anything focused inside.
	<div
		{...rest}
		el={carousel.slideEls}
		ui-value={value}
		role={carousel.isTabbed ? 'tabpanel' : 'group'}
		aria-roledescription={carousel.isTabbed ? undefined : 'slide'}
		ui-active={isCurrent}
	>{children}</div>
}

export function CarouselNavList({ children, ...rest }: CarouselNavListProps) @{
	const carousel = carouselState();

	<div {...rest} role="tablist" aria-orientation={carousel.orientation}>{children}</div>
}

export function CarouselNavTrigger({
	value,
	children,
	onClick,
	onFocus,
	onKeydown,
	...rest
}: CarouselNavTriggerProps) @{
	const carousel = carouselState();
	const pick: CarouselPartInstanceState = state({ value });
	carousel.isTabbed = true;
	const isSelected = computed(() => carousel.value === pick.value);

	<button
		{...rest}
		el={carousel.navEls}
		type="button"
		role="tab"
		ui-value={value}
		aria-selected={isSelected ? 'true' : 'false'}
		tabindex={isSelected ? 0 : -1}
		ui-active={isSelected}
		onClick={(event) => {
			carousel.show(pick.value);
			onClick?.(event);
		}}
		onFocus={(event) => {
			carousel.show(pick.value);
			onFocus?.(event);
		}}
		onKeydown={(event) => {
			// Event fields and bare cells only, the shape lifted into the policy that runs before the handler loads. Each axis negates its own flag: a resumed page stops answering a cell once a handler has written it, and a negation over nothing cancels, which is the safe side.
			if (
				event.key === 'Home' ||
				event.key === 'End' ||
				((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && !carousel.vertical) ||
				((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !carousel.horizontal)
			) {
				event.preventDefault();
				carousel.walk(event.key);
			}

			onKeydown?.(event);
		}}
	>{children}</button>
}

export function CarouselBackTrigger({ children, onClick, ...rest }: CarouselBackTriggerProps) @{
	const carousel = carouselState();

	<button
		{...rest}
		type="button"
		aria-label="Previous slide"
		onClick={(event) => {
			carousel.step(-1);
			onClick?.(event);
		}}
	>{children}</button>
}

export function CarouselForwardTrigger({
	children,
	onClick,
	...rest
}: CarouselForwardTriggerProps) @{
	const carousel = carouselState();

	<button
		{...rest}
		type="button"
		aria-label="Next slide"
		onClick={(event) => {
			carousel.step(1);
			onClick?.(event);
		}}
	>{children}</button>
}

export function CarouselPlayTrigger({ children, onClick, ...rest }: CarouselPlayTriggerProps) @{
	const carousel = carouselState();
	// `false` removes the attribute: a control that may be pressed carries no record.
	const refused = computed(() => (carousel.reducedMotion === true ? 'true' : false));

	<button
		{...rest}
		type="button"
		aria-disabled={refused}
		ui-reduced-motion={carousel.reducedMotion}
		aria-label={carousel.autoplay ? 'stop automatic slide show' : 'start automatic slide show'}
		onClick={(event) => {
			if (carousel.autoplay) carousel.stopAutoplay();
			else carousel.startAutoplay();
			onClick?.(event);
		}}
	>{children}</button>
}
