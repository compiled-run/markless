// Every computed carries a name unique to the whole module and reads its cells
// into locals before calling anything: two parts sharing a computed name resolve
// to one symbol, and a cell read nested inside a call has no name to lower to.

import { computed, element, shared, state } from '@markless/core';
import {
	editKey,
	heldText,
	landCaret,
	opensEdit,
	previewText,
	settled,
	showsPlaceholder,
} from './edit-walk.ts';
import type {
	EditableBoxProps,
	EditableDescriptionProps,
	EditableErrorProps,
	EditableFieldProps,
	EditableInputProps,
	EditableInstanceState,
	EditableLabelProps,
	EditableRootProps,
	EditableTriggerProps,
} from './editable-types.ts';

export const editableState = shared(
	() => {
		const editable: EditableInstanceState = state({
			seed: '',
			given: undefined,
			held: null,
			placeholder: '',
			editOnDoubleClick: false,
			editOnFocus: false,
			cancelOnBlur: false,
			readonly: false,
			disabled: false,
			required: false,
			invalid: false,
			name: '',
			editing: false,
		});
		const boxEl = element<HTMLDivElement>();
		const labelEl = element<HTMLLabelElement>();
		const triggerEl = element<HTMLButtonElement>();
		const inputEl = element<HTMLInputElement>();
		const descriptionEl = element<HTMLDivElement>();
		const errorEl = element<HTMLDivElement>();

		// `written`, not `value`: a lifted symbol that reads `instance.value` from a
		// part declaring a `value` prop is refused by capture analysis.
		const written = computed(() => {
			const given = editable.given;
			const own = editable.held;
			const seed = editable.seed;
			return heldText(given, own, seed);
		});

		return {
			...editable,
			boxEl,
			labelEl,
			triggerEl,
			inputEl,
			descriptionEl,
			errorEl,
			written,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((value: string) => void) | undefined,
			onEditChange: undefined as ((editing: boolean) => void) | undefined,

			/** Open a session and land the caret in the field with the words selected. */
			edit() {
				if (editable.disabled || editable.readonly || editable.editing) return;
				const words = written;

				editable.editing = true;
				// The write above commits before this call lands, which is the runtime's
				// contract - never a frame retry.
				landCaret(inputEl, words);
				editable.onEditChange?.(true);
			},

			/**
			 * Close the session, taking the words or giving back the value from before
			 * it. Where focus lands afterwards is the caller's: the key path hands it
			 * to the preview, and the blur path leaves it where the person put it.
			 */
			settle(typed: string, keep: boolean) {
				if (editable.editing !== true) return;
				const before = written;
				const after = settled(before, typed, keep);

				editable.editing = false;
				if (after !== before) {
					editable.held = after;
					editable.onChange?.(after);
				}
				editable.onEditChange?.(false);
			},
		};
	},
	{ scope: 'widget' },
);

export function EditableRoot({
	value,
	defaultValue = '',
	placeholder = '',
	editOnDoubleClick = false,
	editOnFocus = false,
	cancelOnBlur = false,
	readonly: isReadonly = false,
	disabled = false,
	required = false,
	invalid = false,
	name = '',
	onChange,
	onEditChange,
	children,
	...rest
}: EditableRootProps) @{
	const editable = editableState();
	editable.onChange = onChange;
	editable.onEditChange = onEditChange;
	editable.given = value;
	editable.seed = defaultValue;
	editable.placeholder = placeholder;
	editable.editOnDoubleClick = editOnDoubleClick;
	editable.editOnFocus = editOnFocus;
	editable.cancelOnBlur = cancelOnBlur;
	editable.readonly = isReadonly;
	editable.disabled = disabled;
	editable.required = required;
	editable.invalid = invalid;
	editable.name = name;

	<EditableBox {...rest}>{children}</EditableBox>
}

// A separate part rather than the root's own element: a widget root cannot read its
// own instance token, so the label IDREF only resolves one component deeper.
function EditableBox({ children, ...rest }: EditableBoxProps) @{
	const editable = editableState();
	const boxAriaDisabled = computed(() => (editable.disabled ? 'true' : undefined));

	<div
		{...rest}
		el={editable.boxEl}
		role="group"
		aria-labelledby={editable.labelEl}
		aria-disabled={boxAriaDisabled}
		ui-editing={editable.editing}
		ui-disabled={editable.disabled}
		ui-readonly={editable.readonly}
		ui-required={editable.required}
		ui-invalid={editable.invalid}
		ui-value={editable.written}
	>{children}</div>
}

