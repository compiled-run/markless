import { computed, element, shared, state } from '@markless/core';
import { toolbarState } from '../toolbar/toolbar.tsrx';
import type {
	ToggleGroupBoxProps,
	ToggleGroupInstanceState,
	ToggleGroupItemFieldProps,
	ToggleGroupItemInstanceState,
	ToggleGroupItemProps,
	ToggleGroupLabelProps,
	ToggleGroupOrientation,
	ToggleGroupRootProps,
} from './togglegroup-types.ts';
import { heldValues, nextHeld } from './togglegroup-values.ts';
import { nextItemToFocus } from './togglegroup-walk.ts';

export const togglegroupState = shared(
	() => {
		const group: ToggleGroupInstanceState = state({
			// Raw, in whichever shape the call site wrote it: a shared cell is seeded
			// from a bare prop and nothing else, so `heldValues` normalises every read.
			value: '',
			multiple: false,
			orientation: 'horizontal' as ToggleGroupOrientation,
			loop: false,
			disabled: false,
			required: false,
			name: '',
			focused: '',
		});
		// The array type argument makes the handle plural: bound on every item, read back as the live buttons in document order.
		const itemEls = element<HTMLButtonElement[]>();
		const labelEl = element<HTMLLabelElement>();

		return {
			...group,
			itemEls,
			labelEl,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((value: string | readonly string[]) => void) | undefined,
			toggle(pressed: string) {
				if (group.disabled) return;
				const after = nextHeld(
					heldValues(group.value),
					pressed,
					group.multiple,
					group.required,
				);
				// undefined is a refused press: the last pressed value of a required group.
				if (!after) return;
				const next = group.multiple ? after : (after[0] ?? '');
				group.value = next;
				group.onChange?.(next);
			},
		};
	},
	{ scope: 'widget' },
);

// Rooted by `togglegroup.item`: the field inside one item reads this instance,
// while the item's own body still reads the group's.
export const togglegroupItemState = shared(
	() => {
		const item: ToggleGroupItemInstanceState = state({ value: '', disabled: false });
		const el = element<HTMLButtonElement>();

		return { ...item, el };
	},
	{ scope: 'widget' },
);

export function ToggleGroupRoot({
	value = '',
	multiple = false,
	orientation = 'horizontal',
	loop = false,
	disabled = false,
	required = false,
	name = '',
	onChange,
	children,
	...rest
}: ToggleGroupRootProps) @{
	const group = togglegroupState();
	group.onChange = onChange;
	group.value = value;
	group.multiple = multiple;
	group.orientation = orientation;
	group.loop = loop;
	group.disabled = disabled;
	group.required = required;
	group.name = name;

	<ToggleGroupBox {...rest}>{children}</ToggleGroupBox>
}

// A separate part rather than the root's own element: a widget root cannot read
// its own instance token, so the label IDREF only resolves one component deeper.
function ToggleGroupBox({ children, ...rest }: ToggleGroupBoxProps) @{
	const group = togglegroupState();

	// No `aria-orientation`: ARIA does not support it on `group`, and the axis
	// reaches CSS through `ui-vertical` instead.
	<div
		{...rest}
		role="group"
		aria-labelledby={group.labelEl}
		aria-disabled={group.disabled ? 'true' : undefined}
		ui-multiple={group.multiple}
		ui-vertical={group.orientation === 'vertical'}
		ui-disabled={group.disabled}
		ui-required={group.required}
	>{children}</div>
}

export function ToggleGroupLabel({ children, ...rest }: ToggleGroupLabelProps) @{
	const group = togglegroupState();

	<label {...rest} el={group.labelEl}>{children}</label>
}

export function ToggleGroupItem({
	value,
	disabled = false,
	children,
	onClick,
	onFocus,
	onKeydown,
	...rest
}: ToggleGroupItemProps) @{
	const group = togglegroupState();
	const item = togglegroupItemState();
	// Mixed into an enclosing toolbar: every item is one of the bar's stops.
	// Outside every toolbar this resolves to no bar instance, so `mounted` is the
	// seed and the group keeps its own roving focus.
	const toolbar = toolbarState();
	item.value = value;
	// Own prop only: a seed is built from this component's props, so the group's own `disabled` is added at every read site.
	item.disabled = disabled;

	const isPressed = computed(() => heldValues(group.value).indexOf(item.value) !== -1);
	const isLocked = computed(() => item.disabled || group.disabled);
	// While nothing is pressed every enabled item is tabbable, until a focus says
	// which one owns the stop - no index, so no construction-order counter.
	const isTabStop = computed(() => {
		// Before any other read, so an enclosed item's tabindex depends on this cell
		// alone and never re-renders over the stop the bar wrote.
		if (toolbar.mounted === true) return false;
		if (item.disabled || group.disabled) return false;
		if (group.focused !== '') return group.focused === item.value;
		const held = heldValues(group.value);
		return held.length === 0 || held[0] === item.value;
	});

	<button
		{...rest}
		el={[item.el, group.itemEls, toolbar.itemEls]}
		type="button"
		value={item.value}
		aria-pressed={isPressed ? 'true' : 'false'}
		disabled={isLocked}
		tabindex={isTabStop ? 0 : -1}
		ui-pressed={isPressed}
		ui-disabled={isLocked}
		ui-vertical={group.orientation === 'vertical'}
		onClick={(event) => {
			group.toggle(item.value);
			onClick?.(event);
		}}
		onFocus={(event) => {
			group.focused = item.value;
			onFocus?.(event);
		}}
		onKeydown={(event) => {
			// Guarded by event fields alone, and only `===` chains extract: a guard
			// over locals derived from graph state is MARKLESS_SYNC_POLICY_UNEXTRACTABLE.
			// Enter and Space are absent on purpose - the item is a real button and
			// the browser activates it, so handling them here would press twice.
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

			// This item's own element off its own instance handle: a handler on the
			// element that binds the handle resolves per instance.
			const next = nextItemToFocus(
				group.itemEls,
				item.el,
				event.key,
				group.orientation !== 'vertical',
				group.loop,
			);
			// Focus only. An arrow never presses, which is the rule radiogroup inverts.
			if (next) next.focus();
			onKeydown?.(event);
		}}
	>{children}</button>
}

export function ToggleGroupItemField({ ...rest }: ToggleGroupItemFieldProps) @{
	const group = togglegroupState();
	const item = togglegroupItemState();
	const isPressed = computed(() => heldValues(group.value).indexOf(item.value) !== -1);

	// `type="hidden"` is what keeps this legal inside the button: an input in the
	// hidden state is not interactive content, so it neither takes focus nor
	// reaches the accessibility tree. `disabled` is how an unpressed item submits
	// nothing - a disabled control is left out of the form data set.
	<input
		{...rest}
		type="hidden"
		name={group.name}
		value={item.value}
		disabled={isPressed !== true}
	/>
}
