import { element, shared, state } from '@markless/core';
import type {
	HovercardContentProps,
	HovercardInstanceState,
	HovercardRootProps,
	HovercardSide,
	HovercardTriggerProps,
} from './hovercard-types.ts';

// The card is placed by CSS anchoring alone: the trigger declares the anchor, the
// card points at it, and the geometry is the consumer's stylesheet.
// The scope class these <style> blocks compile against is per MODULE, so each
// block's subject must be structurally unique across all three parts: the trigger
// is this module's only anchor element, the card is its only element carrying
// `ui-side`, and the root is the div that is left.
// Nothing here writes `aria-describedby` or `role="tooltip"`: a card holding links
// and buttons flattened into a description is one unreachable run-on string.

export const hovercardState = shared(
	() => {
		const hovercard: HovercardInstanceState = state({
			open: false,
			delay: 700,
			closeDelay: 300,
			side: 'bottom' as HovercardSide,
			openTimer: 0,
			restingUntil: 0,
			closeTimer: 0,
			closingUntil: 0,
		});
		const rootEl = element<HTMLDivElement>();
		const triggerEl = element<HTMLAnchorElement>();
		const contentEl = element<HTMLDivElement>();

		return {
			...hovercard,
			rootEl,
			triggerEl,
			contentEl,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((open: boolean) => void) | undefined,
			setOpen(next = false) {
				if (hovercard.open === next) return;
				hovercard.open = next;
				hovercard.onChange?.(next);
			},
		};
	},
	{ scope: 'widget' },
);

export function HovercardRoot({
	open = false,
	delay = 700,
	closeDelay = 300,
	side = 'bottom',
	onChange,
	children,
	onPointerover,
	onPointerout,
	onFocusin,
	onFocusout,
	...rest
}: HovercardRootProps) @{
	const hovercard = hovercardState();
	hovercard.onChange = onChange;
	hovercard.open = open;
	hovercard.delay = delay;
	hovercard.closeDelay = closeDelay;
	hovercard.side = side;

	// Every handler sits on the root, which wraps both parts, so trigger -> card is
	// an intra-root move for the pointer and for Tab alike. That is WCAG 1.4.13
	// hoverable and the focus-enterable card, both from the structure.
	// Measured: these handlers report through the `onChange` prop they close over, because a shared method's body copied into a handler module cannot see a callback this same component's render put on the instance.
	<div
		{...rest}
		el={hovercard.rootEl}
		ui-open={hovercard.open}
		ui-closed={hovercard.open !== true}
		onPointerover={(event) => {
			const box = hovercard.rootEl;
			const came = event.relatedTarget as Node | null;
			// pointerover fires again for every element inside the root; only a crossing from outside it is an enter.
			if (
				event.pointerType === 'touch' ||
				box === undefined ||
				(came !== null && box.contains(came) === true)
			) {
				onPointerover?.(event);
				return;
			}

			// Cleared before the open guard: a pointer that came back during the grace
			// must call off the pending hide even though nothing has to open.
			window.clearTimeout(hovercard.closeTimer);
			hovercard.closeTimer = 0;
			hovercard.closingUntil = 0;
			if (hovercard.open === true) {
				onPointerover?.(event);
				return;
			}

			const now = Date.now();
			const isRested =
				hovercard.delay <= 0 || (hovercard.restingUntil !== 0 && now >= hovercard.restingUntil);
			if (isRested) {
				window.clearTimeout(hovercard.openTimer);
				hovercard.openTimer = 0;
				hovercard.restingUntil = 0;
				hovercard.open = true;
				onChange?.(true);
			} else if (hovercard.restingUntil === 0) {
				// The timer re-delivers the crossing rather than showing the card: shared reads are rewritten only at the handler's top level, so `hovercard.setOpen()` inside this closure is a ReferenceError.
				const wait = hovercard.delay;
				hovercard.restingUntil = now + wait;
				hovercard.openTimer = window.setTimeout(() => {
					box.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
				}, wait + 5);
			}
			onPointerover?.(event);
		}}
		onPointerout={(event) => {
			const box = hovercard.rootEl;
			const went = event.relatedTarget as Node | null;
			if (box === undefined || (went !== null && box.contains(went) === true)) {
				onPointerout?.(event);
				return;
			}

			window.clearTimeout(hovercard.openTimer);
			hovercard.openTimer = 0;
			hovercard.restingUntil = 0;
			if (hovercard.open !== true) {
				onPointerout?.(event);
				return;
			}

			// The card sits at a visible offset by convention, so the pointer crosses
			// dead space that is inside neither part. `closeDelay` is what carries it.
			const now = Date.now();
			const isElapsed =
				hovercard.closeDelay <= 0 ||
				(hovercard.closingUntil !== 0 && now >= hovercard.closingUntil);
			if (isElapsed) {
				window.clearTimeout(hovercard.closeTimer);
				hovercard.closeTimer = 0;
				hovercard.closingUntil = 0;
				hovercard.open = false;
				onChange?.(false);
			} else if (hovercard.closingUntil === 0) {
				const wait = hovercard.closeDelay;
				hovercard.closingUntil = now + wait;
				hovercard.closeTimer = window.setTimeout(() => {
					box.dispatchEvent(new PointerEvent('pointerout', { bubbles: true }));
				}, wait + 5);
			}
			onPointerout?.(event);
		}}
		onFocusin={(event) => {
			const box = hovercard.rootEl;
			const came = event.relatedTarget as Node | null;
			if (box === undefined || (came !== null && box.contains(came) === true)) {
				onFocusin?.(event);
				return;
			}

			window.clearTimeout(hovercard.closeTimer);
			hovercard.closeTimer = 0;
			hovercard.closingUntil = 0;
			if (hovercard.open === true) {
				onFocusin?.(event);
				return;
			}

			// Focus waits the same `delay` the pointer does - the inversion of tooltip's rule. Someone tabbing along a paragraph of links has declared interest in none of them, and a card firing at every stop is the annoyance the delay exists to prevent.
			const now = Date.now();
			const isRested =
				hovercard.delay <= 0 || (hovercard.restingUntil !== 0 && now >= hovercard.restingUntil);
			if (isRested) {
				window.clearTimeout(hovercard.openTimer);
				hovercard.openTimer = 0;
				hovercard.restingUntil = 0;
				hovercard.open = true;
				onChange?.(true);
			} else if (hovercard.restingUntil === 0) {
				const wait = hovercard.delay;
				hovercard.restingUntil = now + wait;
				hovercard.openTimer = window.setTimeout(() => {
					box.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
				}, wait + 5);
			}
			onFocusin?.(event);
		}}
		onFocusout={(event) => {
			// Scoped to the root, never to the trigger: Tab from the trigger into the card blurs the trigger, and a family that closed on that could never be entered at all.
			const box = hovercard.rootEl;
			const next = event.relatedTarget as Node | null;
			if (box === undefined) {
				onFocusout?.(event);
				return;
			}
			if (next === null || box.contains(next) !== true) {
				window.clearTimeout(hovercard.openTimer);
				hovercard.openTimer = 0;
				hovercard.restingUntil = 0;
				window.clearTimeout(hovercard.closeTimer);
				hovercard.closeTimer = 0;
				hovercard.closingUntil = 0;
				if (hovercard.open === true) {
					hovercard.open = false;
					onChange?.(false);
				}
			}
			onFocusout?.(event);
		}}
	>
		<style>
			div:not([ui-side]) { anchor-scope: --ui-hovercard; }
		</style>
		{children}
	</div>
}

