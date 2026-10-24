// Where a page server installs keep-parts (fns/keep-parts.ts); the renderer reads the same key, so browsers carry none of it.
export const KEEP_PARTS_HOOK: unique symbol = Symbol.for('markless.keep-parts') as never;

/** A child's markup, marked as kept when worth keeping; `projected` is the page's children as placed in it. */
export type KeepParts = (html: string, projected: string | undefined, child: object) => string;
