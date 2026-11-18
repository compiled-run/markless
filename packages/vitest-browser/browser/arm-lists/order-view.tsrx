export default function OrderView(props: { order: { code: string; lines: Array<{ id: string; text: string }> } | null }) @{
	@if (props.order !== null) {
		<ul data-list>
			@for (const line of props.order.lines; key line.id) {
				<li>{line.text}</li>
			}
		</ul>
	} @else {
		<p data-none>none</p>
	}
}
