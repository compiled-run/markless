import { computed, element, shared, state } from '@markless/core';
import VisuallyHidden from '../base/visually-hidden.tsrx';
import {
	commitFocusedOption,
	focusMatchingOption,
	focusNeighbourOption,
	focusOpeningOption,
} from './element-reach.ts';
import type {
	SelectContentProps,
	SelectFieldProps,
	SelectInstanceState,
	SelectItemIndicatorProps,
	SelectItemInstanceState,
	SelectItemLabelProps,
	SelectItemProps,
	SelectLabelProps,
	SelectRootProps,
	SelectTriggerProps,
} from './select-types.ts';

/** How long a typeahead buffer stays open, in milliseconds. */
const TYPEAHEAD_WINDOW = 750;

export const selectState = shared(
	() => {
		const select: SelectInstanceState = state({
			value: '',
			open: false,
			disabled: false,
			required: false,
			name: '',
			search: '',
			searchAt: 0,
		});
		const labelEl = element<HTMLLabelElement>();
		const contentEl = element<HTMLDivElement>();
		const triggerEl = element<HTMLButtonElement>();

		return {
			...select,
			labelEl,
			contentEl,
			triggerEl,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((value: string) => void) | undefined,
			onOpenChange: undefined as ((open: boolean) => void) | undefined,
			choose(next: string) {
				if (select.disabled || select.value === next) return;
				select.value = next;
				select.onChange?.(next);
			},
			setOpen(next: boolean) {
				if (select.disabled || select.open === next) return;
				select.open = next;
				select.onOpenChange?.(next);
			},
		};
	},
	{ scope: 'widget' },
);

/** One instance per option, rooted by `select.item`. */
export const selectItemState = shared(
	() => {
		const item: SelectItemInstanceState = state({ value: '', disabled: false });

		return { ...item };
	},
	{ scope: 'widget' },
);

export function SelectRoot({
	value = '',
	open = false,
	disabled = false,
	required = false,
	name = '',
	onChange,
	onOpenChange,
	children,
	...rest
}: SelectRootProps) @{
	const select = selectState();
	select.onChange = onChange;
	select.onOpenChange = onOpenChange;
	select.value = value;
	select.open = open;
	select.disabled = disabled;
	select.required = required;
	select.name = name;

	<div
		{...rest}
		ui-open={select.open}
		ui-closed={select.open !== true}
		ui-disabled={select.disabled}
		ui-required={select.required}
	>{children}</div>
}

export function SelectLabel({ children, ...rest }: SelectLabelProps) @{
	const select = selectState();

	<label {...rest} el={select.labelEl}>{children}</label>
}

// role="combobox", against QDS: a bare button with aria-haspopup is announced as
// "button, collapsed" and fails aria-at's `Role 'combobox' is conveyed` row.
export function SelectTrigger({ children, onClick, onKeydown, ...rest }: SelectTriggerProps) @{
	const select = selectState();

	<button
		{...rest}
		el={select.triggerEl}
		type="button"
		role="combobox"
		aria-haspopup="listbox"
		aria-expanded={select.open ? 'true' : 'false'}
		aria-controls={select.contentEl}
		aria-labelledby={select.labelEl}
		disabled={select.disabled}
		ui-open={select.open}
		ui-closed={select.open !== true}
		onClick={(event) => {
			select.setOpen(select.open !== true);
			onClick?.(event);
		}}
		onKeydown={(event) => {
			// The prevented keys are written out from event fields alone: this
			// policy has to be readable before the handler symbol loads.
			if (
				event.key === 'ArrowDown' ||
				event.key === 'ArrowUp' ||
				event.key === 'Home' ||
				event.key === 'End'
			) {
				event.preventDefault();
			}

			const key = event.key;
			const isOpenAtFirstKey = key === 'ArrowDown' || key === 'Home';
			const isOpenAtLastKey = key === 'ArrowUp' || key === 'End';
			// Enter and Space are the button's own activation. preventDefault()
			// from a lazily loaded handler runs after the native dispatch, so a
			// key rule that also opened would toggle straight back shut: the
			// click opens the popup and this handler only lands the focus.
			const isActivationKey = key === 'Enter' || key === ' ';
			const isTypeaheadChar = key.length === 1 && key !== ' ';

			if (
				!select.disabled &&
				(isOpenAtFirstKey || isOpenAtLastKey || isActivationKey || isTypeaheadChar)
			) {
				const now = Date.now();
				const isSearchStale = now - select.searchAt > TYPEAHEAD_WINDOW;
				const search = isTypeaheadChar
					? (isSearchStale ? '' : select.search) + key.toLowerCase()
					: '';
				// Two cell assignments rather than one method taking both: a
				// shared method of arity two aborts the handler. See note.md.
				if (isTypeaheadChar) {
					select.search = search;
					select.searchAt = now;
				}
				if (!isActivationKey) select.setOpen(true);

				// Alt+ArrowDown opens the popup and leaves focus on the combobox.
				if (!event.altKey) {
					focusOpeningOption(select.contentEl, search, isOpenAtLastKey);
				}
			}
			onKeydown?.(event);
		}}
	>{children}</button>
}

