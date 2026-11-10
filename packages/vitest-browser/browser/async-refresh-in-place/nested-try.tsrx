import { computed, state } from '@markless/core';
import { fetchAccount, fetchNotes } from './fetch-data.ts';

export default function NestedTry() @{
	let round = state(0);
	const account = computed(async () => await fetchAccount(round, 99));
	const notes = computed(async () => await fetchNotes(round));

	<main>
		<button data-again onClick={() => round++}>again</button>
		@try {
			<div>
				<h2>{account.name}</h2>
				<input data-field />
				@try {
					<ol>
						@for (const note of notes; key note.id) {
							<li data-note>{note.body}</li>
						}
					</ol>
				} @pending {
					<p>notes loading</p>
				}
			</div>
		} @pending {
			<p>loading</p>
		}
	</main>
}
