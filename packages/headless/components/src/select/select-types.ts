import type { PropsOf, Seeded } from '@markless/core';

/**
 * The root carries the whole family's configuration and renders no role of its
 * own, exactly as QDS's `SelectRoot` does. `multiple` is deliberately absent:
 * it is the one prop that turns `value` into a union and doubles the keyboard
 * table, and the research note files it as a scope decision for a later tranche.
 */
export type SelectRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** The value of the chosen option. Omit it and nothing is chosen. */
	readonly value?: string;
	/** The popup is showing. Omit it and it starts closed. */
	readonly open?: boolean;
	/** Nobody can change the choice. */
	readonly disabled?: boolean;
	/** A choice is needed before the form submits. */
	readonly required?: boolean;
	/** Submitted under this name by `select.field`. */
	readonly name?: string;
	/**
	 * Intended to be called with the new value when a person chooses a different
	 * option. Omit it and choosing still works; the call site simply does nothing.
	 */
	readonly onChange?: (value: string) => void;
	/** Called when the popup opens or closes. */
	readonly onOpenChange?: (open: boolean) => void;
};

/**
 * The graph cells every select part reads and writes: the root's seeded fields,
 * plus the two the typeahead buffer needs. The `element()` handles and the
 * consumer's callbacks are not cells and are not listed here; they are added to
 * the instance the factory returns.
 *
 * `search` plus `searchAt` is the whole typeahead buffer. QDS holds a string and
 * a live `setTimeout` handle; the window here is a comparison against
 * `Date.now()`, so there is no timer to own, cancel, or carry across a resume.
 */
export type SelectInstanceState = Seeded<
	SelectRootProps,
	'value' | 'open' | 'disabled' | 'required' | 'name'
> & {
	search: string;
	searchAt: number;
	onChange?: SelectRootProps['onChange'];
	onOpenChange?: SelectRootProps['onOpenChange'];
};

/**
 * One option. Clicking it, or activating it from the keyboard, chooses it
 * and closes the popup. It takes focus as the list is walked, but it is never a
 * tab stop - only `select.trigger` is.
 */
export type SelectItemProps = PropsOf<'div'> & {
	/** Submitted when this option is the chosen one. Required: no index stands in for it. */
	readonly value: string;
	/** Nobody can choose this option, and the arrow keys walk past it. */
	readonly disabled?: boolean;
};

/**
 * One instance per rendered `select.item`. The parts inside an option read this
 * rather than the select, which is how an item indicator knows whether the
 * option it sits in is the chosen one.
 */
export type SelectItemInstanceState = Seeded<SelectItemProps, 'value' | 'disabled'>;

/** The select's name. Named by `aria-labelledby` from the trigger and the listbox. */
export type SelectLabelProps = PropsOf<'label'>;

/**
 * The control a person opens the list from, and the family's only tab stop. It
 * shows the current choice and reports `role="combobox"`; a consumer's `onClick`
 * and `onKeydown` run after the family's.
 */
export type SelectTriggerProps = PropsOf<'button'>;

/**
 * The popup the options go in. Closed hides it, never detaches it - the
 * trigger's `aria-controls` points at this element. It owns the arrow, Home,
 * End, Enter, Space, Escape and typeahead keys while it is showing.
 */
export type SelectContentProps = PropsOf<'div'>;

/** The words shown for one option. Plain markup: it decides nothing on its own. */
export type SelectItemLabelProps = PropsOf<'span'>;

/**
 * One option's chosen mark. It stays in the page and carries `ui-hidden` while
 * its option is not the chosen one, and it is `aria-hidden`, so the state it
 * draws is never announced twice.
 */
export type SelectItemIndicatorProps = PropsOf<'span'>;

/**
 * The visually hidden native `<select>` that carries the choice into a form. It
 * takes no configuration of its own: `name`, `required` and `disabled` come
 * from `select.root` and the value from whichever option was chosen, so one
 * place decides what a form receives.
 */
export type SelectFieldProps = PropsOf<'select'>;
