export type Tag = { readonly code: number; readonly label: string };

export function CodeStrip({ entries }: { readonly entries: readonly Tag[] }) @{
	<section data-strip>
		@for (const entry of entries; key entry.code) {
			<p>{entry.label}</p>;
		}
	</section>;
}
