import { state } from '@markless/core';
import { Note } from './note.tsrx';

export default function Notes() @{
	let titles = state(['Alpha']);

	<main>
		<button data-add-note onClick={() => (titles = [...titles, 'Beta'])}>Add</button>
		@for (const title of titles; key title) {
			<Note title={title} />
		}
	</main>
}