export function EditableLabel({ children, onClick, ...rest }: EditableLabelProps) @{
	const editable = editableState();

	<label
		{...rest}
		el={editable.labelEl}
		for={editable.inputEl}
		ui-disabled={editable.disabled}
		onClick={(event) => {
			// `for` points at the field, which is hidden while the preview is showing:
			// a click on the label has to land on whichever element is actually there.
			if (editable.editing !== true) editable.triggerEl?.focus();
			onClick?.(event);
		}}
	>{children}</label>
}

/**
 * The preview control. It renders the value rather than accepting children: a
 * part cannot tell whether it was given any, so a fallback branch would render
 * nothing for everybody.
 */
export function EditableTrigger({ onClick, onFocus, ...rest }: EditableTriggerProps) @{
	const editable = editableState();
	const previewWords = computed(() => {
		const now = editable.written;
		const empty = editable.placeholder;
		return previewText(now, empty);
	});
	const previewEmpty = computed(() => {
		const now = editable.written;
		const empty = editable.placeholder;
		return showsPlaceholder(now, empty);
	});
	const previewHidden = computed(() => editable.editing === true);
	// `aria-readonly` is not an attribute `button` supports, so read-only reaches a
	// reader as the disabled state and the control stays focusable and readable.
	const previewAriaDisabled = computed(() => (editable.readonly ? 'true' : undefined));

	<button
		{...rest}
		el={editable.triggerEl}
		type="button"
		hidden={previewHidden}
		disabled={editable.disabled}
		aria-disabled={previewAriaDisabled}
		// Error before description: what is wrong is conveyed before the hint,
		// wherever the two parts sit in the page.
		aria-describedby={[editable.errorEl, editable.descriptionEl]}
		ui-empty={previewEmpty}
		ui-readonly={editable.readonly}
		onClick={(event) => {
			// `detail` is the platform's own click count, so no second event name and
			// no timer of our own.
			if (opensEdit(event.detail, editable.editOnDoubleClick)) editable.edit();
			onClick?.(event);
		}}
		onFocus={(event) => {
			if (editable.editOnFocus) editable.edit();
			onFocus?.(event);
		}}
	>{previewWords}</button>
}

// Hidden until a session opens. The write in `edit()` commits before the focus
// call there lands, which is the runtime's contract - a family that cannot focus
// what it just revealed files a witness rather than retrying.
export function EditableInput({ onKeydown, onBlur, ...rest }: EditableInputProps) @{
	const editable = editableState();
	const fieldHidden = computed(() => editable.editing !== true);
	const fieldInvalid = computed(() => (editable.invalid ? 'true' : 'false'));
	const fieldRequired = computed(() => (editable.required ? 'true' : 'false'));

	<input
		{...rest}
		el={editable.inputEl}
		type="text"
		autocomplete="off"
		hidden={fieldHidden}
		placeholder={editable.placeholder}
		disabled={editable.disabled}
		readonly={editable.readonly}
		aria-labelledby={editable.labelEl}
		aria-describedby={[editable.errorEl, editable.descriptionEl]}
		aria-invalid={fieldInvalid}
		aria-required={fieldRequired}
		onKeydown={(event) => {
			// Written out from event fields alone: the policy has to be readable
			// before the handler symbol loads.
			if (event.key === 'Enter' || event.key === 'Escape') event.preventDefault();

			const decision = editKey(event.key);
			const typed = (event.target as HTMLInputElement).value;
			if (decision === 'commit') editable.settle(typed, true);
			if (decision === 'cancel') editable.settle(typed, false);
			// Read here rather than inside the shared method: a singular handle read
			// from a method reaching across parts names no instance, and with two
			// editables on one page the runtime cannot say which preview it meant.
			// After the write, never before it, so the focus call lands.
			if (decision !== undefined) editable.triggerEl?.focus();
			onKeydown?.(event);
		}}
		onBlur={(event) => {
			// Focus is not taken back here: the person moved it somewhere themselves,
			// and stealing it is the classic inline-rename bug.
			const typed = (event.target as HTMLInputElement).value;
			editable.settle(typed, editable.cancelOnBlur !== true);
			onBlur?.(event);
		}}
	/>
}

export function EditableDescription({ children, ...rest }: EditableDescriptionProps) @{
	const editable = editableState();

	<div {...rest} el={editable.descriptionEl}>{children}</div>
}

// `role="alert"` so the message is spoken when it appears.
export function EditableError({ children, ...rest }: EditableErrorProps) @{
	const editable = editableState();

	<div {...rest} el={editable.errorEl} role="alert">{children}</div>
}

// The one element a form receives. `editable.input` carries no name of its own,
// so a value reaches the form whether or not anyone ever opened a session.
export function EditableField({ ...rest }: EditableFieldProps) @{
	const editable = editableState();

	<input {...rest} type="hidden" name={editable.name} value={editable.written} />
}
