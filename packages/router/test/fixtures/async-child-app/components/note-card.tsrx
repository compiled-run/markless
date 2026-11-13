import NoteDetail from './note-detail.tsrx';

export default function NoteCard({ id, url }: { readonly id: string; readonly url: { readonly search: string } }) @{
	<article>
		<NoteDetail id={id} url={url} />
	</article>
}
