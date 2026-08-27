import type { PropsOf, Seeded } from '@markless/core';

/** Which axis the arrow keys walk, and the axis `aria-orientation` reports. */
export type RadioGroupOrientation = 'horizontal' | 'vertical';

/**
 * The group: a `role="radiogroup"` element named by `radiogroup.label` through
 * `aria-labelledby`.
 */
export type RadioGroupRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** The value of the chosen option. Omit it and nothing is chosen. */
	readonly value?: string;
	/** Which axis the arrow keys walk. Omit it and the options stack top to bottom. */
	readonly orientation?: RadioGroupOrientation;
	/** Arrow past the last option and land on the first. Omit it and the ends still wrap. */
	readonly loop?: boolean;
	/** Nobody can change any option. */
	readonly disabled?: boolean;
	/**
	 * The name every option in this group submits under, declared once here rather
	 * than repeated on every option. Omit it and the group submits nothing.
	 */
	readonly name?: string;
	/** A choice is needed before the form submits. */
	readonly required?: boolean;
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
	'value' | 'orientation' | 'loop' | 'disabled' | 'name' | 'required'
> & {
	invalid: boolean;
	tabbable: string;
	onChange?: RadioGroupRootProps['onChange'];
};

/**
 * One option: its trigger, indicator, label and hidden radio go inside. It
 * carries the option's `value` and reports `ui-selected` and `ui-disabled`, but
 * holds no radio semantics itself - those live on the native input inside it.
 */
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

/** What `radiogroup.root` hands the group element it renders: everything it was given. */
export type RadioGroupBoxProps = PropsOf<'div'>;

/** The group's name: the element `role="radiogroup"` points its `aria-labelledby` at. */
export type RadioGroupLabelProps = PropsOf<'label'>;

/** Supporting text for the group. It renders its children and changes nothing else. */
export type RadioGroupDescriptionProps = PropsOf<'div'>;

/**
 * The group's validation message. Mounting it is what marks the group invalid
 * for as long as it is in the page, so render it only when there is an error to
 * show.
 */
export type RadioGroupErrorProps = PropsOf<'div'>;

/** A consumer's `onClick` runs after the option has been chosen. */
export type RadioGroupItemTriggerProps = PropsOf<'div'>;

/**
 * One option's chosen mark. Its children render only while that option is the
 * chosen one, and the element is `aria-hidden`, so the state it draws is never
 * announced twice.
 */
export type RadioGroupItemIndicatorProps = PropsOf<'span'>;

/**
 * One option's label. Its `for` points at that option's hidden radio, so
 * clicking the text chooses the option and focus lands where the arrow keys
 * expect it.
 */
export type RadioGroupItemLabelProps = PropsOf<'label'>;

/**
 * The visually hidden native radio that carries the option into a form and is
 * the element a person actually focuses. It takes no configuration of its own:
 * `name` and `required` come from `radiogroup.root` and `value` from
 * `radiogroup.item`, so one place decides what a form receives.
 */
export type RadioGroupItemFieldProps = PropsOf<'input'>;
