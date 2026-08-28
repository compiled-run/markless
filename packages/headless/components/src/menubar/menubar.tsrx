import { computed, element, shared, state } from '@markless/core';
import type {
	MenubarBarProps,
	MenubarInstanceState,
	MenubarLabelProps,
	MenubarRootProps,
} from './menubar-types.ts';
import {
	TYPEAHEAD_WINDOW,
	applyStops,
	isShowing,
	matchingTrigger,
	menuIndexOf,
	nextStop,
	orderedRoster,
	showingIndex,
	stopIndex,
} from './menubar-walk.ts';

// The bar drives the menus it holds by re-delivering the gestures those menus
// already answer for themselves: an ArrowDown on a trigger is what opens a menu
// on its first command, and a click on an open menu's trigger is what closes it.
// A bar instance cannot reach a menu instance's cells, and the menus are whole
// and unedited, so the gesture is the only thing there is to write.

export const menubarState = shared(
	() => {
		const bar: MenubarInstanceState = state({
			// A `menu` part outside every bar resolves to no instance and reads this seed, which no rendered bar ever writes.
			mounted: false,
			// A position in the roster rather than an element: a shared cell is seeded and resumed, and a number survives that.
			active: 0,
			entered: false,
			typeahead: '',
			typeaheadAt: 0,
		});
		const barEl = element<HTMLDivElement>();
		const labelEl = element<HTMLSpanElement>();
		// Bound by `menu.trigger` and `menu.root` from that family's own components.
		const triggerEls = element<HTMLElement[]>();
		const menuEls = element<HTMLElement[]>();

		return { ...bar, barEl, labelEl, triggerEls, menuEls };
	},
	{ scope: 'widget' },
);

export function MenubarRoot({ children, ...rest }: MenubarRootProps) @{
	const bar = menubarState();
	// Read by every enclosed menu part, and only ever written here.
	bar.mounted = true;

	<MenubarBar {...rest}>{children}</MenubarBar>
}

// A separate part rather than the root's own element: a widget root cannot read
// its own instance token, so the label IDREF only resolves one component deeper.
function MenubarBar({ children, onFocusin, onKeydown, onPointerover, ...rest }: MenubarBarProps) @{
	const bar = menubarState();
	// An element handle cannot be read while deriving, so no trigger can render
	// the stop itself. The bar writes `tabindex` onto the roster from its handlers,
	// and cold - before any handler has run - carries the page's single stop here.
	const barStop = computed(() => (bar.entered === true ? -1 : 0));

	<div
		{...rest}
		el={[bar.barEl, bar.triggerEls, bar.menuEls]}
		role="menubar"
		aria-orientation="horizontal"
		aria-labelledby={bar.labelEl}
		tabindex={barStop}
		onFocusin={(event) => {
			const triggers = orderedRoster(bar.triggerEls, bar.barEl);
			const menus = orderedRoster(bar.menuEls, bar.barEl);
			const landed = event.target;
			bar.entered = true;
			if (landed === bar.barEl) {
				// The bar was the tab stop. It never keeps focus: it hands it to the
				// trigger holding the roving stop and drops out of the tab order.
				triggers[stopIndex(triggers, bar.active)]?.focus();
				onFocusin?.(event);
				return;
			}
			// Focus anywhere in one menu - trigger, surface, a submenu three levels down - is that menu owning the stop.
			const at = menuIndexOf(triggers, menus, landed as Node);
			if (at !== -1) bar.active = at;
			applyStops(triggers, bar.active);
			onFocusin?.(event);
		}}
		onKeydown={(event) => {
			// A flat `===` chain over `event.key` alone: the resumer applies this
			// policy before the handler module loads, so a guard over what is open
			// would be MARKLESS_SYNC_POLICY_UNEXTRACTABLE.
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
			const triggers = orderedRoster(bar.triggerEls, bar.barEl);
			const menus = orderedRoster(bar.menuEls, bar.barEl);
			const at = menuIndexOf(triggers, menus, here);
			if (at === -1) {
				onKeydown?.(event);
				return;
			}

			const from = triggers[at];
			// The bar walks only on the trigger: inside an open surface, Home, End and a typed letter are that surface's own.
			const onTrigger = from !== undefined && from.contains(here);
			const isTravel = isShowing(from) && (key === 'ArrowLeft' || key === 'ArrowRight');
			const isWalk =
				onTrigger &&
				(key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Home' || key === 'End');
			// Space is left alone: it activates the trigger, which is what opens a menu.
			const isTypeaheadChar = onTrigger && key.length === 1 && key !== ' ';

			if (isTravel) {
				const next = nextStop(triggers, at, key);
				const going = next === undefined ? undefined : triggers[next];
				if (next !== undefined && next !== at && going !== undefined) {
					// Open first, close after: the focus the neighbour takes is what collapses any submenu the old menu had open.
					going.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
					if (from !== undefined && isShowing(from)) {
						from.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
					}
					bar.active = next;
					applyStops(triggers, next);
				}
				event.stopPropagation();
			} else if (isWalk) {
				const next = nextStop(triggers, at, key);
				if (next !== undefined) {
					bar.active = next;
					applyStops(triggers, next);
					triggers[next]?.focus();
				}
				event.stopPropagation();
			} else if (isTypeaheadChar) {
				const now = Date.now();
				const isStale = now - bar.typeaheadAt > TYPEAHEAD_WINDOW;
				const search = (isStale ? '' : bar.typeahead) + key.toLowerCase();
				bar.typeahead = search;
				bar.typeaheadAt = now;
				const found = matchingTrigger(triggers, search, at);
				if (found !== undefined) {
					const moved = triggers.indexOf(found);
					bar.active = moved;
					applyStops(triggers, moved);
					found.focus();
				}
				event.stopPropagation();
			}
			onKeydown?.(event);
		}}
		onPointerover={(event) => {
			// Hover-after-open, Radix's rule: nothing opens on hover until something is,
			// and from then on every neighbour opens at once. No delay is consulted -
			// `menu`'s hover intent is the nested submenus' alone.
			const here = event.target as HTMLElement;
			const triggers = orderedRoster(bar.triggerEls, bar.barEl);
			const menus = orderedRoster(bar.menuEls, bar.barEl);
			const at = menuIndexOf(triggers, menus, here);
			const wanted = at === -1 ? undefined : triggers[at];
			const open = showingIndex(triggers);
			if (
				wanted === undefined ||
				wanted.contains(here) !== true ||
				isShowing(wanted) ||
				open === -1
			) {
				onPointerover?.(event);
				return;
			}

			wanted.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
			wanted.focus();
			const leaving = triggers[open];
			if (leaving !== undefined) {
				leaving.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
			}
			bar.active = at;
			applyStops(triggers, at);
			onPointerover?.(event);
		}}
	>{children}</div>
}

export function MenubarLabel({ children, ...rest }: MenubarLabelProps) @{
	const bar = menubarState();

	<span {...rest} el={bar.labelEl}>{children}</span>
}