// Closed hides the listbox, it never detaches it: the trigger points at this
// element's minted id, and an unmount would leave that reference dangling.
export function SelectContent({ children, onKeydown, ...rest }: SelectContentProps) @{
	const select = selectState();

	<div
		{...rest}
		el={select.contentEl}
		role="listbox"
		aria-labelledby={select.labelEl}
		hidden={select.open !== true}
		ui-open={select.open}
		ui-closed={select.open !== true}
		onKeydown={(event) => {
			// Escape is prevented too: a listbox inside a dialog must not close both.
			if (
				event.key === 'ArrowDown' ||
				event.key === 'ArrowUp' ||
				event.key === 'Home' ||
				event.key === 'End' ||
				event.key === 'Enter' ||
				event.key === ' ' ||
				event.key === 'Escape'
			) {
				event.preventDefault();
			}

			const key = event.key;
			// `target`, not `currentTarget`: a lazy handler symbol runs after the
			// native dispatch has finished, and `currentTarget` is null by then.
			const here = event.target as HTMLElement;
			const isTypeaheadChar = key.length === 1 && key !== ' ';
			const isNavigationKey =
				key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End';
			// Enter, Space, and Tab choose the focused option as the value.
			const isSelectionKey = key === 'Enter' || key === ' ' || key === 'Tab';

			if (isTypeaheadChar) {
				const now = Date.now();
				const isSearchStale = now - select.searchAt > TYPEAHEAD_WINDOW;
				const search = (isSearchStale ? '' : select.search) + key.toLowerCase();
				select.search = search;
				select.searchAt = now;
				focusMatchingOption(select.contentEl, search);
			} else if (isNavigationKey) {
				// Moving is not choosing. A reader that says "selected" after an
				// arrow is this family's most common bug, so the walk is focus only.
				focusNeighbourOption(select.contentEl, here, key);
			} else if (isSelectionKey) {
				// Through the option's own click rule, so one place in this family
				// reads a value. Tab keeps its native move; the other two hand
				// focus back.
				commitFocusedOption(here);
				if (key !== 'Tab') select.triggerEl?.focus();
			} else if (key === 'Escape') {
				// Closing leaves the value untouched: the highlight never committed.
				select.setOpen(false);
				select.triggerEl?.focus();
			}
			onKeydown?.(event);
		}}
	>{children}</div>
}

export function SelectItem({
	value,
	disabled = false,
	children,
	onClick,
	...rest
}: SelectItemProps) @{
	const select = selectState();
	const item = selectItemState();
	item.value = value;
	// Own prop only: a seed is built from this component's props, so the
	// select's own `disabled` is added at every read site instead.
	item.disabled = disabled;
	// One graph cell, read in every position: a comparison written inline in an
	// attribute renders once and then goes stale.
	const isChosen = computed(() => select.value === item.value);
	const isLocked = computed(() => item.disabled || select.disabled);

	<div
		{...rest}
		role="option"
		aria-selected={isChosen ? 'true' : 'false'}
		aria-disabled={isLocked ? 'true' : 'false'}
		tabindex={-1}
		ui-selected={isChosen}
		ui-disabled={isLocked}
		onClick={(event) => {
			// The two cells, not the `isLocked` computed: a computed() read from a
			// handler body does not guard. See note.md.
			if (item.disabled !== true && select.disabled !== true) {
				select.choose(item.value);
				select.setOpen(false);
			}
			onClick?.(event);
		}}
	>{children}</div>
}

export function SelectItemLabel({ children, ...rest }: SelectItemLabelProps) @{
	<span {...rest}>{children}</span>
}

export function SelectItemIndicator({ children, ...rest }: SelectItemIndicatorProps) @{
	const select = selectState();
	const item = selectItemState();
	const isChosen = computed(() => select.value === item.value);

	<span {...rest} aria-hidden="true" ui-hidden={isChosen !== true}>{children}</span>
}

// A `<select>` holding exactly the choice that was made. A single-option
// `<select>` submits the same name/value pair a rebuilt option list would, and
// the option carries the value as its text because the option element's
// attribute type does not yet take one.
export function SelectField({ ...rest }: SelectFieldProps) @{
	const select = selectState();

	<VisuallyHidden>
		<select
			{...rest}
			aria-hidden="true"
			tabindex={-1}
			name={select.name}
			required={select.required}
			disabled={select.disabled}
		>
			<option>{select.value}</option>
		</select>
	</VisuallyHidden>
}
