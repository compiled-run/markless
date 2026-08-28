import { computed, element, shared, state } from '@markless/core';
import { MenuRoot, menuState } from '../menu/menu.tsrx';
import {
	itemAt,
	matchingItem,
	ownItems,
	surfaceOf,
	surfacesOf,
	walkTarget,
} from '../menu/menu-walk.ts';
import { toolbarState } from '../toolbar/toolbar.tsrx';
import type {
	MenubarBarProps,
	MenubarInstanceState,
	MenubarItemContentProps,
	MenubarItemControlProps,
	MenubarItemInstanceState,
	MenubarItemProps,
	MenubarLabelProps,
	MenubarRootProps,
} from './menubar-types.ts';
import {
	TYPEAHEAD_WINDOW,
	applyStops,
	isShowing,
	itemIndexOf,
	matchingBarItem,
	nextStop,
	orderedRoster,
	reveal,
	showingIndex,
	stopIndex,
	travel,
} from './menubar-walk.ts';

// The bar is the item level's own recursion, one turn up from `menu`: a
// `menubar.item` roots a menu of its own the way a `menu.item submenu` roots its
// submenu, and the menu family's parts go inside it untouched. Two rosters carry
// that: the bar's own items, and the menu handles a `menubar.itemcontent`
// registers into so that every walk `menu` already ships answers for this
// surface too.
// A bar instance cannot reach one item's cells, so the bar hands over between
// items by re-delivering the gestures the items answer for themselves.

/** How long a press that closed a menu keeps the click behind it from re-opening, in milliseconds. */
const CLICK_GRACE = 300;

export const menubarState = shared(
	() => {
		const bar: MenubarInstanceState = state({
			// A position in the roster rather than an element: a shared cell is seeded and resumed, and a number survives that.
			active: 0,
			entered: false,
			typeahead: '',
			typeaheadAt: 0,
		});
		const barEl = element<HTMLDivElement>();
		const labelEl = element<HTMLSpanElement>();
		const itemEls = element<HTMLElement[]>();

		return {
			...bar,
			barEl,
			labelEl,
			itemEls,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((value: string) => void) | undefined,
			// `next = ''` rather than `next: string`: the inlined handler is re-parsed as plain JavaScript and an annotation throws (MARKLESS_CAPTURE_OPAQUE_PROP).
			report(next = '') {
				bar.onChange?.(next);
			},
		};
	},
	{ scope: 'widget' },
);

// Rooted by every `menubar.item`, so each menu on the bar gets a level of its
// own. `menubar.root` is declared first and is what seeds `menubarState`, which
// leaves an item an ordinary PART of the bar.
export const menubarItemState = shared(
	() => {
		const level: MenubarItemInstanceState = state({
			expanded: false,
			disabled: false,
			loop: true,
			typeahead: '',
			typeaheadAt: 0,
			graceUntil: 0,
		});
		const itemEl = element<HTMLDivElement>();
		const itemContentEl = element<HTMLDivElement>();

		return { ...level, itemEl, itemContentEl };
	},
	{ scope: 'widget' },
);

export function MenubarRoot({ onChange, children, ...rest }: MenubarRootProps) @{
	const bar = menubarState();
	bar.onChange = onChange;

	<MenubarBar {...rest}>{children}</MenubarBar>
}

