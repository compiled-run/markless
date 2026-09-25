import type { Children } from '@markless/core';
import Sidebar from '../docs/Sidebar.tsrx';

export default function DocsLayout({
	title,
	active,
	children,
}: {
	readonly title: string;
	readonly active: string;
	readonly children?: Children;
}) @{
	<div class="docs-layout">
		<Sidebar active={active} />
		<article>
			<h1>{title}</h1>
			{children}
		</article>
	</div>
}
