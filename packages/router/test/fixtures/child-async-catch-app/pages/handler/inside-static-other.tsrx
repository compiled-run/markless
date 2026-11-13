import { computed } from '@markless/core';
import { StaticCaughtSaver } from '../../components/handler/caught-saver.tsrx';
import { loadThing } from '../../lib/save.ts';

export default function Page() @{
	const thing = computed(async () => loadThing());
	<main>
		@try {
			<p class="loads">loads {thing.loads}</p>
		} @pending {
			<p>Loading</p>
		}
		<StaticCaughtSaver />
	</main>
}
