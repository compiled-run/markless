// Two measured walls shape this file, the same two crop records. Every computed
// carries a name unique to the whole module and reads its cells into locals before
// calling anything. And a handler has no `currentTarget` - a lazy handler symbol
// runs after the native dispatch - so a part that must know whether an event was
// raised on itself hands `event.target` to a shared method and lets the method
// compare it against the handles.

import { computed, element, shared, state } from '@markless/core';
import { focusBackToOpener, focusIntoSurface } from './drawer-focus.ts';
import {
	armBackdropPress,
	beginSwipeReading,
	endSwipeReading,
	isBackdropPressFinished,
	recordSwipeReading,
} from './drawer-press.ts';
import {
	activeSnapOf,
	axisAt,
	CLOSE_THRESHOLD,
	closeSign,
	decideRelease,
	DEFAULT_SNAP_POINTS,
	hiddenDuringDrag,
	isRightToLeft,
	keyIntent,
	measureSurface,
	offsetText,
	openAtSnap,
	resolveSnaps,
	stepSnap,
} from './drawer-swipe.ts';
import type {
	DrawerBackdropProps,
	DrawerCloseProps,
	DrawerContentProps,
	DrawerDescriptionProps,
	DrawerInstanceState,
	DrawerOrientation,
	DrawerRootProps,
	DrawerTitleProps,
	DrawerTriggerProps,
} from './drawer-types.ts';

