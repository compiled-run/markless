import type { PropsOf } from '@markless/core';

/**
 * One number in one field: a real text input a person types into, two step
 * buttons, and a canonical number on the wire. Put a `numberbox.label`, a
 * `numberbox.input` and whichever of `numberbox.backtrigger`,
 * `numberbox.forwardtrigger`, `numberbox.valuelabel`, `numberbox.description`,
 * `numberbox.error` and `numberbox.field` the page needs inside it.
 *
 * It reports `ui-disabled`, `ui-readonly`, `ui-required`, `ui-invalid` and
 * `ui-empty` for styling.
 */
export type NumberboxRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** The number the field shows. `null`, or omitted, and it starts empty. */
	readonly value?: number | null;
	/** The lowest number the field settles on. Omit it and the field is unbounded below. */
	readonly min?: number;
	/** The highest number the field settles on. Omit it and the field is unbounded above. */
	readonly max?: number;
	/** How far one arrow press moves. `Shift` and the page keys move ten of these. */
	readonly step?: number;
	/**
	 * An ISO 4217 currency code, such as `USD` or `EUR`. It is data, not a format:
	 * the family asks `Intl` where this currency's symbol goes in the reader's own
	 * language, shows the number that way, and accepts the same characters back
	 * when somebody types or pastes them. A code `Intl` does not know is ignored.
	 */
	readonly currency?: string;
	/** Nobody can type in the field or step it, and it drops out of the tab order. */
	readonly disabled?: boolean;
	/** The number can be read and selected but not changed. The field stays focusable. */
	readonly readonly?: boolean;
	/** A number is needed before a form submits. */
	readonly required?: boolean;
	/** The field is reported as holding something wrong. Mounting `numberbox.error` also sets it. */
	readonly invalid?: boolean;
	/** Submitted under this name by `numberbox.field`. */
	readonly name?: string;
	/**
	 * Called with the number the field settles on - on blur, on `Enter`, and on
	 * every step - or with `null` once it holds none. It does not fire per
	 * keystroke; the half-typed value is on `numberbox.state()` for anyone who
	 * wants it live.
	 */
	readonly onChange?: (value: number | null) => void;
};

/**
 * The control a person types into: a real text input, so text review, selection
 * and a soft keyboard all behave normally. `disabled`, `readonly` and `required`
 * may be set here as well as on the root, and a restriction set in either place
 * stands - a part can add one, never remove one.
 *
 * It carries no `name`: what a form submits is `numberbox.field`, because the
 * text here is grouped and may carry a currency symbol.
 */
export type NumberboxInputProps = Omit<PropsOf<'input'>, 'value' | 'type'>;

/** The field's name. Its `for` points at the input, so clicking the text focuses it. */
export type NumberboxLabelProps = PropsOf<'label'>;

/**
 * Steps the number down by one `step`. It is out of the tab order and points its
 * `aria-controls` at the input, because the input is the only tab stop and the
 * arrow keys already do what this button does. Holding it repeats.
 */
export type NumberboxBackTriggerProps = PropsOf<'button'>;

/** Steps the number up by one `step`. Otherwise `numberbox.backtrigger`, upward. */
export type NumberboxForwardTriggerProps = PropsOf<'button'>;

/**
 * The formatted number as text. It renders the value rather than accepting
 * children, so there is nothing to keep in step by hand.
 */
export type NumberboxValueLabelProps = Omit<PropsOf<'output'>, 'children'>;

/**
 * Supporting text for the field, named by the input's `aria-describedby`. With no
 * `role="spinbutton"` there is no `aria-valuemin`/`aria-valuemax`, so this is
 * where a range reaches a reader: write it out here when the field has bounds.
 */
export type NumberboxDescriptionProps = PropsOf<'div'>;

/**
 * The validation message, named by the input's `aria-describedby` ahead of
 * `numberbox.description`. Mounting it is what marks the field invalid - it
 * reports `aria-invalid` for as long as this part is in the page - so render it
 * only when there is an error to show.
 */
export type NumberboxErrorProps = PropsOf<'div'>;

/**
 * The element a form submits. It is clipped, out of the tab order and hidden from
 * readers, and it carries the plain number - no grouping, no currency symbol,
 * `.` for a decimal point - under the root's `name`.
 */
export type NumberboxFieldProps = Omit<PropsOf<'input'>, 'value' | 'type'>;

/**
 * The graph cells every numberbox part reads and writes.
 *
 * `seed` is the number the consumer wrote. `typed` is the text a person has
 * entered and not yet committed, `null` whenever the display is the family's own
 * formatting. `held` is the number the last commit settled on and `settled` says
 * whether there has been one. Everything else is derived from those four by
 * `./numberbox-math.ts`.
 */
export type NumberboxInstanceState = {
	seed: number | null;
	typed: string | null;
	held: number | null;
	settled: boolean;
	min: number | undefined;
	max: number | undefined;
	step: number;
	currency: string;
	disabled: boolean;
	readonly: boolean;
	required: boolean;
	invalidProp: boolean;
	errored: boolean;
	name: string;
	spoken: string;
	repeater: number;
	repeats: number;
	repeatUp: boolean;
	onChange?: NumberboxRootProps['onChange'];
};
