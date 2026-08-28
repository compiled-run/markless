import { computed, element, shared, state } from '@markless/core';
import { toolbarState } from '../toolbar/toolbar.tsrx';
import { surfaceStyle } from './menu-anchor.ts';
import {
	TYPEAHEAD_WINDOW,
	dismissChain,
	focusEdge,
	itemAt,
	matchingItem,
	ownItems,
	rememberReturn,
	surfaceOf,
	surfacesOf,
	takeReturn,
	walkTarget,
} from './menu-walk.ts';
import type {
	MenuContentProps,
	MenuContextareaProps,
	MenuInstanceState,
	MenuItemContentProps,
	MenuItemInstanceState,
	MenuItemProps,
	MenuRootProps,
	MenuTriggerProps,
} from './menu-types.ts';

// Every preventDefault guard reads event fields alone, so it decides before the handler symbol loads.
// Walks start at `event.target`: a lazily loaded handler has no `currentTarget`.
// One computed() cell per comparison - a comparison written inline in an attribute renders once and then goes stale.
// A gesture inside a submenu bubbles through every item and surface above it, so each handler first asks whether the target is in ITS OWN level and leaves the event alone when it is not; the surface that answered then stops it.

/** How long a touch rests before the context menu opens, in milliseconds. */
const LONG_PRESS = 500;
/** How far a resting touch may drift and still be a long press, in pixels. */
const LONG_PRESS_SLACK = 10;
/** How long a keyboard-opened context menu ignores the platform's own `contextmenu`, in milliseconds. */
const KEYBOARD_GRACE = 300;
/** How long a press that closed the surface keeps the click behind it from re-opening, in milliseconds. */
const CLICK_GRACE = 300;

// The scope class these <style> blocks compile against is per MODULE, so each
// block's subject must be structurally unique across every part: the trigger is
// the module's only plain button, an item the only element carrying a
// `menuitem*` role, a surface the only kind carrying `role="menu"` - a submenu
// told apart by sitting inside an item - and the root the div that is left.
// `@layer markless` is what keeps these defaults losing to a
// consumer's own unlayered rules without a specificity fight.

