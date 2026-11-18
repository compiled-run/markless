import { state } from '@markless/core';

export default function App() @{
	let ready = state(false);
	let sent = state('Nothing sent');
	<main>
		<h1>Notes</h1>
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				sent = `Sent ${String(data.get('note'))}, code ${String(data.get('code'))}`;
			}}
		>
			<input aria-label="Note" name="note" />
			<input aria-label="Code" name="code" value="A1" required disabled />
			<button disabled={!ready}>Send</button>
		</form>
		<button onClick={() => (ready = true)}>Allow sending</button>
		<p>{ready ? 'Sending allowed' : 'Sending not allowed'}</p>
		<p>{sent}</p>
	</main>
}
