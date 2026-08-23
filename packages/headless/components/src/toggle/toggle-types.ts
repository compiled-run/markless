import type { PropsOf, Seeded } from '@markless/core';

export type ToggleRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** Whether the switch reads as on. Omit it and the switch starts off. */
	readonly checked?: boolean;
	readonly disabled?: boolean;
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

export type ToggleLabelProps = PropsOf<'label'>;

export type ToggleDescriptionProps = PropsOf<'div'>;

export type ToggleErrorProps = PropsOf<'div'>;

/**
 * The visually hidden native input that carries the switch into a form. It takes
 * no configuration of its own: `name`, `value` and `required` come from
 * `toggle.root`, so one place decides what a form receives.
 */
export type ToggleFieldProps = PropsOf<'input'>;
