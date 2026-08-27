import { computed, element, shared, state } from '@markless/core';
import VisuallyHidden from '../base/visually-hidden.tsrx';
import { toolbarState } from '../toolbar/toolbar.tsrx';
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
		const descriptionEl = element<HTMLDivElement>();
		const errorEl = element<HTMLDivElement>();
		const labelEl = element<HTMLLabelElement>();

		return {
			...toggle,
			triggerEl,
			descriptionEl,
			errorEl,
			labelEl,
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

// The switch mixes into a toolbar here rather than at the root, because a
// toolbar's roster holds focusable elements and `toggle.root` renders a div: the
// trigger is the switch's focusable element. Outside every toolbar the read
// resolves to no bar instance, so `mounted` is the seed and nothing changes.
export function ToggleTrigger({ children, onClick, ...rest }: ToggleTriggerProps) @{
	const toggle = toggleState();
	const toolbar = toolbarState();
	// Read once, off a cell no bar writes twice: in a toolbar the bar owns the
	// roving stop and writes it from its own handlers.
	const stop = computed(() => (toolbar.mounted === true ? -1 : undefined));

	<button
		{...rest}
		el={[toggle.triggerEl, toolbar.itemEls]}
		tabindex={stop}
		type="button"
		role="switch"
		aria-labelledby={toggle.labelEl}
		// Error before description: what is wrong is conveyed before the hint,
		// wherever the two parts sit in the page.
		aria-describedby={[toggle.errorEl, toggle.descriptionEl]}
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

	<label {...rest} el={toggle.labelEl} for={toggle.triggerEl}>{children}</label>
}

export function ToggleDescription({ children, ...rest }: ToggleDescriptionProps) @{
	const toggle = toggleState();

	<div {...rest} el={toggle.descriptionEl}>{children}</div>
}

export function ToggleError({ children, ...rest }: ToggleErrorProps) @{
	const toggle = toggleState();
	// Mounting the error part is what marks the switch invalid.
	toggle.invalid = true;

	<div {...rest} el={toggle.errorEl}>{children}</div>
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
