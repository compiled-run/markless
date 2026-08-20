import { computed, shared, state } from '@markless/core';
import type {
	CheckboxDescriptionProps,
	CheckboxErrorProps,
	CheckboxFieldProps,
	CheckboxIndicatorProps,
	CheckboxLabelProps,
	CheckboxRootProps,
	CheckboxTriggerProps,
} from './checkbox-types.ts';

// One instance per `<checkbox.root>`: every part reads and writes this object, so
// parts are placeable anywhere inside the root. Handlers change it through the
// method below, because a direct assignment from a handler is not a graph write.
export const checkboxState = shared(
	() => {
		const checkbox = state({
			checked: false,
			disabled: false,
			required: false,
			name: '',
			value: '',
					});

		const isChecked = computed(() => checkbox.checked === true);

		return {
			...checkbox,
			isChecked,
			ariaChecked: computed(() => (checkbox.checked === true ? 'true' : 'false')),
			// One statement only: a local const here breaks the emitted reader (B2).
			toggle() {
				checkbox.checked = checkbox.checked !== true;
			},
		};
	},
	{ scope: 'widget' },
);

export function CheckboxRoot({
	checked,
	disabled,
	required,
	name,
	value,
	children,
	...rest
}: CheckboxRootProps) @{
	const checkbox = checkboxState();
	checkbox.checked = checked ?? false;
	checkbox.disabled = disabled ?? false;
	checkbox.required = required ?? false;
	checkbox.name = name ?? '';
	checkbox.value = value ?? '';

	<div
		{...rest}
		ui-checked={checkbox.isChecked}
		ui-disabled={checkbox.disabled}
	>{children}</div>
}

export function CheckboxTrigger({ children, ...rest }: CheckboxTriggerProps) @{
	const checkbox = checkboxState();

	<button
		{...rest}
		type="button"
		role="checkbox"
		aria-checked={checkbox.ariaChecked}
		disabled={checkbox.disabled}
		onClick={() => checkbox.toggle()}
		onKeyDown={(event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
			}
		}}
	>{children}</button>
}

export function CheckboxIndicator({ children, ...rest }: CheckboxIndicatorProps) @{
	<span {...rest} aria-hidden="true">{children}</span>
}

export function CheckboxLabel({ children, ...rest }: CheckboxLabelProps) @{
	<label {...rest}>{children}</label>
}

export function CheckboxDescription({ children, ...rest }: CheckboxDescriptionProps) @{
	<div {...rest}>{children}</div>
}

export function CheckboxError({ children, ...rest }: CheckboxErrorProps) @{
	<div {...rest}>{children}</div>
}

export function CheckboxField({ name, value, required, ...rest }: CheckboxFieldProps) @{
	<input {...rest} type="checkbox" name={name} value={value} required={required} />
}
