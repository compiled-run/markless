import { computed } from '@markless/core';
import { loadCounts } from '../src/count.ts';

export default function Home() @{
	const counts = computed(async () => loadCounts());

	<main>
		@try {
			<p data-counts>{counts}</p>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
