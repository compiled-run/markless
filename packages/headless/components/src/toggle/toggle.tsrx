import { element, shared, state } from '@markless/core';
import VisuallyHidden from '../base/visually-hidden.tsrx';
import type {
	ToggleDescriptionProps,
	ToggleErrorProps,
	ToggleFieldProps,
	ToggleLabelProps,
	ToggleRootProps,
	ToggleThumbProps,
	ToggleTriggerProps,
} from './toggle-types.ts';

export const toggleState = shared(
	() => {
		const toggle = state({
			checked: false,
			disabled: false,
			required: false,
			invalid: false,
			name: '',
			value: '',
		});
		const triggerEl = element<HTMLButtonElement>();

		return {
			...toggle,
			triggerEl,
			flip() {
				const next = toggle.checked === true ? false : true;
				toggle.checked = next;
			},
		};
	},
	{ scope: 'widget' },
);

export function ToggleRoot({
	checked = false,
	disabled = false,
	required = false,
	name = '',
	value = 'on',
	onChange,
	children,
	...rest
}: ToggleRootProps) @{
	const toggle = toggleState();
	toggle.checked = checked;
	toggle.disabled = disabled;
	toggle.required = required;
	toggle.name = name;
	toggle.value = value;

	<div {...rest} ui-checked={toggle.checked} ui-disabled={toggle.disabled}>{children}</div>
}

export function ToggleTrigger({ children, onClick, ...rest }: ToggleTriggerProps) @{
	const toggle = toggleState();

	<button
		{...rest}
		el={toggle.triggerEl}
		type="button"
		role="switch"
		aria-checked={toggle.checked ? 'true' : 'false'}
		aria-disabled={toggle.disabled ? 'true' : 'false'}
		aria-invalid={toggle.invalid ? 'true' : 'false'}
		ui-checked={toggle.checked}
		ui-disabled={toggle.disabled}
		disabled={toggle.disabled}
		onClick={(event) => {
			toggle.flip();
			onClick?.(event);
		}}
	>{children}</button>
}

export function ToggleThumb({ children, ...rest }: ToggleThumbProps) @{
	<span {...rest}>{children}</span>
}

export function ToggleLabel({ children, ...rest }: ToggleLabelProps) @{
	const toggle = toggleState();

	<label {...rest} for={toggle.triggerEl}>{children}</label>
}

export function ToggleDescription({ children, ...rest }: ToggleDescriptionProps) @{
	<div {...rest}>{children}</div>
}

export function ToggleError({ children, ...rest }: ToggleErrorProps) @{
	const toggle = toggleState();
	toggle.invalid = true;

	<div {...rest}>{children}</div>
}

// No change handler of its own: the input is clipped, aria-hidden and out of the
// tab order, so nothing but the family ever changes it.
export function ToggleField({ ...rest }: ToggleFieldProps) @{
	const toggle = toggleState();

	<VisuallyHidden>
		<input
			{...rest}
			type="checkbox"
			tabindex={-1}
			aria-hidden="true"
			name={toggle.name}
			value={toggle.value}
			required={toggle.required}
			disabled={toggle.disabled}
			checked={toggle.checked}
		/>
	</VisuallyHidden>
}
