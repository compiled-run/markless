// Where a page server installs keep-parts (fns/keep-parts.ts); the renderer reads the same key, so browsers carry none of it.
export const KEEP_PARTS_HOOK: unique symbol = Symbol.for('markless.keep-parts') as never;

/** A child's markup, marked as kept when worth keeping; `projected` is the page's children as placed in it. */
export type KeepParts = (html: string, projected: string | undefined, child: object) => string;

// The masked markup the renderer builds beside the html while keep-parts is installed. None of these is valid in served
// markup: an attribute value slot is VALUE name SPAN escaped-value END, a whole attribute slot is ATTRIBUTE name SPAN
// rendered-attribute END, a text slot is TEXT before its text, and the `{children}` slot is CHILDREN alone.
export const KEEP_VALUE = '\u0001';
export const KEEP_ATTRIBUTE = '\u0004';
export const KEEP_SPAN = '\u0002';
export const KEEP_END = '\u0003';
export const KEEP_TEXT = '\u0005';
export const KEEP_CHILDREN = '\u0006';
