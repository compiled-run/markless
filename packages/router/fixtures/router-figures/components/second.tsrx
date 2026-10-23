import { state } from '@markless/core';
import { sheet } from './second.art.ts';

export default function Second() @{
	let stamped = state(false);

	<section data-second data-stamped={stamped ? sheet.stamp : 'no'}>
		<svg>
			@for (const line of sheet.lines; key line.key) {
				<path data-line={line.key} d={line.d} />
			}
		</svg>
		<button data-stamp onClick={() => (stamped = !stamped)}>stamp</button>
	</section>
}
