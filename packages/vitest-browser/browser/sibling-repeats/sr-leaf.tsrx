export type Entry = { readonly id: string; readonly open: boolean };

export function ImportedEntry({ entry }: { readonly entry: Entry }) @{
	<article data-imported-row>
		<b>{entry.id}</b>
		@if (entry.open) {
			<i>open</i>
		} @else {
			<i>shut</i>
		}
	</article>
}
