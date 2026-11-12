import { state } from '@markless/core';

export default function Presses() @{
	let presses = state(0);
	let note = state('');

	<section>
		<button
			onClick={() => {
				presses++;
				if (presses === 3) note = 'Pressed three times';
			}}
		>
			Press
		</button>
		<p>{note}</p>
	</section>
}
