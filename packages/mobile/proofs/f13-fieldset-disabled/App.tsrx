import { state } from '@markless/core';

export default function App() @{
	let locked = state(false);
	let sent = state('Not sent');
	<main>
		<h1>Gift</h1>
		<form
			onSubmit={(event) => {
				event.preventDefault();
				sent = `Sent with note ${String(new FormData(event.currentTarget).get('note'))}`;
			}}
		>
			<fieldset disabled={locked}>
				<legend>Message</legend>
				<input aria-label="Note" name="note" />
			</fieldset>
			<button>Send</button>
		</form>
		<button onClick={() => (locked = !locked)}>{locked ? 'Unlock' : 'Lock'}</button>
		<p>{sent}</p>
	</main>
}