export const menuState = shared(
	() => {
		const menu: MenuInstanceState = state({
			open: false,
			disabled: false,
			loop: true,
			radio: false,
			delay: 700,
			closeDelay: 300,
			focused: '',
			typeahead: '',
			typeaheadAt: 0,
			checked: [] as readonly string[],
			position: null as { readonly x: number; readonly y: number } | null,
			pressTimer: 0,
			pressX: 0,
			pressY: 0,
			keyboardAt: 0,
			graceUntil: 0,
		});
		const rootEl = element<HTMLDivElement>();
		const triggerEl = element<HTMLButtonElement>();
		const contentEl = element<HTMLDivElement>();
		const contextEl = element<HTMLDivElement>();
		// The two rosters every walk is asked of: every submenu surface and every
		// item of this menu, at every depth, live and in document order.
		const itemContentEls = element<HTMLDivElement[]>();
		const itemEls = element<HTMLDivElement[]>();

		return {
			...menu,
			rootEl,
			triggerEl,
			contentEl,
			contextEl,
			itemContentEls,
			itemEls,
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
				menu.onOpenChange?.(false);
			},
			rove(next = '') {
				menu.focused = next;
			},
			// One method for the buffer and its clock: a shared method of arity two aborts the handler.
			type(next = '') {
				menu.typeahead = next;
				menu.typeaheadAt = Date.now();
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

// Rooted by every `menu.item`, so an item written inside another item's submenu
// gets an instance of its own. `menu.root` is declared first and is what seeds
// `menuState`, which leaves an item an ordinary PART of the enclosing menu.
export const menuItemState = shared(
	() => {
		const item: MenuItemInstanceState = state({
			expanded: false,
			value: '',
			checkable: false,
			disabled: false,
			submenu: false,
			byHover: false,
			openTimer: 0,
			closeTimer: 0,
			restingUntil: 0,
			closingUntil: 0,
		});
		const itemEl = element<HTMLDivElement>();
		const itemContentEl = element<HTMLDivElement>();

		return { ...item, itemEl, itemContentEl };
	},
	{ scope: 'widget' },
);

export function MenuRoot({
	open = false,
	checked = [],
	disabled = false,
	loop = true,
	radio = false,
	delay = 700,
	closeDelay = 300,
	onChange,
	onOpenChange,
	children,
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
	menu.delay = delay;
	menu.closeDelay = closeDelay;

	<div
		{...rest}
		el={menu.rootEl}
		ui-open={menu.open}
		ui-closed={menu.open !== true}
		ui-disabled={menu.disabled}
	>
		<style>
			@layer markless {
				/* Root and contextarea are not separable by structure, and neither is harmed by the other's declaration. */
				div:not([role]) {
					anchor-scope: --ui-menu;
					-webkit-touch-callout: none;
				}
				/* One anchor name for both surfaces. An item re-scopes it to its own
				   subtree, so `--ui-menu` is the trigger for `menu.content` and the
				   item itself for the `menu.itemcontent` written inside it. */
				div[role^="menuitem"] {
					anchor-name: --ui-menu;
					anchor-scope: --ui-menu;
				}
			}
		</style>
		{children}
	</div>
}

export function MenuTrigger({ children, onClick, onKeydown, ...rest }: MenuTriggerProps) @{
	const menu = menuState();
	const toolbar = toolbarState();
	const expandedMark = computed(() => (menu.open ? 'true' : 'false'));
	// A toolbar writes the one roving stop onto its roster from its own handlers.
	const stop = computed(() => (toolbar.mounted === true ? -1 : undefined));

	<button
		{...rest}
		el={[menu.triggerEl, toolbar.itemEls]}
		type="button"
		aria-haspopup="menu"
		aria-expanded={expandedMark}
		aria-controls={menu.contentEl}
		disabled={menu.disabled}
		tabindex={stop}
		ui-open={menu.open}
		ui-closed={menu.open !== true}
		onClick={(event) => {
			// A press on an open menu's trigger is an outside press, so the surface is already shut by the time this click lands.
			if (menu.graceUntil > Date.now()) {
				onClick?.(event);
				return;
			}
			const surfaces = surfacesOf(menu.contentEl, menu.itemContentEls);
			const surface = menu.contentEl;
			const wasOpen = menu.open === true;
			if (wasOpen) menu.hide();
			else menu.show();
			// A click with no click count came from Enter or Space, which the APG opens focusing the first item; a mouse click leaves focus on the trigger.
			if (wasOpen !== true && event.detail === 0) {
				focusEdge(ownItems(surfaces, menu.itemEls, surface), false);
			}
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
			const isOpenKey =
				key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End';
			if (isOpenKey !== true || menu.disabled === true) {
				onKeydown?.(event);
				return;
			}

			const surfaces = surfacesOf(menu.contentEl, menu.itemContentEls);
			const surface = menu.contentEl;
			const isFromEnd = key === 'ArrowUp' || key === 'End';
			menu.show();
			focusEdge(ownItems(surfaces, menu.itemEls, surface), isFromEnd);
			onKeydown?.(event);
		}}
	>
		<style>
			@layer markless {
				button { anchor-name: --ui-menu; }
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

			const surfaces = surfacesOf(menu.contentEl, menu.itemContentEls);
			const surface = menu.contentEl;
			const held = document.activeElement;
			if (surface !== undefined && held instanceof HTMLElement) rememberReturn(surface, held);
			menu.position = { x: event.clientX, y: event.clientY };
			menu.show();
			focusEdge(ownItems(surfaces, menu.itemEls, surface), false);
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
			const surfaces = surfacesOf(menu.contentEl, menu.itemContentEls);
			const surface = menu.contentEl;
			if (surface !== undefined) rememberReturn(surface, here);
			menu.keyboardAt = Date.now();
			// A keyboard invocation has no pointer, so the surface goes to the middle of what is focused.
			menu.position = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
			menu.show();
			focusEdge(ownItems(surfaces, menu.itemEls, surface), false);
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
		aria-labelledby={menu.triggerEl}
		hidden={menu.open !== true}
		ui-open={menu.open}
		ui-closed={menu.open !== true}
		onContextmenu={(event) => {
			// A right-click on the menu itself would otherwise put the browser's own menu on top of ours.
			event.preventDefault();
			onContextmenu?.(event);
		}}
		onDismiss={(event) => {
			const surface = menu.contentEl;
			const back = menu.triggerEl;
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
			if (
				event.key === 'ArrowDown' ||
				event.key === 'ArrowUp' ||
				event.key === 'Home' ||
				event.key === 'End'
			) {
				event.preventDefault();
			}

			const here = event.target as HTMLElement;
			const surfaces = surfacesOf(menu.contentEl, menu.itemContentEls);
			const mine = menu.contentEl;
			// A key inside a submenu belongs to that submenu's own surface.
			if (mine === undefined || surfaceOf(surfaces, here) !== mine) {
				onKeydown?.(event);
				return;
			}

			const key = event.key;
			const items = ownItems(surfaces, menu.itemEls, mine);
			const at = itemAt(items, here);
			// Space is a typeahead character only while a buffer is live, so typing "save as" never activates "Save".
			const isTypeaheadChar = key.length === 1 && (key !== ' ' || menu.typeahead !== '');
			const isWalkKey = key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End';

			if (isWalkKey) {
				walkTarget(items, at, key, menu.loop === true)?.focus();
			} else if (key === 'Tab') {
				// The APG's rule, and free here: the surface is not portalled and not trapped, so Tab keeps its native move.
				menu.hide();
			} else if (isTypeaheadChar) {
				const now = Date.now();
				const isStale = now - menu.typeaheadAt > TYPEAHEAD_WINDOW;
				const search = (isStale ? '' : menu.typeahead) + key.toLowerCase();
				menu.type(search);
				matchingItem(items, search, at)?.focus();
			}
			onKeydown?.(event);
		}}
	>
		<style>
			@layer markless {
				/* Fixed on both paths: anchoring works the same, and a context menu's point is in client coordinates. */
				[role="menu"] {
					position: fixed;
					position-anchor: --ui-menu;
					left: var(--x);
					top: var(--y);
					position-area: block-end span-inline-end;
				}
			}
		</style>
		{children}
	</div>
}

export function MenuItem({
	value,
	checked,
	disabled = false,
	submenu = false,
	children,
	onClick,
	onFocusin,
	onFocusout,
	onKeydown,
	onPointermove,
	onPointerout,
	onPointerover,
	...rest
}: MenuItemProps) @{
	const menu = menuState();
	const item = menuItemState();
	item.value = value;
	item.checkable = checked !== undefined;
	item.disabled = disabled;
	item.submenu = submenu;
	const isChecked = computed(() => menu.checked.includes(item.value));
	const isLocked = computed(() => item.disabled || menu.disabled);
	// A nesting item is a plain `menuitem` whatever the menu's selection mode is: what it does is open, not choose.
	const itemRole = computed(() =>
		item.submenu ? 'menuitem' : menu.radio ? 'menuitemradio' : item.checkable ? 'menuitemcheckbox' : 'menuitem',
	);
	// `false` removes the attribute: a plain command carries no checked state at all.
	const checkedMark = computed(() =>
		item.submenu !== true && (menu.radio || item.checkable)
			? menu.checked.includes(item.value)
				? 'true'
				: 'false'
			: false,
	);
	const hasPopup = computed(() => (item.submenu ? 'menu' : false));
	const isExpanded = computed(() =>
		item.submenu ? (item.expanded ? 'true' : 'false') : false,
	);

	<div
		{...rest}
		el={[item.itemEl, menu.itemEls]}
		role={itemRole}
		tabindex={-1}
		aria-checked={checkedMark}
		aria-haspopup={hasPopup}
		aria-expanded={isExpanded}
		aria-controls={item.itemContentEl}
		aria-disabled={isLocked ? 'true' : 'false'}
		ui-checked={isChecked}
		ui-open={item.expanded}
		ui-disabled={isLocked}
		onClick={(event) => {
			const here = event.target as HTMLElement;
			const panel = item.itemContentEl;
			// A press inside this item's submenu belongs to the item it landed on.
			if (panel !== undefined && panel.contains(here)) {
				onClick?.(event);
				return;
			}
			// The two cells, not the `isLocked` computed: a computed() read from a handler body does not guard.
			if (item.disabled === true || menu.disabled === true) {
				onClick?.(event);
				return;
			}

			const surfaces = surfacesOf(menu.contentEl, menu.itemContentEls);
			const isSelection = menu.radio === true || item.checkable === true;
			if (item.submenu === true) {
				const wasOpen = item.expanded === true;
				item.expanded = wasOpen !== true;
				item.byHover = false;
				// A pointer opening a submenu leaves focus where it is; a keyboard activation, which carries no click count, goes in.
				if (wasOpen !== true && event.detail === 0) {
					focusEdge(ownItems(surfaces, menu.itemEls, panel), false);
				}
			} else if (isSelection && menu.radio !== true && menu.checked.includes(item.value)) {
				menu.uncheck(item.value);
			} else if (isSelection) {
				menu.check(item.value);
			} else {
				// A command closes the whole chain it sits in, this surface and every one above it.
				menu.choose(item.value);
				dismissChain(surfaces, item.itemEl);
				// The chain hands focus back level by level; the trigger is where it ends, whether or not the press had focus to begin with.
				menu.triggerEl?.focus();
			}
			// The deepest item answered, so no item above it sees this press as its own.
			event.stopPropagation();
			onClick?.(event);
		}}
		onFocusin={(event) => {
			const here = event.target as HTMLElement;
			const panel = item.itemContentEl;
			if (panel === undefined || panel.contains(here) !== true) menu.rove(item.value);
			onFocusin?.(event);
		}}
		onFocusout={(event) => {
			// Focus leaving this item entirely takes its submenu with it: a walk onto a sibling, or the whole menu closing.
			const mine = item.itemEl;
			const went = event.relatedTarget as Node | null;
			if (mine !== undefined && (went === null || mine.contains(went) !== true)) {
				item.expanded = false;
				item.byHover = false;
			}
			onFocusout?.(event);
		}}
		onKeydown={(event) => {
			if (
				event.key === 'Enter' ||
				event.key === ' ' ||
				event.key === 'ArrowRight' ||
				event.key === 'ArrowLeft' ||
				event.key === 'ArrowDown' ||
				event.key === 'ArrowUp' ||
				event.key === 'Home' ||
				event.key === 'End'
			) {
				event.preventDefault();
			}

			const here = event.target as HTMLElement;
			const panel = item.itemContentEl;
			// A key inside this item's submenu belongs to the item it landed on.
			if (panel !== undefined && panel.contains(here)) {
				onKeydown?.(event);
				return;
			}

			const key = event.key;
			const surfaces = surfacesOf(menu.contentEl, menu.itemContentEls);
			const isSelection = menu.radio === true || item.checkable === true;
			const isOpenKey = key === 'ArrowRight' || key === 'Enter' || key === ' ';

			if (item.submenu === true) {
				if (isOpenKey) {
					if (item.disabled !== true && menu.disabled !== true) {
						item.expanded = true;
						item.byHover = false;
						focusEdge(ownItems(surfaces, menu.itemEls, panel), false);
					}
					// An enclosing menubar reads a bare ArrowRight as travel to the next menu; opening a nesting item's own submenu is not that.
					event.stopPropagation();
				}
			} else if (key === 'Enter' || key === ' ') {
				// Routed through the item's own click rule, so one place in this family activates.
				item.itemEl?.click();
				// Space toggles a selection item and leaves the menu up; Enter takes the whole chain down.
				if (key === 'Enter' && isSelection) dismissChain(surfaces, item.itemEl);
			}
			onKeydown?.(event);
		}}
		onPointermove={(event) => {
			// pointermove, not pointerover: a mouse wiggling on an item a keyboard walk left must put focus back on it, which an enter event cannot report.
			const here = event.target as HTMLElement;
			const panel = item.itemContentEl;
			if (panel !== undefined && panel.contains(here)) {
				onPointermove?.(event);
				return;
			}
			const mine = item.itemEl;
			if (mine !== undefined && document.activeElement !== mine) mine.focus();
			onPointermove?.(event);
		}}
		onPointerover={(event) => {
			const here = event.target as HTMLElement;
			const panel = item.itemContentEl;
			const mine = item.itemEl;
			if (
				item.submenu !== true ||
				item.disabled === true ||
				menu.disabled === true ||
				mine === undefined ||
				(panel !== undefined && panel.contains(here))
			) {
				onPointerover?.(event);
				return;
			}

			window.clearTimeout(item.closeTimer);
			item.closeTimer = 0;
			item.closingUntil = 0;
			if (item.expanded === true) {
				onPointerover?.(event);
				return;
			}

			const now = Date.now();
			const isRested = menu.delay <= 0 || (item.restingUntil !== 0 && now >= item.restingUntil);
			if (isRested) {
				window.clearTimeout(item.openTimer);
				item.openTimer = 0;
				item.restingUntil = 0;
				item.byHover = true;
				item.expanded = true;
			} else if (item.restingUntil === 0) {
				// The timer re-delivers the crossing rather than opening: shared reads are rewritten only at the handler's top level, so `item.expanded = true` inside this closure is a ReferenceError.
				const wait = menu.delay;
				item.restingUntil = now + wait;
				item.openTimer = window.setTimeout(() => {
					mine.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
				}, wait + 5);
			}
			onPointerover?.(event);
		}}
		onPointerout={(event) => {
			const here = event.target as HTMLElement;
			const panel = item.itemContentEl;
			const mine = item.itemEl;
			if (
				item.submenu !== true ||
				mine === undefined ||
				(panel !== undefined && panel.contains(here))
			) {
				onPointerout?.(event);
				return;
			}

			// The submenu is written INSIDE the item, so a pointer crossing into it never leaves.
			const went = event.relatedTarget as Node | null;
			if (went !== null && mine.contains(went) === true) {
				onPointerout?.(event);
				return;
			}

			window.clearTimeout(item.openTimer);
			item.openTimer = 0;
			item.restingUntil = 0;
			if (item.expanded !== true) {
				onPointerout?.(event);
				return;
			}

			const now = Date.now();
			const isElapsed =
				menu.closeDelay <= 0 || (item.closingUntil !== 0 && now >= item.closingUntil);
			if (isElapsed) {
				item.closeTimer = 0;
				item.closingUntil = 0;
				item.byHover = false;
				item.expanded = false;
			} else if (item.closingUntil === 0) {
				const wait = menu.closeDelay;
				item.closingUntil = now + wait;
				item.closeTimer = window.setTimeout(() => {
					mine.dispatchEvent(new PointerEvent('pointerout', { bubbles: true }));
				}, wait + 5);
			}
			onPointerout?.(event);
		}}
	>{children}</div>
}

// The submenu one item holds: the same surface part one level down, named by the item that opens it and anchored to it.
export function MenuItemContent({
	children,
	onContextmenu,
	onDismiss,
	onKeydown,
	...rest
}: MenuItemContentProps) @{
	const menu = menuState();
	const item = menuItemState();

	<div
		{...rest}
		el={[item.itemContentEl, menu.itemContentEls]}
		overlay
		role="menu"
		aria-labelledby={item.itemEl}
		hidden={item.expanded !== true}
		ui-open={item.expanded}
		ui-closed={item.expanded !== true}
		onContextmenu={(event) => {
			event.preventDefault();
			onContextmenu?.(event);
		}}
		onDismiss={(event) => {
			const surface = item.itemContentEl;
			const back = item.itemEl;
			const isFocusInside = surface !== undefined && surface.contains(document.activeElement);
			item.expanded = false;
			item.byHover = false;
			// Escape steps out one level and hands focus to the item that opened this submenu.
			if (event.detail.reason === 'escape' && isFocusInside) back?.focus();
			// The primitive reports an outside press to the topmost surface only, and a press outside the whole menu closes all of it.
			if (event.detail.reason === 'outside-press') {
				dismissChain(surfacesOf(menu.contentEl, menu.itemContentEls), back);
			}
			onDismiss?.(event);
		}}
		onKeydown={(event) => {
			if (
				event.key === 'ArrowDown' ||
				event.key === 'ArrowUp' ||
				event.key === 'Home' ||
				event.key === 'End' ||
				event.key === 'ArrowLeft'
			) {
				event.preventDefault();
			}

			const here = event.target as HTMLElement;
			const surfaces = surfacesOf(menu.contentEl, menu.itemContentEls);
			const mine = item.itemContentEl;
			// A key inside a deeper submenu belongs to that submenu's own surface.
			if (mine === undefined || surfaceOf(surfaces, here) !== mine) {
				onKeydown?.(event);
				return;
			}

			const key = event.key;
			const items = ownItems(surfaces, menu.itemEls, mine);
			const at = itemAt(items, here);
			const isTypeaheadChar = key.length === 1 && (key !== ' ' || menu.typeahead !== '');
			const isWalkKey = key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End';

			if (isWalkKey) {
				walkTarget(items, at, key, menu.loop === true)?.focus();
				event.stopPropagation();
			} else if (key === 'ArrowLeft') {
				// One level out, onto the item that opened this submenu. Escape does the same through the overlay's own report.
				item.expanded = false;
				item.byHover = false;
				item.itemEl?.focus();
				event.stopPropagation();
			} else if (key === 'Tab') {
				item.expanded = false;
				menu.hide();
				event.stopPropagation();
			} else if (isTypeaheadChar) {
				const now = Date.now();
				const isStale = now - menu.typeaheadAt > TYPEAHEAD_WINDOW;
				const search = (isStale ? '' : menu.typeahead) + key.toLowerCase();
				menu.type(search);
				matchingItem(items, search, at)?.focus();
				event.stopPropagation();
			}
			onKeydown?.(event);
		}}
	>
		<style>
			@layer markless {
				/* A submenu is the module's only `role="menu"` inside an item, which is what tells it apart from the top surface. */
				[role^="menuitem"] [role="menu"] { position-area: inline-end span-block-end; }
			}
		</style>
		{children}
	</div>
}
