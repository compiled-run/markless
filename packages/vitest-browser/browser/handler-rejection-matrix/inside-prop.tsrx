import { computed, state } from '@markless/core';
import { LabelledCaughtSaver } from './saver.tsrx';
import { loadThing } from './api.ts';

export function InsideProp() @{
	let label = state('Invoice 7');
	const thing = computed(async () => loadThing());
	<main>
		@try {
			<p data-loads>loads {thing.loads}</p>
		} @pending {
			<p>Loading</p>
		}
		<button type="button" data-rename onClick={() => (label = 'Invoice 8')}>Rename</button>
		<LabelledCaughtSaver label={label} />
	</main>
}
