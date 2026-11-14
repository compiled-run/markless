export default function NoteRow(props: { note: { id: string; text: string } }) @{
	<li data-row>{props.note.text}</li>
}
