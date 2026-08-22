import type { PropsOf, Seeded } from '@markless/core';

/** The select-all is on, off, or mixed — computed from the group, never set by a prop. */
export type ChecklistChecked = boolean | 'mixed';

export type ChecklistRootProps = Omit<PropsOf<'fieldset'>, 'onChange'> & {
	/** The values that are ticked. Omit it and nothing is ticked. */
	readonly value?: readonly string[];
	/** Every value the list offers. Select-all compares the ticked set against this. */
	readonly values?: readonly string[];
	/** Nobody can change any item; the fieldset disables its controls natively too. */
	readonly disabled?: boolean;
	/**
	 * Intended to be called with the whole new ticked set whenever an item or the
	 * select-all changes. Omit it and the ticking still works.
	 */
	readonly onChange?: (value: readonly string[]) => void;
};

/** Names the group. A `<legend>` names a `<fieldset>` natively, so no id is minted. */
export type ChecklistLabelProps = PropsOf<'legend'>;

/**
 * Roots the select-all's own checkbox instance: `checkbox.trigger`,
 * `checkbox.indicator` and `checkbox.label` go inside it, not beside it.
 */
export type ChecklistSelectAllProps = PropsOf<'div'>;

/**
 * Roots one item's checkbox instance. `value` is required, because it is what the
 * group's ticked set holds and what a form submits — position is never identity.
 */
export type ChecklistItemProps = PropsOf<'div'> & {
	readonly value: string;
	readonly disabled?: boolean;
	/** Submitted under this name by a `checkbox.field` written inside the item. */
	readonly name?: string;
};

export type ChecklistErrorProps = PropsOf<'div'>;

/**
 * The shared instance every checklist part reads and writes: the root's seeded
 * fields, plus what no prop carries - `invalid`, set by a mounted error part, and
 * the consumer's `onChange`, stored by the root for the writers to call.
 */
export type ChecklistInstanceState = Seeded<
	ChecklistRootProps,
	'value' | 'values' | 'disabled'
> & {
	invalid: boolean;
	onChange?: ChecklistRootProps['onChange'];
};
