import type { Children } from '@markless/core';
import { Sidebar } from '../docs/Sidebar.tsrx';

export function DocsLayout({ children }: { readonly children?: Children }) @{
	<div class="docs-layout">
		<Sidebar active="getting-started" />
		<section>{children}</section>
	</div>
}
