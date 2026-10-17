import { computed } from '@markless/core';
import NoteForm from '../src/note-form.tsrx';

export default function FormStreamedPage() @{
	const note = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 60));
		return { title: 'streamed note' };
	});
	<main>
		@try {
			<NoteForm title={note.title} />;
		} @pending {
			<p data-note-pending>loading note</p>;
		}
	</main>;
}
