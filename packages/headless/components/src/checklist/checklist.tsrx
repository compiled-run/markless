import { computed, shared, state } from '@markless/core';
import { CheckboxRoot } from '../checkbox/checkbox.tsrx';
import type {
	ChecklistErrorProps,
	ChecklistInstanceState,
	ChecklistItemProps,
	ChecklistLabelProps,
	ChecklistRootProps,
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
			invalid: false,
		});

		return {
			...checklist,
			// The slot `<checklist.root>` fills with its own onChange prop; a writer
			// invoking it dispatches straight to the consumer's handler. It stays off
			// state() on purpose - the slot must not become a graph node.
			// Spelled as a literal function type, not an alias: a callback slot is
			// recognised from the written annotation.
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

// A `<fieldset>` is the group, and its `<legend>` names it — the shape aria-at's
// own tri-state reference uses, so no id is minted and no IDREF is needed.
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

	// No `disabled` attribute on the fieldset: the type service's fieldset does not
	// declare one, so the native cascade is unavailable and each part carries its
	// own restriction instead.
	<fieldset
		{...rest}
		ui-disabled={checklist.disabled}
		ui-invalid={checklist.invalid}
	>{children}</fieldset>
}

export function ChecklistLabel({ children, ...rest }: ChecklistLabelProps) @{
	<legend {...rest}>{children}</legend>
}

// Holds the select-all's checkbox instance. Its `checked` is the group's pure
// function, and its toggle writes the whole ticked set: mixed resolves to all,
// because a select-all's mixed state is computed from the items and is never a
// destination a person can choose.
//
// The consumer's own attributes land on this element, and the checkbox root is
// its child: a spread cannot cross a component boundary today (see note.md), so
// `{...rest}` has to sit on an element this part owns.
export function ChecklistSelectAll({ children, ...rest }: ChecklistSelectAllProps) @{
	const checklist = checklistState();

	<div
		{...rest}
		ui-checked={checklist.allChecked === true}
		ui-mixed={checklist.allChecked === 'mixed'}
		ui-disabled={checklist.disabled}
	>
		<CheckboxRoot
			checked={checklist.allChecked}
			disabled={checklist.disabled}
			onChange={(next: boolean | 'mixed') => {
				checklist.setAll(next === true);
			}}
		>{children}</CheckboxRoot>
	</div>
}

// Roots one item's checkbox instance: `checkbox.trigger`, `.indicator`, `.label`,
// `.description` and `.field` go inside. Membership of `value` in the group's
// ticked set is what the checkbox shows, and its toggle writes back to the group.
export function ChecklistItem({ value, disabled, name, children, ...rest }: ChecklistItemProps) @{
	const checklist = checklistState();
	// Materialized as graph data: the toggle handler below closes over it, and a
	// capture routed across a component edge has to resolve to a graph node
	// rather than to a plain prop.
	const item = state({ value });

	<div
		{...rest}
		ui-checked={checklist.value.includes(item.value)}
		ui-disabled={checklist.disabled || disabled === true}
	>
		<CheckboxRoot
			checked={checklist.value.includes(item.value)}
			disabled={checklist.disabled || disabled === true}
			name={name}
			value={item.value}
			onChange={(next: boolean | 'mixed') => {
				checklist.setItem(item.value, next === true);
			}}
		>{children}</CheckboxRoot>
	</div>
}

export function ChecklistError({ children, ...rest }: ChecklistErrorProps) @{
	const checklist = checklistState();
	// Mounting the error part is what marks the group invalid.
	checklist.invalid = true;

	<div {...rest}>{children}</div>
}
