export default function ArrowRow({
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
		@if (opened.some((id) => id === post.id)) {
			<span data-some>some</span>
		}
		@if (opened.every((id) => id !== post.id)) {
			<span data-every>every</span>
		}
		@if (opened.find((id) => id === post.id)) {
			<span data-find>find</span>
		}
		@if (opened.filter((id) => id <= post.id).length > 1) {
			<span data-filter>filter</span>
		}
	</li>
}
