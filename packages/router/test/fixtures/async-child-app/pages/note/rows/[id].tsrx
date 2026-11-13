import type { PageProps } from '@markless/router';
import NoteRow from '../../../components/note-row.tsrx';

export default function NoteRows({ params, url }: PageProps<{ id: string }>) @{
	const parts = ['a', 'b'];
	<main>
		<ul>
			@for (const part of parts; key part) {
				<NoteRow id={params.id} url={url} part={part} />
			}
		</ul>
	</main>
}
