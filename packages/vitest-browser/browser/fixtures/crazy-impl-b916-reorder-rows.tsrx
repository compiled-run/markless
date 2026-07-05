import { state } from '@markless/core';

export function App() @{
	let entries = state([
		{ code: 'alpha', title: 'Alpha' },
		{ code: 'beta', title: 'Beta' },
		{ code: 'gamma', title: 'Gamma' },
	]);
	let chosen = state('none');

	<main>
		<button type="button" data-reverse onClick={() => entries = [
			{ code: 'gamma', title: 'Gamma' },
			{ code: 'beta', title: 'Beta' },
			{ code: 'alpha', title: 'Alpha' },
		]}>Reverse</button>
		<section>
			@for (const entry of entries; key entry.code) {
				<article>
					<h2>{entry.title}</h2>
					<button type="button" onClick={() => chosen = entry.code}>Choose</button>
				</article>
			}
		</section>
		<output data-chosen>{chosen}</output>
	</main>
}
