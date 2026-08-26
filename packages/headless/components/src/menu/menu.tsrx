import { computed, element, shared, state } from '@markless/core';
import { surfaceStyle } from './menu-anchor.ts';
import {
	TYPEAHEAD_WINDOW,
	dismissAbove,
	focusOpening,
	itemAt,
	itemsOf,
	matchingItem,
	rememberReturn,
	surfaceOf,
	takeReturn,
	walkTarget,
} from './menu-walk.ts';
import type {
	MenuContentProps,
	MenuContextareaProps,
	MenuInstanceState,
	MenuItemProps,
	MenuItemTriggerProps,
	MenuRootProps,
	MenuSide,
	MenuTriggerProps,
} from './menu-types.ts';

// Every preventDefault guard reads event fields alone, so it decides before the handler symbol loads.
// Walks start at `event.target`: a lazily loaded handler has no `currentTarget`.
// One computed() cell per comparison - a comparison written inline in an attribute renders once and then goes stale.

/** How long a touch rests before the context menu opens, in milliseconds. */
const LONG_PRESS = 500;
/** How far a resting touch may drift and still be a long press, in pixels. */
const LONG_PRESS_SLACK = 10;
/** How long a keyboard-opened context menu ignores the platform's own `contextmenu`, in milliseconds. */
const KEYBOARD_GRACE = 300;
/** How long a press that closed the surface keeps the click behind it from re-opening, in milliseconds. */
const CLICK_GRACE = 300;

export const menuState = shared(
	() => {
		const menu: MenuInstanceState = state({
			open: false,
			disabled: false,
			loop: true,
			radio: false,
			side: 'bottom' as MenuSide,
			delay: 700,
			closeDelay: 300,
			focused: '',
			typeahead: '',
			typeaheadAt: 0,
			checked: [] as readonly string[],
			position: null as { readonly x: number; readonly y: number } | null,
			byHover: false,
			openTimer: 0,
			closeTimer: 0,
			restingUntil: 0,
			closingUntil: 0,
			pressTimer: 0,
			pressX: 0,
			pressY: 0,
			keyboardAt: 0,
			graceUntil: 0,
		});
		const rootEl = element<HTMLDivElement>();
		// Two openers, one of them per menu: a root menu has the button, a submenu has the itemtrigger. Which one answered is also what says whether this menu IS a submenu.
		// Two handles for what is one opener per menu: binding one from both parts is refused at compile time, even though only ever one is rendered.
		const triggerEl = element<HTMLButtonElement>();
		const itemtriggerEl = element<HTMLButtonElement>();
		const contentEl = element<HTMLDivElement>();
		const contextEl = element<HTMLDivElement>();

		return {
			...menu,
			rootEl,
			triggerEl,
			itemtriggerEl,
			contentEl,
			contextEl,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((value: string) => void) | undefined,
			onOpenChange: undefined as ((open: boolean) => void) | undefined,
			// `next = ''` rather than `next: string`: the inlined handler is re-parsed as plain JavaScript and an annotation throws (MARKLESS_CAPTURE_OPAQUE_PROP).
			show() {
				if (menu.disabled === true || menu.open === true) return;
				menu.open = true;
				menu.onOpenChange?.(true);
			},
			hide() {
				if (menu.open !== true) return;
				menu.open = false;
				menu.focused = '';
				menu.typeahead = '';
				menu.position = null;
				menu.byHover = false;
				menu.onOpenChange?.(false);
			},
			choose(next = '') {
				menu.onChange?.(next);
			},
			check(next = '') {
				// A radio menu holds one value; a checkbox item joins the set.
				if (menu.radio === true) menu.checked = [next];
				else if (menu.checked.includes(next) !== true) menu.checked = [...menu.checked, next];
				menu.onChange?.(next);
			},
			uncheck(next = '') {
				menu.checked = menu.checked.filter((held) => held !== next);
				menu.onChange?.(next);
			},
		};
	},
	{ scope: 'widget' },
);

