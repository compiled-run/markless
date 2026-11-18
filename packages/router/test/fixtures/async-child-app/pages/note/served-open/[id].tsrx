import { state } from '@markless/core';
import type { PageProps } from '@markless/router';
import NoteDetail from '../../../components/note-detail.tsrx';

export default function NoteServedOpen({ params, url }: PageProps<{ id: string }>) @{
	let open = state(true);
	<main>
		<button id="toggle" onClick={() => (open = !open)}>Toggle</button>
		@if (open) {
			<NoteDetail id={params.id} url={url} />
		}
	</main>
}
