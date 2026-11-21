import { state } from '@markless/core';

const NAV = [
	{ kind: 'section', title: 'Start', pages: ['Install', 'First app'] },
	{ kind: 'link', title: 'Blog', pages: [] },
	{ kind: 'section', title: 'Guides', pages: ['State', 'Lists', 'Forms'] },
];
const SECTIONS = NAV.flatMap((entry) => (entry.kind === 'section' ? [entry] : []));

function Section({ title, count }: { readonly title: string; readonly count: number }) @{
	<li>{title}: {count} pages</li>
}

function NavList({ wide }: { readonly wide: boolean }) @{
	const rows = (section: (typeof SECTIONS)[number]) => ({
		title: wide ? section.title.toUpperCase() : section.title,
		count: section.pages.length,
	});
	const sections = SECTIONS.map(rows);
	<ul>
		@for (const section of sections; key section.title) {
			<Section title={section.title} count={section.count} />
		}
	</ul>
}

export default function App() @{
	let reads = state(0);
	<main>
		<h1>Guide</h1>
		<NavList wide={true} />
		<button onClick={() => (reads = reads + 1)}>Read {reads}</button>
	</main>
}
