import { state } from '@markless/core';
import { Details, Meter } from '../src/direction-details.tsrx';

export default function PropNameCollisionPage() @{
	let direction = state('right');
	let level = state(1);
	<main>
		<button
			type="button"
			data-toggle
			onClick={() => {
				direction = direction === 'right' ? 'bottom' : 'right';
				level = level + 1;
			}}
		>
			toggle
		</button>
		<Details direction={direction} />
		<Meter level={level} side="left" />
	</main>;
}
