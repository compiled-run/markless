import type { PropsOf } from '@markless/core';
import type { SegmentType } from './timebox-math.ts';

/**
 * A time of day typed one part at a time, as separate number boxes rather than
 * one text field. It is the group the boxes sit in and the home of the time they
 * spell: put a `timebox.label`, a `timebox.hourinput`, a `timebox.minuteinput`
 * and whichever of `timebox.secondinput`, `timebox.dayperiodinput`,
 * `timebox.description`, `timebox.error` and `timebox.field` the page needs
 * inside it.
 *
 * Mounting a `timebox.secondinput` is what makes the time carry seconds - the
 * parts written are the granularity, so there is no separate prop for it.
 *
 * It reports `ui-disabled`, `ui-readonly`, `ui-required`, `ui-empty`,
 * `ui-hour12` and `ui-order` for styling, and it is the element a reader
 * announces as the group the boxes belong to.
 */
export type TimeBoxRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/**
	 * The time the boxes show, as `HH:mm` or `HH:mm:ss` on a 24-hour clock
	 * whatever the locale displays. Omit it and they start empty.
	 */
	readonly value?: string;
	/** The earliest time the boxes will settle on, in the same shape as `value`. */
	readonly min?: string;
	/** The latest time the boxes will settle on, in the same shape as `value`. */
	readonly max?: string;
	/**
	 * A BCP 47 language tag. It decides whether the boxes show a 12-hour or a
	 * 24-hour clock, which words the AM/PM box shows, and the order `ui-order`
	 * reports. Omit it and the runtime's own locale answers.
	 */
	readonly locale?: string;
	/**
	 * Show a 12-hour clock with an AM/PM box, or a 24-hour one. Omit it and the
	 * locale decides - which is the usual case, and the reason this is not a
	 * required prop.
	 */
	readonly hour12?: boolean;
	/** Nothing can be typed in any box, and they all drop out of the tab order. */
	readonly disabled?: boolean;
	/** The time can be read and walked but not changed. The boxes stay focusable. */
	readonly readonly?: boolean;
	/** A whole time is needed before a form submits. */
	readonly required?: boolean;
	/** Submitted under this name by `timebox.field`. */
	readonly name?: string;
	/**
	 * Called with the whole time as `HH:mm` or `HH:mm:ss` whenever the boxes spell
	 * one, and with `null` while they do not. Omit it and the boxes still work;
	 * the call site simply does nothing.
	 */
	readonly onChange?: (value: string | null) => void;
};

/**
 * What every box in the group shares, whichever part of the time it holds.
 *
 * A box draws its own digits, so it takes no children: what it shows is the part
 * of the time it holds, or its placeholder while it holds none.
 */
export type TimeBoxItemProps = Omit<PropsOf<'span'>, 'children'> & {
	/** The text an empty box shows. Defaults to the box's own shape: `hh`, `mm`, `ss`, `--`. */
	readonly placeholder?: string;
	/** Show a single-digit part as `04` rather than `4`. */
	readonly showLeadingZero?: boolean;
};

/** The hour: 1 to 12 on a 12-hour clock, 0 to 23 on a 24-hour one. */
export type TimeBoxHourInputProps = TimeBoxItemProps;

/** The minute, 0 to 59. */
export type TimeBoxMinuteInputProps = TimeBoxItemProps;

/** The second, 0 to 59. Mounting it is what makes the reported time carry seconds. */
export type TimeBoxSecondInputProps = TimeBoxItemProps;

/**
 * Which half of the day the time falls in. It shows whatever words the locale's
 * own data gives for them, and `a` and `p` set it directly, as well as the
 * arrows. Write it only on a 12-hour clock; a 24-hour time already says which
 * half of the day it means.
 */
export type TimeBoxDayPeriodInputProps = TimeBoxItemProps;

/** What `timebox.root` hands the group element it renders: everything it was given. */
export type TimeBoxGroupProps = PropsOf<'div'>;

/**
 * The group's name: the element `role="group"` points its `aria-labelledby` at.
 * Several boxes have no single control for a `for` to point at, so the name is
 * carried by the IDREF rather than a `for`.
 */
export type TimeBoxLabelProps = PropsOf<'label'>;

/**
 * Supporting text for the group, named by every box's `aria-describedby`. Mount
 * it alongside `timebox.error` and the boxes name both, the error first.
 */
export type TimeBoxDescriptionProps = PropsOf<'div'>;

/**
 * The validation message, named by every box's `aria-describedby` ahead of
 * `timebox.description`. Mounting it is what marks the boxes invalid - they
 * report `aria-invalid` for as long as this part is in the page - so render it
 * only when there is an error to show.
 */
export type TimeBoxErrorProps = PropsOf<'div'>;

/**
 * The element a form submits. It is clipped, out of the tab order and hidden
 * from readers, and it carries the whole time as `HH:mm` or `HH:mm:ss` under the
 * root's `name` - the same string a native `<input type="time">` would submit.
 */
export type TimeBoxFieldProps = Omit<PropsOf<'input'>, 'value' | 'type'>;

/**
 * The graph cells every timebox part reads and writes.
 *
 * `seed` is the time the consumer wrote and the four `*At` cells are what has
 * been typed over it: `null` while a box is untouched, a string once it is not,
 * and `''` once somebody has emptied it. Everything else is derived from those
 * by `./timebox-math.ts`. Text rather than numbers, because a half-typed `0` on
 * its way to `05` is a real state a number cannot hold.
 *
 * `seconds` is set by `timebox.secondinput` on mount, so the granularity is the
 * markup rather than a prop.
 */
export type TimeBoxInstanceState = {
	seed: string;
	hourAt: string | null;
	minuteAt: string | null;
	secondAt: string | null;
	periodAt: string | null;
	min: string;
	max: string;
	locale: string;
	hour12Prop: boolean | undefined;
	seconds: boolean;
	disabled: boolean;
	readonly: boolean;
	required: boolean;
	invalid: boolean;
	name: string;
	onChange?: TimeBoxRootProps['onChange'];
};

/** Which part of the time one box holds, plus how it is asked to draw itself. */
export type TimeBoxItemInstanceState = {
	type: SegmentType;
	showLeadingZero: boolean;
	placeholder: string;
};
