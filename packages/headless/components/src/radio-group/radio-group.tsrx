import { computed, element, shared, state } from '@markless/core';
import VisuallyHidden from '../base/visually-hidden.tsrx';
import type {
	RadioGroupDescriptionProps,
	RadioGroupErrorProps,
	RadioGroupFieldProps,
	RadioGroupInstanceState,
	RadioGroupItemFieldProps,
	RadioGroupItemIndicatorProps,
	RadioGroupItemInstanceState,
	RadioGroupItemLabelProps,
	RadioGroupItemProps,
	RadioGroupItemTriggerProps,
	RadioGroupLabelProps,
	RadioGroupOrientation,
	RadioGroupRootProps,
} from './radio-group-types.ts';

export const radiogroupState = shared(
	() => {
		const group: RadioGroupInstanceState = state({
			value: '',
			orientation: 'vertical' as RadioGroupOrientation,
			loop: true,
			disabled: false,
			required: false,
			invalid: false,
			name: '',
			tabbable: '',
		});
		// The array type argument makes the handle plural: bound on every option's input, read back live and in document order.
		const fieldEls = element<HTMLInputElement[]>();

		return {
			...group,
			fieldEls,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((value: string) => void) | undefined,
			// One way only: nothing a person does returns a group to nothing chosen.
			choose(next: string) {
				if (group.disabled || group.value === next) return;
				group.value = next;
				group.onChange?.(next);
			},
		};
	},
	{ scope: 'widget' },
);

// Rooted by `radiogroup.item`: the parts inside one option read this instance, while the item's own body still reads the group's.
export const radiogroupItemState = shared(
	() => {
		const item: RadioGroupItemInstanceState = state({ value: '', disabled: false });
		const fieldEl = element<HTMLInputElement>();

		return { ...item, fieldEl };
	},
	{ scope: 'widget' },
);

// A fieldset named by its legend: an accessible name with no id, IDREF or minted token, plus native disabling of every option it holds.
export function RadioGroupRoot({
	value = '',
	orientation = 'vertical',
	loop = true,
	disabled = false,
	onChange,
	children,
	...rest
}: RadioGroupRootProps) @{
	const group = radiogroupState();
	group.onChange = onChange;
	group.value = value;
	group.orientation = orientation;
	group.loop = loop;
	group.disabled = disabled;

	<fieldset
		{...rest}
		role="radiogroup"
		aria-orientation={group.orientation === 'horizontal' ? 'horizontal' : 'vertical'}
		aria-required={group.required ? 'true' : 'false'}
		aria-invalid={group.invalid ? 'true' : 'false'}
		disabled={group.disabled}
		ui-horizontal={group.orientation === 'horizontal'}
		ui-disabled={group.disabled}
		ui-required={group.required}
	>{children}</fieldset>
}

export function RadioGroupLabel({ children, ...rest }: RadioGroupLabelProps) @{
	<legend {...rest}>{children}</legend>
}

/** Names the group for a form, once: every option's hidden radio reads the name and the requirement from here. */
export function RadioGroupField({ name = '', required = false }: RadioGroupFieldProps) @{
	const group = radiogroupState();
	group.name = name;
	group.required = required;

	// A part has to render markup to be served as a component, and this one has nothing to show.
	<VisuallyHidden />
}

export function RadioGroupDescription({ children, ...rest }: RadioGroupDescriptionProps) @{
	<div {...rest}>{children}</div>
}

export function RadioGroupError({ children, ...rest }: RadioGroupErrorProps) @{
	const group = radiogroupState();
	// Mounting the error part is what marks the group invalid.
	group.invalid = true;

	<div {...rest}>{children}</div>
}

export function RadioGroupItem({ value, disabled = false, children, ...rest }: RadioGroupItemProps) @{
	const group = radiogroupState();
	const item = radiogroupItemState();
	item.value = value;
	// Own prop only: a seed is built from this component's props, so the group's own `disabled` is added at every read site.
	item.disabled = disabled;

	<div
		{...rest}
		ui-selected={group.value === item.value}
		ui-disabled={item.disabled || group.disabled}
	>{children}</div>
}

