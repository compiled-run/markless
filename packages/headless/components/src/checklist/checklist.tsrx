import { computed, shared, state } from '@markless/core';
import {
	CheckboxDescription,
	CheckboxError,
	CheckboxField,
	CheckboxIndicator,
	CheckboxLabel,
	CheckboxRoot,
	CheckboxTrigger,
} from '../checkbox/checkbox.tsrx';
import type {
	ChecklistErrorProps,
	ChecklistFieldProps,
	ChecklistInstanceState,
	ChecklistItemDescriptionProps,
	ChecklistItemIndicatorProps,
	ChecklistItemLabelProps,
	ChecklistItemProps,
	ChecklistItemTriggerProps,
	ChecklistLabelProps,
	ChecklistRootProps,
	ChecklistSelectAllIndicatorProps,
	ChecklistSelectAllProps,
} from './checklist-types.ts';

export const checklistState = shared(
	() => {
		const checklist: ChecklistInstanceState = state({
			value: [] as readonly string[],
			values: [] as readonly string[],
			disabled: false,
		});

		return {
			...checklist,
			// The literal function type matters: a callback slot is recognised only from
			// the written annotation, never inferred.
			onChange: undefined as ((value: readonly string[]) => void) | undefined,
			allChecked: computed((): boolean | 'mixed' => {
				const ticked = checklist.value;
				const offered = checklist.values;
				if (ticked.length === 0) return false;
				if (ticked.length === offered.length) return true;
				return 'mixed';
			}),
			setItem(itemValue: string, isOn: boolean) {
				const next = isOn
					? [...checklist.value, itemValue]
					: checklist.value.filter((held) => held !== itemValue);
				checklist.value = next;
				checklist.onChange?.(next);
			},
			setAll(isOn: boolean) {
				const next = isOn ? [...checklist.values] : [];
				checklist.value = next;
				checklist.onChange?.(next);
			},
		};
	},
	{ scope: 'widget' },
);

// The select-all's mixed state is computed from the items, never a destination a
// click can reach: activating it from mixed ticks everything.
export function ChecklistRoot({
	value = [],
	values = [],
	disabled = false,
	onChange,
	children,
	...rest
}: ChecklistRootProps) @{
	const checklist = checklistState();
	checklist.onChange = onChange;
	checklist.value = value;
	checklist.values = values;
	checklist.disabled = disabled;

	<CheckboxRoot
		{...rest}
		role="group"
		checked={checklist.allChecked}
		disabled={checklist.disabled}
		onChange={(next: boolean | 'mixed') => {
			checklist.setAll(next === true);
		}}
	>{children}</CheckboxRoot>
}

export function ChecklistLabel({ children, ...rest }: ChecklistLabelProps) @{
	<CheckboxLabel {...rest}>{children}</CheckboxLabel>
}

export function ChecklistError({ children, ...rest }: ChecklistErrorProps) @{
	<CheckboxError {...rest}>{children}</CheckboxError>
}

export function ChecklistField({ ...rest }: ChecklistFieldProps) @{
	<CheckboxField {...rest} />
}

export function ChecklistSelectAll({ children, ...rest }: ChecklistSelectAllProps) @{
	<CheckboxTrigger {...rest}>{children}</CheckboxTrigger>
}

export function ChecklistSelectAllIndicator({
	children,
	...rest
}: ChecklistSelectAllIndicatorProps) @{
	<CheckboxIndicator {...rest}>{children}</CheckboxIndicator>
}

export function ChecklistItem({
	value,
	disabled,
	name,
	children,
	...rest
}: ChecklistItemProps) @{
	const checklist = checklistState();
	const item = state({ value });

	<CheckboxRoot
		{...rest}
		checked={checklist.value.includes(item.value)}
		disabled={checklist.disabled || disabled === true}
		name={name}
		value={item.value}
		onChange={(next: boolean | 'mixed') => {
			checklist.setItem(item.value, next === true);
		}}
	>{children}</CheckboxRoot>
}

export function ChecklistItemTrigger({ children, ...rest }: ChecklistItemTriggerProps) @{
	<CheckboxTrigger {...rest}>{children}</CheckboxTrigger>
}

export function ChecklistItemLabel({ children, ...rest }: ChecklistItemLabelProps) @{
	<CheckboxLabel {...rest}>{children}</CheckboxLabel>
}

export function ChecklistItemDescription({ children, ...rest }: ChecklistItemDescriptionProps) @{
	<CheckboxDescription {...rest}>{children}</CheckboxDescription>
}

export function ChecklistItemIndicator({ children, ...rest }: ChecklistItemIndicatorProps) @{
	<CheckboxIndicator {...rest}>{children}</CheckboxIndicator>
}
