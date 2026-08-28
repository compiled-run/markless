import type { PropsOf } from '@markless/core';

/**
 * Inline rename: one string shown as a control a person presses, and edited in
 * place in a text field that takes the same room.
 *
 * The preview control is `editable.trigger` — a real `<button>` carrying the
 * value's own words, which is the established role for "the control that
 * activates". Ark's focusable `<span>` with an `aria-label` of "edit" is the
 * ecosystem's shape and it loses the value from the announcement; the reasoning,
 * and the rest of the survey, is in
 * `goals/headless-components/notes/U698-editable.md`.
 */
export type EditableRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/**
	 * The value now. Passing this makes the family controlled: a commit reports
	 * through `onChange` and the preview shows nothing new until the words come
	 * back in. Leave it out and the family keeps its own.
	 */
	readonly value?: string;
	/** The value an uncontrolled editable starts with. Omit it and it starts empty. */
	readonly defaultValue?: string;
	/**
	 * The words the preview shows while the value is empty, and the input's own
	 * `placeholder`. Give one to anything that can be empty: the preview is a
	 * button, and a button with no words has no accessible name.
	 */
	readonly placeholder?: string;
	/**
	 * Two clicks open the session rather than one. A single click then does
	 * nothing — but Enter and Space on the preview still open it, because a
	 * gesture only a mouse can make is not a keyboard-operable control.
	 */
	readonly editOnDoubleClick?: boolean;
	/** Landing on the preview at all opens the session, Tab included. */
	readonly editOnFocus?: boolean;
	/**
	 * Moving focus out of the input gives the previous value back instead of
	 * taking the words.
	 *
	 * Off by default, so blur commits: a person who clicked away from a field
	 * they were typing in meant what they had written, which is the same ruling
	 * taglist's per-tag edit already ships. Ark spells this end of the knob
	 * `submitMode: 'enter' | 'none'`; there are no mode enums here.
	 */
	readonly cancelOnBlur?: boolean;
	/**
	 * The value is shown, not edited. The preview stays focusable and readable —
	 * a read-only rename target is still a value somebody has to be able to hear —
	 * and no gesture opens a session.
	 */
	readonly readonly?: boolean;
	/** Nobody can open a session, and the preview leaves the tab order. */
	readonly disabled?: boolean;
	/** A value is needed before the form submits, reported as `aria-required`. */
	readonly required?: boolean;
	/** The value is in an invalid state, reported as `aria-invalid` on the input. */
	readonly invalid?: boolean;
	/** The name `editable.field` submits the value under. */
	readonly name?: string;
	/** Called with the new words every time a session commits a change. */
	readonly onChange?: (value: string) => void;
	/**
	 * Called with `true` when a session opens and `false` when it closes, however
	 * it closed. A commit that changed something calls `onChange` first.
	 *
	 * Zag's `onValueCommit`/`onValueRevert` pair maps onto these two: the commit
	 * is `onChange`, and a revert is the `false` that arrives without one.
	 */
	readonly onEditChange?: (editing: boolean) => void;
};

/**
 * The cells every part reads and writes. One instance per editable.
 *
 * The value arrives from three places and `heldText` picks between them:
 * `given` is the `value` prop and being defined is what "controlled" means,
 * `held` is the family's own last write and is `null` until there is one, and
 * `seed` is `defaultValue`. `editing` is the whole mode machine — preview when
 * false, edit when true.
 */
export type EditableInstanceState = {
	/** `defaultValue`, untouched. */
	seed: string;
	/** The `value` prop. Defined means controlled. */
	given: string | undefined;
	/** The family's own value, and `null` until a session has committed one. */
	held: string | null;
	placeholder: string;
	editOnDoubleClick: boolean;
	editOnFocus: boolean;
	cancelOnBlur: boolean;
	readonly: boolean;
	disabled: boolean;
	required: boolean;
	invalid: boolean;
	name: string;
	/** A session is open: the input is showing and the preview is not. */
	editing: boolean;
	onChange?: EditableRootProps['onChange'];
	onEditChange?: EditableRootProps['onEditChange'];
};

/**
 * The root's own element, one component deeper than `editable.root`.
 *
 * A widget root cannot read its own instance token, so the element that carries
 * `aria-labelledby` has to sit inside the root rather than be it.
 */
export type EditableBoxProps = PropsOf<'div'>;

/**
 * The value's name. It points at `editable.input` with `for`, names the root
 * through `aria-labelledby`, and a click on it lands focus on whichever of the
 * two elements is currently showing.
 */
export type EditableLabelProps = PropsOf<'label'>;

/**
 * The preview control: a real `<button>` whose words are the value, or the
 * placeholder while there is none.
 *
 * It renders the value rather than taking children, because a part cannot tell
 * whether it was given any and a fallback branch would render nothing for
 * everybody. Style it into looking like text; it is a button so that a person
 * who cannot use a mouse can open the session, and so that a reader announces
 * both the words and the fact that they can be changed.
 */
export type EditableTriggerProps = Omit<PropsOf<'button'>, 'children'>;

/**
 * The field the words are edited in, `hidden` until a session opens. Enter
 * commits, Escape gives the previous value back, and blur commits unless
 * `cancelOnBlur` says otherwise.
 *
 * It carries no `name`: `editable.field` is the one element a form receives, so
 * that a value reaches the form whether or not anyone ever opened a session.
 * Native attributes the family does not own — `maxlength`, `spellcheck`,
 * `inputmode` — pass straight through.
 */
export type EditableInputProps = PropsOf<'input'>;

/**
 * Supporting text, named by the `aria-describedby` of both the preview and the
 * input, so the hint is there in either mode.
 */
export type EditableDescriptionProps = PropsOf<'div'>;

/**
 * The validation message, named ahead of `editable.description`. It carries
 * `role="alert"`, so a reader speaks it when it appears. Mounting it does not
 * mark the value invalid: `invalid` is a prop on `editable.root`.
 */
export type EditableErrorProps = PropsOf<'div'>;

/**
 * The form integration: one `input type="hidden"` under the root's `name`,
 * carrying the committed value.
 *
 * A hidden input cannot carry `required`, which is why the root's `required`
 * reaches a person through `aria-required` on the editing field rather than
 * through the browser's own validation.
 */
export type EditableFieldProps = PropsOf<'input'>;
