import { state } from '@markless/core';

export default function Tuples() @{
	let pairs = state([['up', 2], ['party', 1]] as [string, number][]);
	function takeBack(face: string) {
		const at = pairs.findIndex(([name]) => name === face);
		const n = pairs[at]![1];
		if (n <= 1) pairs.splice(at, 1);
		else pairs.splice(at, 1, [face, n - 1]);
	}
	<main data-rows>
		@for (const [face, n] of pairs; key face) {
			<button onClick={() => takeBack(face)}>{face} {n}</button>
		}
	</main>
}
