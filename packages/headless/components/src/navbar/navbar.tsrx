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

// A disclosure, not a menubar - see navbar-types.ts.
// Every keyboard walk here reads the DOM: no primitive builds an ordered collection of a widget's items.
// Every preventDefault guard reads event fields alone, so it decides before the handler symbol loads.
// Walks start at `event.target`: a lazily loaded handler has no `currentTarget`, and a handle bound on a widget-rooting element reads back empty.

// Which dropdown is showing lives on the root, named by value: an instance rooted by an item cannot reach its siblings.
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
			// `next = ''` rather than `next: string`: the inlined handler is re-parsed as plain JavaScript and an annotation throws (MARKLESS_CAPTURE_OPAQUE_PROP).
			show(next = '') {
				if (navbar.value === next) return;
				navbar.value = next;
				navbar.onChange?.(next);
			},
			// Repeats show()'s body rather than calling it: a shared method has no receiver to reach its siblings through.
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

// The panel's id is minted here, not on the root: one handle is one element per rendered widget (MARKLESS_ELEMENT_HANDLE_DUPLICATE).
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

	// No default aria-label: an invented "Navigation" on both a primary and a footer nav is two landmarks a reader cannot tell apart.
	<nav
		{...rest}
		ui-open={navbar.value !== ''}
		ui-closed={navbar.value === ''}
		onFocusout={(event) => {
			const root = (event.target as HTMLElement).closest('nav');
			const next = event.relatedTarget as Node | null;
			if (root !== null && (next === null || root.contains(next) !== true)) {
				navbar.closeAll();
			}
			onFocusout?.(event);
		}}
		onPointerout={(event) => {
			// Closing on leave belongs to the root: the leaving item's pointerout fires before the arriving item's pointerover.
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
			if (nav === null || here === null || here.closest('[ui-navbar-dropdown]') !== null) {
				onKeydown?.(event);
				return;
			}

			const walk = Array.from(
				nav.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
			).filter((control) => control.closest('[ui-navbar-dropdown]') === null);
			const at = walk.indexOf(here);
			const last = walk.length - 1;
			const raw = at + (key === 'ArrowRight' ? 1 : -1);
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
	// One graph cell, read in every position: the same comparison written inline in an attribute renders once and then goes stale.
	const isOpen = computed(() => navbar.value === item.value);

	// The pointer handlers sit on the item, not the trigger, so moving from a trigger into its own dropdown never counts as leaving.
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
			// pointerover fires again for every element inside the item; only a crossing from outside it is an enter.
			if (
				navbar.hover !== true ||
				navbar.value === item.value ||
				box === null ||
				(came !== null && box.contains(came) === true)
			) {
				onPointerover?.(event);
				return;
			}

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
				// The timer re-delivers the crossing rather than opening: shared reads are rewritten only at the handler's top level, so `navbar.show()` inside this closure is a ReferenceError.
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
			if (box !== null && (went === null || box.contains(went) !== true)) {
				window.clearTimeout(item.openTimer);
				item.openTimer = 0;
				item.restingUntil = 0;
			}
			// Written here rather than on the root: the runtime hands the event to the nearest part that declared a handler and stops.
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

	// Escape is not here: the overlay primitive reports it as a `dismiss` on the panel.
	<button
		{...rest}
		type="button"
		aria-expanded={isOpen ? 'true' : 'false'}
		aria-controls={item.contentEl}
		ui-open={isOpen}
		ui-closed={isOpen !== true}
		onClick={(event) => {
			// A dropdown that just opened under the resting pointer must not be shut by the click that followed.
			if (item.graceUntil <= Date.now()) navbar.toggle(item.value);
			onClick?.(event);
		}}
		onKeydown={(event) => {
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
				// The panel is still `hidden` here - the DOM lands after this handler returns - so the focus move waits for the DOM, not the call.
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

			const nav = from.closest('nav');
			const here = from.closest('a[href], button:not([disabled])') as HTMLElement | null;
			if (nav !== null && here !== null) {
				const walk = Array.from(
					nav.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
				).filter((control) => control.closest('[ui-navbar-dropdown]') === null);
				const at = walk.indexOf(here);
				const last = walk.length - 1;
				const raw = at + (key === 'ArrowRight' ? 1 : -1);
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

	// Closed hides the panel, never detaches it: the trigger points at this element's minted id, and an enlisted element removed from the document leaves the overlay stack's marks behind.
	// `overlay` is a bare attribute the primitive reads; while enlisted it reports Escape and outside presses as `dismiss`, closing nothing and moving no focus itself.
	<div
		{...rest}
		el={item.contentEl}
		overlay
		ui-navbar-dropdown=""
		hidden={isOpen !== true}
		ui-open={isOpen}
		ui-closed={isOpen !== true}
		onDismiss={(event) => {
			const from = event.target as HTMLElement;
			const box = from.closest('[ui-navbar-item]');
			const back = box?.querySelector('[aria-expanded]') as HTMLElement | null;
			// Read before the close: a hidden subtree cannot hold focus, so afterwards the answer is gone.
			const wasFocusInside = box !== null && box.contains(document.activeElement);
			// `contains` rather than `===`: a consumer may put an icon inside the trigger, and the press lands on that.
			const pressed = event.detail.pressTarget;
			const onOwnTrigger = pressed !== undefined && back !== null && back.contains(pressed);
			navbar.closeAll();
			// Without this, pressing an open dropdown's trigger closes it on the press and re-opens it on the click; armed by identity, so a press elsewhere leaves the next click free.
			if (onOwnTrigger) item.graceUntil = Date.now() + navbar.clickGrace;
			// The primitive moves no focus, so Escape's return to the trigger is the family's to write.
			if (event.detail.reason === 'escape' && wasFocusInside) back?.focus();
			onDismiss?.(event);
		}}
		onKeydown={(event) => {
			// Escape is not in the list: the primitive's document listener reads `defaultPrevented`.
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
	// `false` rather than `undefined` removes the attribute; `undefined` compiles to no update record at all.
	// `current` takes no destructuring default: a template position reads the raw prop (MARKLESS_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED).
	<a
		{...rest}
		aria-current={current === true ? 'page' : false}
		ui-active={current === true}
		onKeydown={(event) => {
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

			// One walk, two scopes: inside a dropdown all six keys walk its links, at the top level only the arrows walk and they skip open dropdowns.
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
