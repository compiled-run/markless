import { state } from '@markless/core';

function Track(props: { title: string }) @{
	let plays = state(0);

	<li data-track onClick={() => plays = plays + 1}>{props.title} {plays}</li>
}

export function App() @{
	let titles = state(['intro', 'verse']);

	<main data-multi-child>
		<button type="button" data-add onClick={() => titles.push(`chorus${titles.length}`)}>Add</button>
		<ol>
			@for (const title of titles; key title) {
				<Track title={title} />
			}
		</ol>
	</main>
}
