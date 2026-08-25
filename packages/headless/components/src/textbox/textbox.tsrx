import { element, shared, state } from '@markless/core';
import type {
	TextboxDescriptionProps,
	TextboxErrorProps,
	TextboxLabelProps,
	TextboxTextareaProps,
	TextboxRootProps,
	TextboxInputProps,
} from './textbox-types.ts';

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
		const inputEl = element<HTMLInputElement>();
		const textareaEl = element<HTMLTextAreaElement>();
		const labelEl = element<HTMLLabelElement>();
		const describedEl = element<HTMLDivElement>();

		return { ...textbox, inputEl, textareaEl, labelEl, describedEl };
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
export function TextboxInput({
	disabled,
	required,
	readonly,
	onInput,
	...rest
}: TextboxInputProps) @{
	const textbox = textboxState();

	<input
		{...rest}
		el={textbox.inputEl}
		aria-describedby={textbox.describedEl}
		name={textbox.name}
		value={textbox.value}
		aria-invalid={textbox.invalid ? 'true' : undefined}
		disabled={textbox.disabled || disabled === true}
		required={textbox.required || required === true}
		readonly={textbox.readonly || readonly === true}
		onInput={(event) => {
			textbox.value = event.currentTarget.value;
			onInput?.(event);
		}}
	/>
}

export function TextboxTextarea({
	disabled,
	required,
	readonly,
	onInput,
	...rest
}: TextboxTextareaProps) @{
	const textbox = textboxState();

	<textarea
		{...rest}
		el={textbox.textareaEl}
		// The label's for names the input only: one handle cannot bind to both controls.
		aria-labelledby={textbox.labelEl}
		aria-describedby={textbox.describedEl}
		name={textbox.name}
		value={textbox.value}
		aria-invalid={textbox.invalid ? 'true' : undefined}
		disabled={textbox.disabled || disabled === true}
		required={textbox.required || required === true}
		readonly={textbox.readonly || readonly === true}
		onInput={(event) => {
			textbox.value = event.currentTarget.value;
			onInput?.(event);
		}}
	/>
}

export function TextboxLabel({ children, ...rest }: TextboxLabelProps) @{
	const textbox = textboxState();

	<label {...rest} el={textbox.labelEl} for={textbox.inputEl}>{children}</label>
}

// One part stands behind both `textbox.description` and `textbox.error`: an
// element() handle binds in exactly one place, and aria-describedby here names
// exactly one id. A field that mounts both messages is described by the first.
function TextboxMessage({ children, ...rest }: TextboxDescriptionProps) @{
	const textbox = textboxState();

	<div {...rest} el={textbox.describedEl}>{children}</div>
}

export function TextboxDescription({ children, ...rest }: TextboxDescriptionProps) @{
	<TextboxMessage {...rest}>{children}</TextboxMessage>
}

export function TextboxError({ children, ...rest }: TextboxErrorProps) @{
	const textbox = textboxState();
	// Mounting the error part is what marks the control invalid.
	textbox.invalid = true;

	<TextboxMessage {...rest}>{children}</TextboxMessage>
}