// A separate part rather than the root's own element: a widget root cannot read
// its own instance token, so the label IDREF only resolves one component deeper.
function MenubarBar({ children, onFocusin, onKeydown, onPointerover, ...rest }: MenubarBarProps) @{
	const bar = menubarState();
	const toolbar = toolbarState();
	// An element handle cannot be read while deriving, so no item can render the
	// stop itself. The bar writes `tabindex` onto the roster from its handlers,
	// and cold - before any handler has run - carries the page's single stop here.
	// Inside a toolbar the bar is one of that bar's controls, and the stop is its.
	const barStop = computed(() =>
		bar.entered === true || toolbar.mounted === true ? -1 : 0,
	);

	<div
		{...rest}
		el={[bar.barEl, bar.itemEls, toolbar.itemEls]}
		role="menubar"
		aria-orientation="horizontal"
		aria-labelledby={bar.labelEl}
		tabindex={barStop}
		onFocusin={(event) => {
			const items = orderedRoster(bar.itemEls, bar.barEl);
			const landed = event.target;
			bar.entered = true;
			if (landed === bar.barEl) {
				// The bar was the tab stop. It never keeps focus: it hands it to the
				// item holding the roving stop and drops out of the tab order.
				items[stopIndex(items, bar.active)]?.focus();
				onFocusin?.(event);
				return;
			}
			// Focus anywhere in one item - the item itself, its menu, a submenu three levels down - is that item owning the stop.
			const at = itemIndexOf(items, landed as Node);
			if (at !== -1) bar.active = at;
			applyStops(items, bar.active);
			onFocusin?.(event);
		}}
		onKeydown={(event) => {
			// A flat `===` chain over `event.key` alone: the resumer applies this
			// policy before the handler module loads, so a guard over what is open
			// would be MARKLESS_SYNC_POLICY_UNEXTRACTABLE. It covers the whole bar,
			// so a surface travelling on Left or Right has its default cancelled cold.
			if (
				event.key === 'ArrowLeft' ||
				event.key === 'ArrowRight' ||
				event.key === 'Home' ||
				event.key === 'End'
			) {
				event.preventDefault();
			}

			const key = event.key;
			const here = event.target as HTMLElement;
			const items = orderedRoster(bar.itemEls, bar.barEl);
			const at = itemIndexOf(items, here);
			// The bar walks only on the item itself: inside an open menu, Home, End and a typed letter are that menu's own.
			if (at === -1 || items[at] !== here) {
				onKeydown?.(event);
				return;
			}

			const isTravel = isShowing(here) && (key === 'ArrowLeft' || key === 'ArrowRight');
			const isWalk =
				key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Home' || key === 'End';
			// Space is left alone: it opens the item, which is what activation means here.
			const isTypeaheadChar = key.length === 1 && key !== ' ';

			if (isTravel) {
				const next = nextStop(items, at, key);
				if (next !== undefined && next !== at) {
					travel(items, at, next);
					bar.active = next;
					applyStops(items, next);
				}
				event.stopPropagation();
			} else if (isWalk) {
				const next = nextStop(items, at, key);
				if (next !== undefined) {
					bar.active = next;
					applyStops(items, next);
					items[next]?.focus();
				}
				event.stopPropagation();
			} else if (isTypeaheadChar) {
				const now = Date.now();
				const isStale = now - bar.typeaheadAt > TYPEAHEAD_WINDOW;
				const search = (isStale ? '' : bar.typeahead) + key.toLowerCase();
				bar.typeahead = search;
				bar.typeaheadAt = now;
				const found = matchingBarItem(items, search, at);
				if (found !== undefined) {
					const moved = items.indexOf(found);
					bar.active = moved;
					applyStops(items, moved);
					found.focus();
				}
				event.stopPropagation();
			}
			onKeydown?.(event);
		}}
		onPointerover={(event) => {
			// Hover-after-open, Radix's rule: nothing opens on hover until something is,
			// and from then on every neighbour opens at once. No delay is consulted -
			// hover intent is the nested submenus' alone.
			const here = event.target as HTMLElement;
			const items = orderedRoster(bar.itemEls, bar.barEl);
			const at = itemIndexOf(items, here);
			const wanted = at === -1 ? undefined : items[at];
			const open = showingIndex(items);
			if (wanted === undefined || isShowing(wanted) || open === -1) {
				onPointerover?.(event);
				return;
			}

			reveal(items, open, at);
			wanted.focus();
			bar.active = at;
			applyStops(items, at);
			onPointerover?.(event);
		}}
	>
		<style>
			@layer markless {
				[role="menubar"] { anchor-scope: --ui-menubar-item; }
			}
		</style>
		{children}
	</div>
}

