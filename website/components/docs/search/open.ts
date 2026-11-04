import { loadSearchIndex } from './search-load.ts';

/** The attribute on the hidden button inside `<DocsSearch />` that every opener presses. */
export const OPENER_ATTRIBUTE = 'data-docs-search-open';

/**
 * Opens the docs search dialog with the caret in its field. Call it from any click handler on the
 * page, a `navbar.trigger` included; it presses the dialog's own hidden opener, which is the one
 * handler that can reach the field to focus it.
 */
export function openDocsSearch(): void {
	document.querySelector<HTMLElement>(`[${OPENER_ATTRIBUTE}]`)?.click();
}

/** Starts loading the index before the dialog opens; call it on hover or focus of a search button. */
export function warmDocsSearch(): void {
	loadSearchIndex().catch(() => {});
}
