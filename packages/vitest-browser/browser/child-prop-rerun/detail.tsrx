import { computed, state } from '@markless/core';
import { loadNote, saveNote } from './load.ts';

export default function Detail({ id, url }: { readonly id: string; readonly url: { readonly search: string } }) @{
	let round = state(1);
	const note = computed(async () => loadNote(id, new URLSearchParams(url.search).get('tab') ?? 'none', round));
	<section>
		@try {
			<p data-note>{note}</p>
		} @pending {
			<p data-note-pending>loading {id}</p>
		} @catch (error) {
			<p data-note-failed>{(error as Error).message}</p>
		}
		<button data-again onClick={() => round++}>Again</button>
		<button
			data-save
			onClick={async () => {
				await saveNote(id);
				round++;
			}}
		>
			Save
		</button>
	</section>
}
