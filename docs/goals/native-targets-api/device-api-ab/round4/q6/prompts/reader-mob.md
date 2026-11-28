You are taking part in a study of API design. Answer from this prompt alone: do not read files, search the repository or any code, run commands, or use the web. Do not use any tools at all.

You are a mobile developer: you build iPhone and Android apps (SwiftUI, Jetpack Compose or React Native) and write little web code.

Markless is a UI framework whose components are written in `.tsrx` files. In `.tsrx`, a component body is `@{ statements; one root element }` and runs once; `state()` values update the page when assigned; `@if`/`@else` and `@for` are template blocks.

The app is built from one codebase as an iPhone app, an Android app and a website. `@markless/ui` is a package of unstyled components that run on the website, iPhone and Android. Below is one page of the app. You get the code only, no documentation: answer from what the code tells you and from your own experience, and say where you are guessing.

=== CODE ===
```tsrx
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
```
=== END CODE ===

Questions:
1. An iPhone user taps Share, Edit name and Comments. For each, what do they see: a centered box, a bottom sheet (a panel that slides up from the bottom edge), full screen, or something else? Say why.
2. A visitor on the website on a laptop does the same. For each, what do they see?
3. How sure are you of your answer to question 1 (1–5)?

Output format: lines `1:` (with `Share:`, `Edit name:`, `Comments:`), `2:` (the same), `3:`; end with `Tools used: none`.
