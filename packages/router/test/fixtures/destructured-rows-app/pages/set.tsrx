import { state } from '@markless/core';

export default function Faces() @{
	let faces = state(new Set(['up', 'party']));
	<main data-rows>
		@for (const face of faces; key face) {
			<button onClick={() => faces.delete(face)}>{face}</button>
		}
	</main>
}
