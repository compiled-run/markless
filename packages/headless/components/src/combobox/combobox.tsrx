import { computed, element, shared, state } from '@markless/core';
import VisuallyHidden from '../base/visually-hidden.tsrx';
import { clickOptionWithValue, nextHighlightValue } from './option-walk.ts';
import type {
	ComboboxContentProps,
	ComboboxDescriptionProps,
	ComboboxErrorProps,
	ComboboxFieldProps,
	ComboboxInputProps,
	ComboboxInstanceState,
	ComboboxItemIndicatorProps,
	ComboboxItemInstanceState,
	ComboboxItemLabelProps,
	ComboboxItemProps,
	ComboboxLabelProps,
	ComboboxRootProps,
	ComboboxTriggerProps,
} from './combobox-types.ts';

/**
 * How long a press that dismissed the list keeps the trigger's own click from
 * re-opening it, in milliseconds. Armed by identity - only a press on this
 * combobox's trigger arms it - so the window never swallows an unrelated click.
 */
const PRESS_GRACE = 300;

export const comboboxState = shared(
	() => {
		const combobox: ComboboxInstanceState = state({
			value: '' as string | readonly string[],
			input: '',
			highlighted: '',
			open: false,
			disabled: false,
			required: false,
			invalid: false,
			multiple: false,
			removeOnBackspace: false,
			loop: false,
			inline: false,
			name: '',
			placeholder: '',
			isPointerInContent: false,
			isKeyboardMove: false,
			wasFieldEmpty: false,
			wasFieldReset: false,
			pressGraceUntil: 0,
		});
		const labelEl = element<HTMLLabelElement>();
		const inputEl = element<HTMLInputElement>();
		const triggerEl = element<HTMLButtonElement>();
		const contentEl = element<HTMLDivElement>();
		const describedEl = element<HTMLDivElement>();
		// The array type argument is what makes this handle plural: one handle
		// bound on every option, read back as the live options in document order.
		const optionEls = element<HTMLDivElement[]>();

		return {
			...combobox,
			labelEl,
			inputEl,
			triggerEl,
			contentEl,
			describedEl,
			optionEls,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((value: string | readonly string[]) => void) | undefined,
			onInput: undefined as ((value: string) => void) | undefined,
			onOpenChange: undefined as ((open: boolean) => void) | undefined,
			/**
			 * Take or give back one option. Single mode toggles a string and writes
			 * the option's own words into the field; `multiple` toggles membership of
			 * a list and leaves the field alone, because the text there is what the
			 * person is still typing.
			 */
			choose(next: string, label: string) {
				if (combobox.disabled) return;
				const held = combobox.value;
				if (combobox.multiple) {
					const current = typeof held === 'string' ? (held === '' ? [] : [held]) : held;
					const isHeld = current.includes(next);
					const after = isHeld ? current.filter((one) => one !== next) : [...current, next];
					combobox.value = after;
					combobox.highlighted = next;
					combobox.onChange?.(after);
					return;
				}
				const isHeld = held === next;
				const after = isHeld ? '' : next;
				combobox.value = after;
				combobox.input = isHeld ? '' : label;
				combobox.highlighted = after;
				combobox.onChange?.(after);
			},
			setOpen(next: boolean) {
				if (combobox.disabled || combobox.open === next) return;
				combobox.open = next;
				combobox.onOpenChange?.(next);
			},
			/** The field's text changed. The consumer filters their own list from it. */
			typed(next: string) {
				combobox.input = next;
				combobox.wasFieldReset = false;
				combobox.onInput?.(next);
			},
			/** Backspace in an already empty field gives back the last chosen value. */
			removeLast() {
				const held = combobox.value;
				const current = typeof held === 'string' ? (held === '' ? [] : [held]) : held;
				if (current.length === 0) return;
				const after = current.slice(0, current.length - 1);
				combobox.value = after;
				combobox.wasFieldReset = false;
				combobox.onChange?.(after);
			},
		};
	},
	{ scope: 'widget' },
);

/** One instance per option, rooted by `combobox.item`. */
export const comboboxItemState = shared(
	() => {
		const item: ComboboxItemInstanceState = state({ value: '', label: '', disabled: false });

		return { ...item };
	},
	{ scope: 'widget' },
);

export function ComboboxRoot({
	value = '',
	open = false,
	disabled = false,
	required = false,
	invalid = false,
	multiple = false,
	removeOnBackspace = false,
	loop = false,
	inline = false,
	name = '',
	placeholder = '',
	onChange,
	onInput,
	onOpenChange,
	children,
	...rest
}: ComboboxRootProps) @{
	const combobox = comboboxState();
	combobox.onChange = onChange;
	combobox.onInput = onInput;
	combobox.onOpenChange = onOpenChange;
	combobox.value = value;
	combobox.open = open;
	combobox.disabled = disabled;
	combobox.required = required;
	combobox.invalid = invalid;
	combobox.multiple = multiple;
	combobox.removeOnBackspace = removeOnBackspace;
	combobox.loop = loop;
	combobox.inline = inline;
	combobox.name = name;
	combobox.placeholder = placeholder;

	<div
		{...rest}
		role="group"
		ui-open={combobox.open}
		ui-closed={combobox.open !== true}
		ui-disabled={combobox.disabled}
		ui-required={combobox.required}
		ui-inline={combobox.inline}
	>{children}</div>
}

