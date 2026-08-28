import type { PropsOf, Seeded } from '@markless/core';

/**
 * The switch itself; the trigger, thumb, label, messages and field go inside it.
 * It holds whether the switch is on and the form details `toggle.field`
 * submits, so one place decides what a form receives.
 */
export type ToggleRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** Whether the switch reads as on. Omit it and the switch starts off. */
	readonly checked?: boolean;
	/** Nobody can flip the switch, and `toggle.trigger` is disabled outright. */
	readonly disabled?: boolean;
	/** Marks the hidden `toggle.field` input required, so a form refuses to submit with the switch off. */
	readonly required?: boolean;
	/** Submitted under this name by `toggle.field`. */
	readonly name?: string;
	/** Submitted instead of the browser default `"on"`. */
	readonly value?: string;
	/**
	 * Called with the new value when a person flips the switch. Omit it and the
	 * switch still works; the call site simply does nothing.
	 */
	readonly onChange?: (checked: boolean) => void;
};

/**
 * The shared instance every toggle part reads and writes: the root's seeded
 * fields, plus what no prop carries - `invalid`, set by a mounted error part,
 * and the consumer's `onChange`, stored by the root for `flip()` to call.
 */
export type ToggleInstanceState = Seeded<
	ToggleRootProps,
	'checked' | 'disabled' | 'required' | 'name' | 'value'
> & {
	invalid: boolean;
	onChange?: ToggleRootProps['onChange'];
};

/** A consumer's `onClick` runs after the switch has flipped. */
export type ToggleTriggerProps = PropsOf<'button'>;

/** The moving piece inside the trigger. It renders an element and nothing else. */
export type ToggleThumbProps = PropsOf<'span'>;

/** The switch's label. Its `for` points at `toggle.trigger`, so clicking the text flips it. */
export type ToggleLabelProps = PropsOf<'label'>;

/**
 * Supporting text for the switch, named by the trigger's `aria-describedby`.
 * Mount it alongside `toggle.error` and the trigger names both, the error first.
 */
export type ToggleDescriptionProps = PropsOf<'div'>;

/**
 * The validation message, named by the trigger's `aria-describedby` ahead of
 * `toggle.description`. Mounting it is what marks the switch invalid - the
 * trigger reports `aria-invalid` for as long as this part is in the page - so
 * render it only when there is an error to show.
 */
export type ToggleErrorProps = PropsOf<'div'>;

/**
 * The visually hidden native input that carries the switch into a form. It takes
 * no configuration of its own: `name`, `value` and `required` come from
 * `toggle.root`, so one place decides what a form receives.
 */
export type ToggleFieldProps = PropsOf<'input'>;
