import { computed, state } from '@markless/core';
import { loadNote } from './load.ts';

export default function BagDetail(props: { readonly id: string; readonly url: { readonly search: string } }) @{
	let round = state(1);
	const note = computed(async () => loadNote(props.id, new URLSearchParams(props.url.search).get('tab') ?? 'none', round));
	<section>
		@try {
			<p data-note>{note}</p>
		} @pending {
			<p data-note-pending>loading {props.id}</p>
		} @catch (error) {
			<p data-note-failed>{(error as Error).message}</p>
		}
		<button data-again onClick={() => round++}>Again</button>
	</section>
}
