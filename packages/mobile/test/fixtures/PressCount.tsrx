import { state } from '@markless/core';

export default function PressCount() @{
	let note = state('none');
	<main>
		<button onClick={(event) => (note = event.detail >= 2 ? `twice (${event.detail})` : `once (${event.detail})`)}>
			Press
		</button>
		<p>{note}</p>
	</main>
}
