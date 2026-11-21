import { state } from '@markless/core';

export default function App() @{
	let typed = state(0);
	let sent = state('Not signed in');
	<main>
		<h1>Account</h1>
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				sent = `Signed in as ${String(data.get('user'))} with ${String(data.get('secret')).length} characters`;
			}}
		>
			<input aria-label="User" name="user" />
			<input
				type="password"
				aria-label="Password"
				name="secret"
				required
				maxlength="8"
				onInput={(event) => (typed = event.currentTarget.value.length)}
			/>
			<button>Sign in</button>
		</form>
		<p>{typed} characters typed</p>
		<p>{sent}</p>
	</main>
}
