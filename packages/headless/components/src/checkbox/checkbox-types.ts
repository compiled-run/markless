import type { Children, PropsOf } from '@markless/core';

/** A checkbox is on, off, or mixed — the third value is what `indeterminate` means to a form. */
export type CheckboxChecked = boolean | 'mixed';

export type CheckboxRootProps = PropsOf<'div'> & {
	/** The value the checkbox shows. Omit it and the family keeps the value itself. */
	readonly checked?: CheckboxChecked;
	readonly disabled?: boolean;
	readonly required?: boolean;
	/** Submitted under this name by `checkbox.field`. */
	readonly name?: string;
	/** Submitted instead of the browser default `"on"`. */
	readonly value?: string;
	/** Called with the new value when a person toggles the checkbox; never on mount. */
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

export type CheckboxFieldProps = PropsOf<'input'> & {
	readonly name?: string;
	readonly value?: string;
	readonly required?: boolean;
};