// An anchor and only an anchor: the card is a shortcut to where the link goes, so
// everything in it is reachable without it. Typing the part as `<a>` is what makes
// that structural rather than advice.
export function HovercardTrigger({ children, ...rest }: HovercardTriggerProps) @{
	const hovercard = hovercardState();

	<a
		{...rest}
		el={hovercard.triggerEl}
		aria-expanded={hovercard.open ? 'true' : 'false'}
		aria-controls={hovercard.contentEl}
		ui-open={hovercard.open}
		ui-closed={hovercard.open !== true}
	>
		<style>
			a { anchor-name: --ui-hovercard; }
		</style>
		{children}
	</a>
}

// Written after the trigger: a CSS anchor must be laid out strictly before the element that names it, which an in-flow trigger satisfies from anywhere - but a consumer who absolutely positions their trigger and writes the card first gets a silent miss.
// Hidden hides the card, never detaches it: `hidden` is also what keeps its links out of the tab order while closed, the trigger points at this element's minted id, and an enlisted element removed from the document leaves the overlay stack's marks behind.
// No role at all. Not `tooltip`, which would call a tab stop holding buttons a description; not `dialog`, which would demand a name and imply a modality this family refuses.
export function HovercardContent({ children, onDismiss, ...rest }: HovercardContentProps) @{
	const hovercard = hovercardState();

	<div
		{...rest}
		el={hovercard.contentEl}
		overlay
		hidden={hovercard.open !== true}
		ui-open={hovercard.open}
		ui-closed={hovercard.open !== true}
		ui-side={hovercard.side}
		onDismiss={(event) => {
			const surface = hovercard.contentEl;
			const back = hovercard.triggerEl;
			// Read before the close: a hidden subtree cannot hold focus, so afterwards the answer is gone.
			const isFocusInside = surface !== undefined && surface.contains(document.activeElement);
			hovercard.setOpen(false);
			// A press elsewhere is a person choosing where to be, so only Escape hands focus back.
			if (event.detail.reason === 'escape' && isFocusInside) back?.focus();
			onDismiss?.(event);
		}}
	>
		<style>
			[ui-side] { position: absolute; position-anchor: --ui-hovercard; }
		</style>
		{children}
	</div>
}
