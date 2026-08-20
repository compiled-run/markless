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
		const c = state({
			checked: false,
			disabled: false,
			required: false,
			name: '',
			value: '',
			// A minted id would need a call in the factory initializer; see notes/parity-table.md B1.
			instanceId: 'chk',
		});

		const isChecked = computed(() => c.checked === true);

		return {
			...c,
			isChecked,
			ariaChecked: computed(() => (c.checked === true ? 'true' : 'false')),
			// One statement only: a local const here breaks the emitted reader (B2).
			toggle() {
				c.checked = c.checked !== true;
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
}: CheckboxRootProps) @{
	const c = checkboxState();
	c.checked = checked ?? false;
	c.disabled = disabled ?? false;
	c.required = required ?? false;
	c.name = name ?? '';
	c.value = value ?? '';

	<div
		ui-checked={c.isChecked}
		ui-disabled={c.disabled}
	>{children}</div>
}

export function CheckboxTrigger({ disabled, children }: CheckboxTriggerProps) @{
	const c = checkboxState();

	<button
		type="button"
		role="checkbox"
		id={c.instanceId}
		aria-checked={c.ariaChecked}
		disabled={c.disabled}
		onClick={() => c.toggle()}
		onKeyDown={(event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
			}
		}}
	>{children}</button>
}

export function CheckboxIndicator({ children }: CheckboxIndicatorProps) @{
	<span aria-hidden="true">{children}</span>
}

export function CheckboxLabel({ children }: CheckboxLabelProps) @{
	<label>{children}</label>
}

export function CheckboxDescription({ children }: CheckboxDescriptionProps) @{
	<div>{children}</div>
}

export function CheckboxError({ children }: CheckboxErrorProps) @{
	<div>{children}</div>
}

export function CheckboxField({ name, value, required }: CheckboxFieldProps) @{
	<input type="checkbox" name={name} value={value} required={required} />
}
