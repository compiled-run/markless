import { computed, state } from '@markless/core';
import { getMessages } from './gate.ts';

export function InlineSlice() @{
	let shown = state(1);
	let round = state(0);
	const messages = computed(async () => await getMessages(round));

	<section>
		<button data-more onClick={() => shown++}>more</button>
		<button data-again onClick={() => round++}>again</button>
		@try {
			<div>
				@for (const message of messages.slice(0, shown); key message.id) {
					<p data-message>{message.subject}</p>
				}
			</div>
		} @pending {
			<span data-loading>…</span>
		}
	</section>
}
