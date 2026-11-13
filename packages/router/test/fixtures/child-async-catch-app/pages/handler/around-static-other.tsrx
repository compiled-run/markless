import { computed } from '@markless/core';
import Saver from '../../components/handler/saver.tsrx';
import { loadThing } from '../../lib/save.ts';

export default function Page() @{
	const thing = computed(async () => loadThing());
	<main>
		@try {
			<div>
				<p class="loads">loads {thing.loads}</p>
				<Saver />
			</div>
		} @pending {
			<p>Loading</p>
		} @catch (error) {
			<p class="caught">caught: {error.message}</p>
		}
	</main>
}
