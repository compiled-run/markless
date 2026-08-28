import type { PropsOf, Seeded } from '@markless/core';

/**
 * A taglist is a row of committed `string[]` values. Mount `taglist.input`
 * inside it and the static row becomes a tokenizing field; leave it out and the
 * row is display-only, with its delete buttons still fully operable.
 *
 * There is no collection role here on purpose. `option` has presentational
 * children, so a delete button inside one is unreachable; `grid` would need a
 * row and a cell part per tag and cannot contain the text field at all. The root
 * is a plain `role="group"`, each tag's delete button is a real button whose name
 * carries the tag's words, and the root's always-mounted live region is what
 * speaks every change. The reasoning is in `note.md`.
 */
export type TagListRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** The committed tags, in order. Omit it and the list starts empty. */
	readonly value?: readonly string[];
	/** Nobody can add, edit or remove a tag. */
	readonly disabled?: boolean;
	/** At least one tag is needed before the form submits. */
	readonly required?: boolean;
	/** The control is in an invalid state, reported as `aria-invalid` on the input. */
	readonly invalid?: boolean;
	/**
	 * The most tags this list will hold. `0` is no limit — `Infinity` does not
	 * survive serialization. A refused add is spoken by the live region rather
	 * than dropped in silence.
	 */
	readonly max?: number;
	/**
	 * The character that commits the typed text, and the character a paste is
	 * split on. Defaults to a comma.
	 */
	readonly delimiter?: string;
	/**
	 * A tag can be opened for editing in place: Enter on a highlighted tag while
	 * the caret is in the field, F2 on a tag that has focus, or a double-click on
	 * the tag itself. Off by default, like every other behavioural boolean in this
	 * package.
	 */
	readonly editable?: boolean;
	/** Submitted under this name by `taglist.field`, one entry per tag. */
	readonly name?: string;
	/** Called with the whole list every time it changes. */
	readonly onChange?: (value: readonly string[]) => void;
};

/**
 * The graph cells every taglist part reads and writes: the root's seeded fields,
 * plus the four this family needs that no prop names. The `element()` handles,
 * the consumer's callback and the shared methods are not cells and are not
 * listed here; they are added to the instance the factory returns.
 *
 * `highlighted` is the split focus model: DOM focus stays in the text field while
 * the walk moves a highlight that is family state, keyed by the tag's own value.
 * `''` means the caret is in the field with no tag under the walk.
 *
 * `editing` names the tag whose edit input is showing, and `spoken` is what the
 * root's live region is saying.
 */
export type TagListInstanceState = Seeded<
	TagListRootProps,
	'value' | 'disabled' | 'required' | 'invalid' | 'max' | 'delimiter' | 'editable' | 'name'
> & {
	/** The text in the field. */
	input: string;
	/** The highlighted tag's value, or '' when the caret owns the walk. */
	highlighted: string;
	/** The tag whose edit input is showing, or '' when none is. */
	editing: string;
	/** What the root's live region is saying. */
	spoken: string;
	onChange?: TagListRootProps['onChange'];
};

/**
 * One tag. Its `value` is its identity: the highlight, the edit target and the
 * repeat's key are all this string, which is why the list holds no duplicates and
 * why no part in this family takes an index.
 */
export type TagListItemProps = PropsOf<'div'> & {
	/** This tag's words, and its identity. Required: no index stands in for it. */
	readonly value: string;
};

/**
 * One instance per rendered `taglist.item`. The parts inside a tag read this
 * rather than the taglist, which is how a delete button knows which tag it
 * removes.
 */
export type TagListItemInstanceState = Seeded<TagListItemProps, 'value'>;

/**
 * The list's name. It labels `taglist.input` when one is mounted, and names the
 * root through `aria-labelledby` either way, so a display-only row is named too.
 */
export type TagListLabelProps = PropsOf<'label'>;

/**
 * The tokenizing field. Mounting it is what turns a static row into a tags input.
 * It owns the delimiter, Enter, Escape, Backspace, Delete and the caret-aware
 * arrow walk; a consumer's own handlers run after the family's.
 */
export type TagListInputProps = PropsOf<'input'>;

/** The tag's words. Hidden while that tag is being edited. */
export type TagListItemLabelProps = PropsOf<'span'>;

/**
 * The delete affordance, and a real button: it is the only element in a chip a
 * person operates, so it is the one a reader lands on. Its accessible name
 * defaults to `Remove <value>`; pass your own `aria-label` and that wins.
 *
 * It is an ordinary tab stop in both shapes. A roving tabindex is what React
 * Aria's `role="grid"` licenses, and without that role a button in flow content
 * that Tab cannot reach is a WCAG 2.1.1 hazard.
 */
export type TagListItemCloseProps = PropsOf<'button'>;

/**
 * The inline-edit field for one tag, `hidden` unless that tag is the one being
 * edited. Enter commits, Escape restores, blur commits. Mount it only under
 * `editable`; without that prop nothing ever shows it.
 */
export type TagListItemInputProps = PropsOf<'input'>;

/**
 * Supporting text for the field, named by the input's `aria-describedby`. Mount
 * it alongside `taglist.error` and the input names both, the error first.
 */
export type TagListDescriptionProps = PropsOf<'div'>;

/**
 * The validation message, named by the input's `aria-describedby` ahead of
 * `taglist.description`. It carries `role="alert"`, so a reader speaks it when it
 * appears. Mounting it does not mark the field invalid: `invalid` is a prop on
 * `taglist.root`.
 */
export type TagListErrorProps = PropsOf<'div'>;

/**
 * The form integration: one hidden input per tag, all under the root's `name`, so
 * the browser hands a submit handler `formData.getAll(name)`. It takes no
 * configuration of its own.
 *
 * A hidden input cannot carry `required`, so the root's `required` reaches a
 * person through `aria-required` on `taglist.input` rather than through the
 * browser's own validation.
 */
export type TagListFieldProps = PropsOf<'div'>;
