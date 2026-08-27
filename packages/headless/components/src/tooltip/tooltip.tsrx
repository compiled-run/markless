import { element, shared, state } from '@markless/core';
import type {
	TooltipContentProps,
	TooltipInstanceState,
	TooltipRootProps,
	TooltipTriggerProps,
} from './tooltip-types.ts';

// The tip is placed by CSS anchoring alone: the trigger declares the anchor, the
// tip points at it, and the geometry is the consumer's stylesheet. Nothing here
// measures a box, so a tip served already showing is placed on its first layout.
// The scope class these <style> blocks compile against is per MODULE, so each
// block's subject must be structurally unique across all three parts: the trigger
// is this module's only button, the tip is its only element carrying `overlay`,
// and the root is the div that is left.

export const tooltipState = shared(
	() => {
		const tooltip: TooltipInstanceState = state({
			open: false,
			delay: 600,
			openTimer: 0,
			restingUntil: 0,
		});
		const rootEl = element<HTMLDivElement>();
		const triggerEl = element<HTMLButtonElement>();
		const contentEl = element<HTMLDivElement>();

		return {
			...tooltip,
			rootEl,
			triggerEl,
			contentEl,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((open: boolean) => void) | undefined,
			setOpen(next = false) {
				if (tooltip.open === next) return;
				tooltip.open = next;
				tooltip.onChange?.(next);
			},
		};
	},
	{ scope: 'widget' },
);

export function TooltipRoot({
	open = false,
	delay = 600,
	onChange,
	children,
	onPointerover,
	onPointerout,
	...rest
}: TooltipRootProps) @{
	const tooltip = tooltipState();
	tooltip.onChange = onChange;
	tooltip.open = open;
	tooltip.delay = delay;

	// The pointer handlers sit on the root, not the trigger, so moving from the trigger onto the tip never counts as leaving - WCAG 1.4.13 hoverable, from the structure rather than from a tracked polygon.
	<div
		{...rest}
		el={tooltip.rootEl}
		ui-open={tooltip.open}
		ui-closed={tooltip.open !== true}
		onPointerover={(event) => {
			const box = tooltip.rootEl;
			const came = event.relatedTarget as Node | null;
			// pointerover fires again for every element inside the root; only a crossing from outside it is an enter.
			if (
				event.pointerType === 'touch' ||
				tooltip.open === true ||
				box === undefined ||
				(came !== null && box.contains(came) === true)
			) {
				onPointerover?.(event);
				return;
			}

			const now = Date.now();
			const isRested =
				tooltip.delay <= 0 || (tooltip.restingUntil !== 0 && now >= tooltip.restingUntil);
			if (isRested) {
				window.clearTimeout(tooltip.openTimer);
				tooltip.openTimer = 0;
				tooltip.restingUntil = 0;
				tooltip.setOpen(true);
			} else if (tooltip.restingUntil === 0) {
				// The timer re-delivers the crossing rather than showing the tip: shared reads are rewritten only at the handler's top level, so `tooltip.setOpen()` inside this closure is a ReferenceError.
				const wait = tooltip.delay;
				tooltip.restingUntil = now + wait;
				tooltip.openTimer = window.setTimeout(() => {
					box.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
				}, wait + 5);
			}
			onPointerover?.(event);
		}}
		onPointerout={(event) => {
			const box = tooltip.rootEl;
			const went = event.relatedTarget as Node | null;
			if (box === undefined || (went !== null && box.contains(went) === true)) {
				onPointerout?.(event);
				return;
			}
			window.clearTimeout(tooltip.openTimer);
			tooltip.openTimer = 0;
			tooltip.restingUntil = 0;
			tooltip.setOpen(false);
			onPointerout?.(event);
		}}
	>
		<style>
			@layer markless {
				div:not([overlay]) { anchor-scope: --ui-tooltip; }
			}
		</style>
		{children}
	</div>
}

export function TooltipTrigger({ children, onFocus, onBlur, ...rest }: TooltipTriggerProps) @{
	const tooltip = tooltipState();

	// `aria-describedby` is permanent: a directly referenced hidden node still contributes its text, so Tab conveys the tip with nothing shown.
	// Focus shows the tip at once - a person who reached the control by keyboard has already declared the intent a resting pointer only implies.
	<button
		{...rest}
		el={tooltip.triggerEl}
		type="button"
		aria-describedby={tooltip.contentEl}
		ui-open={tooltip.open}
		ui-closed={tooltip.open !== true}
		onFocus={(event) => {
			tooltip.setOpen(true);
			onFocus?.(event);
		}}
		onBlur={(event) => {
			tooltip.setOpen(false);
			onBlur?.(event);
		}}
	>
		<style>
			@layer markless {
				button { anchor-name: --ui-tooltip; }
			}
		</style>
		{children}
	</button>
}

// Written after the trigger: a CSS anchor must be laid out strictly before the element that names it, which an in-flow trigger satisfies from anywhere - but a consumer who absolutely positions their trigger and writes the tip first gets a silent miss.
// Hidden hides the tip, never detaches it: the trigger points at this element's minted id, and an enlisted element removed from the document leaves the overlay stack's marks behind.
// `overlay` is a bare attribute the primitive reads; while enlisted it reports Escape and outside presses - including a press on the tooltip's own trigger - as `dismiss`.
export function TooltipContent({ children, onDismiss, ...rest }: TooltipContentProps) @{
	const tooltip = tooltipState();

	<div
		{...rest}
		el={tooltip.contentEl}
		overlay
		role="tooltip"
		hidden={tooltip.open !== true}
		ui-open={tooltip.open}
		ui-closed={tooltip.open !== true}
		onDismiss={(event) => {
			// No focus return: the tip never holds focus, so there is nowhere to hand it back from.
			tooltip.setOpen(false);
			onDismiss?.(event);
		}}
	>
		<style>
			@layer markless {
				[overlay] { --ui-anchor: --ui-tooltip; position: absolute; position-anchor: --ui-tooltip; position-area: block-start; }
			}
		</style>
		{children}
	</div>
}
