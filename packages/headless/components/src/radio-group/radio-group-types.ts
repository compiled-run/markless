import type { PropsOf, Seeded } from '@markless/core';

/** Which axis the arrow keys walk, and the axis `aria-orientation` reports. */
export type RadioGroupOrientation = 'horizontal' | 'vertical';

/**
 * The group is a `<fieldset>` so its `<legend>` names it natively: no id, no
 * IDREF, and better support than `aria-labelledby` on a `role="radiogroup"` div.
 */
export type RadioGroupRootProps = Omit<PropsOf<'fieldset'>, 'onChange'> & {
	/** The value of the chosen option. Omit it and nothing is chosen. */
	readonly value?: string;
	/** Which axis the arrow keys walk. Omit it and the options stack top to bottom. */
	readonly orientation?: RadioGroupOrientation;
	/** Arrow past the last option and land on the first. Omit it and the ends still wrap. */
	readonly loop?: boolean;
	/** Nobody can change any option. */
	readonly disabled?: boolean;
	/** A choice is needed before the form submits. */
	readonly required?: boolean;
	/** Submitted under this name by `radiogroup.itemfield`. */
	readonly name?: string;
	/**
	 * Intended to be called with the new value when a person picks a different
	 * option. Omit it and picking still works; the call site simply does nothing.
	 */
	readonly onChange?: (value: string) => void;
};

/**
 * The shared instance every group part reads and writes: the root's seeded
 * fields, plus what no prop carries - `invalid`, set by a mounted error part;
 * `tabbable`, the option holding the group's single tab stop while nothing is
 * chosen; and the consumer's `onChange`, stored by the root for `choose()`.
 */
export type RadioGroupInstanceState = Seeded<
	RadioGroupRootProps,
	'value' | 'orientation' | 'loop' | 'disabled' | 'required' | 'name'
> & {
	invalid: boolean;
	tabbable: string;
	onChange?: RadioGroupRootProps['onChange'];
};

/**
 * What `radiogroupState()` hands back. Written out so the factory can declare
 * its return type, which contextually types `choose`'s parameter: a shared
 * method is inlined into every handler that calls it, and a handler's source
 * has to stay parseable as plain JavaScript.
 */
export type RadioGroupInstance = RadioGroupInstanceState & {
	choose(next: string): void;
};

export type RadioGroupItemProps = PropsOf<'div'> & {
	/** Submitted when this option is the chosen one. Required: no index stands in for it. */
	readonly value: string;
	/** Nobody can choose this option, and the arrow keys walk past it. */
	readonly disabled?: boolean;
};

/**
 * One instance per rendered `radiogroup.item`. The parts inside an item read
 * this rather than the group, which is how an item label names its own input
 * and an item indicator knows whether the option it sits in is the chosen one.
 */
export type RadioGroupItemInstanceState = Seeded<RadioGroupItemProps, 'value' | 'disabled'>;

/** The group's name, rendered as the `<legend>` a `<fieldset>` is named by. */
export type RadioGroupLabelProps = PropsOf<'legend'>;

export type RadioGroupDescriptionProps = PropsOf<'div'>;

export type RadioGroupErrorProps = PropsOf<'div'>;

/** A consumer's `onClick` runs after the option has been chosen. */
export type RadioGroupItemTriggerProps = PropsOf<'div'>;

export type RadioGroupItemIndicatorProps = PropsOf<'span'>;

export type RadioGroupItemLabelProps = PropsOf<'label'>;

/**
 * The visually hidden native radio that carries the option into a form and is
 * the element a person actually focuses. It takes no configuration of its own:
 * `name` and `required` come from `radiogroup.root` and `value` from
 * `radiogroup.item`, so one place decides what a form receives.
 */
export type RadioGroupItemFieldProps = PropsOf<'input'>;
