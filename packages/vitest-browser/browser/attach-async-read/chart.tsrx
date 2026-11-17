import { computed } from '@markless/core';
import { draw, loadPoints } from './data.ts';

export function Chart() @{
	const points = computed(async () => loadPoints());

	<main>
		@try {
			<div data-chart attach={(el) => draw(el, points)} onIdle={() => {}}></div>
		} @pending {
			<p data-loading>Loading</p>
		}
	</main>
}
