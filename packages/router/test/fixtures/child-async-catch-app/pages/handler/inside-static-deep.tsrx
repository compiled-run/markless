import { computed } from '@markless/core';
import { StaticCaughtWrapper } from '../../components/handler/caught-wrapper.tsrx';
import { loadThing } from '../../lib/save.ts';

export default function Page() @{
	const thing = computed(async () => loadThing());
	<main>
		@try {
			<p class="loads">loads {thing.loads}</p>
		} @pending {
			<p>Loading</p>
		}
		<StaticCaughtWrapper />
	</main>
}
