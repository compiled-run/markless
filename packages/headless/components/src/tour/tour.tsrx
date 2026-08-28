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

// Never put `anchor-scope` on the root: a tour's target is outside the root's
// subtree, so scoping the anchor name there hides it from the card.
// Every graph read stands on its own line before it is used - an expression
// nesting one under a call crashes the handler module.

export const tourState = shared(
	() => {
		const tour: TourInstanceState = state({
			open: false,
			step: 0,
			loop: false,
			closeOnInteractOutside: true,
			disabled: false,
			// A graph cell, not a plain field: a handler may only read what the graph
			// can lower, and the current target is read in four of them.
			target: undefined as HTMLElement | undefined,
		});
		// Every card binds itself here, in document order: a step's place is where it
		// stands in this roster and the tour's length is how long the roster is.
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

			/**
			 * Move one step in `direction`, over a tour `steps` long.
			 *
			 * The length is handed in rather than taken off the handle: the part that
			 * asked to move derives it from the roster, which is what puts a
			 * roster-dependent cell in the served payload and makes the page's roster
			 * live at resume. Without one, a card's own place is never banked on a
			 * tour that is already showing before the first gesture.
			 */
			walk(direction: number, steps: number) {
				const locked = tour.disabled;
				if (locked === true) return;
				const bound = itemEls;
				const cards = bound === undefined ? [] : bound;
				const at = tour.step;
				const wraps = tour.loop;
				const to = stepAfter(at, direction, steps, wraps === true);
				if (to === at) return;
				const leaving = tour.target;
				releaseTarget(leaving);
				tour.step = to;
				tour.onChange?.(to);
				focusIntoCard(cards, to);
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
			target: undefined as HTMLElement | undefined,
		});
		const el = element<HTMLDivElement>();
		const titleEl = element<HTMLHeadingElement>();
		const descriptionEl = element<HTMLParagraphElement>();

		return { ...item, el, titleEl, descriptionEl };
	},
	{ scope: 'widget' },
);

export function TourItem({ target, children, ...rest }: TourItemProps) @{
	const item = tourItemState();
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
	// The root asks its length before a single card has rendered, so the served
	// page answers it rather than the render.
	const rootCount = computed(() => tour.itemEls.length);

	<div
		{...rest}
		ui-open={tour.open}
		ui-closed={tour.open !== true}
		ui-disabled={tour.disabled}
		ui-max={rootCount}
	>{children}</div>
}

// A separate component from `tour.item`: the card points aria-labelledby and
// aria-describedby at handles the step's own widget owns, and a widget's root
// component cannot read its own instance token.
function TourCard({ children, onDismiss, onFocus, onKeydown, ...rest }: TourCardProps) @{
	const tour = tourState();
	const item = tourItemState();
	const mine = element<HTMLDivElement>();
	// Which step this is, is where it stands among the cards: nobody numbers them.
	const at = computed(() => tour.itemEls.indexOf(mine as HTMLDivElement));
	const cardCount = computed(() => tour.itemEls.length);
	const isCurrent = computed(() => {
		const showing = tour.open;
		const on = tour.step;
		return showing === true && on === at;
	});

	// No `aria-modal`, in any configuration. The APG allows it only when nothing
	// outside can be interacted with, and a tour exists to say "click that"; and the
	// overlay behaviour reads the attribute to mark the rest of the page inert,
	// which would make the spotlighted element unclickable and lock the scroll a
	// tour needs to bring an off-screen target into view.
	<div
		{...rest}
		el={[item.el, tour.itemEls, mine]}
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
			// Coerced: a count rendered before its cards existed is patched into the payload as text.
			const steps = Number(cardCount);
			if (event.target === card) {
				if (event.key === 'ArrowRight') tour.walk(1, steps);
				if (event.key === 'ArrowLeft') tour.walk(-1, steps);
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
				[overlay] { position: fixed; position-anchor: --tour-target; position-area: block-end; }
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
	// The count is spent where it is printed, never inside a second computed(): a
	// derived binding holding it publishes a placeholder nothing downstream resolves.
	const labelCount = computed(() => tour.itemEls.length);

	<span {...rest} ui-value={position} ui-max={labelCount}>
		@if (children) {
			<>{children}</>
		} @else {
			<>{`${tour.step + 1} of ${labelCount}`}</>
		}
	</span>
}

export function TourBackTrigger({ children, onClick, ...rest }: TourBackTriggerProps) @{
	const tour = tourState();
	// Every derived cell in this module carries its own name: two components
	// declaring the same `const` collapse to one cell, and the survivor's formula
	// silently answers for both.
	const isBackOff = computed(() => {
		const locked = tour.disabled;
		const wraps = tour.loop;
		const at = tour.step;
		return locked === true || (wraps !== true && at <= 0);
	});
	const backCount = computed(() => tour.itemEls.length);

	<button
		{...rest}
		type="button"
		disabled={isBackOff}
		ui-disabled={isBackOff}
		onClick={(event) => {
			const steps = Number(backCount);
			tour.walk(-1, steps);
			onClick?.(event);
		}}
	>{children}</button>
}

export function TourForwardTrigger({ children, onClick, ...rest }: TourForwardTriggerProps) @{
	const tour = tourState();
	const forwardCount = computed(() => tour.itemEls.length);

	<button
		{...rest}
		type="button"
		disabled={tour.disabled === true || tour.loop !== true && tour.step >= forwardCount - 1}
		ui-disabled={tour.disabled === true || tour.loop !== true && tour.step >= forwardCount - 1}
		onClick={(event) => {
			const steps = Number(forwardCount);
			tour.walk(1, steps);
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
