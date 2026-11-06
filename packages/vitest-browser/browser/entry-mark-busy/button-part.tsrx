import type { Children } from '@markless/core';

// Imported into wrapper-imported.tsrx: the forwarding component lives in a module the page
// never defines, so the entry mark has to be carried across the compiled component edge.
export function Button({ onClick, children }: { readonly onClick?: () => void; readonly children?: Children }) @{
	<button type="button" data-save onClick={onClick}>{children}</button>
}
