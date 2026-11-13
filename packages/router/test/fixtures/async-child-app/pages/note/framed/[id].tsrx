import type { PageProps } from '@markless/router';
import Frame from '../../../components/frame.tsrx';
import NoteDetail from '../../../components/note-detail.tsrx';

export default function NoteFramed({ params, url }: PageProps<{ id: string }>) @{
	<main>
		<Frame>
			<NoteDetail id={params.id} url={url} />
		</Frame>
	</main>
}
