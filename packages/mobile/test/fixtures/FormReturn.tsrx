import { state } from '@markless/core';

export default function FormReturn() @{
	let ready = state(false);
	let clicks = state(0);
	let sent = state('none');
	<main>
		<form
			onSubmit={(event) => {
				event.preventDefault();
				sent = String(new FormData(event.currentTarget).get('note'));
			}}
		>
			<input aria-label="Note" name="note" />
			<button disabled={!ready} onClick={() => (clicks = clicks + 1)}>
				Send
			</button>
		</form>
		<button onClick={() => (ready = true)}>Ready</button>
		<p>{sent} {clicks}</p>
	</main>
}
