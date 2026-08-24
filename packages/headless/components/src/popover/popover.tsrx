import { element, shared, state } from '@markless/core';
import { anchorSurface } from './popover-anchor.ts';
import type {
	PopoverCloseProps,
	PopoverContentProps,
	PopoverDescriptionProps,
	PopoverInstanceState,
	PopoverRootProps,
	PopoverSide,
	PopoverTitleProps,
	PopoverTriggerProps,
} from './popover-types.ts';

/** How long a press that closed the surface keeps the click behind it from re-opening, in milliseconds. */
const CLICK_GRACE = 300;

export const popoverState = shared(
	() => {
		const popover: PopoverInstanceState = state({
			open: false,
			side: 'bottom' as PopoverSide,
			graceUntil: 0,
		});
		const triggerEl = element<HTMLButtonElement>();
		const contentEl = element<HTMLDivElement>();
		const titleEl = element<HTMLHeadingElement>();
		const descriptionEl = element<HTMLParagraphElement>();
		const closeEl = element<HTMLButtonElement>();

		return {
			...popover,
			triggerEl,
			contentEl,
			titleEl,
			descriptionEl,
			closeEl,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((open: boolean) => void) | undefined,
			setOpen(next: boolean) {
				if (popover.open === next) return;
				popover.open = next;
				popover.onChange?.(next);
			},
		};
	},
	{ scope: 'widget' },
);

export function PopoverRoot({
	open = false,
	side = 'bottom',
	onChange,
	children,
	...rest
}: PopoverRootProps) @{
	const popover = popoverState();
	popover.onChange = onChange;
	popover.open = open;
	popover.side = side;

	<div
		{...rest}
		ui-open={popover.open}
		ui-closed={popover.open !== true}
	>{children}</div>
}

export function PopoverTrigger({ children, onClick, ...rest }: PopoverTriggerProps) @{
	const popover = popoverState();

	<button
		{...rest}
		el={popover.triggerEl}
		type="button"
		aria-haspopup="dialog"
		aria-expanded={popover.open ? 'true' : 'false'}
		aria-controls={popover.contentEl}
		ui-open={popover.open}
		ui-closed={popover.open !== true}
		onClick={(event) => {
			if (popover.graceUntil <= Date.now()) {
				popover.setOpen(popover.open !== true);
				// The surface is still `hidden` here, so the placement waits for the DOM rather than for this call.
				if (popover.open === true) {
					anchorSurface(popover.triggerEl, popover.contentEl, popover.side);
				}
			}
			onClick?.(event);
		}}
	>{children}</button>
}

// Closed hides the surface, never detaches it: the trigger points at this element's minted id, and an enlisted element removed from the document leaves the overlay stack's marks behind.
// `overlay` is a bare attribute the primitive reads; while enlisted it reports Escape and outside presses as `dismiss`, closing nothing and moving no focus itself.
export function PopoverContent({ children, onDismiss, ...rest }: PopoverContentProps) @{
	const popover = popoverState();

	<div
		{...rest}
		el={popover.contentEl}
		overlay
		role="dialog"
		aria-labelledby={popover.titleEl}
		aria-describedby={popover.descriptionEl}
		hidden={popover.open !== true}
		ui-open={popover.open}
		ui-closed={popover.open !== true}
		ui-side={popover.side}
		onDismiss={(event) => {
			const surface = popover.contentEl;
			const back = popover.triggerEl;
			// Read before the close: a hidden subtree cannot hold focus, so afterwards the answer is gone.
			const isFocusInside = surface !== undefined && surface.contains(document.activeElement);
			// `contains` rather than `===`: a consumer may put an icon inside the trigger, and the press lands on that.
			const pressed = event.detail.pressTarget;
			const isOwnTriggerPress =
				pressed !== undefined && back !== undefined && back.contains(pressed);
			popover.setOpen(false);
			if (isOwnTriggerPress) popover.graceUntil = Date.now() + CLICK_GRACE;
			// The primitive moves no focus, and a press elsewhere is a person choosing where to be, so only Escape hands it back.
			if (event.detail.reason === 'escape' && isFocusInside) back?.focus();
			onDismiss?.(event);
		}}
	>{children}</div>
}

export function PopoverTitle({ children, ...rest }: PopoverTitleProps) @{
	const popover = popoverState();

	<h2 {...rest} el={popover.titleEl}>{children}</h2>
}

export function PopoverDescription({ children, ...rest }: PopoverDescriptionProps) @{
	const popover = popoverState();

	<p {...rest} el={popover.descriptionEl}>{children}</p>
}

export function PopoverClose({ children, onClick, ...rest }: PopoverCloseProps) @{
	const popover = popoverState();

	<button
		{...rest}
		el={popover.closeEl}
		type="button"
		onClick={(event) => {
			popover.setOpen(false);
			popover.triggerEl?.focus();
			onClick?.(event);
		}}
	>{children}</button>
}
