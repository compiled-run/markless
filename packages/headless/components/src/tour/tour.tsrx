import { computed, element, shared, state } from '@markless/core';
import { nameTarget, releaseTarget, revealTarget, stepAfter } from './tour-anchor.ts';
import { focusBackToTarget, focusIntoCard } from './tour-focus.ts';
import type {
	TourBackdropProps,
	TourBackTriggerProps,
	TourCardProps,
	TourCloseProps,
	TourDescriptionProps,
	TourForwardTriggerProps,
	TourInstanceState,
	TourItemInstanceState,
	TourItemProps,
	TourRootProps,
	TourTitleProps,
	TourValueLabelProps,
} from './tour-types.ts';

// The card and the spotlight are both placed by CSS anchoring against a name the
// family writes onto the consumer's own element, which is the one thing a <style>
// block cannot do: the scope class is minted only onto elements this module
// renders. NEVER put `anchor-scope` on the root - a tour's target is outside the
// root's subtree by construction, so scoping the name there hides it from the
// card instead of isolating it, and the card lands in the corner.
// The scope class these <style> blocks compile against is per MODULE, so each
// block's subject must be structurally unique across every part: the card is the
// module's only element carrying `ui-side`, the spotlight its only one carrying
// `ui-spotlight`.
// Every graph read in this file stands on its own line before it is used: an
// expression nesting one under a call is emitted as written and crashes the
// handler module (MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE).
// DECLARATION ORDER IS LOAD-BEARING, and it is why the item, the root and the
// card sit in this order: a shared() factory's widget root is the FIRST
// component in the module that resolves it. `tour.item` must come before the
// card so the step's own instance is rooted above the element carrying its
// IDREFs; `tour.root` must come before the card so the tour's instance is rooted
// at the root and not at a card. Moving any of the three renames a widget root
// and breaks the family - see note.md.

export const tourState = shared(
	() => {
		const tour: TourInstanceState = state({
			open: false,
			step: 0,
			// Each step writes `index + 1` here as it renders, so the last one leaves
			// the length behind. A plural handle cannot do this job: it reads back
			// empty inside a computed(), so it is a handler-time registry only.
			count: 0,
			loop: false,
			closeOnInteractOutside: true,
			disabled: false,
			// A graph cell, not a plain field: a handler may only read what the graph
			// can lower, and the current target is read in four of them.
			target: undefined as HTMLElement | undefined,
		});
		// Bound on every card and read back in document order, for the one job a
		// handler does with it: landing focus on the card a step change moved to.
		const itemEls = element<HTMLDivElement[]>();

		return {
			...tour,
			itemEls,
			// literal function types: a callback slot is only recognised from the written annotation
			onChange: undefined as ((step: number) => void) | undefined,
			onOpenChange: undefined as ((open: boolean) => void) | undefined,

			/**
			 * The step that just took focus says what it is about.
			 *
			 * This is the family's only hook on a step becoming current: no lifecycle
			 * runs, and the incoming step's target lives in the incoming item's own
			 * instance, which no handler on the outgoing card can reach.
			 */
			enter(target: HTMLElement | undefined) {
				tour.target = target;
				nameTarget(target);
				revealTarget(target);
			},

			next() {
				const locked = tour.disabled;
				if (locked === true) return;
				const bound = itemEls;
				const cards = bound === undefined ? [] : bound;
				const at = tour.step;
				const wraps = tour.loop;
				const to = stepAfter(at, 1, cards.length, wraps === true);
				if (to === at) return;
				const leaving = tour.target;
				releaseTarget(leaving);
				tour.step = to;
				tour.onChange?.(to);
				focusIntoCard(cards, to);
			},

			prev() {
				const locked = tour.disabled;
				if (locked === true) return;
				const bound = itemEls;
				const cards = bound === undefined ? [] : bound;
				const at = tour.step;
				const wraps = tour.loop;
				const to = stepAfter(at, -1, cards.length, wraps === true);
				if (to === at) return;
				const leaving = tour.target;
				releaseTarget(leaving);
				tour.step = to;
				tour.onChange?.(to);
				focusIntoCard(cards, to);
			},

			/** Abandoning the tour part-way. Reported exactly as `close()`; `state().step` is where the person gave up. */
			skip() {
				const showing = tour.open;
				if (showing !== true) return;
				const bound = itemEls;
				const cards = bound === undefined ? [] : bound;
				const at = tour.step;
				const leaving = tour.target;
				releaseTarget(leaving);
				focusBackToTarget(leaving, cards, at);
				tour.target = undefined;
				tour.open = false;
				tour.onOpenChange?.(false);
			},

			close() {
				const showing = tour.open;
				if (showing !== true) return;
				const bound = itemEls;
				const cards = bound === undefined ? [] : bound;
				const at = tour.step;
				const leaving = tour.target;
				releaseTarget(leaving);
				focusBackToTarget(leaving, cards, at);
				tour.target = undefined;
				tour.open = false;
				tour.onOpenChange?.(false);
			},
		};
	},
	{ scope: 'widget' },
);

