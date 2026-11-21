import { computed, storage } from '@markless/core';
import { Link } from '@markless/router';
import { parseNotes } from '../lib/notes.ts';

export default function AllNotes() @{
	let saved = storage('notes', '[]');
	const count = computed(() => parseNotes(saved).length);
	<main>
		<title>All notes</title>
		<h1>All notes</h1>
		@if (count === 0) {
			<p>No notes yet</p>
		}
		<Link href="/new">Write your first note</Link>
	</main>
}
