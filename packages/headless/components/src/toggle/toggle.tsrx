import { element, shared, state } from '@markless/core';
import type {
	ToggleDescriptionProps,
	ToggleErrorProps,
	ToggleFieldProps,
	ToggleLabelProps,
	ToggleRootProps,
	ToggleThumbProps,
	ToggleTriggerProps,
} from './toggle-types.ts';

// One instance per rendered `<toggle.root>`: every part reads and writes this
// object, so a part is placeable anywhere inside the root. The values below are
// placeholders, not defaults: `<toggle.root>` seeds every one of them on every
// render, and what an omitted prop means is stated once, as a destructuring
// default on the root's signature.
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
		// The relationship, not a string: the compiler mints this widget's id and
		// writes it on the trigger and on every position that names the handle.
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
	// What a browser submits for a checkbox-shaped control with no value of its own.
	value = 'on',
	onChange,
	children,
	...rest
}: ToggleRootProps) @{
	const toggle = toggleState();
	// Destructured so it never lands on the div below; the shared instance carries it.
	toggle.checked = checked;
	toggle.disabled = disabled;
	toggle.required = required;
	toggle.name = name;
	toggle.value = value;

	<div {...rest} ui-checked={toggle.checked} ui-disabled={toggle.disabled}>{children}</div>
}

// role="switch" is a checkbox with two states and no mixed value, so the button
// needs no keyboard rule of its own: a native button activates on both Space and
// Enter, which is exactly what a switch must do.
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
	// Intent: mounting the error part marks the trigger invalid. A seed a part writes
	// does not reach its siblings yet (U-H), so the trigger still reads valid.
	toggle.invalid = true;

	<div {...rest}>{children}</div>
}

// No change handler of its own: the input is clipped, aria-hidden and out of the
// tab order, so nothing but the family ever changes it.
export function ToggleField({ ...rest }: ToggleFieldProps) @{
	const toggle = toggleState();

	<span
		style="clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px;"
	>
		<input
			{...rest}
			type="checkbox"
			tabindex="-1"
			aria-hidden="true"
			name={toggle.name}
			value={toggle.value}
			required={toggle.required}
			disabled={toggle.disabled}
			checked={toggle.checked}
		/>
	</span>
}
