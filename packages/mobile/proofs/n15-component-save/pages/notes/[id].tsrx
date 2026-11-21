import { computed, storage } from '@markless/core';
import type { PageProps } from '@markless/router';
import { parseNotes } from '../../lib/notes.ts';

export default function NotePage({ params }: PageProps<{ id: string }>) @{
	let saved = storage('notes', '[]');
	const note = computed(() => parseNotes(saved).find((entry) => entry.id === params.id));
	<main>
		<title>Note</title>
		@if (note) {
			<>
				<h1>{note.title}</h1>
				<p>{note.pinned ? 'Pinned' : 'Not pinned'}</p>
				<p>{note.tag}</p>
			</>
		} @else {
			<h1>No such note</h1>
		}
	</main>
}
