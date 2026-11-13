import { state } from '@markless/core';
import type { PageProps } from '@markless/router';
import NoteDetail from '../../../components/note-detail.tsrx';

export default function NoteOpened({ params, url }: PageProps<{ id: string }>) @{
	let open = state(false);
	<main>
		<button id="open" onClick={() => (open = true)}>Open</button>
		@if (open) {
			<NoteDetail id={params.id} url={url} />
		}
	</main>
}
