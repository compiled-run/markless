// Keyboard helpers the figure toys share.
type Target = { readonly tagName?: string; readonly isContentEditable?: boolean; closest?: (selector: string) => unknown } | null;

/** True for a key the page-wide listener must leave alone: a shortcut, a key meant for a field or dialog, or one the focused key already handles. */
export function ignoredKey(
	pressed: { readonly key: string; readonly metaKey: boolean; readonly ctrlKey: boolean; readonly altKey: boolean },
	focused: Target,
	figure: { contains?: (node: never) => boolean },
): boolean {
	if (pressed.metaKey || pressed.ctrlKey || pressed.altKey || pressed.key === 'Tab' || pressed.key === 'Escape') return true;
	if (!focused) return false;
	if (figure.contains?.(focused as never)) return true;
	const tag = (focused.tagName ?? '').toLowerCase();
	if (tag === 'input' || tag === 'textarea' || tag === 'select' || focused.isContentEditable) return true;
	return Boolean(focused.closest?.('dialog, [role="dialog"], [role="combobox"], [role="searchbox"]'));
}

/** Keeps a key a figure has taken from also scrolling the page (Space) or going back (Backspace). */
export function keep(pressed: { preventDefault(): void }): void {
	pressed.preventDefault();
}
