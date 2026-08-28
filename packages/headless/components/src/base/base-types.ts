import type { PropsOf } from '@markless/core';

/**
 * A button. Give it `pressed` and it becomes a toggle button that reports
 * `aria-pressed` and flips on each activation; leave `pressed` off and it is an
 * ordinary button with no state of its own.
 */
export type ButtonProps = Pick<PropsOf<'button'>, 'children' | 'disabled'> & {
	/**
	 * Provide it and the button becomes a toggle button: it reports `aria-pressed`
	 * and flips on every activation. Omit it and this is a plain button, with no
	 * pressed state for a reader to announce.
	 */
	readonly pressed?: boolean;
	/**
	 * Called with the new state each time a person flips a toggle button. Omit it
	 * and the button still flips; the call site simply does nothing.
	 */
	readonly onChange?: (pressed: boolean) => void;
};

/**
 * A plain `<label>`. It wires nothing on its own: `for` is passed straight
 * through, so the consumer decides what it names. A family that owns its own
 * control ships its own label part instead, already pointed at that control.
 */
export type LabelProps = Pick<PropsOf<'label'>, 'children' | 'for'>;

/**
 * A display separator: a static `role="separator"` that divides content, with
 * no focus, no keys and no value. Give it `decorative` and it drops the role
 * entirely and hides from readers, for a rule that is only paint.
 *
 * A separator a person can move is not this part. ARIA gives `role="separator"`
 * two natures, and the focusable one is a window-splitter widget with value
 * semantics; that lives in the `resizable` family, which shares only the role
 * string.
 */
export type SeparatorProps = {
	/**
	 * Which way the separator runs, as the reader announces it. Defaults to
	 * `horizontal`, matching ARIA's own default for the role.
	 */
	readonly orientation?: 'horizontal' | 'vertical';
	/**
	 * Provide it and the separator is paint only: no role and `aria-hidden`, so
	 * no reader stops on a line that carries no meaning.
	 */
	readonly decorative?: boolean;
};

/**
 * Content that is hidden from sight but still reached by screen readers and
 * still focusable. The clipping style is written inline and no class ships, so
 * no consumer stylesheet can collide with it.
 */
export type VisuallyHiddenProps = Pick<PropsOf<'span'>, 'children'>;
