import { computed, state } from '@markless/core';
import { getMessages } from './gate.ts';

export default function InlineFilter() @{
	let round = state(0);
	let query = state('');
	const messages = computed(async () => await getMessages(round));

	<main>
		<button data-again onClick={() => round++}>again</button>
		<input data-query value={query} onInput={(event) => (query = event.currentTarget.value)} />
		@try {
			<ol>
				@for (const message of messages.filter((entry) => entry.subject.startsWith(query)); key message.id) {
					<li data-message>{message.subject}</li>
				}
			</ol>
		} @pending {
			<p data-loading>Loading…</p>
		}
	</main>
}
