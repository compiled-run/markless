import { computed, element, shared, state } from '@markless/core';
import type {
	ToolbarBarProps,
	ToolbarInstanceState,
	ToolbarItemInstanceState,
	ToolbarItemProps,
	ToolbarLabelProps,
	ToolbarOrientation,
	ToolbarRootProps,
} from './toolbar-types.ts';
import { applyStops, nextStop, orderedRoster, stopIndex } from './toolbar-walk.ts';

export const toolbarState = shared(
	() => {
		const toolbar: ToolbarInstanceState = state({
			orientation: 'horizontal' as ToolbarOrientation,
			// The bar exists. A control of another family reads this to know whether
			// it is inside a toolbar at all: a control outside every bar resolves to
			// no instance and reads the seed, which no rendered bar ever writes.
			mounted: false,
			// Where the bar's one tab stop sits, as a position in the roster read
			// back in document order. A position rather than an element, because a
			// shared cell is seeded and resumed and a number survives that.
			active: 0,
			// Focus has been inside the bar. Until then the bar itself is the page's
			// single stop for the bar, and it hands focus straight on.
			entered: false,
		});
		const barEl = element<HTMLDivElement>();
		const labelEl = element<HTMLSpanElement>();
		// The array type argument makes the handle plural. Every control in the bar
		// binds it - `toolbar.item`, and any other family's control that reads this
		// instance - so it reads back as the live roster.
		const itemEls = element<HTMLElement[]>();

		return { ...toolbar, barEl, labelEl, itemEls };
	},
	{ scope: 'widget' },
);

export const toolbarItemState = shared(
	() => {
		const item: ToolbarItemInstanceState = state({ disabled: false });
		const el = element<HTMLButtonElement>();

		return { ...item, el };
	},
	{ scope: 'widget' },
);

export function ToolbarRoot({ orientation = 'horizontal', children, ...rest }: ToolbarRootProps) @{
	const toolbar = toolbarState();
	toolbar.orientation = orientation;

	<ToolbarBar {...rest}>{children}</ToolbarBar>
}

// A separate part rather than the root's own element: a widget root cannot read
// its own instance token, so the label IDREF only resolves one component deeper.
function ToolbarBar({ children, onKeydown, onFocusin, ...rest }: ToolbarBarProps) @{
	const toolbar = toolbarState();
	// Read by every control in the bar, and only ever written here.
	toolbar.mounted = true;

	// An element handle cannot be read while deriving
	// (MARKLESS_ELEMENT_HANDLE_UNBOUND), so no part can compare itself to the
	// roster at render time and no control can render the stop itself. The bar
	// writes `tabindex` onto the roster from its handlers instead, and cold - before
	// any handler has run - the bar carries the page's single stop for itself.
	const barStop = computed(() => (toolbar.entered === true ? -1 : 0));

	<div
		{...rest}
		el={toolbar.barEl}
		role="toolbar"
		aria-orientation={toolbar.orientation}
		aria-labelledby={toolbar.labelEl}
		tabindex={barStop}
		ui-vertical={toolbar.orientation === 'vertical'}
		onFocusin={(event) => {
			const roster = orderedRoster(toolbar.itemEls);
			const landed = event.target;
			toolbar.entered = true;
			if (landed === toolbar.barEl) {
				// The bar was the tab stop. It never keeps focus: it hands it to the
				// control holding the roving stop and drops out of the tab order.
				roster[stopIndex(roster, toolbar.active)]?.focus();
				onFocusin?.(event);
				return;
			}
			const at = roster.indexOf(landed as HTMLElement);
			if (at !== -1) toolbar.active = at;
			applyStops(roster, toolbar.active);
			onFocusin?.(event);
		}}
		onKeydown={(event) => {
			// A flat `===` chain over `event.key` alone: the resumer applies this
			// policy before the handler module loads, so a guard over the bar's
			// orientation would be MARKLESS_SYNC_POLICY_UNEXTRACTABLE. The off-axis
			// arrows are prevented too, which costs a page scroll the way `tabs` and
			// `togglegroup` already pay it.
			if (
				event.key === 'ArrowRight' ||
				event.key === 'ArrowLeft' ||
				event.key === 'ArrowUp' ||
				event.key === 'ArrowDown' ||
				event.key === 'Home' ||
				event.key === 'End'
			) {
				event.preventDefault();
			}

			const roster = orderedRoster(toolbar.itemEls);
			const from = event.target as HTMLElement;
			// The control took the key for itself - a select opened its listbox, a
			// toggle group stepped between its own items - so focus has already moved
			// and the bar only records where the stop now sits. That is the whole
			// composition rule, and it asks nothing of the control: no shared flag, no
			// stopped propagation, no cooperation at all.
			const landed = document.activeElement;
			if (landed !== from) {
				const moved = roster.indexOf(landed as HTMLElement);
				if (moved !== -1) toolbar.active = moved;
				applyStops(roster, toolbar.active);
				onKeydown?.(event);
				return;
			}

			const next = nextStop(roster, from, event.key, toolbar.orientation !== 'vertical');
			if (next !== undefined) {
				toolbar.active = next;
				applyStops(roster, next);
				roster[next]?.focus();
			}
			onKeydown?.(event);
		}}
	>{children}</div>
}

export function ToolbarLabel({ children, ...rest }: ToolbarLabelProps) @{
	const toolbar = toolbarState();

	<span {...rest} el={toolbar.labelEl}>{children}</span>
}

export function ToolbarItem({ disabled = false, children, onClick, ...rest }: ToolbarItemProps) @{
	const toolbar = toolbarState();
	const item = toolbarItemState();
	item.disabled = disabled;

	<button
		{...rest}
		el={[item.el, toolbar.itemEls]}
		type="button"
		aria-disabled={item.disabled ? 'true' : undefined}
		ui-disabled={item.disabled}
		tabindex={-1}
		onClick={(event) => {
			// aria-disabled, not the native attribute: the control stays focusable so
			// a person walking the bar still meets it, and the family is what refuses
			// the activation.
			if (item.disabled === true) return;
			onClick?.(event);
		}}
	>{children}</button>
}
