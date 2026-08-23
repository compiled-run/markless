import { computed, element, shared, state } from '@markless/core';
import type {
	NavbarInstanceState,
	NavbarItemContentProps,
	NavbarItemInstanceState,
	NavbarItemLinkProps,
	NavbarItemProps,
	NavbarItemTriggerProps,
	NavbarRootProps,
} from './navbar-types.ts';

// A `<nav>` landmark holding buttons that show and hide panels. It is a
// DISCLOSURE, not a menubar - see navbar-types.ts.
//
// Which dropdown is showing lives on the ROOT, named by the item's `value`, not
// as an `open` flag per item: opening one has to close the others, and an
// instance rooted by an item cannot reach its siblings.
export const navbarState = shared(
	() => {
		const navbar: NavbarInstanceState = state({
			value: '',
			hover: true,
			delay: 200,
			clickGrace: 300,
		});

		return {
			...navbar,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((value: string) => void) | undefined,
			// `next = ''` rather than `next: string`. A shared method that dispatches is
			// inlined into its caller, and the capture analysis then parses that handler
			// with a JavaScript-only parser: an annotation makes the parse throw and
			// every `onClick?.(event)` beside it is reported as an unconditional call
			// (MARKLESS_CAPTURE_OPAQUE_PROP).
			show(next = '') {
				if (navbar.value === next) return;
				navbar.value = next;
				navbar.onChange?.(next);
			},
			// Repeats show()'s body rather than calling it: a shared method has no
			// receiver to reach its siblings through.
			toggle(next = '') {
				const to = navbar.value === next ? '' : next;
				if (navbar.value === to) return;
				navbar.value = to;
				navbar.onChange?.(to);
			},
			closeAll() {
				if (navbar.value === '') return;
				navbar.value = '';
				navbar.onChange?.('');
			},
		};
	},
	{ scope: 'widget' },
);

// Rooted by each `navbar.item`: that item's own name, whether it leads to the
// section a person is in, and the two facts a hover has to remember between one
// pointer event and the next.
//
// The panel's minted id is bound here rather than on the root, because a navbar
// root holds N items and one handle is one element per rendered widget
// (MARKLESS_ELEMENT_HANDLE_DUPLICATE).
export const navbarItemState = shared(
	() => {
		const item: NavbarItemInstanceState = state({
			value: '',
			active: false,
			openTimer: 0,
			restingUntil: 0,
			graceUntil: 0,
		});
		const contentEl = element<HTMLDivElement>();

		return { ...item, contentEl };
	},
	{ scope: 'widget' },
);

