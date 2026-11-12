import { computed, state } from '@markless/core';
import { loadFlash, loadTodos } from '../src/todos.ts';

// Plain forms: sent in place with JavaScript on, as the browser sends them with it off.
export default function Shelf() @{
	const todos = computed(async () => await loadTodos());
	const flash = computed(async () => await loadFlash());
	let draft = state('');
	const method = 'post';

	<main data-page="shelf">
		<style>
			form[aria-busy='true'] {
				opacity: 0.6;
			}
		</style>
		<input data-other aria-label="Elsewhere" />
		@try {
			<section data-shelf>
				<form method="post" action="/api/todos" data-add-form>
					<input name="title" data-title aria-label="Title" />
					<button type="submit" data-submit>Add</button>
					<button type="submit" formaction="/api/todos?to=/done" data-submit-done>Add and finish</button>
					<button type="submit" formmethod="get" formaction="/done" data-submit-get>Look</button>
					<button type="submit" formtarget="_self" formaction="/api/todos?answer&self" data-submit-self>
						Add here
					</button>
					<button type="submit" formaction="/api/todos?answer" data-submit-answer>Add, plain answer</button>
				</form>
				<form method="post" action="/api/todos" data-shadow-form>
					<input name="title" data-shadow-title aria-label="Shadow title" />
					<input type="hidden" name="target" value="elsewhere" />
					<input type="hidden" name="method" value="get" />
					<input type="hidden" name="reset" value="kept" />
					<button type="submit" name="action" value="archive" data-shadow-archive>Archive</button>
					<button type="submit" name="action" value="keep">Keep</button>
				</form>
				<form method="post" action="/api/todos?encoding" data-lines-form>
					<textarea name="title" data-lines aria-label="Lines"></textarea>
					<button type="submit" data-lines-submit>Add lines</button>
				</form>
				<form method="post" action="/legacy-save" data-legacy-form>
					<input name="title" data-legacy-title aria-label="Legacy title" />
					<button type="submit" data-legacy-submit>Save through middleware</button>
					<button type="submit" formaction="/legacy-save?to=/done" data-legacy-done>Save and finish through middleware</button>
				</form>
				<form method="post" action="/api/todos?to=javascript:window.__xss=1" data-script-form>
					<input name="title" value="script" />
					<button type="submit" data-script-submit>Follow a script address</button>
				</form>
				<form method="post" action="/api/todos?to=https://elsewhere.example/checkout" data-checkout-form>
					<input name="title" value="checkout" />
					<button type="submit" data-checkout-submit>Check out</button>
				</form>
				<p data-flash>{flash}</p>
				<form method="post" action="/api/todos?encoding" enctype="multipart/form-data" data-file-form>
					<input type="file" name="file" data-file aria-label="File" />
					<button type="submit" data-file-submit>Upload</button>
				</form>
				<form method="post" action="/api/todos?encoding" enctype="text/plain" data-plain-form>
					<input name="title" data-plain-title aria-label="Plain title" />
					<button type="submit" data-plain-submit>Add as text</button>
				</form>
				<form method={method} action="/api/todos" data-expression-form>
					<input name="title" data-expression-title aria-label="Expression title" />
					<button type="submit" data-expression-submit>Add by expression</button>
				</form>
				<form method="post" action="/api/todos" data-bound-form>
					<input
						name="title"
						data-bound-title
						aria-label="Bound title"
						value={draft}
						onInput={(event) => (draft = (event.target as HTMLInputElement).value)}
					/>
					<button type="submit" data-bound-submit>Add bound</button>
				</form>
				<p data-draft>{draft}</p>
				<form method="post" action="/api/todos" target="sink" data-target-form>
					<input name="title" data-target-title aria-label="Target title" />
					<button type="submit" data-target-submit>Add in the frame</button>
				</form>
				<form method="post" action="/api/todos" rel="external" data-external-form>
					<input name="title" data-external-title aria-label="External title" />
					<button type="submit" data-external-submit>Add with a page load</button>
				</form>
				<form method="post" action="https://elsewhere.example/api/todos" data-cross-form>
					<input name="title" value="elsewhere" />
					<button type="submit" data-cross-submit>Send elsewhere</button>
				</form>
				<ul data-list>
					@for (const todo of todos; key todo.id) {
						<li>{todo.title}</li>
					}
				</ul>
			</section>
		} @pending {
			<p data-pending>Loading</p>
		} @catch (error, reset) {
			<p data-error>
				{error.message}
				<button type="button" data-dismiss onClick={reset}>Dismiss</button>
			</p>
		}
		<form method="post" action="/api/todos" data-outside-form>
			<input name="title" data-outside-title aria-label="Outside title" />
			<button type="submit" data-outside-submit>Add from outside</button>
		</form>
		<iframe name="sink" title="sink" data-sink></iframe>
		<a data-to-start href="/start">start</a>
		<div style="height: 2000px">spacer</div>
	</main>
}
