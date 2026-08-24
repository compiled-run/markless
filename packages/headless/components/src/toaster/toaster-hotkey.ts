/**
 * The stack's keyboard shortcut, as a behavior.
 *
 * A behavior is the only primitive handed a live element, and it reaches nothing
 * else: it cannot write graph state. That is exactly enough here - the shortcut
 * moves focus and stamps `ui-expanded` on the region itself, and both are facts
 * about one element rather than data the page has to resume with.
 */
export function installStackHotkey(hotkey: string) {
	return (host: HTMLElement) => {
		const document = host.ownerDocument;
		let opener: Element | null = null;

		const expand = () => {
			// Where focus was, so leaving the stack can put it back. Read before the
			// stack takes focus, because afterwards the answer is the stack itself.
			if (host.contains(document.activeElement) !== true) opener = document.activeElement;
			host.setAttribute('ui-expanded', '');
			host.focus();
		};

		const collapse = () => {
			host.removeAttribute('ui-expanded');
			const back = opener;
			opener = null;
			if (back instanceof HTMLElement) back.focus();
		};

		const onKeydown = (event: KeyboardEvent) => {
			if (event.key === hotkey) {
				event.preventDefault();
				expand();
				return;
			}
			// Escape only answers while the stack itself holds focus, so it never
			// takes an Escape a dialog or a listbox was owed.
			if (event.key === 'Escape' && host.contains(document.activeElement)) collapse();
		};

		document.addEventListener('keydown', onKeydown);
		return () => {
			document.removeEventListener('keydown', onKeydown);
		};
	};
}
