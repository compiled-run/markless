import { computed, state } from '@markless/core';
import { fetchNotes } from './fetch-data.ts';

export default function BareRows() @{
	let round = state(0);
	const notes = computed(async () => await fetchNotes(round));

	<div>
		<button data-again onClick={() => round++}>again</button>
		<ul>
			@try {
				@for (const note of notes; key note.id) {
					<li data-note>
						<span>{note.body}</span>
						<input />
					</li>
				}
			} @pending {
				<li>loading</li>
			}
		</ul>
	</div>
}