export const drawerState = shared(
	() => {
		const drawer: DrawerInstanceState = state({
			open: false,
			modal: true,
			orientation: 'vertical' as DrawerOrientation,
			start: false,
			snapPoints: DEFAULT_SNAP_POINTS,
			closeThreshold: CLOSE_THRESHOLD,
			given: undefined,
			seed: undefined,
			own: undefined,
			isTriggerOpened: false,
			dragging: false,
			pointerId: -1,
			size: 0,
			grabAt: 0,
			grabHidden: 0,
			dragHidden: 0,
			lastAt: 0,
			lastTime: 0,
			velocity: 0,
			flipped: false,
		});
		const triggerEl = element<HTMLButtonElement>();
		const backdropEl = element<HTMLDivElement>();
		const contentEl = element<HTMLDivElement>();
		const titleEl = element<HTMLHeadingElement>();
		const descriptionEl = element<HTMLParagraphElement>();
		const closeEl = element<HTMLButtonElement>();

		const snaps = computed(() => {
			const points = drawer.snapPoints;
			const measured = drawer.size;
			return resolveSnaps(points, measured);
		});
		const activeSnap = computed(() => {
			const given = drawer.given;
			const own = drawer.own;
			const seed = drawer.seed;
			const rests = snaps;
			return activeSnapOf(given, own, seed, rests);
		});
		const hiddenFraction = computed(() => {
			const isDragging = drawer.dragging;
			const moved = drawer.dragHidden;
			const active = activeSnap;
			const rests = snaps;
			return isDragging ? moved : 1 - openAtSnap(active, rests);
		});
		const offset = computed(() => {
			const now = hiddenFraction;
			return offsetText(now);
		});
		// Authored rather than toggled: the overlay behaviour reads it off the
		// enlisted subtree at the moment the backdrop enlists, and that read is what
		// takes the page behind out of reach and locks its scroll.
		const ariaModal = computed(() => (drawer.modal ? 'true' : undefined));

		return {
			...drawer,
			triggerEl,
			backdropEl,
			contentEl,
			titleEl,
			descriptionEl,
			closeEl,
			snaps,
			activeSnap,
			hiddenFraction,
			offset,
			ariaModal,
			// literal function types: a callback slot is only recognised from the written annotation
			onChange: undefined as ((open: boolean) => void) | undefined,
			onSnapPointChange: undefined as ((snapPoint: number) => void) | undefined,

			setOpen(next: boolean) {
				if (drawer.open === next) return;
				drawer.open = next;
				drawer.onChange?.(next);
			},

			/**
			 * The surface's size and the page's direction. There is no mount hook and
			 * no frame polling, so this runs from the first focus or press that
			 * reaches the surface - which is every route that can move it.
			 */
			measure() {
				const surface = contentEl;
				if (!surface) return;
				const axis = drawer.orientation;
				drawer.size = measureSurface(surface, axis);
				drawer.flipped = isRightToLeft(surface);
			},

			/**
			 * Starts a swipe. Only a press whose target *is* the surface starts one:
			 * there is no handle part to restrict the gesture to, and a descendant is
			 * consumer markup the family has no way to classify - so a button, a text
			 * selection or a scroll region inside the drawer is never a drag start.
			 */
			beginSwipe(target: EventTarget | null, clientX: number, clientY: number, pointerId: number, time: number) {
				const surface = contentEl;
				if (!surface) return;
				if (target !== surface) return;

				const axis = drawer.orientation;
				const active = activeSnap;
				const rests = snaps;
				const resting = 1 - openAtSnap(active, rests);
				const measured = measureSurface(surface, axis);
				const rtl = isRightToLeft(surface);
				const anchoredAtStart = drawer.start;
				const sign = closeSign(axis, anchoredAtStart, rtl);
				const along = axisAt(clientX, clientY, axis);

				drawer.size = measured;
				drawer.flipped = rtl;
				drawer.grabAt = along;
				drawer.grabHidden = resting;
				drawer.dragHidden = resting;
				drawer.pointerId = pointerId;
				drawer.dragging = true;
				beginSwipeReading(surface, along * sign, time);
				// Last, and pointer capture rather than window listeners: the swipe
				// keeps arriving here once the pointer leaves the surface, and a
				// pointer id the platform does not know throws.
				surface.setPointerCapture(pointerId);
			},

			/**
			 * Carries the swipe in flight. Travel is measured from where it was
			 * grabbed rather than from the last move, so a swipe that overshoots and
			 * comes back lands where the pointer is.
			 */
			swipeTo(clientX: number, clientY: number, time: number) {
				const isDragging = drawer.dragging;
				if (!isDragging) return;
				const surface = contentEl;
				if (!surface) return;

				const axis = drawer.orientation;
				const anchoredAtStart = drawer.start;
				const rtl = drawer.flipped;
				const sign = closeSign(axis, anchoredAtStart, rtl);
				const along = axisAt(clientX, clientY, axis);
				const grabbed = drawer.grabAt;
				const startedHidden = drawer.grabHidden;
				const measured = drawer.size;

				drawer.dragHidden = hiddenDuringDrag(startedHidden, (along - grabbed) * sign, measured);
				recordSwipeReading(surface, along * sign, time);
			},

			/** Commits the swipe: the drawer settles on a rest position, or it closes. */
			endSwipe() {
				const isDragging = drawer.dragging;
				if (!isDragging) return;
				const surface = contentEl;

				const moved = drawer.dragHidden;
				const startedHidden = drawer.grabHidden;
				const rests = snaps;
				const limit = drawer.closeThreshold;
				const active = activeSnap;
				const speed = surface ? endSwipeReading(surface) : 0;
				const landed = decideRelease(moved, startedHidden, speed, rests, limit);

				drawer.dragging = false;
				drawer.pointerId = -1;
				drawer.velocity = speed;

				if (landed.close) {
					// The rest position goes back to the seed, so reopening starts where
					// a first open would rather than where the swipe left it.
					drawer.own = undefined;
					const wasOpen = drawer.open;
					drawer.open = false;
					if (wasOpen === true) drawer.onChange?.(false);
					focusBackToOpener(triggerEl, backdropEl, drawer.isTriggerOpened);
					drawer.isTriggerOpened = false;
					return;
				}

				drawer.own = landed.snap;
				if (landed.snap !== active) drawer.onSnapPointChange?.(landed.snap);
			},

			/** Drops the swipe in flight without reporting it. */
			cancelSwipe() {
				const isDragging = drawer.dragging;
				if (!isDragging) return;
				const surface = contentEl;
				if (surface) endSwipeReading(surface);
				const active = activeSnap;
				const rests = snaps;
				drawer.dragging = false;
				drawer.pointerId = -1;
				drawer.dragHidden = 1 - openAtSnap(active, rests);
			},

			/**
			 * An arrow key along the drawer's axis steps one rest position. No
			 * reference library offers this: snap points are pointer-only in all
			 * three, and a keyboard has no other way to reach an intermediate one.
			 * Keys raised inside the drawer belong to whatever they landed on.
			 */
			moveByKey(target: EventTarget | null, key: string) {
				const surface = contentEl;
				if (!surface) return;
				if (target !== surface) return;

				const rests = snaps;
				if (rests.length < 2) return;
				const axis = drawer.orientation;
				const anchoredAtStart = drawer.start;
				const rtl = isRightToLeft(surface);
				const intent = keyIntent(key, axis, anchoredAtStart, rtl);
				if (intent === 0) return;

				const active = activeSnap;
				const next = stepSnap(active, rests, intent);
				if (next === active) return;
				drawer.own = next;
				drawer.onSnapPointChange?.(next);
			},
		};
	},
	{ scope: 'widget' },
);