export function NavbarRoot({
	value = '',
	hover = true,
	delay = 200,
	clickGrace = 300,
	onChange,
	children,
	onFocusout,
	onKeydown,
	onPointerout,
	...rest
}: NavbarRootProps) @{
	const navbar = navbarState();
	navbar.onChange = onChange;
	navbar.value = value;
	navbar.hover = hover;
	navbar.delay = delay;
	navbar.clickGrace = clickGrace;

	// No default aria-label: a page can carry a primary nav and a footer nav, and an
	// invented "Navigation" on both is two landmarks a reader cannot tell apart.
	// `{...rest}` is spread first so a consumer's own name is the name.
	//
	// Every walk below starts at `event.target` and climbs. A lazily loaded handler
	// has no `currentTarget`, and an `element()` handle bound on a widget-rooting
	// element reads back empty in a handler - measured on this tip, see note.md.
	<nav
		{...rest}
		ui-open={navbar.value !== ''}
		ui-closed={navbar.value === ''}
		onFocusout={(event) => {
			// Focus left the navbar entirely, so nothing should still be showing.
			const root = (event.target as HTMLElement).closest('nav');
			const next = event.relatedTarget as Node | null;
			if (root !== null && (next === null || root.contains(next) !== true)) {
				navbar.closeAll();
			}
			onFocusout?.(event);
		}}
		onPointerout={(event) => {
			// Closing on leave belongs to the ROOT, not to the item. Moving from one
			// item to the next fires the leaving item's pointerout BEFORE the arriving
			// item's pointerover, so an item that closed on its own leave would take the
			// navbar to "nothing showing" a moment before the next item asks whether
			// anything is showing - and every switch would pay the cold-start delay.
			const root = (event.target as HTMLElement).closest('nav');
			const went = event.relatedTarget as Node | null;
			if (
				navbar.hover === true &&
				root !== null &&
				(went === null || root.contains(went) !== true)
			) {
				navbar.closeAll();
			}
			onPointerout?.(event);
		}}
		onKeydown={(event) => {
			// The two keys the top level owns, guarded by event fields alone: a
			// browser-critical policy has to be readable before the handler symbol
			// loads.
			if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
				event.preventDefault();
			}

			const key = event.key;
			if (key !== 'ArrowLeft' && key !== 'ArrowRight') {
				onKeydown?.(event);
				return;
			}

			const from = event.target as HTMLElement;
			const nav = from.closest('nav');
			const here = from.closest('a[href], button:not([disabled])') as HTMLElement | null;
			// A link inside an open dropdown is not a top-level control, and the arrow
			// keys there belong to the content part.
			if (nav === null || here === null || here.closest('[ui-navbar-dropdown]') !== null) {
				onKeydown?.(event);
				return;
			}

			// DOM order is the navigation order. The walk needs the ordered collection
			// of the navbar's top-level controls, and no primitive builds one today -
			// pending capability: ordered item registration into an ancestor widget
			// instance, see note.md.
			const walk = Array.from(
				nav.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
			).filter((control) => control.closest('[ui-navbar-dropdown]') === null);
			const at = walk.indexOf(here);
			const last = walk.length - 1;
			const raw = at + (key === 'ArrowRight' ? 1 : -1);
			// The ends wrap, which is what the authoring practices' own
			// disclosure-navigation example does.
			const to = raw < 0 ? last : raw > last ? 0 : raw;
			const next = walk[to];
			if (at >= 0 && next) next.focus();
			onKeydown?.(event);
		}}
	>{children}</nav>
}

export function NavbarItem({
	value,
	active = false,
	children,
	onPointerover,
	onPointerout,
	...rest
}: NavbarItemProps) @{
	const navbar = navbarState();
	const item = navbarItemState();
	item.value = value;
	item.active = active;
	// One graph cell, read in every position: a comparison written inline in an
	// attribute renders once and then goes stale.
	const isOpen = computed(() => navbar.value === item.value);

	// `ui-navbar-item` is anatomy, not state: it is the name every climb needs for
	// "the item this control belongs to".
	//
	// The pointer handlers sit on the ITEM rather than on the trigger, so moving
	// from a trigger down into its own dropdown never counts as leaving. That is why
	// this family needs no close delay and no safe polygon: the panel is inside the
	// element the pointer is still in.
	<div
		{...rest}
		ui-navbar-item=""
		ui-open={isOpen}
		ui-closed={isOpen !== true}
		ui-active={item.active}
		onPointerover={(event) => {
			const from = event.target as HTMLElement;
			const box = from.closest('[ui-navbar-item]') as HTMLElement | null;
			const came = event.relatedTarget as Node | null;
			// pointerover fires again for every element inside the item; only the
			// crossing that came from outside it is an enter.
			if (
				navbar.hover !== true ||
				navbar.value === item.value ||
				box === null ||
				(came !== null && box.contains(came) === true)
			) {
				onPointerover?.(event);
				return;
			}

			// Instant while any dropdown is already showing, delayed only on the cold
			// start: if you are already browsing the navbar you expect the next one at
			// once, rather than for a fixed window after the last close.
			const now = Date.now();
			const isReadyToOpen =
				navbar.value !== '' ||
				navbar.delay <= 0 ||
				(item.restingUntil !== 0 && now >= item.restingUntil);
			if (isReadyToOpen) {
				window.clearTimeout(item.openTimer);
				item.openTimer = 0;
				item.restingUntil = 0;
				item.graceUntil = now + navbar.clickGrace;
				navbar.show(item.value);
			} else if (item.restingUntil === 0) {
				// The timer touches the DOM only, and re-delivers the crossing rather
				// than opening: shared-instance reads are rewritten at the handler
				// symbol's top level and NOT inside a nested closure, so `navbar.show()`
				// in here is `ReferenceError: navbar is not defined`. The deadline left
				// on the instance is what tells the second run the wait is over.
				const wait = navbar.delay;
				item.restingUntil = now + wait;
				item.openTimer = window.setTimeout(() => {
					box.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
				}, wait + 5);
			}
			onPointerover?.(event);
		}}
		onPointerout={(event) => {
			const from = event.target as HTMLElement;
			const box = from.closest('[ui-navbar-item]') as HTMLElement | null;
			const nav = from.closest('nav');
			const went = event.relatedTarget as Node | null;
			// Leaving this item abandons the open it had scheduled.
			if (box !== null && (went === null || box.contains(went) !== true)) {
				window.clearTimeout(item.openTimer);
				item.openTimer = 0;
				item.restingUntil = 0;
			}
			// Closing is decided against the LANDMARK, not against the item: moving from
			// a trigger down into its own dropdown, or across to the next entry, must
			// not close anything.
			//
			// It lives here rather than on the root because the runtime hands an event
			// to the NEAREST part that declared a handler for it and stops: with the
			// same rule written on `navbar.root`, the item's own handler shadowed it and
			// the root's never ran.
			if (
				navbar.hover === true &&
				nav !== null &&
				(went === null || nav.contains(went) !== true)
			) {
				navbar.closeAll();
			}
			onPointerout?.(event);
		}}
	>{children}</div>
}

