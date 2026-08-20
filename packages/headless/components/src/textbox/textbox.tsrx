import { element, shared, state } from '@markless/core';
import type {
	TextboxDescriptionProps,
	TextboxErrorProps,
	TextboxLabelProps,
	TextboxMultilineTriggerProps,
	TextboxRootProps,
	TextboxTriggerProps,
} from './textbox-types.ts';

// One instance per rendered `<textbox.root>`: every part reads and writes this
// object, so a part is placeable anywhere inside the root. The values below are
// placeholders, not defaults: `<textbox.root>` seeds every one of them on every
// render, and what an omitted prop means is stated once, as a destructuring
// default on the root's signature.
export const textboxState = shared(
	() => {
		const textbox = state({
			value: '',
			disabled: false,
			required: false,
			readonly: false,
			invalid: false,
			name: '',
		});
		// The relationships, not strings: the compiler mints this widget's ids and
		// writes them on the parts that name each other. A handle binds one live
		// element, so the two controls carry one each and the label names the
		// single-line one; both controls point back at the label for their name.
		const triggerEl = element<HTMLInputElement>();
		const multilineTriggerEl = element<HTMLTextAreaElement>();
		const labelEl = element<HTMLLabelElement>();

		return { ...textbox, triggerEl, multilineTriggerEl, labelEl };
	},
	{ scope: 'widget' },
);

export function TextboxRoot({
	value = '',
	disabled = false,
	required = false,
	readonly = false,
	name = '',
	onChange,
	children,
	...rest
}: TextboxRootProps) @{
	const textbox = textboxState();
	// Destructured so it never lands on the div below; the shared instance carries it.
	textbox.value = value;
	textbox.disabled = disabled;
	textbox.required = required;
	textbox.readonly = readonly;
	textbox.name = name;

	<div
		{...rest}
		ui-disabled={textbox.disabled}
		ui-required={textbox.required}
		ui-readonly={textbox.readonly}
		ui-empty={textbox.value === ''}
	>{children}</div>
}

// A restriction set on this part is added to whatever the root set: `||`, never a
// replacement, so a part can make the control stricter and never looser.
export function TextboxTrigger({
	disabled,
	required,
	readonly,
	onInput,
	...rest
}: TextboxTriggerProps) @{
	const textbox = textboxState();

	<input
		{...rest}
		el={textbox.triggerEl}
		aria-labelledby={textbox.labelEl}
		name={textbox.name}
		value={textbox.value}
		aria-invalid={textbox.invalid ? 'true' : 'false'}
		disabled={textbox.disabled || disabled === true}
		required={textbox.required || required === true}
		readonly={textbox.readonly || readonly === true}
		onInput={(event) => {
			textbox.value = event.target.value;
			onInput?.(event);
		}}
	/>
}

export function TextboxMultilineTrigger({
	disabled,
	required,
	readonly,
	onInput,
	...rest
}: TextboxMultilineTriggerProps) @{
	const textbox = textboxState();

	<textarea
		{...rest}
		el={textbox.multilineTriggerEl}
		aria-labelledby={textbox.labelEl}
		name={textbox.name}
		value={textbox.value}
		aria-invalid={textbox.invalid ? 'true' : 'false'}
		disabled={textbox.disabled || disabled === true}
		required={textbox.required || required === true}
		readonly={textbox.readonly || readonly === true}
		onInput={(event) => {
			textbox.value = event.target.value;
			onInput?.(event);
		}}
	/>
}

export function TextboxLabel({ children, ...rest }: TextboxLabelProps) @{
	const textbox = textboxState();

	<label {...rest} el={textbox.labelEl} for={textbox.triggerEl}>{children}</label>
}

export function TextboxDescription({ children, ...rest }: TextboxDescriptionProps) @{
	<div {...rest}>{children}</div>
}

export function TextboxError({ children, ...rest }: TextboxErrorProps) @{
	const textbox = textboxState();
	// Intent: mounting the error part marks the control invalid. A seed a part
	// writes does not reach its siblings yet (U-H), so the control still reads valid.
	textbox.invalid = true;

	<div {...rest}>{children}</div>
}