// A submenu is a nested `menu.root`: its own instance, so its open state, roving focus and `onChange` are the submenu's.
export function MenuRoot({
	open = false,
	checked = [],
	disabled = false,
	loop = true,
	radio = false,
	side = 'bottom',
	delay = 700,
	closeDelay = 300,
	onChange,
	onOpenChange,
	children,
	onPointerout,
	...rest
}: MenuRootProps) @{
	const menu = menuState();
	menu.onChange = onChange;
	menu.onOpenChange = onOpenChange;
	menu.open = open;
	menu.checked = checked;
	menu.disabled = disabled;
	menu.loop = loop;
	menu.radio = radio;
	menu.side = side;
	menu.delay = delay;
	menu.closeDelay = closeDelay;

	// The pointer handler sits on the root, which wraps an itemtrigger and its own surface, so a move from a submenu's trigger into that submenu is never a leave.
	<div
		{...rest}
		el={menu.rootEl}
		ui-open={menu.open}
		ui-closed={menu.open !== true}
		ui-disabled={menu.disabled}
		onPointerout={(event) => {
			const box = menu.rootEl;
			const went = event.relatedTarget as Node | null;
			if (
				menu.byHover !== true ||
				box === undefined ||
				(went !== null && box.contains(went) === true)
			) {
				onPointerout?.(event);
				return;
			}

			window.clearTimeout(menu.openTimer);
			menu.openTimer = 0;
			menu.restingUntil = 0;
			const now = Date.now();
			const isElapsed =
				menu.closeDelay <= 0 || (menu.closingUntil !== 0 && now >= menu.closingUntil);
			if (isElapsed) {
				menu.closeTimer = 0;
				menu.closingUntil = 0;
				menu.hide();
			} else if (menu.closingUntil === 0) {
				// The timer re-delivers the crossing rather than closing: shared reads are rewritten only at the handler's top level, so `menu.hide()` inside this closure is a ReferenceError.
				const wait = menu.closeDelay;
				menu.closingUntil = now + wait;
				menu.closeTimer = window.setTimeout(() => {
					box.dispatchEvent(new PointerEvent('pointerout', { bubbles: true }));
				}, wait + 5);
			}
			onPointerout?.(event);
		}}
	>
		<style>
			@layer markless {
				/* Root and contextarea are not separable by structure, and neither is harmed by the other's declaration. */
				div:not([role]):not([ui-side]) {
					anchor-scope: --ui-menu;
					-webkit-touch-callout: none;
				}
			}
		</style>
		{children}
	</div>
}

export function MenuTrigger({ children, onClick, onKeydown, ...rest }: MenuTriggerProps) @{
	const menu = menuState();

	<button
		{...rest}
		el={menu.triggerEl}
		type="button"
		aria-haspopup="menu"
		aria-expanded={menu.open ? 'true' : 'false'}
		aria-controls={menu.contentEl}
		disabled={menu.disabled}
		ui-open={menu.open}
		ui-closed={menu.open !== true}
		onClick={(event) => {
			// A press on an open menu's trigger is an outside press, so the surface is already shut by the time this click lands.
			if (menu.graceUntil > Date.now()) {
				onClick?.(event);
				return;
			}
			const surface = menu.contentEl;
			const wasOpen = menu.open === true;
			if (wasOpen) menu.hide();
			else menu.show();
			// A click with no click count came from Enter or Space, which the APG opens focusing the first item; a mouse click leaves focus on the trigger.
			if (wasOpen !== true && event.detail === 0) focusOpening(surface, false);
			onClick?.(event);
		}}
		onKeydown={(event) => {
			if (
				event.key === 'ArrowDown' ||
				event.key === 'ArrowUp' ||
				event.key === 'Home' ||
				event.key === 'End'
			) {
				event.preventDefault();
			}

			const key = event.key;
			// Enter and Space stay the button's own activation: a lazy handler's preventDefault lands after the native dispatch, so opening here as well would toggle straight back shut.
			const isOpenKey = key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End';
			if (isOpenKey !== true || menu.disabled === true) {
				onKeydown?.(event);
				return;
			}

			const surface = menu.contentEl;
			const isFromEnd = key === 'ArrowUp' || key === 'End';
			menu.show();
			focusOpening(surface, isFromEnd);
			onKeydown?.(event);
		}}
	>
		<style>
			@layer markless {
				button:not([role]) { anchor-name: --ui-menu; }
			}
		</style>
		{children}
	</button>
}

