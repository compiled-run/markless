import { state } from '@markless/core';

export default function App() @{
	let sent = state('Nothing sent');
	<main>
		<h1>Sign up</h1>
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				sent = `Sent ${String(data.get('first'))} ${String(data.get('last'))}, nickname ${String(data.has('nickname'))}`;
			}}
		>
			<input aria-label="First name" name="first" />
			<input aria-label="Last name" name="last" value="Lovelace" />
			<input aria-label="Nickname" />
			<button type="submit">Send</button>
		</form>
		<p>{sent}</p>
	</main>
}
