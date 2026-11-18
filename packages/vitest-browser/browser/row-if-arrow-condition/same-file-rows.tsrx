import { state } from '@markless/core';

function Row({ post, opened, onToggle }: { post: { id: number }; opened: number[]; onToggle: () => void }) @{
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

export default function Page() @{
	let posts = state([{ id: 1 }, { id: 2 }, { id: 3 }]);
	let opened = state<number[]>([]);

	<ul>
		@for (const post of posts; key post.id) {
			<Row
				post={post}
				opened={opened}
				onToggle={() =>
					(opened = opened.includes(post.id) ? opened.filter((id) => id !== post.id) : [...opened, post.id])
				}
			/>
		}
	</ul>
}
