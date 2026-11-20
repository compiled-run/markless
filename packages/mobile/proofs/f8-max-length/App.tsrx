import { state } from '@markless/core';

export default function App() @{
	let handle = state('Alexandra');
	let limit = state(5);
	let sent = state('Nothing sent');
	<main>
		<h1>Profile</h1>
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				sent = `Sent ${String(data.get('handle'))} with [${String(data.get('code'))}]`;
			}}
		>
			<input
				aria-label="Handle"
				name="handle"
				maxlength="5"
				value={handle}
				onInput={(event) => (handle = event.currentTarget.value)}
			/>
			<input aria-label="Code" name="code" maxlength={limit} />
			<button type="submit">Send</button>
		</form>
		<button onClick={() => (limit = 3)}>Shorter codes</button>
		<p>Codes up to {limit}</p>
		<p>{sent}</p>
	</main>
}