// No role, no name, no ARIA state: `aria-haspopup` says a control opens a menu when it is activated, which a region answering a right-click does not do (w3c/aria#1971).
export function MenuContextarea({
	children,
	onContextmenu,
	onKeydown,
	onPointerdown,
	onPointermove,
	onPointerup,
	...rest
}: MenuContextareaProps) @{
	const menu = menuState();

	<div
		{...rest}
		el={menu.contextEl}
		ui-open={menu.open}
		ui-closed={menu.open !== true}
		onContextmenu={(event) => {
			// Unconditional and reading nothing, which is the only shape the compiler lifts into the synchronous policy that cancels the browser's own menu on a served page's FIRST right-click.
			event.preventDefault();

			const key = menu.keyboardAt;
			// The keyboard route already opened it on the keydown; a platform that also synthesises `contextmenu` must not open it twice.
			if (menu.disabled === true || Date.now() - key < KEYBOARD_GRACE) {
				onContextmenu?.(event);
				return;
			}

			const surface = menu.contentEl;
			const held = document.activeElement;
			if (surface !== undefined && held instanceof HTMLElement) rememberReturn(surface, held);
			menu.position = { x: event.clientX, y: event.clientY };
			menu.show();
			focusOpening(surface, false);
			onContextmenu?.(event);
		}}
		onKeydown={(event) => {
			// A flat chain of key comparisons: the extractable policy grammar is `===` against a literal, and F10 without Shift has no default action here to lose.
			if (event.key === 'ContextMenu' || event.key === 'F10') {
				event.preventDefault();
			}

			// Headless Chromium turns neither key into a `contextmenu` event, so the family opens on the key itself rather than waiting for one that never arrives.
			const isMenuKey = event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey === true);
			if (isMenuKey !== true || menu.disabled === true) {
				onKeydown?.(event);
				return;
			}

			const here = event.target as HTMLElement;
			const box = here.getBoundingClientRect();
			const surface = menu.contentEl;
			if (surface !== undefined) rememberReturn(surface, here);
			menu.keyboardAt = Date.now();
			// A keyboard invocation has no pointer, so the surface goes to the middle of what is focused.
			menu.position = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
			menu.show();
			focusOpening(surface, false);
			onKeydown?.(event);
		}}
		onPointerdown={(event) => {
			if (event.pointerType === 'mouse' || menu.disabled === true) {
				onPointerdown?.(event);
				return;
			}

			const area = menu.contextEl;
			const x = event.clientX;
			const y = event.clientY;
			menu.pressX = x;
			menu.pressY = y;
			window.clearTimeout(menu.pressTimer);
			// The timer synthesises the gesture rather than opening: a scheduled callback cannot reach the graph, and iOS sends no `contextmenu` for a long press at all.
			menu.pressTimer = window.setTimeout(() => {
				area?.dispatchEvent(
					new MouseEvent('contextmenu', { bubbles: true, clientX: x, clientY: y }),
				);
			}, LONG_PRESS);
			onPointerdown?.(event);
		}}
		onPointermove={(event) => {
			const drift =
				Math.abs(event.clientX - menu.pressX) + Math.abs(event.clientY - menu.pressY);
			// A finger is never perfectly still, so only a real drift calls the gesture off.
			if (menu.pressTimer !== 0 && drift > LONG_PRESS_SLACK) {
				window.clearTimeout(menu.pressTimer);
				menu.pressTimer = 0;
			}
			onPointermove?.(event);
		}}
		onPointerup={(event) => {
			window.clearTimeout(menu.pressTimer);
			menu.pressTimer = 0;
			onPointerup?.(event);
		}}
	>{children}</div>
}

