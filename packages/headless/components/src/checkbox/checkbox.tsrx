import { element, shared, state } from '@markless/core';
import VisuallyHidden from '../base/visually-hidden.tsrx';
import type {
	CheckboxDescriptionProps,
	CheckboxErrorProps,
	CheckboxFieldProps,
	CheckboxIndicatorProps,
	CheckboxInstanceState,
	CheckboxLabelProps,
	CheckboxRootProps,
	CheckboxTriggerProps,
} from './checkbox-types.ts';

// One instance per rendered `<checkbox.root>`: every part reads and writes this
// object, so a part is placeable anywhere inside the root. The values below are
// placeholders, not defaults: `<checkbox.root>` seeds every one of them on every
// render, and what an omitted prop means is stated once, as a destructuring
// default on the root's signature.
export const checkboxState = shared(
	() => {
		// Annotated, not cast: the compiler reads member accesses on this binding, and an
		// `as` expression at a use site hides them from its capture analysis.
		const checkbox: CheckboxInstanceState = state({
			checked: false as boolean | 'mixed',
			disabled: false,
			required: false,
			invalid: false,
			name: '',
			value: '',
		});
		// The relationship, not a string: the compiler mints this widget's id and
		// writes it on the trigger and on every position that names the handle.
		const triggerEl = element<HTMLButtonElement>();

		return {
			...checkbox,
			triggerEl,
			// The slot `<checkbox.root>` fills with its own onChange prop; a part
			// invoking it dispatches straight to the consumer's handler. It stays off
			// state() on purpose - the slot must not become a graph node.
			onChange: undefined as ((checked: boolean | 'mixed') => void) | undefined,
			toggle() {
				// Mixed resolves to checked, the way a native indeterminate box does.
				const next = checkbox.checked === true ? false : true;
				checkbox.checked = next;
				checkbox.onChange?.(next);
			},
		};
	},
	{ scope: 'widget' },
);

export function CheckboxRoot({
	checked = false,
	disabled = false,
	required = false,
	name = '',
	// What a browser submits for a checkbox with no value of its own.
	value = 'on',
	onChange,
	children,
	...rest
}: CheckboxRootProps) @{
	const checkbox = checkboxState();
	checkbox.onChange = onChange;
	checkbox.checked = checked;
	checkbox.disabled = disabled;
	checkbox.required = required;
	checkbox.name = name;
	checkbox.value = value;

	<div
		{...rest}
		ui-checked={checkbox.checked === true}
		ui-mixed={checkbox.checked === 'mixed'}
		ui-disabled={checkbox.disabled}
	>{children}</div>
}

export function CheckboxTrigger({ children, onClick, onKeydown, ...rest }: CheckboxTriggerProps) @{
	const checkbox = checkboxState();

	<button
		{...rest}
		el={checkbox.triggerEl}
		type="button"
		role="checkbox"
		aria-checked={
			checkbox.checked === 'mixed' ? 'mixed' : checkbox.checked === true ? 'true' : 'false'
		}
		aria-invalid={checkbox.invalid ? 'true' : 'false'}
		ui-checked={checkbox.checked === true}
		ui-mixed={checkbox.checked === 'mixed'}
		ui-disabled={checkbox.disabled}
		disabled={checkbox.disabled}
		onClick={(event) => {
			checkbox.toggle();
			onClick?.(event);
		}}
		onKeydown={(event) => {
			// A native button activates on Enter; a checkbox must not. The request
			// lands after dispatch returns, so today it only sometimes wins (U-M).
			if (event.key === 'Enter') {
				event.preventDefault();
			}
			onKeydown?.(event);
		}}
	>{children}</button>
}

export function CheckboxIndicator({ children, ...rest }: CheckboxIndicatorProps) @{
	const checkbox = checkboxState();

	<span {...rest} aria-hidden="true">
		@if (checkbox.checked) { <>{children}</> }
	</span>
}

export function CheckboxLabel({ children, ...rest }: CheckboxLabelProps) @{
	const checkbox = checkboxState();

	<label {...rest} for={checkbox.triggerEl}>{children}</label>
}

export function CheckboxDescription({ children, ...rest }: CheckboxDescriptionProps) @{
	<div {...rest}>{children}</div>
}

export function CheckboxError({ children, ...rest }: CheckboxErrorProps) @{
	const checkbox = checkboxState();
	// Mounting the error part is what marks the trigger invalid.
	checkbox.invalid = true;

	<div {...rest}>{children}</div>
}

// No change handler of its own: the input is clipped, aria-hidden and out of the
// tab order, so nothing but the family ever changes it.
export function CheckboxField({ ...rest }: CheckboxFieldProps) @{
	const checkbox = checkboxState();

	<VisuallyHidden>
		<input
			{...rest}
			type="checkbox"
			tabindex={-1}
			aria-hidden="true"
			name={checkbox.name}
			value={checkbox.value}
			required={checkbox.required}
			checked={checkbox.checked === true}
			indeterminate={checkbox.checked === 'mixed'}
		/>
	</VisuallyHidden>
}
