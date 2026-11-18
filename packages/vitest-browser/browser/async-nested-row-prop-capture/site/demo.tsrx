import { computed, state } from '@markless/core';
import Main from './todos.tsrx';

export default function SiteDemo() @{
	let reload = state(0);
	let run = state(0);
	const runs = computed(() => [{ run, reload }]);

	<section>
		<button type="button" data-run-again onClick={() => (run = run + 1)}>Run again</button>
		<button type="button" data-reload onClick={() => (reload = reload + 1)}>Reload</button>
		@for (const item of runs; key item.run) {
			<Main reload={item.reload} />
		}
	</section>
}