export function NavbarItemTrigger({
	children,
	onClick,
	onKeydown,
	...rest
}: NavbarItemTriggerProps) @{
	const navbar = navbarState();
	const item = navbarItemState();
	const isOpen = computed(() => navbar.value === item.value);

	// A native <button> already activates on Enter and on Space, so those two keys
	// need no rule; ArrowDown is the authoring practices' optional "open and step
	// inside". Escape is not here: the overlay primitive reports it as a `dismiss`
	// on the panel, and `navbar.itemcontent` decides what it means.
	<button
		{...rest}
		type="button"
		aria-expanded={isOpen ? 'true' : 'false'}
		aria-controls={item.contentEl}
		ui-open={isOpen}
		ui-closed={isOpen !== true}
		onClick={(event) => {
			// A dropdown that just opened under the resting pointer is not something the
			// click that followed should shut. A timestamp comparison rather than a
			// second timer, read where the decision is made.
			if (item.graceUntil <= Date.now()) navbar.toggle(item.value);
			onClick?.(event);
		}}
		onKeydown={(event) => {
			// Guarded by event fields alone, for the reason the root's handler gives.
			if (
				event.key === 'ArrowDown' ||
				event.key === 'ArrowLeft' ||
				event.key === 'ArrowRight'
			) {
				event.preventDefault();
			}

			const key = event.key;
			const from = event.target as HTMLElement;

			if (key === 'ArrowDown') {
				navbar.show(item.value);
				const box = from.closest('[ui-navbar-item]');
				const panel = box === null ? null : box.querySelector('[ui-navbar-dropdown]');
				// The panel is still `hidden` on the next line: the write above starts a
				// dispatch and the DOM lands after this handler returns, and nothing
				// inside a hidden subtree can take focus. So the focus move waits for the
				// DOM rather than for the call, in a callback that touches the DOM only,
				// and it gives up after 200 ms rather than spinning.
				let tries = 0;
				const stepIn = () => {
					tries = tries + 1;
					const first = panel?.querySelector(
						'a[href], button:not([disabled])',
					) as HTMLElement | null;
					if (panel !== null && panel.hasAttribute('hidden') !== true && first !== null) {
						first.focus();
					} else if (tries < 20) {
						window.setTimeout(stepIn, 10);
					}
				};
				stepIn();
				onKeydown?.(event);
				return;
			}

			if (key !== 'ArrowLeft' && key !== 'ArrowRight') {
				onKeydown?.(event);
				return;
			}

			// The top level walks with the left and right arrows, and the walk skips
			// anything inside an open dropdown. It stays on the DOM for the reason the
			// root's walk gives: no primitive builds the ordered collection.
			const nav = from.closest('nav');
			const here = from.closest('a[href], button:not([disabled])') as HTMLElement | null;
			if (nav !== null && here !== null) {
				const walk = Array.from(
					nav.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
				).filter((control) => control.closest('[ui-navbar-dropdown]') === null);
				const at = walk.indexOf(here);
				const last = walk.length - 1;
				const raw = at + (key === 'ArrowRight' ? 1 : -1);
				// The ends wrap, which is what the authoring practices' own
				// disclosure-navigation example does.
				const to = raw < 0 ? last : raw > last ? 0 : raw;
				const next = walk[to];
				if (at >= 0 && next) next.focus();
			}
			onKeydown?.(event);
		}}
	>{children}</button>
}