// `for` names the input, so a click on the label lands the caret in the field
// without this part writing a handler for it (behaviour 5.3).
export function ComboboxLabel({ children, ...rest }: ComboboxLabelProps) @{
	const combobox = comboboxState();

	<label {...rest} el={combobox.labelEl} for={combobox.inputEl}>{children}</label>
}

// The only tab stop in the family, and the element that owns the keyboard. DOM
// focus never leaves it: that is the whole difference between this family and
// select, and every rule below follows from it.
export function ComboboxInput({
	onInput,
	onKeydown,
	onKeyup,
	...rest
}: ComboboxInputProps) @{
	const combobox = comboboxState();

	<input
		{...rest}
		el={combobox.inputEl}
		type="text"
		role="combobox"
		autocomplete="off"
		value={combobox.input}
		placeholder={combobox.placeholder}
		disabled={combobox.disabled}
		required={combobox.required}
		aria-autocomplete="list"
		aria-labelledby={combobox.labelEl}
		aria-controls={combobox.contentEl}
		aria-describedby={combobox.describedEl}
		aria-invalid={combobox.invalid ? 'true' : 'false'}
		// An inline list is part of the page: nothing expands, so neither word is
		// written. `false` rather than `undefined`, because the attribute writer
		// reads `false` as "remove this" and `undefined` as no record at all.
		aria-expanded={combobox.inline === true ? false : combobox.open === true ? 'true' : 'false'}
		aria-haspopup={combobox.inline === true ? false : 'listbox'}
		ui-open={combobox.open}
		ui-closed={combobox.open !== true}
		onInput={(event) => {
			const next = (event.target as HTMLInputElement).value;
			const isMultiple = combobox.multiple === true;
			combobox.typed(next);
			// Emptying the field in single mode gives the choice back: the text IS
			// the selection there. With `multiple` the text is only a filter.
			if (next === '' && isMultiple !== true) combobox.choose('', '');
			if (next !== '') combobox.setOpen(true);
			onInput?.(event);
		}}
		onKeydown={(event) => {
			// The prevented keys are written out from event fields alone: this policy
			// has to be readable before the handler symbol loads. Printable keys are
			// deliberately absent - typing belongs to the field, and this family has
			// no typeahead buffer to feed.
			if (
				event.key === 'ArrowDown' ||
				event.key === 'ArrowUp' ||
				event.key === 'Home' ||
				event.key === 'End' ||
				event.key === 'PageDown' ||
				event.key === 'PageUp' ||
				event.key === 'Enter'
			) {
				event.preventDefault();
			}

			const key = event.key;
			const options = combobox.optionEls;
			const isInline = combobox.inline === true;
			const isShowing = isInline || combobox.open === true;
			const isMultiple = combobox.multiple === true;
			const isLooping = combobox.loop === true;
			const highlighted = combobox.highlighted;
			const isStepKey = key === 'ArrowDown' || key === 'ArrowUp';
			const isJumpKey = key === 'Home' || key === 'End';

			if (key === 'Backspace') {
				// The FAMILY's text, not the field's. A lazily loaded handler runs
				// after the native dispatch, so by the time this line runs the browser
				// has already deleted the character and the element reads empty - which
				// would make the very first backspace give a chosen value back. The
				// cell still holds what the last input event reported, which is exactly
				// "the text before this keystroke".
				combobox.wasFieldEmpty = combobox.input === '';
			} else if (isStepKey && isShowing !== true) {
				// Closed: the key opens the list and lands the highlight at the end it
				// asks for - down on the first option, up on the last.
				combobox.setOpen(true);
				const landing = nextHighlightValue(options, '', key, isLooping);
				if (landing !== undefined) combobox.isKeyboardMove = true;
				if (landing !== undefined) combobox.highlighted = landing;
			} else if ((isStepKey || isJumpKey) && isShowing) {
				const landing = nextHighlightValue(options, highlighted, key, isLooping);
				if (landing !== undefined) combobox.isKeyboardMove = true;
				if (landing !== undefined) combobox.highlighted = landing;
			} else if (key === 'Enter' && isShowing && highlighted !== '') {
				// Through the option's own click rule, so one place in this family
				// reads a value and one place decides whether the list closes.
				clickOptionWithValue(options, highlighted);
				if (isMultiple) combobox.input = '';
				if (isMultiple) combobox.wasFieldReset = true;
			} else if (key === 'Escape' && isInline !== true) {
				// An inline list has nothing to close, which is what upstream asserts.
				combobox.setOpen(false);
			} else if (key === 'Tab' && isInline !== true) {
				// Closes, and the native move is left alone.
				combobox.setOpen(false);
			}
			onKeydown?.(event);
		}}
		onKeyup={(event) => {
			const key = event.key;
			const isMultiple = combobox.multiple === true;
			const isArmed = combobox.removeOnBackspace === true;
			// Either the field was already empty when the key went down, or an Enter
			// selection had just emptied it. The two flags are why the FIRST
			// backspace deletes text and only the second gives a value back.
			const wasEmpty = combobox.wasFieldEmpty === true || combobox.wasFieldReset === true;
			const isEmptyNow = (event.target as HTMLInputElement).value === '';
			if (key === 'Backspace' && isMultiple && isArmed && wasEmpty && isEmptyNow) {
				combobox.removeLast();
			}
			onKeyup?.(event);
		}}
	/>
}

