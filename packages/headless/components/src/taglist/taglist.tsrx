import { computed, element, shared, state } from '@markless/core';
import VisuallyHidden from '../base/visually-hidden.tsrx';
// One tag's inline rename is editable's session over one row of the array.
import { editKey, landCaret, opensEdit, settled } from '../editable/edit-walk.ts';
import {
	admit,
	afterRemoval,
	elementForValue,
	nextHighlight,
	rename,
	splitPasted,
} from './tag-walk.ts';
import type {
	TagListDescriptionProps,
	TagListErrorProps,
	TagListFieldProps,
	TagListInputProps,
	TagListInstanceState,
	TagListItemCloseProps,
	TagListItemInputProps,
	TagListItemInstanceState,
	TagListItemLabelProps,
	TagListItemProps,
	TagListLabelProps,
	TagListRootProps,
} from './taglist-types.ts';

// The walk moves a highlight, never DOM focus: the caret stays in the field while
// a tag is under the walk, so nothing about the highlight can be read back off
// the document. That is why a tag carries its own value in the markup as
// `ui-value` - it is the only channel from an element a handle handed back to the
// family state that names it.

export const taglistState = shared(
	() => {
		const taglist: TagListInstanceState = state({
			value: [] as readonly string[],
			disabled: false,
			required: false,
			invalid: false,
			max: 0,
			delimiter: ',',
			editable: false,
			name: '',
			input: '',
			highlighted: '',
			editing: '',
			spoken: '',
		});
		const labelEl = element<HTMLLabelElement>();
		const inputEl = element<HTMLInputElement>();
		const descriptionEl = element<HTMLDivElement>();
		const errorEl = element<HTMLDivElement>();
		// The array type argument is what makes these handles plural: one handle
		// bound on every tag, read back in document order. Walking them is how the
		// family reaches another part's element without ever looking one up.
		const closeEls = element<HTMLButtonElement[]>();
		const editEls = element<HTMLInputElement[]>();

		return {
			...taglist,
			labelEl,
			inputEl,
			descriptionEl,
			errorEl,
			closeEls,
			editEls,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((value: readonly string[]) => void) | undefined,

			/**
			 * Take tags onto the list. Empties are dropped, a tag already held is
			 * passed over, and `max` stops the run: a refusal is spoken rather than
			 * silent, because a chip that never appeared looks like a bug.
			 */
			take(incoming: readonly string[]) {
				if (taglist.disabled) return;
				const held = taglist.value;
				const after = admit(held, incoming, taglist.max);
				const cap = taglist.max;
				if (after === held && cap > 0 && held.length >= cap) {
					taglist.spoken = `${cap} tags is the limit`;
					return;
				}
				if (after === held) return;
				const added = after.length - held.length;
				taglist.value = after;
				taglist.spoken =
					added === 1 ? `${after[after.length - 1]} added` : `${added} tags added`;
				taglist.onChange?.(after);
			},

			/** Take one tag back off the list, and move the highlight off it. */
			remove(value: string) {
				if (taglist.disabled) return;
				const held = taglist.value;
				if (!held.includes(value)) return;
				const after = held.filter((tag) => tag !== value);
				taglist.highlighted = afterRemoval(held, value);
				taglist.editing = '';
				taglist.value = after;
				taglist.spoken = `${value} removed`;
				taglist.onChange?.(after);
			},

			/** Move the walk. `''` gives it back to the caret. */
			highlight(value: string) {
				taglist.highlighted = value;
			},

			/** Open one tag for editing and land the caret in its own field. */
			edit(value: string) {
				if (taglist.disabled || taglist.editable !== true) return;
				taglist.editing = value;
				taglist.highlighted = value;
				landCaret(elementForValue(editEls, value) as HTMLInputElement | undefined, value);
			},

			/** Take the edited words, or give the tag back unchanged. */
			settle(was: string, now: string, keep: boolean) {
				taglist.editing = '';
				const held = taglist.value;
				// A cancel settles on the words from before, and renaming a tag to what it
				// already reads gives the array back - so the cancel path needs no branch.
				const one = settled(was, now, keep);
				const after = rename(held, was, one);
				if (after === held) return;
				taglist.highlighted = held.includes(one) || one === '' ? '' : one;
				taglist.value = after;
				taglist.spoken = one === '' ? `${was} removed` : `${was} is now ${one}`;
				taglist.onChange?.(after);
			},
		};
	},
	{ scope: 'widget' },
);