// Closed hides the surface, never detaches it: an enlisted element removed from the document leaves the overlay stack's marks behind.
// No `aria-modal`: the primitive derives modality from it, and a menu that inerts the page behind it is wrong.
export function MenuContent({
	children,
	onContextmenu,
	onDismiss,
	onKeydown,
	...rest
}: MenuContentProps) @{
	const menu = menuState();
	const placement = computed(() => surfaceStyle(menu.position));

	<div
		{...rest}
		el={menu.contentEl}
		style={placement}
		overlay
		role="menu"
		aria-labelledby={[menu.triggerEl, menu.itemtriggerEl]}
		hidden={menu.open !== true}
		ui-open={menu.open}
		ui-closed={menu.open !== true}
		ui-side={menu.side}
		onContextmenu={(event) => {
			// A right-click on the menu itself would otherwise put the browser's own menu on top of ours.
			event.preventDefault();
			onContextmenu?.(event);
		}}
		onDismiss={(event) => {
			const surface = menu.contentEl;
			const back = menu.triggerEl ?? menu.itemtriggerEl;
			// Read before the close: a hidden subtree cannot hold focus, so afterwards the answer is gone.
			const isFocusInside = surface !== undefined && surface.contains(document.activeElement);
			// `contains` rather than `===`: a consumer may put an icon inside the trigger, and the press lands on that.
			const pressed = event.detail.pressTarget;
			const isOwnTriggerPress =
				pressed !== undefined && back !== undefined && back.contains(pressed);
			// A context menu has no trigger; focus goes back to whatever held it when the menu was asked for.
			const away = surface === undefined ? undefined : takeReturn(surface);
			menu.hide();
			if (isOwnTriggerPress) menu.graceUntil = Date.now() + CLICK_GRACE;
			// The primitive moves no focus, and a press elsewhere is a person choosing where to be, so only Escape hands it back.
			if (event.detail.reason === 'escape' && isFocusInside) {
				if (back !== undefined) back.focus();
				else away?.focus();
			}
			onDismiss?.(event);
		}}
		onKeydown={(event) => {
			// The fallback walk, for a consumer's own focusable written inside the surface: an item's own handler shadows this one.
			if (
				event.key === 'ArrowDown' ||
				event.key === 'ArrowUp' ||
				event.key === 'Home' ||
				event.key === 'End'
			) {
				event.preventDefault();
			}

			const key = event.key;
			const here = event.target as HTMLElement;
			const surface = surfaceOf(here);
			const next = walkTarget(itemsOf(surface), itemAt(surface, here), key, menu.loop === true);
			next?.focus();
			onKeydown?.(event);
		}}
	>
		<style>
			@layer markless {
				/* Fixed on both paths: anchoring works the same, and a context menu's point is in client coordinates. */
				[ui-side] {
					position: fixed;
					position-anchor: --ui-menu;
					left: var(--x);
					top: var(--y);
				}
				/* `self-inline-*` reads the surface's own writing direction; plain `inline-*` never flips out of flow. */
				[ui-side="top"] { position-area: top span-right; }
				[ui-side="bottom"] { position-area: bottom span-right; }
				[ui-side="start"] { position-area: span-self-block-end self-inline-start; }
				[ui-side="end"] { position-area: span-self-block-end self-inline-end; }
			}
		</style>
		{children}
	</div>
}

