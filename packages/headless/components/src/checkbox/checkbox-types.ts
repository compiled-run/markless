import type { PropsOf, Seeded } from '@markless/core';

/** A checkbox is on, off, or mixed — the third value is what `indeterminate` means to a form. */
export type CheckboxChecked = boolean | 'mixed';

/**
 * The checkbox itself; the trigger, label, description, error and field parts go
 * inside it. It holds the checked value and the form details that
 * `checkbox.field` submits, so one place decides what a form receives.
 */
export type CheckboxRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** The value the checkbox shows. Omit it and the checkbox starts off. */
	readonly checked?: CheckboxChecked;
	/** Nobody can toggle the checkbox, and `checkbox.trigger` is disabled outright. */
	readonly disabled?: boolean;
	/** Marks the hidden `checkbox.field` input required, so a form refuses to submit unchecked. */
	readonly required?: boolean;
	/** Submitted under this name by `checkbox.field`. */
	readonly name?: string;
	/** Submitted instead of the browser default `"on"`. */
	readonly value?: string;
	/**
	 * Intended to be called with the new value when a person toggles the checkbox.
	 * Omit it and the toggle still works; the call site simply does nothing.
	 */
	readonly onChange?: (checked: CheckboxChecked) => void;
};

/** A consumer's `onClick` and `onKeydown` run after the checkbox has toggled. */
export type CheckboxTriggerProps = PropsOf<'button'>;

/**
 * The shared instance every checkbox part reads and writes: the root's seeded
 * fields, plus what no prop carries - `invalid`, set by a mounted error part,
 * and the consumer's `onChange`, stored by the root for `toggle()` to call.
 */
export type CheckboxInstanceState = Seeded<
	CheckboxRootProps,
	'checked' | 'disabled' | 'required' | 'name' | 'value'
> & {
	invalid: boolean;
	onChange?: CheckboxRootProps['onChange'];
};

/**
 * The check mark. Its children render only while the checkbox is on or mixed,
 * and the element is `aria-hidden`, so the state it draws is never announced a
 * second time.
 */
export type CheckboxIndicatorProps = PropsOf<'span'>;

/** The checkbox's label. Its `for` points at `checkbox.trigger`, so clicking the text toggles. */
export type CheckboxLabelProps = PropsOf<'label'>;

/** Supporting text beside the checkbox. It renders its children and changes nothing else. */
export type CheckboxDescriptionProps = PropsOf<'div'>;

/**
 * The validation message. Mounting it is what marks the checkbox invalid -
 * `checkbox.trigger` reports `aria-invalid` for as long as this part is in the
 * page - so render it only when there is an error to show.
 */
export type CheckboxErrorProps = PropsOf<'div'>;

/**
 * The visually hidden native input that carries the checkbox into a form. It
 * takes no configuration of its own: `name`, `value` and `required` come from
 * `checkbox.root`, so one place decides what a form receives.
 */
export type CheckboxFieldProps = PropsOf<'input'>;