/** One instance per tag, rooted by `taglist.item`. */
export const taglistItemState = shared(
	() => {
		const item: TagListItemInstanceState = state({ value: '' });

		return { ...item };
	},
	{ scope: 'widget' },
);

export function TagListRoot({
	value = [],
	disabled = false,
	required = false,
	invalid = false,
	max = 0,
	delimiter = ',',
	editable = false,
	name = '',
	onChange,
	children,
	...rest
}: TagListRootProps) @{
	const taglist = taglistState();
	taglist.onChange = onChange;
	taglist.value = value;
	taglist.disabled = disabled;
	taglist.required = required;
	taglist.invalid = invalid;
	taglist.max = max;
	taglist.delimiter = delimiter;
	taglist.editable = editable;
	taglist.name = name;

	<div
		{...rest}
		role="group"
		aria-labelledby={taglist.labelEl}
		ui-disabled={taglist.disabled}
		ui-required={taglist.required}
		ui-invalid={taglist.invalid}
		ui-empty={taglist.value.length === 0}
	>
		{/* Always rendered, not a part: an announcement a consumer has to remember
		    to mount is not a guarantee. With no collection role on the tags this is
		    the only thing that speaks an add, a removal or a refused cap. */}
		<VisuallyHidden>
			<output aria-live="polite" aria-atomic="true">{taglist.spoken}</output>
		</VisuallyHidden>
		{children}
	</div>
}

// `for` names the field, so a click on the label lands the caret there. The root
// is named by this element either way, which is what gives a display-only row -
// one with no field at all - a name of its own.
export function TagListLabel({ children, ...rest }: TagListLabelProps) @{
	const taglist = taglistState();

	<label {...rest} el={taglist.labelEl} for={taglist.inputEl}>{children}</label>
}

// The tokenizing field. Mounting it is what turns a static row into a tags input.
export function TagListInput({
	onInput,
	onKeydown,
	onPaste,
	...rest
}: TagListInputProps) @{
	const taglist = taglistState();

	<input
		{...rest}
		el={taglist.inputEl}
		type="text"
		autocomplete="off"
		value={taglist.input}
		disabled={taglist.disabled}
		aria-labelledby={taglist.labelEl}
		// Error before description: what is wrong is conveyed before the hint,
		// wherever the two parts sit in the page.
		aria-describedby={[taglist.errorEl, taglist.descriptionEl]}
		aria-invalid={taglist.invalid ? 'true' : 'false'}
		aria-required={taglist.required ? 'true' : 'false'}
		ui-empty={taglist.input === ''}
		onInput={(event) => {
			const next = (event.target as HTMLInputElement).value;
			const mark = taglist.delimiter;
			const at = mark === '' ? -1 : next.lastIndexOf(mark);
			// Everything before the last delimiter is committed; what follows it is
			// still being typed.
			if (at >= 0) taglist.take(splitPasted(next.slice(0, at), mark));
			taglist.input = at >= 0 ? next.slice(at + mark.length) : next;
			onInput?.(event);
		}}
		// The cancel is unconditional because it has to be decided before the
		// handler symbol loads, and the clipboard's own text is not something the
		// synchronous policy can see. Every paste becomes tags, which is what a
		// person pasting a delimited list into a chip field means.
		onPaste={(event) => {
			event.preventDefault();
			const text = (event as ClipboardEvent).clipboardData?.getData('text') ?? '';
			const mark = taglist.delimiter;
			taglist.take(splitPasted(text, mark === '' ? ',' : mark));
			onPaste?.(event);
		}}
		onKeydown={(event) => {
			// Written out from event fields and graph state alone: the policy has to
			// be readable before the handler symbol loads. ArrowLeft is absent on
			// purpose - it walks only from an empty field or a caret already at 0,
			// and in both of those the native default moves nothing.
			if (event.key === 'Enter') event.preventDefault();
			if (
				(event.key === 'ArrowRight' ||
					event.key === 'Backspace' ||
					event.key === 'Delete' ||
					event.key === 'Escape') &&
				taglist.highlighted !== ''
			) {
				event.preventDefault();
			}

			const key = event.key;
			const field = event.target as HTMLInputElement;
			// The cell, not the element: a lazily loaded handler runs after the
			// native dispatch, so the field can already read empty while only the
			// cell still holds the text from before this keystroke.
			const wasEmpty = taglist.input === '';
			const atStart = field.selectionStart === 0 && field.selectionEnd === 0;
			const held = taglist.highlighted;
			const isEditable = taglist.editable === true;

			if (key === 'Enter' && held !== '' && isEditable) {
				taglist.edit(held);
			} else if (key === 'Enter') {
				taglist.take(splitPasted(taglist.input, taglist.delimiter === '' ? ',' : taglist.delimiter));
				taglist.input = '';
			} else if (key === 'ArrowLeft' && (wasEmpty || atStart)) {
				const landing = nextHighlight(taglist.value, held, key);
				if (landing !== undefined) taglist.highlight(landing);
			} else if (key === 'ArrowRight' && held !== '') {
				const landing = nextHighlight(taglist.value, held, key);
				if (landing !== undefined) taglist.highlight(landing);
			} else if (key === 'Backspace' && held !== '') {
				taglist.remove(held);
			} else if (key === 'Backspace' && wasEmpty) {
				// The first press walks, the second removes: a tag that vanished on a
				// keystroke aimed at text is the classic "I lost a tag I could not
				// see" complaint.
				const landing = nextHighlight(taglist.value, held, 'ArrowLeft');
				if (landing !== undefined) taglist.highlight(landing);
			} else if (key === 'Delete' && held !== '') {
				taglist.remove(held);
			} else if (key === 'Escape' && held !== '') {
				taglist.highlight('');
			}
			onKeydown?.(event);
		}}
	/>
}