export function DrawerRoot({
	open = false,
	modal = true,
	orientation = 'vertical',
	start = false,
	snapPoints = DEFAULT_SNAP_POINTS,
	snapPoint,
	defaultSnapPoint,
	closeThreshold = CLOSE_THRESHOLD,
	onChange,
	onSnapPointChange,
	children,
	...rest
}: DrawerRootProps) @{
	const drawer = drawerState();
	drawer.onChange = onChange;
	drawer.onSnapPointChange = onSnapPointChange;
	drawer.open = open;
	drawer.modal = modal;
	drawer.orientation = orientation;
	drawer.start = start;
	drawer.snapPoints = snapPoints;
	drawer.given = snapPoint;
	drawer.seed = defaultSnapPoint;
	drawer.closeThreshold = closeThreshold;

	<div
		{...rest}
		ui-open={drawer.open}
		ui-closed={drawer.open !== true}
		ui-orientation={drawer.orientation}
		ui-start={drawer.start}
		ui-dragging={drawer.dragging}
	>{children}</div>
}

export function DrawerTrigger({ children, onClick, ...rest }: DrawerTriggerProps) @{
	const drawer = drawerState();

	<button
		{...rest}
		el={drawer.triggerEl}
		type="button"
		aria-haspopup="dialog"
		ui-open={drawer.open}
		ui-closed={drawer.open !== true}
		onClick={(event) => {
			drawer.isTriggerOpened = true;
			drawer.setOpen(true);
			focusIntoSurface(drawer.contentEl);
			onClick?.(event);
		}}
	>{children}</button>
}

export function DrawerBackdrop({
	children,
	onDismiss,
	onPointerdown,
	onPointerup,
	...rest
}: DrawerBackdropProps) @{
	const drawer = drawerState();

	<div
		{...rest}
		overlay
		el={drawer.backdropEl}
		hidden={drawer.open !== true}
		ui-backdrop={true}
		ui-open={drawer.open}
		ui-closed={drawer.open !== true}
		ui-orientation={drawer.orientation}
		ui-start={drawer.start}
		onDismiss={(event) => {
			// Escape and a press beyond the layer entirely both close the drawer.
			// Only presses beyond the layer report here, because the behaviour counts
			// its own element as inside.
			drawer.setOpen(false);
			focusBackToOpener(drawer.triggerEl, drawer.backdropEl, drawer.isTriggerOpened);
			drawer.isTriggerOpened = false;
			onDismiss?.(event);
		}}
		onPointerdown={(event) => {
			// A dismissal starts here and finishes on the release, so a swipe that
			// began on the surface and ended on the layer never closes it twice.
			armBackdropPress(drawer.backdropEl, event.target, event.button);
			onPointerdown?.(event);
		}}
		onPointerup={(event) => {
			// Read here rather than on `click`, keeping the whole gesture in the
			// pointer vocabulary the press began in.
			const isOutsidePress = isBackdropPressFinished(drawer.backdropEl, event.target);
			if (isOutsidePress) {
				drawer.setOpen(false);
				focusBackToOpener(drawer.triggerEl, drawer.backdropEl, drawer.isTriggerOpened);
				drawer.isTriggerOpened = false;
			}
			onPointerup?.(event);
		}}
	>
		<style>
			@layer markless {
				[ui-backdrop] { position: fixed; inset: 0; }
			}
		</style>
		{children}
	</div>
}

