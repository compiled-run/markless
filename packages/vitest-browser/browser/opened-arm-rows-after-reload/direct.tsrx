export default function Direct({ items }: { items: Array<{ id: string; text: string }> }) @{
	<ul data-list>
		@for (const item of items; key item.id) {
			<li>{item.text}</li>
		}
	</ul>
}
