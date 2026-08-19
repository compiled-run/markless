import type { Children } from '@markless/core';

export function DocsLayout({ children }: { readonly children?: Children }) @{
	<div class="docs-layout">{children}</div>
}
