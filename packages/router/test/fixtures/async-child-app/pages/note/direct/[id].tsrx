import type { PageProps } from '@markless/router';
import NoteDetail from '../../../components/note-detail.tsrx';

export default function NoteDirect({ params, url }: PageProps<{ id: string }>) @{
	<main>
		<NoteDetail id={params.id} url={url} />
	</main>
}
