export default function OpenRow({
	post,
	opened,
	onToggle,
}: {
	post: { id: number };
	opened: number[];
	onToggle: () => void;
}) @{
	<li>
		<button data-toggle onClick={onToggle}>Toggle {post.id}</button>
		@if (opened.includes(post.id)) {
			<span data-open>open</span>
		} @else if (opened.length > 0) {
			<span data-other>other</span>
		} @else {
			<span data-shut>shut</span>
		}
	</li>
}
