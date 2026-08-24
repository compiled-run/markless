import type { PropsOf, Seeded } from '@markless/core';

/**
 * A combobox is a text field with a list attached. It is NOT a select: DOM focus
 * never leaves the input, the highlighted option is family state rather than the
 * focused element, and printable keys belong to the field.
 *
 * The root holds the family's configuration and renders `role="group"`, exactly
 * as Qwik UI's `HComboboxRootImpl` does.
 */
export type ComboboxRootProps = Omit<PropsOf<'div'>, 'onChange' | 'onInput'> & {
	/**
	 * The chosen option's value. A plain string in the ordinary case; with
	 * `multiple` it is the list of chosen values. Omit it and nothing is chosen.
	 */
	readonly value?: string | readonly string[];
	/** The list is showing. Omit it and it starts closed. */
	readonly open?: boolean;
	/** Nobody can change the choice or type in the field. */
	readonly disabled?: boolean;
	/** A choice is needed before the form submits. */
	readonly required?: boolean;
	/** The control is in an invalid state, reported as `aria-invalid` on the input. */
	readonly invalid?: boolean;
	/** More than one option can be chosen at a time, and `value` becomes a list. */
	readonly multiple?: boolean;
	/** Backspace in an empty field removes the last chosen value. `multiple` only. */
	readonly removeOnBackspace?: boolean;
	/** The arrow walk wraps around the ends instead of stopping at them. */
	readonly loop?: boolean;
	/**
	 * The list is part of the page rather than a popup: it is always showing, and
	 * nothing dismisses it. Spelled as a native-style boolean attribute,
	 * never as a mode enum.
	 */
	readonly inline?: boolean;
	/** Submitted under this name by `combobox.field`. */
	readonly name?: string;
	/** The field's placeholder. The root's value wins over the input's own. */
	readonly placeholder?: string;
	/**
	 * Called with the new selection when a person chooses or unchooses an option:
	 * a string ordinarily, the whole list with `multiple`.
	 */
	readonly onChange?: (value: string | readonly string[]) => void;
	/** Called with the field's new text every time a person types in it. */
	readonly onInput?: (value: string) => void;
	/** Called when the list opens or closes. */
	readonly onOpenChange?: (open: boolean) => void;
};

/**
 * The graph cells every combobox part reads and writes: the root's seeded
 * fields, plus the five this family needs that no prop names. The `element()`
 * handles, the consumer's callbacks and the shared methods are not cells and are
 * not listed here; they are added to the instance the factory returns.
 *
 * `isPointerInContent` and `isKeyboardMove` are the two guards Qwik UI carries
 * as `isMouseOverPopupSig` and `isKeyboardFocusSig`: a list that opens under a
 * resting mouse must not have its keyboard highlight stolen by a pointer that
 * never moved. `wasFieldEmpty` and `wasFieldReset` are the two-flag dance
 * `removeOnBackspace` needs, so the first backspace deletes text and only the
 * second removes a chosen value.
 *
 * `pressGraceUntil` is the trigger-collision guard: a press that dismissed the
 * list is the same press whose click the trigger is about to see.
 */
export type ComboboxInstanceState = Seeded<
	ComboboxRootProps,
	| 'value'
	| 'open'
	| 'disabled'
	| 'required'
	| 'invalid'
	| 'multiple'
	| 'removeOnBackspace'
	| 'loop'
	| 'inline'
	| 'name'
	| 'placeholder'
> & {
	/** The text in the field. A consumer filters their own list from this. */
	input: string;
	/** The value of the highlighted option, or '' when nothing is highlighted. */
	highlighted: string;
	isPointerInContent: boolean;
	isKeyboardMove: boolean;
	wasFieldEmpty: boolean;
	wasFieldReset: boolean;
	pressGraceUntil: number;
	onChange?: ComboboxRootProps['onChange'];
	onInput?: ComboboxRootProps['onInput'];
	onOpenChange?: ComboboxRootProps['onOpenChange'];
};

export type ComboboxItemProps = PropsOf<'div'> & {
	/** This option's value. Required: no index stands in for it. */
	readonly value: string;
	/**
	 * The words the field shows once this option is chosen. Omit it and the value
	 * is used. Qwik UI harvests this from `ItemLabel`'s children at pre-render;
	 * markless has no build-time child scan, so the text arrives as data.
	 */
	readonly label?: string;
	/** Nobody can choose this option, and the arrow walk steps past it. */
	readonly disabled?: boolean;
};

/**
 * One instance per rendered `combobox.item`. The parts inside an option read
 * this rather than the combobox, which is how an item indicator knows whether
 * the option it sits in is a chosen one.
 */
export type ComboboxItemInstanceState = Seeded<ComboboxItemProps, 'value' | 'label' | 'disabled'>;

/** The combobox's name. Named by `aria-labelledby` from the input and the list. */
export type ComboboxLabelProps = PropsOf<'label'>;

export type ComboboxInputProps = PropsOf<'input'>;

/** Deliberately not a tab stop: only the input is. */
export type ComboboxTriggerProps = PropsOf<'button'>;

export type ComboboxContentProps = PropsOf<'div'>;

export type ComboboxItemLabelProps = PropsOf<'span'>;

export type ComboboxItemIndicatorProps = PropsOf<'span'>;

export type ComboboxDescriptionProps = PropsOf<'div'>;

/** Its presence is what a reader is told about first. */
export type ComboboxErrorProps = PropsOf<'div'>;

/**
 * The visually hidden native `<select>` that carries the choice into a form. It
 * takes no configuration of its own: `name`, `required` and `disabled` come from
 * `combobox.root`, so one place decides what a form receives.
 */
export type ComboboxFieldProps = PropsOf<'select'>;
