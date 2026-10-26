export type Note = { readonly id: number; readonly text: string; readonly replies: readonly Note[] };

export default function NoteRow({ text, replies }: { readonly text: string; readonly replies: readonly Note[] }) @{
	<li>
		<span data-text>{text}</span>
		<ul>
			@for (const reply of replies; key reply.id) {
				<NoteRow text={reply.text} replies={reply.replies} />
			}
		</ul>
	</li>
}
