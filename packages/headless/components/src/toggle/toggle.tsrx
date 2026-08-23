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
		const describedEl = element<HTMLDivElement>();

		return {
			...toggle,
			triggerEl,
			describedEl,
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

// The message the switch names. One part stands behind both `toggle.description`
// and `toggle.error` because an element() handle may be bound in exactly one place
// (MARKLESS_ELEMENT_HANDLE_DUPLICATE) and a control may name exactly one id (a
// handle list in an IDREF position is MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE,
// recorded as U-C). A switch that mounts one message is described by it; a switch
// that mounts both is described by the first of them.
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