export function TagListItem({
	value,
	children,
	onClick,
	onKeydown,
	...rest
}: TagListItemProps) @{
	const taglist = taglistState();
	const item = taglistItemState();
	item.value = value;
	const isHighlighted = computed(() => taglist.highlighted === item.value);
	const isEditing = computed(() => taglist.editing === item.value);

	// No ARIA role. `option` children are presentational, so a delete button
	// inside one is unreachable, and `grid` would need a row and a cell part per
	// tag and could not hold the field. The button below is what a reader lands on.
	<div
		{...rest}
		ui-value={item.value}
		ui-highlighted={isHighlighted}
		ui-editing={isEditing}
		ui-disabled={taglist.disabled}
		onClick={(event) => {
			// A keyboard activation carries `detail` 0, and the delete button's own is
			// one of those: a click out of that button must not open the tag it removed.
			const close = elementForValue(taglist.closeEls, item.value);
			const fromClose = close !== undefined && close.contains(event.target as Node);
			if (!fromClose && opensEdit(event.detail, true) && taglist.editable === true) {
				taglist.edit(item.value);
			}
			onClick?.(event);
		}}
		// F2, not Enter: this lands from the focused delete button, where Enter and
		// Space are that button's own activation. Enter opens the edit from the field.
		onKeydown={(event) => {
			if (event.key === 'F2') event.preventDefault();

			const key = event.key;
			const box = elementForValue(taglist.editEls, item.value);
			if (
				key === 'F2' &&
				box !== undefined &&
				taglist.editable === true &&
				taglist.highlighted === item.value &&
				taglist.editing !== item.value
			) {
				taglist.edit(item.value);
			}
			onKeydown?.(event);
		}}
	>{children}</div>
}

export function TagListItemLabel({ children, ...rest }: TagListItemLabelProps) @{
	const taglist = taglistState();
	const item = taglistItemState();
	const isEditing = computed(() => taglist.editing === item.value);

	<span {...rest} hidden={isEditing}>
		@if (children) {
			<>{children}</>
		} @else {
			<>{item.value}</>
		}
	</span>
}

