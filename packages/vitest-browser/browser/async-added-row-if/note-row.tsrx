import { state } from '@markless/core';
import type { Post } from './posts.ts';

export function NoteRow({ post, onLike }: { post: Post; onLike: () => void }) @{
	let note = state(false);
	let deep = state(false);
	let flag = state(false);

	<li>
		<span data-likes>{post.likes}</span>
		<button data-like onClick={onLike}>Like</button>
		<button data-expand onClick={() => (note = !note)}>Note {post.id}</button>
		<button data-flag-toggle onClick={() => (flag = !flag)}>Flag</button>
		@if (note) {
			<div data-note>
				<input data-text />
				<button data-close onClick={() => (note = false)}>Close</button>
				<button data-deeper onClick={() => (deep = !deep)}>More</button>
				@if (deep) {
					<em data-deep>More</em>
				}
			</div>
		} @else {
			<span data-closed>closed</span>
		}
		@if (flag) {
			<b data-flag>flagged</b>
		}
	</li>
}
