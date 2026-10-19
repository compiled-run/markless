import { state } from '@markless/core';
import { bump } from './static-prop-rows-bump.ts';

const HEADINGS = [
	{ id: 'intro', text: 'Intro' },
	{ id: 'usage', text: 'Usage' },
	{ id: 'faq', text: 'FAQ' },
];

function Contents({
	headings,
}: {
	readonly headings: ReadonlyArray<{ readonly id: string; readonly text: string }>;
}) @{
	<ul data-contents>
		@for (const heading of headings; key heading.id) {
			<li class={`entry-${heading.id}`}><a href={`#${heading.id}`}>{heading.text}</a></li>
		}
	</ul>
}

export function App() @{
	let count = state(0);

	<main>
		<output data-count>{count}</output>
		@if (count > 0) {
			<p data-clicked>clicked</p>
		}
		<button type="button" data-increment onClick={() => (count = bump(count))}>Increment</button>
		<Contents headings={HEADINGS} />
	</main>
}
