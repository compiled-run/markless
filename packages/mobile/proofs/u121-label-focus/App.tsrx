import { state } from '@markless/core';

export default function App() @{
	let note = state('Not editing');
	let pinned = state(false);
	<main>
		<h1>New note</h1>
		<form onSubmit={(event) => event.preventDefault()}>
			<label>
				Title
				<input name="title" onFocus={() => (note = 'Editing title')} />
			</label>
			<label>
				Body
				<textarea name="body" aria-label="Note text" onFocus={() => (note = 'Editing body')}></textarea>
			</label>
			<label>
				<input type="checkbox" name="pinned" onChange={(event) => (pinned = event.currentTarget.checked)} />
				Pin to top
			</label>
		</form>
		<p>{note}</p>
		<p>{pinned ? 'Pinned yes' : 'Pinned no'}</p>
	</main>
}
