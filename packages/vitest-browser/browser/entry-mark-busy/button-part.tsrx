import type { Children } from '@markless/core';

// Lives in a module the page never defines, so the entry mark crosses a compiled component edge.
export function Button({ onClick, children }: { readonly onClick?: () => void; readonly children?: Children }) @{
	<button type="button" data-save onClick={onClick}>{children}</button>
}
