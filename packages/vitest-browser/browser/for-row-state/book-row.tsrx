import { state } from '@markless/core';

export function BookRow({ id, title }: { id: string; title: string }) @{
	let liked = state(false);

	<li data-book={id}>
		<button data-like={id} onClick={() => (liked = !liked)}>{liked ? 'liked' : 'like'}</button>
		{title}
	</li>
}
