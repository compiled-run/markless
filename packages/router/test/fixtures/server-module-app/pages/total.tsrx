import { computed } from '@markless/core';
import { loadTotal } from '../src/total.ts';

export default function Total() @{
	const shown = computed(async () => loadTotal());

	<main>
		@try {
			<p data-total>{shown}</p>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