// Not a tab stop, on purpose: only the input is one. Clicking it puts the caret
// back in the field and toggles the list.
export function ComboboxTrigger({ children, onClick, ...rest }: ComboboxTriggerProps) @{
	const combobox = comboboxState();

	<button
		{...rest}
		el={combobox.triggerEl}
		type="button"
		tabindex={-1}
		aria-controls={combobox.contentEl}
		aria-expanded={combobox.inline === true ? false : combobox.open === true ? 'true' : 'false'}
		aria-label="Show options"
		disabled={combobox.disabled}
		ui-open={combobox.open}
		ui-closed={combobox.open !== true}
		onClick={(event) => {
			// The press that dismissed an open list is the same press whose click
			// arrives here: without this the trigger would close on the press and
			// re-open on the click. Armed by identity in `onDismiss` below.
			const isOpen = combobox.open === true;
			if (combobox.pressGraceUntil <= Date.now()) combobox.inputEl?.focus();
			if (combobox.pressGraceUntil <= Date.now()) combobox.setOpen(isOpen !== true);
			onClick?.(event);
		}}
	>{children}</button>
}

// Closed hides the list, it never detaches it: the input points at this
// element's minted id, and an unmount would leave that reference dangling.
// Never detaching is also what the overlay mark requires - an enlisted element
// removed from the document leaves the stack's marks behind.
//
// `overlay` is the bare attribute the primitive reads, and nothing is imported
// for it. It is written unconditionally, which is a known deviation for `inline`
// - see note.md, "One content part, two modes".
export function ComboboxContent({
	children,
	onDismiss,
	onPointerenter,
	...rest
}: ComboboxContentProps) @{
	const combobox = comboboxState();
	// One graph cell, read in every position: a comparison written inline in an
	// attribute renders once and then goes stale.
	const isShowing = computed(() => combobox.inline === true || combobox.open === true);

	<div
		{...rest}
		el={combobox.contentEl}
		overlay
		role="listbox"
		aria-labelledby={combobox.labelEl}
		aria-multiselectable={combobox.multiple === true ? 'true' : false}
		hidden={isShowing !== true}
		ui-open={isShowing}
		ui-closed={isShowing !== true}
		onPointerenter={(event) => {
			// A pointer that is genuinely in the list may highlight; a keyboard walk
			// that happens to run under a resting mouse may not be overruled by it.
			combobox.isKeyboardMove = false;
			combobox.isPointerInContent = true;
			onPointerenter?.(event);
		}}
		onDismiss={(event) => {
			const isInline = combobox.inline === true;
			const pressed = event.detail.pressTarget;
			const trigger = combobox.triggerEl;
			// Where the press landed, which the report carries for `outside-press`
			// and omits for Escape. `contains` rather than `===`: a consumer is free
			// to put an icon inside the trigger, and the press lands on that.
			const isOwnTrigger = pressed !== undefined && trigger !== undefined && trigger.contains(pressed);
			if (isInline !== true) combobox.setOpen(false);
			if (isInline !== true && isOwnTrigger) combobox.pressGraceUntil = Date.now() + PRESS_GRACE;
			// The primitive moves no focus, so the return is the family's to write.
			// Escape has to leave the caret in the field a person was typing in.
			if (isInline !== true && event.detail.reason === 'escape') combobox.inputEl?.focus();
			onDismiss?.(event);
		}}
	>{children}</div>
}

