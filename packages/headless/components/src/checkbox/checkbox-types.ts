import type { Children, PropsOf } from '@markless/core';
import type { SingleHandler } from '../handler-props.ts';

type TriggerProps = PropsOf<'button'>;

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
	 * Omit it and the toggle still works; the call site simply does nothing.
	 */
	readonly onChange?: (checked: CheckboxChecked) => void;
	readonly children?: Children;
};

export type CheckboxTriggerProps = Omit<TriggerProps, 'onClick' | 'onKeydown'> & {
	/** Called after the checkbox has toggled. */
	readonly onClick?: SingleHandler<TriggerProps['onClick']>;
	readonly onKeydown?: SingleHandler<TriggerProps['onKeydown']>;
	readonly children?: Children;
};

/**
 * The shared instance every checkbox part reads and writes, named here because the parts
 * and `checkboxState()` itself both need it: `toggle()` reaches the consumer slot the root
 * filled, which the state object's own inferred type does not carry.
 */
export type CheckboxInstanceState = {
	-readonly [Field in keyof Pick<
		CheckboxRootProps,
		'checked' | 'disabled' | 'required' | 'name' | 'value'
	>]-?: CheckboxRootProps[Field];
} & {
	/** Set by `checkbox.error` when it mounts. */
	invalid: boolean;
	/** Filled by `checkbox.root` with the consumer's own onChange prop. */
	onChange?: CheckboxRootProps['onChange'];
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
