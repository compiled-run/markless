import { computed, element, shared, state } from '@markless/core';
import {
	DEFAULT_DURATION,
	TICK,
	dismiss,
	enqueue,
	expire,
	hasExpired,
	holdAll,
	releaseAll,
	positionOf,
	stackingStyle,
	toastId,
} from './toaster-queue.ts';
import type {
	ToastOptions,
	ToasterInstanceState,
	ToasterItemCloseProps,
	ToasterItemDescriptionProps,
	ToasterItemIconProps,
	ToasterItemInstanceState,
	ToasterItemProps,
	ToasterItemTitleProps,
	ToasterRootProps,
} from './toaster-types.ts';

// One queue per page, not per widget: a message raised by a component that never renders the region still has to reach it.
export const toasterState = shared(
	() => {
		const toaster: ToasterInstanceState = state({
			queue: [],
			paused: false,
			pausedAt: 0,
			minted: 0,
			ticker: 0,
		});
		const regionEl = element<HTMLOListElement>();

		return {
			...toaster,
			regionEl,
			/** Raise a message; the returned id lets the same message be updated in place later. */
			toast(title: string, options?: ToastOptions) {
				const id = toastId(options, toaster.minted + 1);
				toaster.minted = toaster.minted + 1;
				toaster.queue = enqueue(toaster.queue, id, title, options, Date.now(), DEFAULT_DURATION);
				// One clock for the whole stack: a per-message timer cannot survive resume, because a row minted after it never ran a body that could start one.
				if (toaster.ticker === 0) {
					toaster.ticker = window.setInterval(() => {
						if (toaster.paused) return;
						if (hasExpired(toaster.queue, Date.now())) {
							toaster.queue = expire(toaster.queue, Date.now());
						}
						if (toaster.queue.length === 0) {
							window.clearInterval(toaster.ticker);
							toaster.ticker = 0;
						}
					}, TICK);
				}
				return id;
			},
			dismiss(id: string) {
				toaster.queue = dismiss(toaster.queue, id);
			},
			/** Hovering or tabbing in stops every clock, WCAG 2.2.2's own rule. */
			pause() {
				if (toaster.paused) return;
				toaster.pausedAt = Date.now();
				toaster.queue = holdAll(toaster.queue, Date.now());
				toaster.paused = true;
			},
			resume() {
				if (toaster.paused !== true) return;
				toaster.queue = releaseAll(toaster.queue, Date.now());
				toaster.paused = false;
			},
		};
	},
	{ scope: 'page' },
);

export const toasterItemState = shared(
	() => {
		const item: ToasterItemInstanceState = state({
			id: '',
			title: '',
			description: '',
			tone: 'neutral',
			icon: '',
			index: 0,
		});

		return { ...item };
	},
	{ scope: 'widget' },
);

// No attach= on this root: a behavior on a page-scoped root crashes the render.
export function ToasterRoot({
	children,
	onPointerover,
	onPointerout,
	onFocusin,
	onFocusout,
	...rest
}: ToasterRootProps) @{
	const toaster = toasterState();

	<ol
		{...rest}
		el={toaster.regionEl}
		// The region is in the DOM before the first message: a live region that arrives together with its text is not announced.
		aria-live="polite"
		aria-atomic="false"
		aria-relevant="additions"
		tabindex={-1}
		ui-toaster=""
		ui-paused={toaster.paused}
		onPointerover={(event) => {
			toaster.pause();
			onPointerover?.(event);
		}}
		onPointerout={(event) => {
			toaster.resume();
			onPointerout?.(event);
		}}
		onFocusin={(event) => {
			toaster.pause();
			onFocusin?.(event);
		}}
		onFocusout={(event) => {
			toaster.resume();
			onFocusout?.(event);
		}}
	>
		{children}
	</ol>
}

/** One message. `--index` and `--offset` are the stacking data a consumer's own styles read; `ui-front` marks the front one. */
export function ToasterItem({ toast, children, ...rest }: ToasterItemProps) @{
	const toaster = toasterState();
	const item = toasterItemState();
	item.id = toast.id;
	item.title = toast.title;
	item.description = toast.description;
	item.tone = toast.tone;
	item.icon = toast.icon;
	// One computed() cell per rendered fact - an expression written inline in an attribute renders once and then goes stale.
	const isFront = computed(() => positionOf(toaster.queue, item.id) === 0);
	const stacking = computed(() => stackingStyle(positionOf(toaster.queue, item.id)));

	<li {...rest} ui-toast="" ui-tone={item.tone} ui-front={isFront} style={stacking}>{children}</li>
}

/** The message's words. Left empty it renders the title it was given. */
export function ToasterItemTitle({ children, ...rest }: ToasterItemTitleProps) @{
	const item = toasterItemState();

	<div {...rest} ui-toasttitle="">
		@if (children) {
			{children}
		} @else {
			{item.title}
		}
	</div>
}

/** The line under the title. Left empty it renders the description it was given. */
export function ToasterItemDescription({ children, ...rest }: ToasterItemDescriptionProps) @{
	const item = toasterItemState();

	<div {...rest} ui-toastdescription="">
		@if (children) {
			{children}
		} @else {
			{item.description}
		}
	</div>
}

/** The tone's mark. Hidden from readers: the words carry the meaning. */
export function ToasterItemIcon({ children, ...rest }: ToasterItemIconProps) @{
	const item = toasterItemState();

	<span {...rest} ui-toasticon="" aria-hidden="true">
		@if (children) {
			{children}
		} @else {
			{item.icon}
		}
	</span>
}

/** Dismisses the message it sits in. It needs no id: the item it is inside knows. */
export function ToasterItemClose({ children, onClick, ...rest }: ToasterItemCloseProps) @{
	const toaster = toasterState();
	const item = toasterItemState();

	<button
		{...rest}
		type="button"
		ui-toastclose=""
		onClick={(event) => {
			toaster.dismiss(item.id);
			onClick?.(event);
		}}
	>{children}</button>
}
