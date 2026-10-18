type Item = { readonly id: string; readonly name: string };

export function NameList({ items }: { readonly items: readonly Item[] }) @{
	<ul>
		@for (const item of items; key item.id) {
			<li>{item.name}</li>;
		}
	</ul>;
}