export function NavbarItemContent({
	children,
	onDismiss,
	onKeydown,
	...rest
}: NavbarItemContentProps) @{
	const navbar = navbarState();
	const item = navbarItemState();
	const isOpen = computed(() => navbar.value === item.value);

	// Closed hides the panel, it never detaches it: the trigger points at this
	// element's minted id, and an unmount would leave that reference dangling.
	// Never detaching is also what the overlay mark below requires - an enlisted
	// element removed from the document leaves the stack's marks behind.
	//
	// `overlay` is the bare attribute the primitive reads, and nothing is imported
	// for it. The panel enlists when `hidden` flips off and leaves the stack when it
	// flips back on, and while it is enlisted the primitive reports Escape and an
	// outside press as a `dismiss`. It closes nothing and moves no focus: both are
	// decided in `onDismiss` below.
	<div
		{...rest}
		el={item.contentEl}
		overlay
		ui-navbar-dropdown=""
		hidden={isOpen !== true}
		ui-open={isOpen}
		ui-closed={isOpen !== true}
		onDismiss={(event) => {
			// A disclosure answers to both reasons - Escape, and a press outside the
			// panel - which is what the authoring practices' dismissability
			// requirement asks for and what QDS gets from `popover="auto"`.
			const from = event.target as HTMLElement;
			const box = from.closest('[ui-navbar-item]');
			const back = box?.querySelector('[aria-expanded]') as HTMLElement | null;
			// Read before the close: a hidden subtree cannot hold focus, so after the
			// dispatch lands the answer is no longer available.
			const wasFocusInside = box !== null && box.contains(document.activeElement);
			navbar.closeAll();
			// The press that dismissed may be the same press whose click the trigger is
			// about to see. Without this, pressing the trigger of an open dropdown would
			// close it on the press and re-open it on the click. The window is the
			// item's own, so a press outside never suppresses a click on a different
			// entry's trigger.
			item.graceUntil = Date.now() + navbar.clickGrace;
			// The primitive moves no focus, so the return is the family's to write:
			// Escape from inside the entry has to land on the button that opened the
			// panel, or a person is left standing on nothing. A dismissal that reached
			// no focus of ours moves none.
			if (event.detail.reason === 'escape' && wasFocusInside) back?.focus();
			onDismiss?.(event);
		}}
		onKeydown={(event) => {
			// Guarded by event fields alone, for the reason the root's handler gives.
			// Escape is not in the list: the primitive's document listener reads
			// `defaultPrevented`, and this family has no default to suppress.
			if (
				event.key === 'ArrowUp' ||
				event.key === 'ArrowDown' ||
				event.key === 'ArrowLeft' ||
				event.key === 'ArrowRight' ||
				event.key === 'Home' ||
				event.key === 'End'
			) {
				event.preventDefault();
			}

			const key = event.key;
			const from = event.target as HTMLElement;

			const isNavigationKey =
				key === 'ArrowUp' ||
				key === 'ArrowDown' ||
				key === 'ArrowLeft' ||
				key === 'ArrowRight' ||
				key === 'Home' ||
				key === 'End';
			const panel = from.closest('[ui-navbar-dropdown]');
			const here = from.closest('a[href], button:not([disabled])') as HTMLElement | null;
			if (!isNavigationKey || panel === null || here === null) {
				onKeydown?.(event);
				return;
			}

			// The panel's own links, in DOM order. It stays on the DOM for the reason
			// the root's walk gives: no primitive builds the ordered collection.
			const walk = Array.from(
				panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
			);
			const at = walk.indexOf(here);
			const last = walk.length - 1;
			const isForwardKey = key === 'ArrowDown' || key === 'ArrowRight';
			const step = key === 'Home' ? -at : key === 'End' ? last - at : isForwardKey ? 1 : -1;
			const raw = at + step;
			const to = raw < 0 ? last : raw > last ? 0 : raw;
			const next = walk[to];
			if (at >= 0 && next) next.focus();
			onKeydown?.(event);
		}}
	>{children}</div>
}

