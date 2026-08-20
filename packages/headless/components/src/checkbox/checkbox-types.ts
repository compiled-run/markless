import type { Children, PropsOf } from '@markless/core';

/** A checkbox is on, off, or mixed — the third value is what `indeterminate` means to a form. */
export type CheckboxChecked = boolean | 'mixed';

export type CheckboxRootProps = PropsOf<'div'> & {
	/** The value the checkbox shows. Omit it and the checkbox starts off. */
	readonly checked?: CheckboxChecked;
	readonly disabled?: boolean;
	readonly required?: boolean;
	/** Submitted under this name by `checkbox.field`. */
	readonly name?: string;
	/** Submitted instead of the browser default `"on"`. */
	readonly value?: string;
	/**
	 * Intended to be called with the new value when a person toggles the checkbox.
	 * Inert today: a consumer callback cannot be reached from the shared instance
	 * yet (U-B in the goal's parity table), so it is accepted and never invoked.
	 */
	readonly onChange?: (checked: CheckboxChecked) => void;
	readonly children?: Children;
};

export type CheckboxTriggerProps = PropsOf<'button'> & {
	readonly children?: Children;
};

export type CheckboxIndicatorProps = PropsOf<'span'> & {
	readonly children?: Children;
};

export type CheckboxLabelProps = PropsOf<'label'> & {
	readonly children?: Children;
};

export type CheckboxDescriptionProps = PropsOf<'div'> & {
	readonly children?: Children;
};

export type CheckboxErrorProps = PropsOf<'div'> & {
	readonly children?: Children;
};

/**
 * The visually hidden native input that carries the checkbox into a form. It
 * takes no configuration of its own: `name`, `value` and `required` come from
 * `checkbox.root`, so one place decides what a form receives.
 */
export type CheckboxFieldProps = PropsOf<'input'>;
