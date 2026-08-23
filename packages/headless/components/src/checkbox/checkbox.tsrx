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

export const checkboxState = shared(
	() => {
		const checkbox: CheckboxInstanceState = state({
			checked: false as boolean | 'mixed',
			disabled: false,
			required: false,
			invalid: false,
			name: '',
			value: '',
		});
		const triggerEl = element<HTMLButtonElement>();

		return {
			...checkbox,
			triggerEl,
			onChange: undefined as ((checked: boolean | 'mixed') => void) | undefined,
			toggle() {
				// mixed resolves to checked, like a native indeterminate box.
				checkbox.checked = checkbox.checked !== true;
				checkbox.onChange?.(checkbox.checked);
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
			// A native button activates on Enter; a checkbox must not.
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
