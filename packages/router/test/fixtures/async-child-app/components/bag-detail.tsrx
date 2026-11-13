import { computed, state } from '@markless/core';
import { loadNote } from '../lib/notes.ts';

export default function BagDetail(props: { readonly id: string; readonly url: { readonly search: string } }) @{
	let round = state(1);
	const note = computed(async () => loadNote(props.id, new URLSearchParams(props.url.search).get('tab') ?? 'none', round));
	<section>
		@try {
			<p id="note">{note}</p>
		} @pending {
			<p id="note-pending">loading {props.id}</p>
		} @catch (error) {
			<p id="note-failed">{(error as Error).message}</p>
		}
		<button id="again" onClick={() => round++}>Again</button>
	</section>
}
