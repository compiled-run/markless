import type { PageProps } from '@markless/router';
import Frame from '../../../components/frame.tsrx';
import NoteCard from '../../../components/note-card.tsrx';

export default function NoteDeep({ params, url }: PageProps<{ id: string }>) @{
	<main>
		<Frame>
			<NoteCard id={params.id} url={url} />
		</Frame>
	</main>
}
