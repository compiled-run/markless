import { computed, element, shared, state } from '@markless/core';
import { controlAt, controlsInside, panelAt, stepTo, topLevelControls } from './navbar-walk.ts';
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
// Every preventDefault guard reads event fields alone, so it decides before the handler symbol loads.
// Walks start at `event.target`: a lazily loaded handler has no `currentTarget`.

// Which dropdown is showing lives on the root, named by value: an instance rooted by an item cannot reach its siblings.
export const navbarState = shared(
	() => {
		const navbar: NavbarInstanceState = state({
			value: '',
			hover: true,
			delay: 200,
			clickGrace: 300,
		});
		const navEl = element<HTMLElement>();
		// The array type argument makes a handle plural: bound on every trigger and
		// every link, read back as the live controls in document order.
		const controlEls = element<HTMLElement[]>();
		const panelEls = element<HTMLElement[]>();

		return {
			...navbar,
			navEl,
			controlEls,
			panelEls,
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
		const boxEl = element<HTMLDivElement>();
		const triggerEl = element<HTMLButtonElement>();

		return { ...item, contentEl, boxEl, triggerEl };
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
		el={navbar.navEl}
		ui-open={navbar.value !== ''}
		ui-closed={navbar.value === ''}
		onFocusout={(event) => {
			const root = navbar.navEl;
			const next = event.relatedTarget as Node | null;
			if (root === undefined) {
				onFocusout?.(event);
				return;
			}
			if (next === null || root.contains(next) !== true) navbar.closeAll();
			onFocusout?.(event);
		}}
		onPointerout={(event) => {
			// Closing on leave belongs to the root: the leaving item's pointerout fires before the arriving item's pointerover.
			const root = navbar.navEl;
			const went = event.relatedTarget as Node | null;
			if (navbar.hover !== true || root === undefined) {
				onPointerout?.(event);
				return;
			}
			if (went === null || root.contains(went) !== true) navbar.closeAll();
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
			const here = controlAt(navbar.controlEls, from);
			const isInsideDropdown = panelAt(navbar.panelEls, from) !== undefined;
			if (here === undefined || isInsideDropdown) {
				onKeydown?.(event);
				return;
			}

			const walk = topLevelControls(navbar.controlEls, navbar.panelEls);
			const next = stepTo(walk, here, key === 'ArrowRight' ? 'next' : 'previous');
			if (next) next.focus();
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
		el={item.boxEl}
		ui-open={isOpen}
		ui-closed={isOpen !== true}
		ui-active={item.active}
		onPointerover={(event) => {
			const box = item.boxEl;
			const came = event.relatedTarget as Node | null;
			// pointerover fires again for every element inside the item; only a crossing from outside it is an enter.
			if (
				navbar.hover !== true ||
				navbar.value === item.value ||
				box === undefined ||
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
			const box = item.boxEl;
			const nav = navbar.navEl;
			const went = event.relatedTarget as Node | null;
			if (box !== undefined && (went === null || box.contains(went) !== true)) {
				window.clearTimeout(item.openTimer);
				item.openTimer = 0;
				item.restingUntil = 0;
			}
			// Written here rather than on the root: the runtime hands the event to the nearest part that declared a handler and stops.
			if (
				navbar.hover === true &&
				nav !== undefined &&
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
		el={[item.triggerEl, navbar.controlEls]}
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
				// Read at the handler's top level: a shared read inside the closure below is a ReferenceError.
				const panel = item.contentEl;
				const first = controlsInside(navbar.controlEls, panel)[0];
				// The panel is still `hidden` here - the DOM lands after this handler returns - so the focus move waits for the DOM, not the call.
				let tries = 0;
				const stepIn = () => {
					tries = tries + 1;
					if (panel !== undefined && panel.hasAttribute('hidden') !== true && first) {
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

			const here = controlAt(navbar.controlEls, from);
			const walk = topLevelControls(navbar.controlEls, navbar.panelEls);
			const next = stepTo(walk, here, key === 'ArrowRight' ? 'next' : 'previous');
			if (next) next.focus();
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
		el={[item.contentEl, navbar.panelEls]}
		overlay
		hidden={isOpen !== true}
		ui-open={isOpen}
		ui-closed={isOpen !== true}
		onDismiss={(event) => {
			const box = item.boxEl;
			const back = item.triggerEl;
			// Read before the close: a hidden subtree cannot hold focus, so afterwards the answer is gone.
			const wasFocusInside = box !== undefined && box.contains(document.activeElement);
			// `contains` rather than `===`: a consumer may put an icon inside the trigger, and the press lands on that.
			const pressed = event.detail.pressTarget;
			const onOwnTrigger = pressed !== undefined && back !== undefined && back.contains(pressed);
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
			const panel = item.contentEl;
			const here = controlAt(navbar.controlEls, from);
			if (!isNavigationKey || panel === undefined || here === undefined) {
				onKeydown?.(event);
				return;
			}

			const isForwardKey = key === 'ArrowDown' || key === 'ArrowRight';
			const step =
				key === 'Home' ? 'first' : key === 'End' ? 'last' : isForwardKey ? 'next' : 'previous';
			const next = stepTo(controlsInside(navbar.controlEls, panel), here, step);
			if (next) next.focus();
			onKeydown?.(event);
		}}
	>{children}</div>
}

export function NavbarItemLink({ current, children, onKeydown, ...rest }: NavbarItemLinkProps) @{
	const navbar = navbarState();

	// `false` rather than `undefined` removes the attribute; `undefined` compiles to no update record at all.
	// `current` takes no destructuring default: a template position reads the raw prop (MARKLESS_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED).
	<a
		{...rest}
		el={navbar.controlEls}
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
			const panel = panelAt(navbar.panelEls, from);

			// One walk, two scopes: inside a dropdown all six keys walk its links, at the top level only the arrows walk and they skip open dropdowns.
			const isInsideDropdown = panel !== undefined;
			const isForwardKey = key === 'ArrowRight' || (isInsideDropdown && key === 'ArrowDown');
			const isBackwardKey = key === 'ArrowLeft' || (isInsideDropdown && key === 'ArrowUp');
			const isJumpKey = isInsideDropdown && (key === 'Home' || key === 'End');
			if (!isForwardKey && !isBackwardKey && !isJumpKey) {
				onKeydown?.(event);
				return;
			}

			const here = controlAt(navbar.controlEls, from);
			if (here === undefined) {
				onKeydown?.(event);
				return;
			}

			const walk = isInsideDropdown
				? controlsInside(navbar.controlEls, panel)
				: topLevelControls(navbar.controlEls, navbar.panelEls);
			const step = key === 'Home' ? 'first' : key === 'End' ? 'last' : isForwardKey ? 'next' : 'previous';
			const next = stepTo(walk, here, step);
			if (next) next.focus();
			onKeydown?.(event);
		}}
	>{children}</a>
}
