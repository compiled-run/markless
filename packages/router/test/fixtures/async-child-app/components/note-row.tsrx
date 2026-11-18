import { computed, state } from '@markless/core';
import { loadNote } from '../lib/notes.ts';

export default function NoteRow({ id, url, part }: { readonly id: string; readonly url: { readonly search: string }; readonly part: string }) @{
	let round = state(1);
	const note = computed(async () => loadNote(`${id}-${part}`, new URLSearchParams(url.search).get('tab') ?? 'none', round));
	<li data-part={part}>
		@try {
			<span data-note>{note}</span>
		} @pending {
			<span data-note-pending>loading {part}</span>
		} @catch (error) {
			<span data-note-failed>{(error as Error).message}</span>
		}
		<button data-again onClick={() => round++}>Again</button>
	</li>
}