export function MenuItem({
	value,
	checked,
	disabled = false,
	children,
	onClick,
	onFocusin,
	onKeydown,
	onPointermove,
	...rest
}: MenuItemProps) @{
	const menu = menuState();
	// Own props only: a seed is built from this component's props, so the menu's own `disabled` is added at every read site.
	const item = state({ value, checkable: checked !== undefined, disabled });
	const isChecked = computed(() => menu.checked.includes(item.value));
	const isLocked = computed(() => item.disabled || menu.disabled);
	const itemRole = computed(() =>
		menu.radio ? 'menuitemradio' : item.checkable ? 'menuitemcheckbox' : 'menuitem',
	);
	// `false` removes the attribute: a plain command carries no checked state at all.
	const checkedMark = computed(() =>
		menu.radio || item.checkable ? (menu.checked.includes(item.value) ? 'true' : 'false') : false,
	);

	<div
		{...rest}
		role={itemRole}
		tabindex={-1}
		aria-checked={checkedMark}
		aria-disabled={isLocked ? 'true' : 'false'}
		ui-checked={isChecked}
		ui-disabled={isLocked}
		onClick={(event) => {
			// The two cells, not the `isLocked` computed: a computed() read from a handler body does not guard.
			if (item.disabled === true || menu.disabled === true) {
				onClick?.(event);
				return;
			}

			const isSelection = menu.radio === true || item.checkable === true;
			if (isSelection && menu.radio !== true && menu.checked.includes(item.value)) {
				menu.uncheck(item.value);
			} else if (isSelection) {
				menu.check(item.value);
			} else {
				// A command closes the whole menu, this surface and every one above it.
				const surface = menu.contentEl;
				const back = menu.triggerEl ?? menu.itemtriggerEl;
				menu.choose(item.value);
				menu.hide();
				back?.focus();
				dismissAbove(surface);
			}
			onClick?.(event);
		}}
		onFocusin={(event) => {
			menu.focused = item.value;
			onFocusin?.(event);
		}}
		onKeydown={(event) => {
			if (
				event.key === 'ArrowDown' ||
				event.key === 'ArrowUp' ||
				event.key === 'Home' ||
				event.key === 'End' ||
				event.key === 'Enter' ||
				event.key === ' ' ||
				event.key === 'ArrowLeft'
			) {
				event.preventDefault();
			}

			const key = event.key;
			const here = event.target as HTMLElement;
			const surface = surfaceOf(here);
			const items = itemsOf(surface);
			const at = itemAt(surface, here);
			// Space is a typeahead character only while a buffer is live, so typing "save as" never activates "Save".
			const isTypeaheadChar = key.length === 1 && (key !== ' ' || menu.typeahead !== '');
			const isWalkKey = key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End';
			const isSelection = menu.radio === true || item.checkable === true;
			// The itemtrigger answers only in a submenu, which is what makes ArrowLeft a submenu key and nothing at the root.
			const back = menu.triggerEl ?? menu.itemtriggerEl;
			const up = menu.itemtriggerEl;

			if (isWalkKey) {
				walkTarget(items, at, key, menu.loop === true)?.focus();
			} else if (key === 'Enter' || key === ' ') {
				// Routed through the item's own click rule, so one place in this family activates.
				at?.click();
				// Space toggles a selection item and leaves the menu up; Enter takes the whole menu down.
				if (key === 'Enter' && isSelection) {
					menu.hide();
					back?.focus();
					dismissAbove(menu.contentEl);
				}
			} else if (key === 'Tab') {
				// The APG's rule, and free here: the surface is not portalled and not trapped, so Tab keeps its native move.
				menu.hide();
				dismissAbove(menu.contentEl);
			} else if (key === 'ArrowLeft') {
				// A submenu closes back onto its itemtrigger; a root menu has no itemtrigger, and ArrowLeft does nothing there.
				if (up !== undefined) {
					menu.hide();
					up.focus();
				}
			} else if (isTypeaheadChar) {
				const now = Date.now();
				const isStale = now - menu.typeaheadAt > TYPEAHEAD_WINDOW;
				const search = (isStale ? '' : menu.typeahead) + key.toLowerCase();
				// Two cell assignments rather than one method taking both: a shared method of arity two aborts the handler.
				menu.typeahead = search;
				menu.typeaheadAt = now;
				matchingItem(items, search, at)?.focus();
			}
			onKeydown?.(event);
		}}
		onPointermove={(event) => {
			// pointermove, not pointerover: a mouse wiggling on an item a keyboard walk left must put focus back on it, which an enter event cannot report.
			const here = event.target as HTMLElement;
			const at = itemAt(surfaceOf(here), here);
			if (at !== undefined && document.activeElement !== at) at.focus();
			onPointermove?.(event);
		}}
	>{children}</div>
}