// A separate part rather than the item's own element: `menubar.item` roots the
// level and the menu below it, and an IDREF to either only resolves one
// component deeper.
function MenubarItemControl({
	children,
	onClick,
	onKeydown,
	...rest
}: MenubarItemControlProps) @{
	const bar = menubarState();
	const level = menubarItemState();
	const menu = menuState();
	const expandedMark = computed(() => (level.expanded ? 'true' : 'false'));
	const isLocked = computed(() => (level.disabled ? 'true' : 'false'));

	// `menu.triggerEl` is the control a command hands focus back to when it closes
	// the chain, and `menu.itemEls` is bound here rather than on the surface
	// because an item of the bar sits outside every surface and so is never one
	// surface's own command.
	<div
		{...rest}
		el={[level.itemEl, bar.itemEls, menu.triggerEl, menu.itemEls]}
		role="menuitem"
		tabindex={-1}
		aria-haspopup="menu"
		aria-expanded={expandedMark}
		aria-controls={level.itemContentEl}
		aria-disabled={isLocked}
		ui-open={level.expanded}
		ui-closed={level.expanded !== true}
		ui-disabled={level.disabled}
		onClick={(event) => {
			const here = event.target as HTMLElement;
			const surface = level.itemContentEl;
			// A press inside this item's menu belongs to the command it landed on.
			if (surface !== undefined && surface.contains(here)) {
				onClick?.(event);
				return;
			}
			// A press on an open item is an outside press, so the menu is already shut by the time this click lands.
			if (level.graceUntil > Date.now() || level.disabled === true) {
				onClick?.(event);
				return;
			}

			const wasOpen = level.expanded === true;
			level.expanded = wasOpen !== true;
			// A click with no click count came from Enter or Space, which the APG opens focusing the first command; a mouse click leaves focus on the item.
			if (wasOpen !== true && event.detail === 0) {
				surface?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
			}
			event.stopPropagation();
			onClick?.(event);
		}}
		onKeydown={(event) => {
			if (
				event.key === 'ArrowDown' ||
				event.key === 'ArrowUp' ||
				event.key === 'Enter' ||
				event.key === ' '
			) {
				event.preventDefault();
			}

			const here = event.target as HTMLElement;
			const surface = level.itemContentEl;
			// A key inside this item's menu belongs to that menu.
			if (surface !== undefined && surface.contains(here)) {
				onKeydown?.(event);
				return;
			}

			const key = event.key;
			const isOpenKey = key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === ' ';
			if (isOpenKey !== true || level.disabled === true) {
				onKeydown?.(event);
				return;
			}

			// The surface answers where the roving focus lands, over the commands it
			// holds: an item of the bar cannot ask, because a plural handle reads
			// against the bindings its own module carries.
			const edge = key === 'ArrowUp' ? 'End' : 'Home';
			level.expanded = true;
			surface?.dispatchEvent(new KeyboardEvent('keydown', { key: edge, bubbles: true }));
			event.stopPropagation();
			onKeydown?.(event);
		}}
	>
		<style>
			@layer markless {
				[role="menuitem"] {
					anchor-name: --ui-menubar-item;
					anchor-scope: --ui-menubar-item;
				}
			}
		</style>
		{children}
	</div>
}

// The props go on to `menu.root` unchanged rather than defaulted here: a
// destructuring default is a component-body local, and a template position reads
// the prop the consumer passed (MARKLESS_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED).
export function MenubarItem({
	open,
	checked,
	disabled,
	loop,
	radio,
	delay,
	closeDelay,
	children,
	...rest
}: MenubarItemProps) @{
	const level = menubarItemState();
	const bar = menubarState();
	level.expanded = open === true;
	level.disabled = disabled === true;
	level.loop = loop !== false;

	// The menu family's own level, so every `menu.item` written inside this item
	// resolves the instance its shipped keyboard and activation already read.
	// What a command reports goes to the bar, which is the one root.
	<MenuRoot
		checked={checked}
		disabled={disabled}
		loop={loop}
		radio={radio}
		delay={delay}
		closeDelay={closeDelay}
		onChange={(value: string) => {
			bar.report(value);
		}}
	>
		<MenubarItemControl {...rest}>{children}</MenubarItemControl>
	</MenuRoot>
}

