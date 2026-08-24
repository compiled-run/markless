import type { PropsOf, Seeded } from '@markless/core';

/** The select-all is on, off, or mixed — computed from the group, never set by a prop. */
export type ChecklistChecked = boolean | 'mixed';

/**
 * The group and the select-all's own checkbox root are one element: `role="group"`
 * plus the checkbox root's own behavior.
 */
export type ChecklistRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** The values that are ticked. Omit it and nothing is ticked. */
	readonly value?: readonly string[];
	/** Every value the list offers. Select-all compares the ticked set against this. */
	readonly values?: readonly string[];
	/** Nobody can change any item, and the select-all is locked too. */
	readonly disabled?: boolean;
	/**
	 * Intended to be called with the whole new ticked set whenever an item or the
	 * select-all changes. Omit it and the ticking still works.
	 */
	readonly onChange?: (value: readonly string[]) => void;
};

/** Names the group by naming the select-all trigger, whose id the family mints. */
export type ChecklistLabelProps = PropsOf<'label'>;

/**
 * The group's validation message. Mounting it marks the select-all's checkbox
 * invalid for as long as it is in the page; an item's own message goes in a
 * `checklist.error` written inside that item instead.
 */
export type ChecklistErrorProps = PropsOf<'div'>;

/**
 * The visually hidden native input that carries the enclosing checkbox into a
 * form. It takes no configuration of its own: `name` and `value` come from the
 * part that roots the instance, so one place decides what a form receives.
 */
export type ChecklistFieldProps = PropsOf<'input'>;

/**
 * The one trigger that ticks or clears every item. It reports mixed while only
 * some items are ticked, but mixed is never somewhere a click lands: activating
 * it from mixed ticks everything.
 */
export type ChecklistSelectAllProps = PropsOf<'button'>;

/**
 * The select-all's check mark. Its children render while the select-all is on or
 * mixed, and the element is `aria-hidden`.
 */
export type ChecklistSelectAllIndicatorProps = PropsOf<'span'>;

/**
 * Roots one item's checkbox instance. `value` is required, because it is what the
 * group's ticked set holds and what a form submits — position is never identity.
 */
export type ChecklistItemProps = PropsOf<'div'> & {
	/** This item's name in the group's ticked set, and what a form submits for it. */
	readonly value: string;
	/** This one item is locked. The root's own `disabled` locks every item regardless. */
	readonly disabled?: boolean;
	/** Submitted under this name by a `checklist.field` written inside the item. */
	readonly name?: string;
};

/**
 * One item's checkbox. Ticking it updates the group's whole set, which is what
 * the select-all is computed from.
 */
export type ChecklistItemTriggerProps = PropsOf<'button'>;

/** One item's label. Its `for` points at that item's trigger, so clicking the text ticks it. */
export type ChecklistItemLabelProps = PropsOf<'label'>;

/** Supporting text for one item. It renders its children and changes nothing else. */
export type ChecklistItemDescriptionProps = PropsOf<'div'>;

/**
 * One item's check mark. Its children render while that item is ticked, and the
 * element is `aria-hidden`.
 */
export type ChecklistItemIndicatorProps = PropsOf<'span'>;

/**
 * The shared instance every checklist part reads and writes: the root's seeded
 * fields, plus the consumer's `onChange`, stored by the root for the writers to
 * call. `invalid` is not here — a mounted error part marks the enclosing checkbox
 * instance, which is the one whose trigger carries `aria-invalid`.
 */
export type ChecklistInstanceState = Seeded<
	ChecklistRootProps,
	'value' | 'values' | 'disabled'
> & {
	onChange?: ChecklistRootProps['onChange'];
};
