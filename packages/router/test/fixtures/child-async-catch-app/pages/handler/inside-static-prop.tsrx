import { computed, state } from '@markless/core';
import { LabelledCaughtSaver } from '../../components/handler/caught-saver.tsrx';
import { loadThing } from '../../lib/save.ts';

export default function Page() @{
	let label = state('Invoice 7');
	const thing = computed(async () => loadThing());
	<main>
		@try {
			<p class="loads">loads {thing.loads}</p>
		} @pending {
			<p>Loading</p>
		}
		<button type="button" data-rename onClick={() => (label = 'Invoice 8')}>Rename</button>
		<LabelledCaughtSaver label={label} />
	</main>
}
