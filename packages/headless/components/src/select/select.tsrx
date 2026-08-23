import { computed, element, shared, state } from '@markless/core';
import VisuallyHidden from '../base/visually-hidden.tsrx';
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

/** How long a typeahead buffer stays open, in milliseconds. QDS's own window. */
const TYPEAHEAD_WINDOW = 750;

// The two DOM walks below are written out in each handler that needs them
// rather than shared from module scope: a module-scope function called from a
// component body is read as a state helper, and one returning an array is
// MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED. Measured on this tip - see note.md.

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
		// Typed to the element each handle is bound on: `el=` checks the tag.
		const labelEl = element<HTMLLabelElement>();
		const contentEl = element<HTMLDivElement>();

		return {
			...select,
			labelEl,
			contentEl,
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

// A second family, rooted by each `select.item`: the option's own value and
// whether it can be chosen. Its indicator reads this rather than the select.
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

// role="combobox", against QDS: QDS ships aria-haspopup on a bare button, which
// a reader announces as "button, collapsed" and which fails aria-at's
// `Role 'combobox' is conveyed` row.
export function SelectTrigger({ children, onClick, onKeydown, ...rest }: SelectTriggerProps) @{
	const select = selectState();

	<button
		{...rest}
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
			// The four keys, guarded by event fields alone: a browser-critical
			// policy has to be readable before the handler symbol loads. Enter and
			// Space are deliberately absent - see the `activating` note below.
			if (
				event.key === 'ArrowDown' ||
				event.key === 'ArrowUp' ||
				event.key === 'Home' ||
				event.key === 'End'
			) {
				event.preventDefault();
			}

			const key = event.key;
			const opening =
				key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End';
			// Enter and Space are the button's own activation. preventDefault() from
			// this handler runs after the native dispatch, so the click fires anyway
			// and a key rule that also opened would toggle straight back shut -
			// measured, see note.md. The click opens; this only lands the focus.
			const activating = key === 'Enter' || key === ' ';
			const printable = key.length === 1 && key !== ' ';
			// `target`, not `currentTarget`: a lazy handler symbol runs after the
			// native dispatch has finished, and `currentTarget` is null by then.
			const here = (event.target as HTMLElement).closest('[role="combobox"]');
			const listId = here?.getAttribute('aria-controls') ?? '';
			const list = listId === '' ? null : document.getElementById(listId);
			const alt = event.altKey;

			if (!select.disabled && list !== null && (opening || activating || printable)) {
				const now = Date.now();
				const search = printable
					? (now - select.searchAt > TYPEAHEAD_WINDOW ? '' : select.search) + key.toLowerCase()
					: '';
				// Two cell assignments, not a shared method taking both: a
				// two-parameter shared method aborts the handler - see note.md.
				if (printable) {
					select.search = search;
					select.searchAt = now;
				}
				if (!activating) select.setOpen(true);

				// The listbox is `hidden` until the open cell reaches the DOM, and
				// nothing inside a hidden subtree can take focus, so the roving move
				// is retried per frame until it lands.
				if (!alt) {
					let tries = 12;
					const land = () => {
						// DOM order is navigation order, so no registry holds it.
						const options = Array.from(
							list.querySelectorAll<HTMLElement>('[role="option"]'),
						).filter((option) => option.getAttribute('aria-disabled') !== 'true');
						const chosen = options.find(
							(option) => option.getAttribute('aria-selected') === 'true',
						);
						// The option's own words, with aria-hidden decoration left
						// out, so an indicator's text is never typeable.
						const match = options.find((option) => {
							let words = '';
							for (const node of Array.from(option.childNodes)) {
								const child = node as Element;
								if (node.nodeType === 1 && child.getAttribute('aria-hidden') === 'true') {
									continue;
								}
								words += node.textContent ?? '';
							}
							return words.trim().toLowerCase().startsWith(search);
						});
						const end =
							key === 'ArrowUp' || key === 'End' ? options[options.length - 1] : options[0];
						const landing = printable ? match : (chosen ?? end);
						landing?.focus();
						tries = tries - 1;
						if (tries > 0 && document.activeElement !== landing) requestAnimationFrame(land);
					};
					requestAnimationFrame(land);
				}
			}
			onKeydown?.(event);
		}}
	>{children}</button>
}

export function SelectContent({ children, onKeydown, ...rest }: SelectContentProps) @{
	const select = selectState();

	// Closed hides the listbox, it never detaches it: the trigger points at this
	// element's minted id, and an unmount would leave that reference dangling.
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
			const printable = key.length === 1 && key !== ' ';
			const here = event.target as HTMLElement;
			const list = here.closest('[role="listbox"]') as HTMLElement | null;
			const option = here.closest('[role="option"]') as HTMLElement | null;
			const trigger =
				list === null || list.id === ''
					? null
					: document.querySelector<HTMLElement>('[aria-controls="' + list.id + '"]');

			if (list !== null) {
				const options = Array.from(list.querySelectorAll<HTMLElement>('[role="option"]')).filter(
					(each) => each.getAttribute('aria-disabled') !== 'true',
				);
				const at = option === null ? -1 : options.indexOf(option);
				const last = options.length - 1;

				if (printable) {
					const now = Date.now();
					const search =
						(now - select.searchAt > TYPEAHEAD_WINDOW ? '' : select.search) + key.toLowerCase();
					select.search = search;
					select.searchAt = now;
					const match = options.find((each) => {
						let words = '';
						for (const node of Array.from(each.childNodes)) {
							const child = node as Element;
							if (node.nodeType === 1 && child.getAttribute('aria-hidden') === 'true') continue;
							words += node.textContent ?? '';
						}
						return words.trim().toLowerCase().startsWith(search);
					});
					match?.focus();
				} else if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
					// Moving is not choosing. A reader that says "selected" after an
					// arrow is this family's most common bug, so the walk is focus only.
					const to =
						key === 'Home'
							? 0
							: key === 'End'
								? last
								: key === 'ArrowDown'
									? Math.min(at + 1, last)
									: Math.max(at - 1, 0);
					options[to]?.focus();
				} else if (key === 'Enter' || key === ' ' || key === 'Tab') {
					// The option's own click rule is the one place a value is read,
					// so committing by key is committing by the same path.
					option?.click();
					// Tab keeps its native move; the other two hand focus back.
					if (key !== 'Tab') trigger?.focus();
				} else if (key === 'Escape') {
					select.setOpen(false);
					trigger?.focus();
				}
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
	// Own prop only: a seed is built from this component's props, so the select's
	// own `disabled` is added at every read site instead.
	item.disabled = disabled;
	// One graph cell, read in every position: a comparison written inline in an
	// attribute renders once and then goes stale. Measured, see tabs/note.md.
	const chosen = computed(() => select.value === item.value);
	const locked = computed(() => item.disabled || select.disabled);

	<div
		{...rest}
		role="option"
		aria-selected={chosen ? 'true' : 'false'}
		aria-disabled={locked ? 'true' : 'false'}
		tabindex={-1}
		ui-selected={chosen}
		ui-disabled={locked}
		onClick={(event) => {
			// The two cells, not the `locked` computed: a computed() read from a
			// handler body does not guard - measured, see note.md.
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
	const chosen = computed(() => select.value === item.value);

	<span {...rest} aria-hidden="true" ui-hidden={chosen !== true}>{children}</span>
}

// A `<select>` holding exactly the choice that was made. QDS rebuilds the whole
// option list here from its item registry; markless has no registry - and needs
// none, because a single-option `<select>` submits the same name/value pair. The
// option carries the value as its text rather than a `value` attribute, which
// submits identically and which the option's attribute type does not yet carry.
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
