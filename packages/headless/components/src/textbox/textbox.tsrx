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

		return { ...textbox, inputEl, textareaEl, labelEl };
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
		aria-labelledby={textbox.labelEl}
		name={textbox.name}
		value={textbox.value}
		aria-invalid={textbox.invalid ? 'true' : 'false'}
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
		aria-labelledby={textbox.labelEl}
		name={textbox.name}
		value={textbox.value}
		aria-invalid={textbox.invalid ? 'true' : 'false'}
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

export function TextboxDescription({ children, ...rest }: TextboxDescriptionProps) @{
	<div {...rest}>{children}</div>
}

export function TextboxError({ children, ...rest }: TextboxErrorProps) @{
	const textbox = textboxState();
	// Mounting the error part is what marks the control invalid.
	textbox.invalid = true;

	<div {...rest}>{children}</div>
}