/** One instance per step, so the parts inside a card read that step's own facts. */
export const tourItemState = shared(
	() => {
		const item: TourItemInstanceState = state({
			index: 0,
			side: 'bottom',
			target: undefined as HTMLElement | undefined,
		});
		const el = element<HTMLDivElement>();
		const titleEl = element<HTMLHeadingElement>();
		const descriptionEl = element<HTMLParagraphElement>();

		return { ...item, el, titleEl, descriptionEl };
	},
	{ scope: 'widget' },
);

export function TourItem({ index, target, side = 'bottom', children, ...rest }: TourItemProps) @{
	const item = tourItemState();
	item.index = index;
	item.side = side;
	item.target = target;

	<TourCard {...rest}>{children}</TourCard>
}

export function TourRoot({
	open = false,
	loop = false,
	closeOnInteractOutside = true,
	disabled = false,
	onChange,
	onOpenChange,
	children,
	...rest
}: TourRootProps) @{
	const tour = tourState();
	tour.onChange = onChange;
	tour.onOpenChange = onOpenChange;
	tour.open = open;
	tour.loop = loop;
	tour.closeOnInteractOutside = closeOnInteractOutside;
	tour.disabled = disabled;

	<div
		{...rest}
		ui-open={tour.open}
		ui-closed={tour.open !== true}
		ui-disabled={tour.disabled}
	>{children}</div>
}

// A separate component from `tour.item`: the card points aria-labelledby and
// aria-describedby at handles the step's own widget owns, and a widget's root
// component cannot read its own instance token.
function TourCard({ children, onDismiss, onFocus, onKeydown, ...rest }: TourCardProps) @{
	const tour = tourState();
	const item = tourItemState();
	// The step's own `index` prop, not a lookup: a card has to know its place while
	// it renders, and every registry this library has is handler-time only.
	const isCurrent = computed(() => {
		const showing = tour.open;
		const at = tour.step;
		const mine = item.index;
		return showing === true && at === mine;
	});

	// No `aria-modal`, in any configuration. The APG allows it only when nothing
	// outside can be interacted with, and a tour exists to say "click that"; and the
	// overlay behaviour reads the attribute to mark the rest of the page inert,
	// which would make the spotlighted element unclickable and lock the scroll a
	// tour needs to bring an off-screen target into view.
	<div
		{...rest}
		el={[item.el, tour.itemEls]}
		overlay
		role="dialog"
		tabindex={-1}
		aria-labelledby={item.titleEl}
		aria-describedby={item.descriptionEl}
		hidden={isCurrent !== true}
		ui-current={isCurrent}
		// The same cell as `ui-current`, under the name every overlay surface in
		// the library writes when it is the one showing.
		ui-open={isCurrent}
		ui-closed={isCurrent !== true}
		ui-side={item.side}
		onFocus={(event) => {
			const own = item.target;
			tour.enter(own);
			onFocus?.(event);
		}}
		onKeydown={(event) => {
			// Guarded by event fields alone, and only `===` chains extract: a guard over
			// locals derived from graph state is MARKLESS_SYNC_POLICY_UNEXTRACTABLE.
			if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
				event.preventDefault();
			}
			// Arrows act only when the card host itself is the event target, so a
			// consumer's own listbox or slider inside a step keeps its own arrows and
			// there is no `keyboardNavigation` knob to get wrong.
			const card = item.el;
			if (event.target === card) {
				if (event.key === 'ArrowRight') tour.next();
				if (event.key === 'ArrowLeft') tour.prev();
			}
			onKeydown?.(event);
		}}
		onDismiss={(event) => {
			const detail = event.detail;
			// `contains` on a handle the consumer handed over is the one containment
			// predicate allowed, and it is what keeps a press on the very thing the tour
			// just pointed at from closing the tour.
			const pressed = detail.pressTarget;
			const own = item.target;
			const isOwnTargetPress = pressed !== undefined && own !== undefined && own.contains(pressed);
			const dismissable = tour.closeOnInteractOutside;
			const isEscape = detail.reason === 'escape';
			if (isEscape || (dismissable === true && isOwnTargetPress !== true)) tour.close();
			onDismiss?.(event);
		}}
	>
		<style>
			@layer markless {
				/* Fixed rather than absolute, so the card escapes whatever overflow container the target sits in. A step with no target resolves no anchor, which leaves `position-area` inert and the card wherever the consumer's own ungated rule puts it. */
				[ui-side] { position: fixed; position-anchor: --tour-target; }
				[ui-side="top"] { position-area: top span-right; }
				[ui-side="bottom"] { position-area: bottom span-right; }
				/* `self-inline-*` reads the card's own writing direction; plain `inline-*` reads the containing block's, which for an out-of-flow card never flips. */
				[ui-side="start"] { position-area: span-self-block-end self-inline-start; }
				[ui-side="end"] { position-area: span-self-block-end self-inline-end; }
			}
		</style>
		{children}
	</div>
}