// No role and no aria-checked: the radio semantics live on the native input this sits beside, and a half-stated role is worse than none.
export function RadioGroupItemTrigger({ children, onClick, ...rest }: RadioGroupItemTriggerProps) @{
	const group = radiogroupState();
	const item = radiogroupItemState();

	<div
		{...rest}
		ui-selected={group.value === item.value}
		ui-disabled={item.disabled || group.disabled}
		onClick={(event) => {
			if (!item.disabled) group.choose(item.value);
			onClick?.(event);
		}}
	>{children}</div>
}

export function RadioGroupItemIndicator({ children, ...rest }: RadioGroupItemIndicatorProps) @{
	const group = radiogroupState();
	const item = radiogroupItemState();
	// A computed, not the comparison inline: an `@if` condition written as an expression renders once and then never refreshes.
	const isSelected = computed(() => group.value === item.value);

	<span {...rest} aria-hidden="true">
		@if (isSelected) { <>{children}</> }
	</span>
}

export function RadioGroupItemLabel({ children, ...rest }: RadioGroupItemLabelProps) @{
	const item = radiogroupItemState();

	<label {...rest} for={item.fieldEl}>{children}</label>
}

export function RadioGroupItemField({ onChange, onFocus, onKeydown, ...rest }: RadioGroupItemFieldProps) @{
	const group = radiogroupState();
	const item = radiogroupItemState();
	// While nothing is chosen every enabled option is tabbable, until a focus says which one owns the stop - no index, so no construction-order counter.
	const isTabStop = computed(
		() =>
			group.value === item.value ||
			(group.value === '' && (group.tabbable === '' || group.tabbable === item.value)),
	);

	<VisuallyHidden>
		<input
			{...rest}
			el={[item.fieldEl, group.fieldEls]}
			type="radio"
			name={group.name}
			value={item.value}
			checked={group.value === item.value}
			disabled={item.disabled || group.disabled}
			required={group.required}
			tabindex={isTabStop ? 0 : -1}
			onChange={(event) => {
				group.choose(item.value);
				onChange?.(event);
			}}
			onFocus={(event) => {
				group.tabbable = item.value;
				onFocus?.(event);
			}}
			onKeydown={(event) => {
				// Guarded by event fields alone: this policy has to be readable before the handler symbol loads.
				if (
					event.key === 'ArrowDown' ||
					event.key === 'ArrowUp' ||
					event.key === 'ArrowLeft' ||
					event.key === 'ArrowRight' ||
					event.key === 'Home' ||
					event.key === 'End'
				) {
					event.preventDefault();
				}

				const isHorizontal = group.orientation === 'horizontal';
				const forward = isHorizontal ? 'ArrowRight' : 'ArrowDown';
				const backward = isHorizontal ? 'ArrowLeft' : 'ArrowUp';
				const key = event.key;
				// `target`, not `currentTarget`: a lazy handler symbol runs after the native dispatch, when `currentTarget` is null.
				const here = event.target as HTMLInputElement;
				const isNavigationKey =
					key === forward || key === backward || key === 'Home' || key === 'End';
				if (!isNavigationKey) {
					onKeydown?.(event);
					return;
				}

				const fields = Array.from(group.fieldEls ?? []).filter((field) => !field.disabled);
				const at = fields.indexOf(here);
				const last = fields.length - 1;
				const step = key === 'Home' ? -at : key === 'End' ? last - at : key === forward ? 1 : -1;
				const raw = at + step;
				const to = raw < 0 ? (group.loop ? last : 0) : raw > last ? (group.loop ? 0 : last) : raw;
				const next = fields[to];
				if (at >= 0 && next) {
					next.focus();
					// APG: an arrow moves focus AND chooses. Unlike tabs, selection is not optional.
					group.choose(next.value);
				}
				onKeydown?.(event);
			}}
		/>
	</VisuallyHidden>
}
