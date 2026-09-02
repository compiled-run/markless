// Both controls name the error handle before the description handle: what is
// wrong is conveyed before the hint, wherever the two parts sit in the page.

import { element, shared, state } from '@markless/core';
import type {
	TextboxDescriptionProps,
	TextboxErrorProps,
	TextboxInstanceState,
	TextboxLabelProps,
	TextboxTextareaProps,
	TextboxRootProps,
	TextboxInputProps,
} from './textbox-types.ts';

export const textboxState = shared(
	() => {
		const textbox: TextboxInstanceState = state({
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
		const descriptionEl = element<HTMLDivElement>();
		const errorEl = element<HTMLDivElement>();

		return {
			...textbox,
			inputEl,
			textareaEl,
			labelEl,
			descriptionEl,
			errorEl,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((value: string) => void) | undefined,

			// `event.target`, never `currentTarget`: a dispatch runs after the browser
			// has finished with the event, and `currentTarget` is null by then.
			type(from: EventTarget | null) {
				const control = from as HTMLInputElement | HTMLTextAreaElement | null;
				if (!control) return;

				const next = control.value;
				if (next === textbox.value) return;
				textbox.value = next;
				textbox.onChange?.(next);
			},
		};
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
	textbox.onChange = onChange;
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
		ui-invalid={textbox.invalid}
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
		aria-describedby={[textbox.errorEl, textbox.descriptionEl]}
		name={textbox.name}
		value={textbox.value}
		aria-invalid={textbox.invalid ? 'true' : undefined}
		disabled={textbox.disabled || disabled === true}
		required={textbox.required || required === true}
		readonly={textbox.readonly || readonly === true}
		onInput={(event) => {
			textbox.type(event.target);
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
		aria-describedby={[textbox.errorEl, textbox.descriptionEl]}
		name={textbox.name}
		value={textbox.value}
		aria-invalid={textbox.invalid ? 'true' : undefined}
		disabled={textbox.disabled || disabled === true}
		required={textbox.required || required === true}
		readonly={textbox.readonly || readonly === true}
		onInput={(event) => {
			textbox.type(event.target);
			onInput?.(event);
		}}
	/>
}

export function TextboxLabel({ children, ...rest }: TextboxLabelProps) @{
	const textbox = textboxState();

	<label {...rest} el={textbox.labelEl} for={textbox.inputEl}>{children}</label>
}

export function TextboxDescription({ children, ...rest }: TextboxDescriptionProps) @{
	const textbox = textboxState();

	<div {...rest} el={textbox.descriptionEl}>{children}</div>
}

export function TextboxError({ children, ...rest }: TextboxErrorProps) @{
	const textbox = textboxState();
	// Mounting the error part is what marks the control invalid.
	textbox.invalid = true;

	<div {...rest} el={textbox.errorEl}>{children}</div>
}
