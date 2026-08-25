import type { PropsOf } from '@markless/core';
import type { SegmentType } from './datebox-math.ts';

/**
 * A date typed one part at a time, as three number boxes rather than one text
 * field. It is the group the three boxes sit in and the home of the date they
 * spell: put a `datebox.label`, a `datebox.dayinput`, a
 * `datebox.monthinput` and a `datebox.yearinput` inside it, in whichever
 * order the date should read, and a `datebox.field` when a form has to submit
 * it.
 *
 * It reports `ui-disabled`, `ui-required` and `ui-empty` for styling, and it is
 * the element a reader announces as the group the boxes belong to.
 */
export type DateBoxRootProps = Omit<PropsOf<'fieldset'>, 'onChange'> & {
	/**
	 * The date the boxes show, as `yyyy-mm-dd`. Omit it and they start empty.
	 */
	readonly value?: string;
	/** The earliest date the boxes will settle on, as `yyyy-mm-dd`. */
	readonly min?: string;
	/** The latest date the boxes will settle on, as `yyyy-mm-dd`. */
	readonly max?: string;
	/** Nothing can be typed in any box, and they all drop out of the tab order. */
	readonly disabled?: boolean;
	/** A whole date is needed before a form submits. */
	readonly required?: boolean;
	/** Submitted under this name by `datebox.field`. */
	readonly name?: string;
	/**
	 * Called with the whole date as `yyyy-mm-dd` whenever the boxes spell one, and
	 * with `null` while they do not. Omit it and the boxes still work; the call
	 * site simply does nothing.
	 */
	readonly onChange?: (value: string | null) => void;
};

/**
 * What every box in the group shares, whichever part of the date it holds.
 *
 * A box draws its own digits, so it takes no children: what it shows is the part
 * of the date it holds, or its placeholder while it holds none.
 */
export type DateBoxItemProps = Omit<PropsOf<'span'>, 'children'> & {
	/** The text an empty box shows. Defaults to the box's own shape: `dd`, `mm`, `yyyy`. */
	readonly placeholder?: string;
	/** Show a single-digit day or month as `04` rather than `4`. */
	readonly showLeadingZero?: boolean;
};

/** The day of the month, 1 to whatever the chosen month and year allow. */
export type DateBoxDayInputProps = DateBoxItemProps;

/** The month, 1 to 12. */
export type DateBoxMonthInputProps = DateBoxItemProps;

/** The year. */
export type DateBoxYearInputProps = DateBoxItemProps;

/**
 * The group's name. It is a `<legend>` inside the root's `<fieldset>`, the
 * `radio-group` precedent: three boxes have no single control for a `for` to
 * point at, and this way the group is named by the platform.
 */
export type DateBoxLabelProps = PropsOf<'legend'>;

/**
 * Supporting text for the group, named by the root's `aria-describedby`. One
 * element can be named that way, so mounting this alongside `datebox.error`
 * describes by whichever renders first.
 */
export type DateBoxDescriptionProps = PropsOf<'div'>;

/**
 * The validation message. Mounting it is what marks the boxes invalid - they
 * report `aria-invalid` for as long as this part is in the page - so render it
 * only when there is an error to show.
 */
export type DateBoxErrorProps = PropsOf<'div'>;

/**
 * The element a form submits. It is clipped, out of the tab order and hidden
 * from readers, and it carries the whole date as `yyyy-mm-dd` under the root's
 * `name`.
 */
export type DateBoxFieldProps = Omit<PropsOf<'input'>, 'value' | 'type'>;

/**
 * The graph cells every datebox part reads and writes.
 *
 * `seed` is the date the consumer wrote and the three `*At` cells are what has
 * been typed over it: `null` while a box is untouched, a string once it is not,
 * and `''` once somebody has emptied it. Everything else is derived from those
 * four by `./datebox-math.ts`. Text rather than numbers, because a half-typed
 * `0` on its way to `05` is a real state a number cannot hold.
 */
export type DateBoxInstanceState = {
	seed: string;
	dayAt: string | null;
	monthAt: string | null;
	yearAt: string | null;
	min: string;
	max: string;
	disabled: boolean;
	required: boolean;
	invalid: boolean;
	name: string;
	onChange?: DateBoxRootProps['onChange'];
};

/** Which part of the date one box holds, plus how it is asked to draw itself. */
export type DateBoxItemInstanceState = {
	type: SegmentType;
	showLeadingZero: boolean;
	placeholder: string;
};