// The delete affordance, and an ordinary tab stop in both shapes: a roving
// tabindex is what React Aria's `role="grid"` licenses, and without that role a
// button in flow content Tab cannot reach is a WCAG 2.1.1 hazard.
export function TagListItemClose({
	children,
	onClick,
	onFocus,
	onKeydown,
	...rest
}: TagListItemCloseProps) @{
	const taglist = taglistState();
	const item = taglistItemState();
	const isHighlighted = computed(() => taglist.highlighted === item.value);
	// The name carries the tag's own words: it is the whole announcement a reader
	// gets for this chip, so "Remove" alone would name every button on the row.
	const name = computed(() => `Remove ${item.value}`);

	<button
		{...rest}
		el={taglist.closeEls}
		type="button"
		ui-value={item.value}
		ui-highlighted={isHighlighted}
		aria-label={name}
		disabled={taglist.disabled}
		onClick={(event) => {
			taglist.remove(item.value);
			onClick?.(event);
		}}
		onFocus={(event) => {
			// DOM focus and the walk are one thing while focus is actually on a tag;
			// they part company only when the caret is in the field.
			taglist.highlight(item.value);
			onFocus?.(event);
		}}
		onKeydown={(event) => {
			// Written out from event fields alone: the policy has to be readable
			// before the handler symbol loads.
			if (
				event.key === 'ArrowLeft' ||
				event.key === 'ArrowRight' ||
				event.key === 'Home' ||
				event.key === 'End' ||
				event.key === 'Backspace' ||
				event.key === 'Delete'
			) {
				event.preventDefault();
			}

			const key = event.key;
			const held = item.value;
			if (key === 'Backspace' || key === 'Delete') {
				// The neighbour is named before the removal but its element is read
				// after it: the write commits first, so the handle already holds the
				// node the repeat kept.
				const landing = afterRemoval(taglist.value, held);
				taglist.remove(held);
				const next = elementForValue(taglist.closeEls, landing);
				if (next !== undefined) next.focus();
				if (next === undefined) taglist.inputEl?.focus();
			} else {
				const landing = nextHighlight(taglist.value, held, key);
				if (landing !== undefined) elementForValue(taglist.closeEls, landing)?.focus();
				if (landing === '') taglist.inputEl?.focus();
			}
			onKeydown?.(event);
		}}
	>{children}</button>
}

// Hidden until this tag is the one being edited. The write commits before the
// focus call in `edit()` lands, which is the runtime's contract - a family that
// cannot focus what it just revealed files a witness rather than retrying.
export function TagListItemInput({
	onInput,
	onKeydown,
	onBlur,
	...rest
}: TagListItemInputProps) @{
	const taglist = taglistState();
	const item = taglistItemState();
	const isEditing = computed(() => taglist.editing === item.value);

	<input
		{...rest}
		el={taglist.editEls}
		type="text"
		autocomplete="off"
		ui-value={item.value}
		hidden={isEditing !== true}
		disabled={taglist.disabled}
		aria-label={item.value}
		onKeydown={(event) => {
			if (event.key === 'Enter' || event.key === 'Escape') event.preventDefault();

			const move = editKey(event.key);
			const typed = (event.target as HTMLInputElement).value;
			if (move !== undefined) taglist.settle(item.value, typed, move === 'commit');
			if (move !== undefined) taglist.inputEl?.focus();
			onKeydown?.(event);
		}}
		onBlur={(event) => {
			// Blur takes the words rather than dropping them: a person who clicked
			// away from a field they were editing meant what they had written.
			if (taglist.editing === item.value) {
				taglist.settle(item.value, (event.target as HTMLInputElement).value, true);
			}
			onBlur?.(event);
		}}
		onInput={(event) => {
			onInput?.(event);
		}}
	/>
}

export function TagListDescription({ children, ...rest }: TagListDescriptionProps) @{
	const taglist = taglistState();

	<div {...rest} el={taglist.descriptionEl}>{children}</div>
}

// `role="alert"` so the message is spoken when it appears.
export function TagListError({ children, ...rest }: TagListErrorProps) @{
	const taglist = taglistState();

	<div {...rest} el={taglist.errorEl} role="alert">{children}</div>
}

// One hidden input per tag, all under the root's name, so a submit handler reads
// them back with `formData.getAll(name)`. A hidden input cannot carry `required`,
// which is why the root's `required` reaches a person through `aria-required` on
// the field instead of through the browser's own validation.
export function TagListField({ ...rest }: TagListFieldProps) @{
	const taglist = taglistState();

	<div {...rest} role="presentation">
		@for (const tag of taglist.value; key tag) {
			<input type="hidden" name={taglist.name} value={tag} />
		}
	</div>
}
