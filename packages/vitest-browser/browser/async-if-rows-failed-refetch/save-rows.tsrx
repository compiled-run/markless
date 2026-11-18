import { computed, state } from '@markless/core';
import { loadPosts, save, type Post } from './posts-server.ts';

// The click-through demo's row: handlers save, and the re-fetch each save causes is the one that fails.
function PostRow({ post }: { post: Post }) @{
	let expanded = state(false);
	let editing = state(false);
	let typed = state('');
	let error = state('');

	<li>
		@if (editing) {
			<form
				data-form
				onSubmit={async (event) => {
					event.preventDefault();
					error = '';
					try {
						await save({ op: 'rename', id: post.id, title: typed });
						editing = false;
					} catch (failure) {
						error = (failure as Error).message;
					}
				}}
			>
				<input value={typed} onInput={(event) => (typed = (event.target as HTMLInputElement).value)} />
				<button type="submit">Save</button>
			</form>
		} @else {
			<p data-title>{post.title}</p>
		}
		<button
			data-like
			onClick={async () => {
				error = '';
				try {
					await save({ op: 'like', id: post.id });
				} catch (failure) {
					error = (failure as Error).message;
				}
			}}
		>
			Like
		</button>
		<button
			data-toggle
			onClick={() => {
				typed = post.title;
				editing = true;
			}}
		>
			Rename
		</button>
		<button data-expand onClick={() => (expanded = !expanded)}>Note</button>
		@if (expanded) {
			<label data-note>Note</label>
		}
		@if (error) {
			<p data-row-error>{error}</p>
		}
	</li>
}

export default function Page() @{
	const posts = computed(async () => await loadPosts());
	const likes = computed(() => posts.reduce((sum, post) => sum + post.likes, 0));

	<section>
		<button data-add onClick={async () => await save({ op: 'add', id: 'd' })}>Add</button>
		<button data-touch onClick={async () => await save({ op: 'touch', id: '' })}>Touch</button>
		@try {
			<div>
				<p data-total>{likes}</p>
				<ul>
					@for (const post of posts; key post.id) {
						<PostRow post={post} />
					}
				</ul>
			</div>
		} @pending {
			<p data-loading>Loading</p>
		} @catch (error, reset) {
			<p data-error>
				{error.message} <button data-retry onClick={reset}>Retry</button>
			</p>
		}
	</section>
}
