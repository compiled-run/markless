// file: pages/post.tsrx
import { state } from '@markless/core';
import { drawer, modal } from '@markless/ui';

export default function Post() @{
	let sharing = state(false);
	let name = state('Weekend trip');

	<main>
		<style>{`
			.share { padding: 1rem; border: none; border-radius: 12px; background: white; }
			.edit { padding: 1rem; border-radius: 12px; background: white; }
			.comments { padding: 1rem; border-radius: 12px 12px 0 0; background: white; }
			.dim { background: rgb(0 0 0 / 0.4); }
		`}</style>
		<h1>{name}</h1>

		<button onClick={() => (sharing = true)}>Share</button>
		@if (sharing) {
			<dialog open class="share">
				<p>Anyone with the link can view this post.</p>
				<button onClick={() => (sharing = false)}>Done</button>
			</dialog>
		}

		<modal.root>
			<modal.trigger>Edit name</modal.trigger>
			<modal.backdrop class="dim">
				<modal.content class="edit">
					<modal.title>Edit name</modal.title>
					<input value={name} onInput={(event) => (name = event.currentTarget.value)} />
					<modal.close>Save</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>

		<drawer.root>
			<drawer.trigger>Comments</drawer.trigger>
			<drawer.backdrop class="dim">
				<drawer.content class="comments">
					<drawer.title>Comments</drawer.title>
					<p>No comments yet.</p>
					<drawer.close>Close</drawer.close>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
	</main>
}
