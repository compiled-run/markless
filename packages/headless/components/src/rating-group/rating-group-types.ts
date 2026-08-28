import type { PropsOf, Seeded } from '@markless/core';

/**
 * A rating: one number chosen out of `count` positions, drawn as a run of
 * filled marks. Radiogroup semantics under the hood, but not a radio group -
 * the fill is cumulative rather than one checked member, a hover previews a
 * value nobody has committed, and a position can be half filled.
 *
 * The root owns the list. `count` decides how many positions there are, and
 * `ratinggroup.state().positions` hands them back as `1 … count` for the
 * consumer's repeat: an item never takes an index, because a position derived
 * from render order is not readable at render time today.
 */
export type RatingGroupRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/**
	 * The rating now. Passing this makes the group controlled: a gesture reports
	 * through `onChange` and nothing fills until the new number comes back in.
	 * Leave it out and the group keeps its own.
	 */
	readonly value?: number;
	/** The rating an uncontrolled group starts with. Omit it and nothing is rated. */
	readonly defaultValue?: number;
	/** How many positions the group has. Omit it and there are 5. */
	readonly count?: number;
	/** A position can be filled halfway, by pointer and by key. */
	readonly half?: boolean;
	/**
	 * The rating is shown, not chosen. Every position stays readable and
	 * reachable - a display-only aggregate is still a rating to a reader - and
	 * nothing a person does changes it.
	 */
	readonly readonly?: boolean;
	/** Nobody can change the rating, and the group leaves the tab order. */
	readonly disabled?: boolean;
	/** A rating is needed before the form submits. */
	readonly required?: boolean;
	/** The name `ratinggroup.field` submits under. Omit it and the group submits nothing. */
	readonly name?: string;
	/**
	 * Intended to be called with the new rating whenever it changes. Omit it and
	 * rating still works; the call site simply does nothing.
	 */
	readonly onChange?: (value: number) => void;
};

/**
 * The cells every part reads and writes. One instance per group.
 *
 * `previewAt` is the transient half of the family: what a hover is offering
 * before anyone commits it. `NO_PREVIEW` means nothing is being offered, which
 * cannot be 0 because 0 is a rating a person can give.
 */
export type RatingGroupInstanceState = {
	/** `defaultValue`, untouched. */
	seed: number;
	/** The `value` prop. Defined means controlled. */
	given: number | undefined;
	/** The family's own rating, and `null` until a gesture has written one. */
	held: number | null;
	count: number;
	half: boolean;
	readonly: boolean;
	disabled: boolean;
	required: boolean;
	name: string;
	/** The rating a hover is offering, or the "nothing offered" sentinel. */
	previewAt: number;
	onChange?: RatingGroupRootProps['onChange'];
};

/** What `ratinggroup.root` hands the group element it renders: everything it was given. */
export type RatingGroupBoxProps = PropsOf<'div'>;

/** The group's name: the `role="radiogroup"` element points its `aria-labelledby` here. */
export type RatingGroupLabelProps = PropsOf<'span'>;

/** Supporting text for the group, wired into the group's `aria-describedby`. */
export type RatingGroupDescriptionProps = PropsOf<'div'>;

/**
 * The group's validation message, wired into the group's `aria-describedby`
 * ahead of the description, so what is wrong is conveyed before the hint.
 * Render it only when there is something to say.
 */
export type RatingGroupErrorProps = PropsOf<'div'>;

/**
 * One position, and one `role="radio"`. `value` is the rating this position
 * commits, not a place in a list: it comes from `positions` on the instance,
 * which the root derives from `count`.
 *
 * The family owns this element's `style` attribute to carry `--rating-fill`,
 * so style it from a stylesheet rather than a `style` prop.
 */
export type RatingGroupItemProps = PropsOf<'div'> & {
	/** The rating this position commits. */
	readonly value: number;
};

/** One instance per rendered `ratinggroup.item`: the position it was written with. */
export type RatingGroupItemPosition = Seeded<RatingGroupItemProps, 'value'>;

/**
 * The rating as text - `3 of 5`, and `0 of 5` when nothing is rated. It takes
 * no children: a consumer who wants their own wording writes their own element
 * and reads `ui-value` off it.
 */
export type RatingGroupValueLabelProps = Omit<PropsOf<'output'>, 'children'>;

/**
 * The clipped native input that carries the rating into a form. It takes no
 * configuration of its own: `name` comes from `ratinggroup.root`, so one place
 * decides what a form receives.
 */
export type RatingGroupFieldProps = PropsOf<'input'>;