export function TourBackdrop({ children, ...rest }: TourBackdropProps) @{
	const tour = tourState();

	// No `overlay` here, deliberately: the card is the enlisted surface, a backdrop
	// is optional in every family that has one, and two marked elements would
	// double-enlist. Nothing is lost - this element takes no pointer events either
	// way, and outside presses are heard by a document listener, not by paint.
	<div
		{...rest}
		ui-spotlight
		hidden={tour.open !== true}
		ui-open={tour.open}
		ui-closed={tour.open !== true}
	>
		<style>
			@layer markless {
				/* Intro.js's spotlight: the box IS the hole and the dim is its own shadow, so only geometry is written here and the colour, the corner radius and any transition stay the consumer's. */
				[ui-spotlight] {
					position: fixed;
					position-anchor: --tour-target;
					top: anchor(top);
					left: anchor(left);
					width: anchor-size(width);
					height: anchor-size(height);
					box-shadow: 0 0 0 100vmax var(--ui-tour-dim, rgb(0 0 0 / 0.5));
					/* A box-shadow is not hit-testable and this border box IS the hole, so `auto` would swallow presses on the target and let the dim through - exactly backwards. */
					pointer-events: none;
				}
			}
		</style>
		{children}
	</div>
}

export function TourTitle({ children, ...rest }: TourTitleProps) @{
	const item = tourItemState();

	<h2 {...rest} el={item.titleEl}>{children}</h2>
}

export function TourDescription({ children, ...rest }: TourDescriptionProps) @{
	const item = tourItemState();

	<p {...rest} el={item.descriptionEl}>{children}</p>
}

export function TourValueLabel({ children, ...rest }: TourValueLabelProps) @{
	const tour = tourState();
	const position = computed(() => {
		const at = tour.step;
		return at + 1;
	});
	const text = computed(() => {
		const at = tour.step;
		const total = tour.count;
		return `${at + 1} of ${total}`;
	});

	<span {...rest} ui-value={position} ui-max={tour.count}>
		@if (children) {
			<>{children}</>
		} @else {
			<>{text}</>
		}
	</span>
}

export function TourBackTrigger({ children, onClick, ...rest }: TourBackTriggerProps) @{
	const tour = tourState();
	const isOff = computed(() => {
		const locked = tour.disabled;
		const wraps = tour.loop;
		const at = tour.step;
		return locked === true || (wraps !== true && at <= 0);
	});

	<button
		{...rest}
		type="button"
		disabled={isOff}
		onClick={(event) => {
			tour.prev();
			onClick?.(event);
		}}
	>{children}</button>
}

export function TourForwardTrigger({ children, onClick, ...rest }: TourForwardTriggerProps) @{
	const tour = tourState();
	const isOff = computed(() => {
		const locked = tour.disabled;
		const wraps = tour.loop;
		const at = tour.step;
		const total = tour.count;
		return locked === true || (wraps !== true && at >= total - 1);
	});

	<button
		{...rest}
		type="button"
		disabled={isOff}
		onClick={(event) => {
			tour.next();
			onClick?.(event);
		}}
	>{children}</button>
}

export function TourClose({ children, onClick, ...rest }: TourCloseProps) @{
	const tour = tourState();

	<button
		{...rest}
		type="button"
		onClick={(event) => {
			tour.close();
			onClick?.(event);
		}}
	>{children}</button>
}
