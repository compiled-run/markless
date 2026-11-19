import { state } from '@markless/core';

export default function Reactions() @{
	let counts = state(new Map([['up', 2], ['party', 1]]));
	function takeBack(face: string) {
		const n = counts.get(face) ?? 0;
		if (n <= 1) counts.delete(face);
		else counts.set(face, n - 1);
	}
	<div data-rows>
		@for (const [face, n] of counts; key face) {
			<button onClick={() => takeBack(face)}>{face} {n}</button>
		}
	</div>
}
