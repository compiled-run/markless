import { state } from '@markless/core';

export default function App() @{
	let status = state('Not signed in');
	<main>
		<h1>Sign in</h1>
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				status = `Signed in as [${String(data.get('email'))}]`;
			}}
		>
			<input aria-label="Email" name="email" type="email" required />
			<button type="submit">Continue</button>
		</form>
		<p>{status}</p>
	</main>
}