export function DrawerContent({
	children,
	onPointerdown,
	onPointermove,
	onPointerup,
	onPointercancel,
	onKeydown,
	onFocusin,
	...rest
}: DrawerContentProps) @{
	const drawer = drawerState();

	<div
		{...rest}
		el={drawer.contentEl}
		role="dialog"
		aria-modal={drawer.ariaModal}
		aria-labelledby={drawer.titleEl}
		aria-describedby={drawer.descriptionEl}
		tabindex={-1}
		style={drawer.offset}
		ui-content={true}
		ui-open={drawer.open}
		ui-closed={drawer.open !== true}
		ui-orientation={drawer.orientation}
		ui-start={drawer.start}
		ui-dragging={drawer.dragging}
		onPointerdown={(event) => {
			if (event.button === 0) {
				drawer.beginSwipe(
					event.target,
					event.clientX,
					event.clientY,
					event.pointerId,
					event.timeStamp,
				);
			}
			onPointerdown?.(event);
		}}
		onPointermove={(event) => {
			drawer.swipeTo(event.clientX, event.clientY, event.timeStamp);
			onPointermove?.(event);
		}}
		onPointerup={(event) => {
			drawer.endSwipe();
			onPointerup?.(event);
		}}
		onPointercancel={(event) => {
			drawer.cancelSwipe();
			onPointercancel?.(event);
		}}
		onKeydown={(event) => {
			// Guarded by event fields alone: a guard over locals derived from graph
			// state is MARKLESS_SYNC_POLICY_UNEXTRACTABLE.
			if (
				event.key === 'ArrowUp' ||
				event.key === 'ArrowDown' ||
				event.key === 'ArrowLeft' ||
				event.key === 'ArrowRight'
			) {
				event.preventDefault();
			}
			drawer.moveByKey(event.target, event.key);
			onKeydown?.(event);
		}}
		onFocusin={(event) => {
			// The one route that measures without moving anything: the surface takes
			// focus as it opens, so a pixel snap point has a size to resolve against
			// before the first swipe.
			drawer.measure();
			onFocusin?.(event);
		}}
	>
		<style>
			@layer markless {
				[ui-content] {
					position: fixed;
					inset-inline: 0;
					inset-block: auto 0;
					translate: 0 calc(var(--offset, 0) * 100%);
					/* The browser must not claim the pan before the family sees it, and a
					   swipe that runs out of drawer must not rubber-band the page behind -
					   the iOS webview failure. A scroll region inside the drawer sets its
					   own touch-action, because this one reaches its descendants. */
					touch-action: none;
					overscroll-behavior: contain;
				}
				[ui-content][ui-start] {
					inset-block: 0 auto;
					translate: 0 calc(var(--offset, 0) * -100%);
				}
				[ui-content][ui-orientation=horizontal] {
					inset-block: 0;
					inset-inline: auto 0;
					translate: calc(var(--offset, 0) * 100%) 0;
				}
				[ui-content][ui-orientation=horizontal][ui-start] {
					inset-inline: 0 auto;
					translate: calc(var(--offset, 0) * -100%) 0;
				}
				/* `inset-inline` is logical and `translate` is physical, so the inline
				   axis needs the page's direction to agree on which way is out. */
				[ui-content][ui-orientation=horizontal]:dir(rtl) {
					translate: calc(var(--offset, 0) * -100%) 0;
				}
				[ui-content][ui-orientation=horizontal][ui-start]:dir(rtl) {
					translate: calc(var(--offset, 0) * 100%) 0;
				}
			}
		</style>
		{children}
	</div>
}

export function DrawerTitle({ children, ...rest }: DrawerTitleProps) @{
	const drawer = drawerState();

	<h2 {...rest} el={drawer.titleEl}>{children}</h2>
}

export function DrawerDescription({ children, ...rest }: DrawerDescriptionProps) @{
	const drawer = drawerState();

	<p {...rest} el={drawer.descriptionEl}>{children}</p>
}

export function DrawerClose({ children, onClick, ...rest }: DrawerCloseProps) @{
	const drawer = drawerState();

	<button
		{...rest}
		el={drawer.closeEl}
		type="button"
		onClick={(event) => {
			drawer.setOpen(false);
			focusBackToOpener(drawer.triggerEl, drawer.backdropEl, drawer.isTriggerOpened);
			drawer.isTriggerOpened = false;
			onClick?.(event);
		}}
	>{children}</button>
}
