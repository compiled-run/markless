import type { PropsOf } from '@markless/core';

/**
 * One chosen file, as the graph holds it. Every field is a plain value, because
 * the array lives in a `state()` cell and has to survive being written into the
 * page and read back after resume. The `File` itself cannot: it stays beside the
 * real `<input type="file">` in `fileupload-files.ts`, keyed by that element.
 *
 * `id` is minted per upload and is what a keyed repeat and the remove button
 * identify a row by; two files with the same name each get their own.
 */
export type FileRecord = {
	readonly id: string;
	readonly name: string;
	readonly size: number;
	readonly type: string;
	readonly lastModified: number;
};

/**
 * The upload itself; the label, the drop area, the browse button, the real field
 * and the list of chosen files all go inside it. It holds the restrictions and
 * reports `ui-disabled` for styling.
 *
 * There is no `value` prop: a `FileList` cannot be built from markup, so the
 * chosen files always start empty and are only ever added by a person.
 */
export type FileUploadRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** What the picker offers and what a drop is filtered against, e.g. `image/*,.pdf`. */
	readonly accept?: string;
	/** More than one file may be chosen; without it a new choice replaces the old one. */
	readonly multiple?: boolean;
	/** Nothing can be chosen: the button is disabled and drops are ignored. */
	readonly disabled?: boolean;
	/** A file must be chosen before a form submits. */
	readonly required?: boolean;
	/** Submitted under this name by the real field the family renders. */
	readonly name?: string;
	/** Called with the chosen files whenever they change. */
	readonly onChange?: (files: readonly FileRecord[]) => void;
};

/** The cells every fileupload part reads and writes. One instance per upload. */
export type FileUploadInstanceState = {
	files: FileRecord[];
	accept: string;
	multiple: boolean;
	disabled: boolean;
	required: boolean;
	name: string;
	/** True while a drag is over the drop area, so a consumer can style it. */
	dragging: boolean;
	/** The consumer's own callback, stored by the root for the methods to call. */
	onChange?: FileUploadRootProps['onChange'];
};

/** The upload's name. Its `for` points at the real field, which is what names it for a reader. */
export type FileUploadLabelProps = PropsOf<'label'>;

/**
 * The region a file can be dropped onto. It carries no role and no tabindex on
 * purpose: dropping is a pointer enhancement and the browse button is the
 * keyboard route, so a second tab stop here would do nothing the button does not.
 * It reports `ui-dragging` and `ui-disabled`.
 */
export type FileUploadDropAreaProps = PropsOf<'div'>;

/** The button that opens the file picker. This is the keyboard and reader route in. */
export type FileUploadTriggerProps = PropsOf<'button'>;

/**
 * The real `<input type="file">`. It is clipped, `aria-hidden` and out of the tab
 * order, so nothing but the family and the picker ever touch it — but it is the
 * element that actually submits, and the family keeps its `files` in step with
 * the rows on the page, dropped files included.
 */
export type FileUploadFieldProps = PropsOf<'input'>;

/** One chosen file's row. Everything it shows comes from the `file` record it is given. */
export type FileUploadItemProps = PropsOf<'div'> & {
	/** The file this row shows. */
	readonly file: FileRecord;
};

/** One instance per rendered `fileupload.item`, read by the parts inside it. */
export type FileUploadItemInstanceState = {
	id: string;
	name: string;
};

/**
 * The file's name. Leave it empty and it renders the name the record carries;
 * give it children and they are shown instead.
 */
export type FileUploadItemLabelProps = PropsOf<'span'>;

/**
 * The button that takes the file it sits in off the list. It takes no id: the
 * item around it holds one. Give it an `aria-label` — the visible character is
 * usually a cross, which a reader would otherwise announce as "times".
 */
export type FileUploadItemCloseProps = PropsOf<'button'>;