export function ComboboxItem({
	value,
	label,
	disabled = false,
	children,
	onClick,
	onFocus,
	onPointerover,
	...rest
}: ComboboxItemProps) @{
	const combobox = comboboxState();
	const item = comboboxItemState();
	item.value = value;
	// Written in the body rather than as a destructuring default: a default that
	// names another parameter is not readable from a template position
	// (MARKLESS_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED).
	item.label = label ?? value;
	// Own prop only: a seed is built from this component's props, so the
	// combobox's own `disabled` is added at every read site instead.
	item.disabled = disabled;
	// One graph cell, read in every position: a comparison written inline in an
	// attribute renders once and then goes stale.
	const isChosen = computed(() => {
		const held = combobox.value;
		if (typeof held === 'string') return held === item.value;
		return held.includes(item.value);
	});
	const isHighlighted = computed(() => combobox.highlighted === item.value);
	const isLocked = computed(() => item.disabled || combobox.disabled);

	// `ui-value` is this option's own name in the markup. The highlight is family
	// state keyed by value and DOM focus never lands on an option, so an element
	// the walk was handed has no other way back to the value it stands for. See
	// note.md, "The value in the markup".
	<div
		{...rest}
		el={combobox.optionEls}
		role="option"
		ui-value={item.value}
		aria-selected={isChosen ? 'true' : 'false'}
		aria-disabled={isLocked ? 'true' : 'false'}
		tabindex={-1}
		ui-selected={isChosen}
		ui-highlighted={isHighlighted}
		ui-disabled={isLocked}
		onClick={(event) => {
			// The two cells, not the `isLocked` computed: a computed() read from a
			// handler body does not guard. See note.md.
			if (item.disabled !== true && combobox.disabled !== true) {
				const held = combobox.value;
				const wasChosen = typeof held === 'string' ? held === item.value : held.includes(item.value);
				combobox.choose(item.value, item.label);
				// Choosing closes; UNCHOOSING leaves the list up, which is Qwik UI's
				// own rule and the one most likely to be "fixed" by a later reader.
				if (
					wasChosen !== true &&
					combobox.multiple !== true &&
					combobox.inline !== true
				) {
					combobox.setOpen(false);
				}
			}
			onClick?.(event);
		}}
		onFocus={(event) => {
			// The safety net that keeps the caret in the field whatever focuses an
			// option - a consumer's own script, a browser's find-in-page, a click.
			combobox.inputEl?.focus();
			onFocus?.(event);
		}}
		onPointerover={(event) => {
			// Only a pointer genuinely inside the list highlights. Without the guard
			// a list opening under a resting mouse steals the keyboard's highlight.
			if (combobox.isPointerInContent === true || combobox.inline === true) {
				if (item.disabled !== true) combobox.highlighted = item.value;
			}
			onPointerover?.(event);
		}}
	>{children}</div>
}

export function ComboboxItemLabel({ children, ...rest }: ComboboxItemLabelProps) @{
	<span {...rest}>{children}</span>
}

export function ComboboxItemIndicator({ children, ...rest }: ComboboxItemIndicatorProps) @{
	const combobox = comboboxState();
	const item = comboboxItemState();
	const isChosen = computed(() => {
		const held = combobox.value;
		if (typeof held === 'string') return held === item.value;
		return held.includes(item.value);
	});

	<span {...rest} aria-hidden="true" ui-hidden={isChosen !== true}>{children}</span>
}

// One part stands behind both `combobox.description` and `combobox.error`: an
// element() handle binds in exactly one place, and `aria-describedby` names
// exactly one id (an IDREF LIST is MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE). A
// combobox that mounts both messages is described by the first. Same call
// textbox made.
function ComboboxMessage({ children, ...rest }: ComboboxDescriptionProps) @{
	const combobox = comboboxState();

	<div {...rest} el={combobox.describedEl}>{children}</div>
}

export function ComboboxDescription({ children, ...rest }: ComboboxDescriptionProps) @{
	<ComboboxMessage {...rest}>{children}</ComboboxMessage>
}

// `role="alert"` so the message is spoken when it appears, which is what makes
// mounting this part worth doing at all.
export function ComboboxError({ children, ...rest }: ComboboxErrorProps) @{
	<ComboboxMessage {...rest} role="alert">{children}</ComboboxMessage>
}

// A `<select>` holding exactly the choice that was made. A single-option
// `<select>` submits the same name/value pair a rebuilt option list would, and
// the option carries the value as its text because the option element's
// attribute type does not yet take one. Same shape select ships.
//
// One option per chosen value - what `multiple` wants - needs a `@for` over a
// read off the shared instance, and that lowers to `ReferenceError: combobox is
// not defined`. See note.md, "A repeat cannot be sourced from the instance".
export function ComboboxField({ ...rest }: ComboboxFieldProps) @{
	const combobox = comboboxState();

	<VisuallyHidden>
		<select
			{...rest}
			aria-hidden="true"
			tabindex={-1}
			name={combobox.name}
			required={combobox.required}
			disabled={combobox.disabled}
		>
			<option>{combobox.value}</option>
		</select>
	</VisuallyHidden>
}
