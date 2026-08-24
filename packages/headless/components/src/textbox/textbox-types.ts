import type { PropsOf } from '@markless/core';

/**
 * The text box itself; the label, the control, and any description or error go
 * inside it. It holds the text and the restrictions, and reports `ui-disabled`,
 * `ui-required`, `ui-readonly` and `ui-empty` for styling. Put either a
 * `textbox.input` or a `textbox.textarea` inside - the root renders no control
 * of its own.
 */
export type TextboxRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** The text the box shows. Omit it and the box starts empty. */
	readonly value?: string;
	/** Nobody can type in the control, and it drops out of the tab order. */
	readonly disabled?: boolean;
	/** The control must hold text before a form submits. */
	readonly required?: boolean;
	/** The text can be read and selected but not changed. */
	readonly readonly?: boolean;
	/** Submitted under this name by whichever control the family renders. */
	readonly name?: string;
	/**
	 * Called with the new text as a person types. Omit it and the box still works;
	 * the call site simply does nothing.
	 */
	readonly onChange?: (value: string) => void;
};

/**
 * The control a person types into. `disabled`, `required` and `readonly` may be
 * set here as well as on the root, and a restriction set in either place stands:
 * a part can add a restriction, never remove one.
 */
export type TextboxInputProps = PropsOf<'input'>;

/** The same control over more than one line. */
export type TextboxTextareaProps = PropsOf<'textarea'>;

/** The box's name. Its `for` points at the control, so clicking the text focuses it. */
export type TextboxLabelProps = PropsOf<'label'>;

/**
 * Supporting text for the box, named by the control's `aria-describedby`. One
 * element can be named that way, so mounting this alongside `textbox.error`
 * describes by whichever renders first.
 */
export type TextboxDescriptionProps = PropsOf<'div'>;

/**
 * The validation message. Mounting it is what marks the control invalid - it
 * reports `aria-invalid` for as long as this part is in the page - so render it
 * only when there is an error to show.
 */
export type TextboxErrorProps = PropsOf<'div'>;
