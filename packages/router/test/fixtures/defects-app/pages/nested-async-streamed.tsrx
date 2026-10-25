import { computed } from '@markless/core';
import { DockRow } from '../src/dock-row.tsrx';

export default function NestedAsyncStreamedPage() @{
	const berths = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 40));
		return [1, 2, 3];
	});
	<main>
		@try {
			<ul>
				@for (const berth of berths; key berth) {
					<DockRow berth={berth} />
				}
			</ul>
		} @pending {
			<p data-berths-wait>assigning berths</p>
		}
	</main>
}
