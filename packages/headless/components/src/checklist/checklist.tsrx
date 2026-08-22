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

// One instance per rendered `<checklist.root>`. The group holds two arrays and
// nothing else: what is ticked, and what the list offers. The select-all's state
// is a pure function of the two, so no second cell can disagree with the items.
// The values below are placeholders, not defaults: `<checklist.root>` seeds every
// one of them on every render.
export const checklistState = shared(
	() => {
		// Annotated, not cast: the compiler reads member accesses on this binding, and an
		// `as` expression at a use site hides them from its capture analysis.
		const checklist: ChecklistInstanceState = state({
			value: [] as readonly string[],
			values: [] as readonly string[],
			disabled: false,
		});

		return {
			...checklist,
			// The slot `<checklist.root>` fills with its own onChange prop; a writer
			// invoking it dispatches straight to the consumer's handler. It stays off
			// state() on purpose - the slot must not become a graph node.
			// Spelled as a literal function type, not the `ChecklistRootProps['onChange']`
			// alias: a callback slot is still recognised from the written annotation.
			onChange: undefined as ((value: readonly string[]) => void) | undefined,
			// Nothing ticked is off, everything ticked is on, anything else is mixed.
			// Both arrays are read whole, into a local, rather than through a
			// `.length` path: the whole-value read is what the group's writes move.
			allChecked: computed((): boolean | 'mixed' => {
				const ticked = checklist.value;
				const offered = checklist.values;
				if (ticked.length === 0) return false;
				return ticked.length === offered.length ? true : 'mixed';
			}),
			setItem(itemValue: string, on: boolean) {
				const next = on
					? [...checklist.value, itemValue]
					: checklist.value.filter((held) => held !== itemValue);
				checklist.value = next;
				checklist.onChange?.(next);
			},
			setAll(on: boolean) {
				const next = on ? [...checklist.values] : [];
				checklist.value = next;
				checklist.onChange?.(next);
			},
		};
	},
	{ scope: 'widget' },
);

// The group AND the select-all's own checkbox root, which is the shape QDS has:
// one element, `role="group"`, and the select-all parts written directly inside
// it resolve this instance. Its checked value is the group's pure function, and
// its toggle writes the whole ticked set - mixed resolves to all, because a
// select-all's mixed state is computed from the items and is never a destination
// a person can choose.
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

// Names the group by naming the select-all: the label's `for` is the minted id of
// the trigger this root's checkbox instance owns, so no group id is authored.
export function ChecklistLabel({ children, ...rest }: ChecklistLabelProps) @{
	<CheckboxLabel {...rest}>{children}</CheckboxLabel>
}

// Mounting the error part is what marks the enclosing checkbox instance invalid,
// so a `checklist.error` in the root marks the group and one inside an item marks
// that item.
export function ChecklistError({ children, ...rest }: ChecklistErrorProps) @{
	<CheckboxError {...rest}>{children}</CheckboxError>
}

// The visually hidden native input that carries the enclosing checkbox into a
// form. It takes no configuration: `name` and `value` come from the part that
// roots the instance.
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

// Roots one item's checkbox instance. Membership of `value` in the group's ticked
// set is what the checkbox shows, and its toggle writes back to the group.
export function ChecklistItem({
	value,
	disabled,
	name,
	children,
	...rest
}: ChecklistItemProps) @{
	const checklist = checklistState();
	// Materialized as graph data: the toggle handler below closes over it, and a
	// capture routed across a component edge has to resolve to a graph node
	// rather than to a plain prop.
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
