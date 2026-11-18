import { state } from '@markless/core';

function Row({ post, opened, onToggle }: { post: { id: number }; opened: number[]; onToggle: () => void }) @{
	<li>
		<button data-toggle onClick={onToggle}>Toggle {post.id}</button>
		@if (opened.includes(post.id)) {
			<span data-open>open</span>
		} @else {
			<span data-shut>shut</span>
		}
	</li>
}

export default function Page() @{
	let posts = state([{ id: 1 }, { id: 2 }, { id: 3 }]);
	let opened = state<number[]>([]);

	<section>
		<button data-open-first onClick={() => (opened = opened.includes(1) ? opened.filter((id) => id !== 1) : [...opened, 1])}>First</button>
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
	</section>
}
