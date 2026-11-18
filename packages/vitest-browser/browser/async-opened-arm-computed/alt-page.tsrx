import { computed, state } from '@markless/core';
import Panel from './alt-panel.tsrx';

export default function AltPage() @{
	let size = state(2);
	const names = computed(async () => Array.from({ length: size }, (_, i) => `n${i}`));

	<section>
		@try {
			<Panel names={names} />
		} @pending {
			<p>waiting</p>
		}
		<button data-grow onClick={() => size++}>grow</button>
	</section>
}
