import { computed } from '@markless/core';
import NoteForm from '../src/note-form.tsrx';

export default function FormServedPage() @{
	const note = computed(async () => ({ title: 'served note' }));
	<main>
		@try {
			<NoteForm title={note.title} />;
		} @pending {
			<p>loading note</p>;
		}
	</main>;
}
