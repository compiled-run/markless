import Sidebar from '../docs/Sidebar.tsrx';

export default function DocsLayout({
	title,
	active,
}: {
	readonly title: string;
	readonly active: string;
}) @{
	<header class="docs-layout">
		<Sidebar active={active} />
		<h1>{title}</h1>
	</header>
}