export function NavbarItemLink({ current, children, onKeydown, ...rest }: NavbarItemLinkProps) @{
	// It resolves no instance at all: the only reason it once read `navbarState`
	// was `closeAll()` for its own Escape branch, and the overlay primitive owns
	// that report now.
	//
	// The priority-1 assertion the QDS reference cannot make: `spec.md` designed
	// this part, named it `navbar.itemlink`, and the code never shipped it, so
	// aria-at's `stateCurrentPage` had nowhere to land.
	//
	// It roots no ITEM instance, so it works at the top level and inside a dropdown
	// alike, and `current` is per LINK: a dropdown holds many links and only one of
	// them is the page you are on.
	//
	// `false` rather than `undefined` on the links you are not on: the attribute
	// writer reads `false` as "remove this", where `undefined` compiles to no update
	// record at all. And `current` carries no destructuring default because a
	// template position reads the raw prop
	// (MARKLESS_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED).
	<a
		{...rest}
		aria-current={current === true ? 'page' : false}
		ui-active={current === true}
		onKeydown={(event) => {
			// Guarded by event fields alone, for the reason the trigger's handler gives.
			// Every key this part might act on is listed, because which ones it DOES act
			// on is decided below from where the link sits. Escape is not among them:
			// the panel this link sits in carries the overlay mark, and the primitive
			// reports Escape there.
			if (
				event.key === 'ArrowUp' ||
				event.key === 'ArrowDown' ||
				event.key === 'ArrowLeft' ||
				event.key === 'ArrowRight' ||
				event.key === 'Home' ||
				event.key === 'End'
			) {
				event.preventDefault();
			}

			const key = event.key;
			const from = event.target as HTMLElement;
			const panel = from.closest('[ui-navbar-dropdown]');

			// One walk, two scopes. Inside a dropdown all six movement keys walk the
			// panel's own links; at the top level only the left and right arrows walk,
			// and they skip anything inside an open dropdown. Both stay on the DOM for
			// the reason the root's walk gives: no primitive builds the collection.
			const isInsideDropdown = panel !== null;
			const isForwardKey = key === 'ArrowRight' || (isInsideDropdown && key === 'ArrowDown');
			const isBackwardKey = key === 'ArrowLeft' || (isInsideDropdown && key === 'ArrowUp');
			const isJumpKey = isInsideDropdown && (key === 'Home' || key === 'End');
			const scope = isInsideDropdown ? panel : from.closest('nav');
			const here = from.closest('a[href], button:not([disabled])') as HTMLElement | null;
			if (here === null || scope === null || (!isForwardKey && !isBackwardKey && !isJumpKey)) {
				onKeydown?.(event);
				return;
			}

			const walk = Array.from(
				scope.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
			).filter((control) => isInsideDropdown || control.closest('[ui-navbar-dropdown]') === null);
			const at = walk.indexOf(here);
			const last = walk.length - 1;
			const step = key === 'Home' ? -at : key === 'End' ? last - at : isForwardKey ? 1 : -1;
			const raw = at + step;
			const to = raw < 0 ? last : raw > last ? 0 : raw;
			const next = walk[to];
			if (at >= 0 && next) next.focus();
			onKeydown?.(event);
		}}
	>{children}</a>
}
