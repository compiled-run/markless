import { state } from '@markless/core';

export default function App() @{
	let sent = state('Nothing sent');
	<main>
		<h1>Account</h1>
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				sent = `Sent ${String(data.get('email'))}`;
			}}
		>
			<input aria-label="Email" name="email" type="email" />
			<input type="submit" value="Send" />
		</form>
		<p>{sent}</p>
	</main>
}
