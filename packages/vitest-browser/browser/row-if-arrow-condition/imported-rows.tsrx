import { state } from '@markless/core';
import ArrowRow from './arrow-row.tsrx';

export default function Page() @{
	let posts = state([{ id: 1 }, { id: 2 }, { id: 3 }]);
	let opened = state<number[]>([]);

	<ul>
		@for (const post of posts; key post.id) {
			<ArrowRow
				post={post}
				opened={opened}
				onToggle={() =>
					(opened = opened.includes(post.id) ? opened.filter((id) => id !== post.id) : [...opened, post.id])
				}
			/>
		}
	</ul>
}
