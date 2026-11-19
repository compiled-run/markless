import { state } from '@markless/core';

export default function Entries() @{
	let counts = state({ up: 2, party: 1 });
	let taken = state<string[]>([]);
	function takeBack(face: string) {
		taken.push(face);
	}
	<main>
		<p data-rows>
			@for (const [face, n] of Object.entries(counts); key face) {
				<button onClick={() => takeBack(face)}>{face} {n}</button>
			}
		</p>
		<output data-taken>{taken.join(',')}</output>
	</main>
}
