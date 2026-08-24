import { computed, element, shared, state } from '@markless/core';
import { moveToValue, slideEngine } from './carousel-engine.ts';
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
		});
		const titleEl = element<HTMLDivElement>();
		const scrollEl = element<HTMLDivElement>();
		const viewportEl = element<HTMLDivElement>();
		const slideEls = element<HTMLDivElement[]>();
		const navEls = element<HTMLButtonElement[]>();

		return {
			...carousel,
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

				const next = keyValue(reachable, carousel.value, key, isWrapping);
				if (next === undefined) return;
				if (carousel.value !== next) {
					carousel.value = next;
					carousel.onChange?.(next);
				}

				moveToValue(scrollEl, viewportEl, carousel.orientation, slides, next, carousel.align);

				const pickers = navEls ?? [];
				const landed = reachable.indexOf(next);
				pickers[landed]?.focus();
			},

			/** The APG's rule: any focus or hover inside stops the rotation, and only the rotation control starts it again. */
			stopAutoplay() {
				if (carousel.autoplayTimer !== 0) window.clearInterval(carousel.autoplayTimer);
				carousel.autoplayTimer = 0;
				carousel.autoplay = false;
			},

			startAutoplay() {
				if (carousel.autoplayTimer !== 0) window.clearInterval(carousel.autoplayTimer);
				carousel.autoplayTimer = 0;

				const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
				if (isReducedMotion) return;

				carousel.autoplay = true;
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
				track.setPointerCapture(pointerId);
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
	carousel.mousewheel = mousewheel;
	carousel.mouseSensitivity = sensitivity?.mouse ?? 1.5;
	carousel.touchSensitivity = sensitivity?.touch ?? 1.25;

	<div
		{...rest}
		role="group"
		aria-roledescription="carousel"
		aria-live={carousel.autoplay ? 'off' : 'polite'}
		aria-atomic="false"
		ui-vertical={carousel.orientation === 'vertical'}
		ui-loop={carousel.loop}
		onFocusin={(event) => {
			carousel.stopAutoplay();
			onFocusin?.(event);
		}}
		onPointerover={(event) => {
			carousel.stopAutoplay();
			onPointerover?.(event);
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
	<div {...rest} role="tablist">{children}</div>
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
			// Guarded by event fields alone: a guard over locals derived from graph state is MARKLESS_SYNC_POLICY_UNEXTRACTABLE.
			if (
				event.key === 'ArrowRight' ||
				event.key === 'ArrowLeft' ||
				event.key === 'Home' ||
				event.key === 'End'
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

	<button
		{...rest}
		type="button"
		aria-label={carousel.autoplay ? 'stop automatic slide show' : 'start automatic slide show'}
		onClick={(event) => {
			if (carousel.autoplay) carousel.stopAutoplay();
			else carousel.startAutoplay();
			onClick?.(event);
		}}
	>{children}</button>
}
