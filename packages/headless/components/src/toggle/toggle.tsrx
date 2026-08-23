import { element, shared, state } from '@markless/core';
import VisuallyHidden from '../base/visually-hidden.tsrx';
import type {
	ToggleDescriptionProps,
	ToggleErrorProps,
	ToggleFieldProps,
	ToggleInstanceState,
	ToggleLabelProps,
	ToggleRootProps,
	ToggleThumbProps,
	ToggleTriggerProps,
} from './toggle-types.ts';

export const toggleState = shared(
	() => {
		const toggle: ToggleInstanceState = state({
			checked: false,
			disabled: false,
			required: false,
			invalid: false,
			name: '',
			value: '',
		});
		const triggerEl = element<HTMLButtonElement>();
		const describedEl = element<HTMLDivElement>();

		return {
			...toggle,
			triggerEl,
			describedEl,
			onChange: undefined as ((checked: boolean) => void) | undefined,
			flip() {
				if (toggle.disabled) return;
				toggle.checked = toggle.checked !== true;
				toggle.onChange?.(toggle.checked);
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
	toggle.onChange = onChange;
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
		aria-describedby={toggle.describedEl}
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

// One part stands behind both `toggle.description` and `toggle.error`: an element()
// handle binds in exactly one place, and aria-describedby here names exactly one id.
// A switch that mounts both messages is therefore described by the first of them.
function ToggleMessage({ children, ...rest }: ToggleDescriptionProps) @{
	const toggle = toggleState();

	<div {...rest} el={toggle.describedEl}>{children}</div>
}

export function ToggleDescription({ children, ...rest }: ToggleDescriptionProps) @{
	<ToggleMessage {...rest}>{children}</ToggleMessage>
}

export function ToggleError({ children, ...rest }: ToggleErrorProps) @{
	const toggle = toggleState();
	toggle.invalid = true;

	<ToggleMessage {...rest}>{children}</ToggleMessage>
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
