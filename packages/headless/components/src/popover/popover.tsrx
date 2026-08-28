import { element, shared, state } from '@markless/core';
import type {
	PopoverCloseProps,
	PopoverContentProps,
	PopoverDescriptionProps,
	PopoverInstanceState,
	PopoverRootProps,
	PopoverTitleProps,
	PopoverTriggerProps,
} from './popover-types.ts';

// The surface is placed by CSS anchoring alone: the trigger declares the anchor,
// the surface points at it, and the geometry beyond one default `position-area`
// is the consumer's stylesheet. Nothing here measures a box, so a surface served
// already showing is placed on its first layout.
// The scope class these <style> blocks compile against is per MODULE, so each
// block's subject must be structurally unique across every part: the trigger is
// the module's only button carrying `aria-haspopup`, the surface its only element
// carrying `overlay`, and the root the div that is left.
// `@layer markless` is what keeps these defaults losing to a consumer's own
// unlayered rules without a specificity fight.

/** How long a press that closed the surface keeps the click behind it from re-opening, in milliseconds. */
const CLICK_GRACE = 300;

export const popoverState = shared(
	() => {
		const popover: PopoverInstanceState = state({
			open: false,
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
	onChange,
	children,
	...rest
}: PopoverRootProps) @{
	const popover = popoverState();
	popover.onChange = onChange;
	popover.open = open;

	<div
		{...rest}
		ui-open={popover.open}
		ui-closed={popover.open !== true}
	>
		<style>
			@layer markless {
				div:not([overlay]) { anchor-scope: --ui-popover; }
			}
		</style>
		{children}
	</div>
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
			if (popover.graceUntil <= Date.now()) popover.setOpen(popover.open !== true);
			onClick?.(event);
		}}
	>
		<style>
			@layer markless {
				button[aria-haspopup] { anchor-name: --ui-popover; }
			}
		</style>
		{children}
	</button>
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
	>
		<style>
			@layer markless {
				[overlay] {
					--ui-anchor: --ui-popover;
					position: absolute;
					position-anchor: --ui-popover;
					position-area: block-end;
				}
			}
		</style>
		{children}
	</div>
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