// The parent menu's item and this submenu's trigger at once, so `menu.contentEl` here is the submenu's surface while the walk it joins belongs to the surface it is written in.
export function MenuItemTrigger({
	children,
	onClick,
	onFocusin,
	onKeydown,
	onPointerover,
	...rest
}: MenuItemTriggerProps) @{
	const menu = menuState();

	<button
		{...rest}
		el={menu.itemtriggerEl}
		type="button"
		role="menuitem"
		tabindex={-1}
		aria-haspopup="menu"
		aria-expanded={menu.open ? 'true' : 'false'}
		aria-controls={menu.contentEl}
		aria-disabled={menu.disabled ? 'true' : 'false'}
		ui-open={menu.open}
		ui-closed={menu.open !== true}
		onClick={(event) => {
			if (menu.disabled === true) {
				onClick?.(event);
				return;
			}
			const surface = menu.contentEl;
			const wasOpen = menu.open === true;
			if (wasOpen) menu.hide();
			else menu.show();
			// A pointer opening a submenu leaves focus where it is; a keyboard activation, which carries no click count, goes in.
			if (wasOpen !== true && event.detail === 0) focusOpening(surface, false);
			onClick?.(event);
		}}
		onFocusin={(event) => {
			menu.focused = '';
			onFocusin?.(event);
		}}
		onKeydown={(event) => {
			if (
				event.key === 'ArrowDown' ||
				event.key === 'ArrowUp' ||
				event.key === 'Home' ||
				event.key === 'End' ||
				event.key === 'ArrowRight'
			) {
				event.preventDefault();
			}

			const key = event.key;
			const here = event.target as HTMLElement;
			// The surface this trigger is written IN, not the one it opens.
			const surface = surfaceOf(here);
			const isWalkKey = key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End';
			// Enter and Space stay the button's own activation, which the click rule below opens on.
			const isOpenKey = key === 'ArrowRight';
			const isTypeaheadChar = key.length === 1 && (key !== ' ' || menu.typeahead !== '');
			const panel = menu.contentEl;

			if (isOpenKey) {
				menu.show();
				focusOpening(panel, false);
			} else if (isWalkKey) {
				const items = itemsOf(surface);
				walkTarget(items, itemAt(surface, here), key, menu.loop === true)?.focus();
			} else if (key === 'Tab') {
				menu.hide();
				dismissAbove(panel);
			} else if (isTypeaheadChar) {
				const now = Date.now();
				const isStale = now - menu.typeaheadAt > TYPEAHEAD_WINDOW;
				const search = (isStale ? '' : menu.typeahead) + key.toLowerCase();
				menu.typeahead = search;
				menu.typeaheadAt = now;
				const items = itemsOf(surface);
				matchingItem(items, search, itemAt(surface, here))?.focus();
			}
			onKeydown?.(event);
		}}
		onPointerover={(event) => {
			const opener = menu.itemtriggerEl;
			if (menu.open === true || menu.disabled === true || opener === undefined) {
				onPointerover?.(event);
				return;
			}

			window.clearTimeout(menu.closeTimer);
			menu.closeTimer = 0;
			menu.closingUntil = 0;
			const now = Date.now();
			const isRested =
				menu.delay <= 0 || (menu.restingUntil !== 0 && now >= menu.restingUntil);
			if (isRested) {
				window.clearTimeout(menu.openTimer);
				menu.openTimer = 0;
				menu.restingUntil = 0;
				menu.byHover = true;
				menu.show();
			} else if (menu.restingUntil === 0) {
				// The timer re-delivers the crossing rather than opening: shared reads are rewritten only at the handler's top level, so `menu.show()` inside this closure is a ReferenceError.
				const wait = menu.delay;
				menu.restingUntil = now + wait;
				menu.openTimer = window.setTimeout(() => {
					opener.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
				}, wait + 5);
			}
			onPointerover?.(event);
		}}
	>{children}</button>
}
