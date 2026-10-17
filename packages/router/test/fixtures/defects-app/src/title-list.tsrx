type Row = { readonly id: string; readonly title: string };

export function TitleList({ rows }: { readonly rows: readonly Row[] }) @{
	<ul data-prop-rows>
		@for (const row of rows; key row.id) {
			<TitleItem row={row} />;
		}
	</ul>;
}

function TitleItem({ row }: { readonly row: Row }) @{
	<li data-x="1">{row.title}</li>;
}
