/**
 * The family's imperative write onto an element it did not render, reached
 * through the handle the consumer bound. Fluent's tooltip does exactly this and
 * preserves whatever name was already there rather than clobbering it.
 *
 * `setProperty` rather than `style.anchorName`, because the DOM lib in this tree
 * does not declare the typed property yet.
 */
export function nameAnchor(el: Element | undefined, name: string): string {
	if (!(el instanceof HTMLElement)) return '';
	const existing = el.style.getPropertyValue('anchor-name').trim();
	const next = existing !== '' && existing !== 'none' ? existing : name;
	el.style.setProperty('anchor-name', next);
	return next;
}