// Closed hides the surface, never detaches it: an enlisted element removed from
// the document leaves the overlay stack's marks behind.
// No `aria-modal`: the primitive derives modality from it, and a menu that inerts
// the page behind it is wrong.
export function MenubarItemContent({
	children,
	onContextmenu,
	onDismiss,
	onKeydown,
	...rest
}: MenubarItemContentProps) @{
	const bar = menubarState();
	const level = menubarItemState();
	const menu = menuState();

	// `menu.itemContentEls` is what makes this surface one of the menu's own: the
	// chain a command closes, and the level a submenu inside it belongs under, are
	// both read off that roster by the menu family itself.
	<div
		{...rest}
		el={[level.itemContentEl, menu.itemContentEls]}
		overlay
		role="menu"
		aria-labelledby={level.itemEl}
		hidden={level.expanded !== true}
		ui-open={level.expanded}
		ui-closed={level.expanded !== true}
		onContextmenu={(event) => {
			// A right-click on the menu itself would otherwise put the browser's own menu on top of ours.
			event.preventDefault();
			onContextmenu?.(event);
		}}
		onDismiss={(event) => {
			const surface = level.itemContentEl;
			const back = level.itemEl;
			// Read before the close: a hidden subtree cannot hold focus, so afterwards the answer is gone.
			const isFocusInside = surface !== undefined && surface.contains(document.activeElement);
			// `contains` rather than `===`: a consumer may put an icon inside the item, and the press lands on that.
			const pressed = event.detail.pressTarget;
			const isOwnItemPress =
				pressed !== undefined && back !== undefined && back.contains(pressed);
			level.expanded = false;
			if (isOwnItemPress) level.graceUntil = Date.now() + CLICK_GRACE;
			// The primitive moves no focus, and a press elsewhere is a person choosing where to be, so only Escape hands it back.
			if (event.detail.reason === 'escape' && isFocusInside) back?.focus();
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
			const surfaces = surfacesOf(undefined, menu.itemContentEls);
			const mine = level.itemContentEl;
			// A key inside a submenu belongs to that submenu's own surface.
			if (mine === undefined || surfaceOf(surfaces, here) !== mine) {
				onKeydown?.(event);
				return;
			}

			const key = event.key;
			const items = ownItems(surfaces, menu.itemEls, mine);
			const at = itemAt(items, here);
			// Space is a typeahead character only while a buffer is live, so typing "save as" never activates "Save".
			const isTypeaheadChar = key.length === 1 && (key !== ' ' || level.typeahead !== '');
			const isWalkKey = key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End';
			const isTravel = key === 'ArrowLeft' || key === 'ArrowRight';

			if (isWalkKey) {
				walkTarget(items, at, key, level.loop === true)?.focus();
				event.stopPropagation();
			} else if (isTravel) {
				// Left and Right leave this menu for the neighbouring item's, which is what a bar does with them.
				const roster = orderedRoster(bar.itemEls, bar.barEl);
				const from = itemIndexOf(roster, here);
				const next = from === -1 ? undefined : nextStop(roster, from, key);
				if (next !== undefined && next !== from) {
					travel(roster, from, next);
					bar.active = next;
					applyStops(roster, next);
				}
				event.stopPropagation();
			} else if (key === 'Tab') {
				// The APG's rule, and free here: the surface is not portalled and not trapped, so Tab keeps its native move.
				level.expanded = false;
				event.stopPropagation();
			} else if (isTypeaheadChar) {
				const now = Date.now();
				const isStale = now - level.typeaheadAt > TYPEAHEAD_WINDOW;
				const search = (isStale ? '' : level.typeahead) + key.toLowerCase();
				level.typeahead = search;
				level.typeaheadAt = now;
				matchingItem(items, search, at)?.focus();
				event.stopPropagation();
			}
			onKeydown?.(event);
		}}
	>
		<style>
			@layer markless {
				[role="menu"] {
					position: fixed;
					position-anchor: --ui-menubar-item;
					position-area: block-end;
				}
			}
		</style>
		{children}
	</div>
}

export function MenubarLabel({ children, ...rest }: MenubarLabelProps) @{
	const bar = menubarState();

	<span {...rest} el={bar.labelEl}>{children}</span>
}
