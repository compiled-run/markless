export default function HeadNote({ note }: { readonly note: string }) @{
	<section>
		@if (note) {
			<em>{note}</em>
		} @else {
			<b>none</b>
		}
	</section>
}
