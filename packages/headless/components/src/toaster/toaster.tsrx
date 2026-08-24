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
	shownSlice,
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

/** How many messages show at once when a root does not say. */
const DEFAULT_VISIBLE = 3;

/**
 * One queue per page, not per widget: a message raised by a component that never
 * renders the region still has to reach it, and `toaster.root` is placed once.
 */
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
			/**
			 * Say something. The id comes back so the same message can be said again
			 * later - a save that starts as "Saving..." and finishes as "Saved" is one
			 * message updated in place, not two.
			 */
			toast(title: string, options?: ToastOptions) {
				const id = toastId(options, toaster.minted + 1);
				toaster.minted = toaster.minted + 1;
				toaster.queue = enqueue(toaster.queue, id, title, options, Date.now(), DEFAULT_DURATION);
				// One clock for the whole stack, started by the first message and
				// stopped when the last one leaves: per-message timers would have to
				// be owned, cancelled and rebuilt across a resume, and a row this
				// runtime minted after resume never ran a body that could start one.
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
			/** Take one message away. Whatever was waiting behind it moves up. */
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
			/** Leaving starts them again from where each message stopped. */
			resume() {
				if (toaster.paused !== true) return;
				toaster.queue = releaseAll(toaster.queue, Date.now());
				toaster.paused = false;
			},
		};
	},
	{ scope: 'page' },
);

/** One instance per rendered `toaster.item`, read by the parts inside it. */
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

/**
 * The region every message appears in, and the whole family's easy path: written
 * with no children it renders the messages itself.
 *
 * The rows it renders are deliberately plain - static markup, text read from the
 * message, and one close button. That is exactly the shape this runtime can
 * build for itself after a resume, so a page served with an empty stack still
 * grows a real row for the first message a person's click raises. Writing the
 * rows out by hand (the custom path below) buys per-message attributes and gives
 * that up; note.md carries the measurement.
 */
export function ToasterRoot({
	visible,
	children,
	onPointerover,
	onPointerout,
	onFocusin,
	onFocusout,
	...rest
}: ToasterRootProps) @{
	const toaster = toasterState();
	// The showing slice is a cell of this component, not of the page-wide graph:
	// `visible` is a prop, and a page-scoped factory is never handed props.
	const shown = computed(() => shownSlice(toaster.queue, visible ?? DEFAULT_VISIBLE));

	<ol
		{...rest}
		el={toaster.regionEl}
		// No attach= here: a behavior on a page-scoped root crashes the render.
		// The F8 shortcut it would have carried is in toaster-hotkey.ts, unwired.
		// The region is in the DOM before the first message on purpose: a live
		// region that arrives together with its text is not announced.
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
		@if (children === undefined) {
			@for (const message of shown; key message.id) {
				<li ui-toast="">
					<span ui-toasticon="" aria-hidden="true">{message.icon}</span>
					<div ui-toasttitle="">{message.title}</div>
					<div ui-toastdescription="">{message.description}</div>
					<button
						type="button"
						ui-toastclose=""
						aria-label="Dismiss"
						onClick={() => {
							toaster.dismiss(message.id);
						}}
					>×</button>
				</li>
			}
		}
	</ol>
}

/**
 * One message, written out. `--index` and `--offset` are the stacking data a
 * consumer's own styles read, and `ui-front` marks the one at the front.
 */
export function ToasterItem({ toast, children, ...rest }: ToasterItemProps) @{
	const toaster = toasterState();
	const item = toasterItemState();
	item.id = toast.id;
	item.title = toast.title;
	item.description = toast.description;
	item.tone = toast.tone;
	item.icon = toast.icon;
	// One cell per rendered fact, each read in one position: the row's place in
	// the queue moves whenever the queue does, and an expression written inline in
	// an attribute renders once and then goes stale.
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
