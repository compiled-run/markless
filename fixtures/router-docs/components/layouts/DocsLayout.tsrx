import { Sidebar } from '../docs/Sidebar.tsrx';

export function DocsLayout({ children }: { readonly children?: unknown }) @{
	<div class="docs-layout">
		<Sidebar active="getting-started" />
		<section>{children}</section>
	</div>
}
