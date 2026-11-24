import { state } from '@markless/core';

export default function App() @{
	let draft = state('Hello');
	let sent = state('Nothing sent');
	<form
		onSubmit={(event) => {
			event.preventDefault();
			const data = new FormData(event.currentTarget);
			sent = `Sent ${String(data.get('note'))} and ${String(data.get('sign'))}`;
		}}
	>
		<h1>Postcard</h1>
		<textarea aria-label="Note" name="note">{draft}</textarea>
		<textarea aria-label="Sign" name="sign" value="Ada" />
		<p>Draft {draft}</p>
		<button type="button" onClick={() => (draft = draft === 'Suggested' ? 'Other' : 'Suggested')}>
			Suggest
		</button>
		<button>Send</button>
		<p>{sent}</p>
	</form>
}
